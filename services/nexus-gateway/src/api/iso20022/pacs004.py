"""
pacs.004 Payment Return Handler

Handles ISO 20022 pacs.004 (Payment Return) messages.
Currently a future/roadmap item for Release 1 - Nexus R1 uses pacs.008 with
NexusOrgnlUETR in remittance info for returns.

Reference: https://docs.nexusglobalpayments.org/payment-processing/returns
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from uuid import uuid4
from lxml import etree
import logging

from ...db import get_db
from .. import validation as xsd_validation
from ..schemas import Pacs004Response
from .utils import store_payment_event

router = APIRouter()
logger = logging.getLogger(__name__)


def _extract_original_uetr_from_pacs004(xml_content: str) -> str:
    """Extract OrgnlUETR from pacs.004 XML document.
    
    Searches for the OrgnlUETR element in typical pacs.004 structure:
    TxInf/OrgnlUETR or RtrTxInf/OrgnlUETR
    """
    try:
        root = etree.fromstring(xml_content.encode())
        ns = {'doc': 'urn:iso:std:iso:20022:tech:xsd:pacs.004.001.14'}
        
        # Try namespaced first
        for xpath in ['.//doc:OrgnlUETR', './/doc:TxInf/doc:OrgnlUETR', './/doc:RtrTxInf/doc:OrgnlUETR']:
            elements = root.xpath(xpath, namespaces=ns)
            if elements and elements[0].text:
                return elements[0].text
        
        # Fallback: try without namespace (for sandbox testing)
        for xpath in ['.//OrgnlUETR', './/TxInf/OrgnlUETR', './/RtrTxInf/OrgnlUETR']:
            elements = root.xpath(xpath)
            if elements and elements[0].text:
                return elements[0].text
        
        return f"UNKNOWN-{uuid4().hex[:8]}"
    except Exception:
        return f"UNKNOWN-{uuid4().hex[:8]}"


@router.post(
    "/pacs004",
    response_model=Pacs004Response,
    summary="Submit pacs.004 Payment Return",
    description="""
    **Future/Roadmap - Not in Release 1**
    
    Accepts a pacs.004 (Payment Return) message for returning funds
    after settlement. Currently, Nexus Release 1 uses pacs.008 with
    NexusOrgnlUETR in remittance info for returns.
    
    This endpoint is provided for future compatibility.
    
    Reference: https://docs.nexusglobalpayments.org/payment-processing/returns
    """
)
async def process_pacs004(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Pacs004Response:
    """Process pacs.004 Payment Return."""
    processed_at = datetime.now(timezone.utc)
    return_id = str(uuid4())
    
    try:
        body = await request.body()
        xml_content = body.decode('utf-8')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read XML: {str(e)}")
    
    # XSD Validation
    xsd_result = xsd_validation.validate_pacs004(xml_content)
    if not xsd_result.valid:
        # Forensic Logging
        failed_uetr = xsd_validation.safe_extract_uetr(xml_content) or f"UNKNOWN-{uuid4().hex[:8]}"
        await store_payment_event(
            db=db,
            uetr=failed_uetr,
            event_type="SCHEMA_VALIDATION_FAILED",
            actor="NEXUS",
            data={
                "messageType": "pacs.004",
                "errors": xsd_result.errors
            },
            pacs004_xml=xml_content
        )
        raise HTTPException(
            status_code=400, 
            detail={"error": "XSD_VALIDATION_FAILED", "errors": xsd_result.errors}
        )
    
    # Extract original UETR from parsed XML
    original_uetr = _extract_original_uetr_from_pacs004(xml_content)
    logger.info(f"pacs.004 return received for original UETR: {original_uetr}")
    
    # Store return event for audit trail
    await store_payment_event(
        db=db,
        uetr=original_uetr,
        event_type="PAYMENT_RETURN_RECEIVED",
        actor="NEXUS",
        data={
            "returnId": return_id,
            "messageType": "pacs.004",
            "note": "Future - use pacs.008 with NexusOrgnlUETR for Release 1"
        },
        pacs004_xml=xml_content
    )
    
    # Cancel any active reservation for the returned payment
    from ..sap import cancel_reservation_for_payment
    await cancel_reservation_for_payment(db=db, uetr=original_uetr)
    
    return Pacs004Response(
        returnId=return_id,
        originalUetr=original_uetr,
        status="ACCEPTED",
        message="Payment return processed (Future - use pacs.008 with NexusOrgnlUETR for Release 1)",
        processedAt=processed_at.isoformat()
    )
