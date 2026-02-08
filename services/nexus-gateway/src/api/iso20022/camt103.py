"""
camt.103 Create Reservation - Liquidity Reservation at SAP

Reference: https://docs.nexusglobalpayments.org/settlement-access-provision/liquidity

Purpose: Allows IPS Operators to create a debit authorization for the FXP's
account at the Destination SAP before the payment is processed.

This endpoint accepts raw XML or JSON payloads. When XML is provided,
it extracts reservation details using lxml parsing.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from uuid import uuid4
from typing import Optional

from lxml import etree

from ...db import get_db
from .. import validation as xsd_validation
from ..schemas import Camt103Response
from .utils import store_payment_event

router = APIRouter()


def _extract_reservation_details(xml_content: str) -> dict:
    """Extract reservation details from camt.103 XML document.
    
    Searches for key elements: Amount, Currency, AccountId, 
    ReservationType, and any reference IDs.
    """
    details = {}
    try:
        root = etree.fromstring(xml_content.encode())
        ns = {'doc': 'urn:iso:std:iso:20022:tech:xsd:camt.103.001.03'}
        
        # Try namespaced first, then fallback without namespace
        for ns_prefix, namespaces in [('doc:', ns), ('', {})]:
            # Amount and Currency
            for xpath in [f'.//{ns_prefix}Amt', f'.//{ns_prefix}IntrBkSttlmAmt']:
                elements = root.xpath(xpath, namespaces=namespaces) if namespaces else root.xpath(xpath)
                if elements and elements[0].text:
                    details['amount'] = elements[0].text
                    ccy = elements[0].get('Ccy')
                    if ccy:
                        details['currency'] = ccy
                    break
            
            # Account identification
            for xpath in [f'.//{ns_prefix}AcctId/{ns_prefix}IBAN', f'.//{ns_prefix}AcctId/{ns_prefix}Othr/{ns_prefix}Id']:
                elements = root.xpath(xpath, namespaces=namespaces) if namespaces else root.xpath(xpath)
                if elements and elements[0].text:
                    details['accountId'] = elements[0].text
                    break
            
            # Reservation type
            for xpath in [f'.//{ns_prefix}RsvatnTp', f'.//{ns_prefix}Tp/{ns_prefix}Cd']:
                elements = root.xpath(xpath, namespaces=namespaces) if namespaces else root.xpath(xpath)
                if elements and elements[0].text:
                    details['reservationType'] = elements[0].text
                    break
            
            # Message ID
            for xpath in [f'.//{ns_prefix}MsgId', f'.//{ns_prefix}GrpHdr/{ns_prefix}MsgId']:
                elements = root.xpath(xpath, namespaces=namespaces) if namespaces else root.xpath(xpath)
                if elements and elements[0].text:
                    details['messageId'] = elements[0].text
                    break
            
            if details:
                break
    except Exception:
        pass  # XML parsing failed; use defaults
    
    return details


@router.post(
    "/camt103",
    response_model=Camt103Response,
    summary="Submit camt.103 Create Reservation",
    description="""
    **Optional - SAP Integration Method 2a**
    
    Accepts a camt.103 (Create Reservation) message for liquidity reservation
    at the Destination SAP. This creates a debit authorization for the
    FXP's account before the payment is processed.
    
    The endpoint accepts raw XML and extracts reservation details including
    amount, currency, account ID, and reservation type.
    
    Reference: https://docs.nexusglobalpayments.org/settlement-access-provision/liquidity
    """
)
async def process_camt103(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Camt103Response:
    """Process camt.103 Create Reservation with XML extraction."""
    processed_at = datetime.now(timezone.utc)
    reservation_id = str(uuid4())
    
    try:
        body = await request.body()
        xml_content = body.decode('utf-8')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read XML: {str(e)}")
    
    # XSD Validation
    xsd_result = xsd_validation.validate_camt103(xml_content)
    if not xsd_result.valid:
        failed_uetr = xsd_validation.safe_extract_uetr(xml_content) or f"UNKNOWN-{uuid4().hex[:8]}"
        await store_payment_event(
            db=db,
            uetr=failed_uetr,
            event_type="SCHEMA_VALIDATION_FAILED",
            actor="NEXUS",
            data={
                "messageType": "camt.103",
                "errors": xsd_result.errors
            },
            camt103_xml=xml_content
        )
        raise HTTPException(
            status_code=400,
            detail={"error": "XSD_VALIDATION_FAILED", "errors": xsd_result.errors}
        )
    
    # Extract reservation details from XML
    reservation_details = _extract_reservation_details(xml_content)
    
    # Store forensic event with extracted details
    await store_payment_event(
        db=db,
        uetr=reservation_details.get('messageId', f"RSRV-{reservation_id}"),
        event_type="LIQUIDITY_RESERVATION_CREATED",
        actor="SAP",
        data={
            "messageType": "camt.103",
            "reservationId": reservation_id,
            **reservation_details
        },
        camt103_xml=xml_content
    )
    
    return Camt103Response(
        reservationId=reservation_id,
        status="CREATED",
        message=f"Liquidity reservation created at SAP"
                + (f" for {reservation_details.get('currency', '')} {reservation_details.get('amount', '')}" 
                   if reservation_details.get('amount') else ""),
        processedAt=processed_at.isoformat()
    )
