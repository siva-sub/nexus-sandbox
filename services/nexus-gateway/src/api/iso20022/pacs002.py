"""
Payment Status Report (pacs.002) Processing and Generation

Reference: https://docs.nexusglobalpayments.org/messaging-and-translation/message-pacs.002-fi-to-fi-payment-status-report

NotebookLM confirmed (2026-02-03):
- Status codes: ACCC, RJCT, BLCK, ACWP, ACTC
- Reason codes: AB03, AB04, TM01, AC04, AC06, AM04, RR04, FR01, RC11, AGNT
- Mandatory: Original UETR, TxSts, StsRsnInf (if RJCT)
- Version: pacs.002.001.15
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel
from enum import Enum
from lxml import etree
import json

from ...db import get_db
from ...config import settings
from .. import validation as xsd_validation
from .utils import store_payment_event

router = APIRouter(tags=["ISO 20022 Messages"])


from ..schemas import (
    TransactionStatus,
    StatusReasonCode,
    Pacs002Request,
    Pacs002Response,
    PaymentStatusResponse
)


# =============================================================================
# POST /iso20022/pacs002 - Receive Payment Status Report
# =============================================================================

@router.post(
    "/pacs002",
    response_model=Pacs002Response,
    summary="Receive pacs.002 Payment Status Report",
    description="""
    **Step 17 Completion**
    
    Receives an ISO 20022 pacs.002 (FI to FI Payment Status Report) message
    from Destination PSP (via Destination IPS) indicating payment success or failure.
    
    ## Status Codes (NotebookLM confirmed)
    
    | Code | Meaning | Trigger |
    |------|---------|---------|
    | ACCC | Settlement Completed | Recipient credited ✓ |
    | RJCT | Rejected | Failure (reversed) |
    | BLCK | Blocked | Suspicious activity |
    | ACWP | Accepted Without Posting | Sanctions review delay (Normal priority only) |
    | ACTC | Technical Validation | SAP acknowledgement |
    
    ## Mandatory Fields
    
    - **Original UETR**: Reference to original pacs.008
    - **Transaction Status**: ACCC/RJCT/BLCK/ACWP/ACTC
    - **Status Reason Info**: MANDATORY if RJCT (deviation from CBPR+)
    
    Reference: https://docs.nexusglobalpayments.org/messaging-and-translation/message-pacs.002-fi-to-fi-payment-status-report
    """
)
async def receive_pacs002(
    request: Pacs002Request,
    db: AsyncSession = Depends(get_db)
) -> Pacs002Response:
    """
    Process incoming pacs.002 status report.
    
    Updates payment status in database and triggers:
    - ACCC: Finalize payment, notify Source PSP
    - RJCT: Reverse settlement, notify Source PSP
    - BLCK: Mark for investigation
    - ACWP: Wait for final status
    """
    processed_at = datetime.now(timezone.utc)
    
    # Validate: RJCT requires status reason
    if request.transactionStatus == TransactionStatus.RJCT:
        if not request.statusReasonCode:
            raise HTTPException(
                status_code=400,
                detail="Status Reason Code is MANDATORY for RJCT status (per Nexus deviation from CBPR+)"
            )
    
    # Update payment status
    await update_payment_status(
        db=db,
        uetr=request.uetr,
        status=request.transactionStatus.value,
        reason_code=request.statusReasonCode.value if request.statusReasonCode else None,
        reason_text=request.statusReasonText
    )
    
    # Store event for event sourcing
    await store_status_event(
        db=db,
        uetr=request.uetr,
        status=request.transactionStatus.value,
        reason_code=request.statusReasonCode.value if request.statusReasonCode else None
    )
    
    # Step 18: Settle or cancel reservation based on pacs.002 outcome
    # Per Nexus docs:
    #   ACCC → SAPs finalize debit on FXP account (reservation UTILIZED)
    #   RJCT → D-IPS reverses settlement, D-SAP releases reservation (CANCELLED)
    # Ref: https://docs.nexusglobalpayments.org/payment-processing/payment-flow-happy-path
    if request.transactionStatus in (TransactionStatus.ACCC,):
        from ..sap import settle_reservation_for_payment
        settled = await settle_reservation_for_payment(db=db, uetr=request.uetr)
        if settled:
            # Store RESERVATION_UTILIZED events for both SAP legs
            await store_payment_event(
                db=db,
                uetr=request.uetr,
                event_type="RESERVATION_UTILIZED",
                actor="S-SAP",
                data={
                    "leg": "SOURCE",
                    "trigger": "pacs.002 ACCC",
                    "message": "Source SAP reservation UTILIZED — FXP source-currency nostro debited (settlement finalized)",
                }
            )
            await store_payment_event(
                db=db,
                uetr=request.uetr,
                event_type="RESERVATION_UTILIZED",
                actor="D-SAP",
                data={
                    "leg": "DESTINATION",
                    "trigger": "pacs.002 ACCC",
                    "message": "Dest SAP reservation UTILIZED — FXP dest-currency nostro debited (settlement finalized)",
                }
            )
    elif request.transactionStatus == TransactionStatus.RJCT:
        from ..sap import cancel_reservation_for_payment
        cancelled = await cancel_reservation_for_payment(db=db, uetr=request.uetr)
        if cancelled:
            reason = request.statusReasonCode.value if request.statusReasonCode else "RJCT"
            # Per Nexus docs: D-IPS reverses settlement, D-SAP releases reservation
            await store_payment_event(
                db=db,
                uetr=request.uetr,
                event_type="RESERVATION_CANCELLED",
                actor="S-SAP",
                data={
                    "leg": "SOURCE",
                    "trigger": f"pacs.002 RJCT ({reason})",
                    "message": f"Source SAP reservation CANCELLED — source-currency funds released back to FXP nostro",
                }
            )
            await store_payment_event(
                db=db,
                uetr=request.uetr,
                event_type="RESERVATION_CANCELLED",
                actor="D-SAP",
                data={
                    "leg": "DESTINATION",
                    "trigger": f"pacs.002 RJCT ({reason})",
                    "message": f"Dest SAP reservation CANCELLED — dest-currency funds released back to FXP nostro",
                }
            )
    
    # Determine message based on status
    messages = {
        TransactionStatus.ACCC: "Payment completed successfully. Recipient credited.",
        TransactionStatus.RJCT: f"Payment rejected: {request.statusReasonCode.value if request.statusReasonCode else 'Unknown'}. Funds reversed.",
        TransactionStatus.BLCK: "Payment blocked for investigation.",
        TransactionStatus.ACWP: "Payment accepted, pending posting (sanctions review).",
        TransactionStatus.ACTC: "Technical validation accepted.",
        TransactionStatus.ACSP: "Settlement in process.",
    }
    
    return Pacs002Response(
        uetr=request.uetr,
        status="PROCESSED",
        processedAt=processed_at.isoformat(),
        originalPaymentStatus=request.transactionStatus.value,
        message=messages.get(request.transactionStatus, "Status received")
    )


# =============================================================================
# POST /iso20022/pacs002/xml - Receive pacs.002 as XML
# =============================================================================

@router.post(
    "/pacs002/xml",
    response_model=Pacs002Response,
    summary="Receive pacs.002 as ISO 20022 XML",
    description="""
    Accepts raw ISO 20022 pacs.002.001.15 XML message.
    
    Parses the XML to extract UETR, status, and reason codes.
    """
)
async def receive_pacs002_xml(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Pacs002Response:
    """Process pacs.002 XML message."""
    processed_at = datetime.now(timezone.utc)
    
    try:
        body = await request.body()
        xml_content = body.decode('utf-8')
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to read XML body: {str(e)}"
        )
    
    # Step 1: XSD Schema Validation
    xsd_result = xsd_validation.validate_pacs002(xml_content)
    if not xsd_result.valid:
        # Forensic Logging: Store violation in Message Observatory 
        from .utils import store_payment_event
        from uuid import uuid4
        
        failed_uetr = xsd_validation.safe_extract_uetr(xml_content) or f"UNKNOWN-{uuid4().hex[:8]}"
        
        await store_payment_event(
            db=db,
            uetr=failed_uetr,
            event_type="SCHEMA_VALIDATION_FAILED",
            actor="NEXUS",
            data={
                "messageType": "pacs.002",
                "errors": xsd_result.errors,
                "summary": "Incoming pacs.002 failed XSD schema validation"
            },
            pacs002_xml=xml_content
        )

        raise HTTPException(
            status_code=400,
            detail={
                "error": "XSD_VALIDATION_FAILED",
                "messageType": "pacs.002",
                "validationErrors": xsd_result.errors,
                "reference": "https://www.iso20022.org/message/pacs.002"
            }
        )
    
    # Step 2: Parse XML
    try:
        parsed = parse_pacs002(xml_content)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid pacs.002 XML: {str(e)}"
        )
    
    # Extract values
    uetr = parsed.get("originalUetr", "")
    status_str = parsed.get("transactionStatus", "")
    reason_code = parsed.get("statusReasonCode")
    
    # Map to enum
    try:
        status = TransactionStatus(status_str)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown transaction status: {status_str}"
        )
    
    # Validate RJCT requires reason
    if status == TransactionStatus.RJCT and not reason_code:
        raise HTTPException(
            status_code=400,
            detail="Status Reason Code is MANDATORY for RJCT status"
        )
    
    # Update and store
    await update_payment_status(
        db=db,
        uetr=uetr,
        status=status.value,
        reason_code=reason_code,
        reason_text=None
    )
    
    # Settle or cancel reservation based on final status
    if status == TransactionStatus.ACCC:
        from ..sap import settle_reservation_for_payment
        await settle_reservation_for_payment(db=db, uetr=uetr)
    elif status == TransactionStatus.RJCT:
        from ..sap import cancel_reservation_for_payment
        await cancel_reservation_for_payment(db=db, uetr=uetr)
    
    return Pacs002Response(
        uetr=uetr,
        status="PROCESSED",
        processedAt=processed_at.isoformat(),
        originalPaymentStatus=status.value,
        message=f"pacs.002 XML processed: {status.value}"
    )


# =============================================================================
# GET /payments/{uetr}/status - Query Payment Status
# =============================================================================

@router.get(
    "/payments/{uetr}/status",
    response_model=PaymentStatusResponse,
    summary="Get payment status by UETR",
    description="""
    Query the current status of a payment using its UETR.
    
    Returns the latest pacs.002 status received.
    """
)
async def get_payment_status(
    uetr: str,
    db: AsyncSession = Depends(get_db)
) -> PaymentStatusResponse:
    """Get payment status by UETR."""
    # For sandbox: return example status
    # Production would query payments table
    
    return PaymentStatusResponse(
        uetr=uetr,
        status=TransactionStatus.ACSC,
        statusReasonCode=None,
        statusReasonText=None,
        createdAt=datetime.now(timezone.utc).isoformat(),
        updatedAt=datetime.now(timezone.utc).isoformat(),
        sourceAmount="1000.00",
        destinationAmount="25850.00"
    )


# =============================================================================
# Helper Functions
# =============================================================================

def parse_pacs002(xml_content: str) -> dict:
    """Parse pacs.002 XML and extract key fields."""
    try:
        root = etree.fromstring(xml_content.encode())
        
        # Define namespace map
        ns = {
            'doc': 'urn:iso:std:iso:20022:tech:xsd:pacs.002.001.15'
        }
        
        def get_text(xpath, default=None):
            elements = root.xpath(xpath, namespaces=ns)
            if elements:
                return elements[0].text if hasattr(elements[0], 'text') else str(elements[0])
            simple_xpath = xpath.replace('doc:', '')
            elements = root.xpath(simple_xpath)
            if elements:
                return elements[0].text if hasattr(elements[0], 'text') else str(elements[0])
            return default
        
        return {
            "messageId": get_text(".//MsgId") or get_text(".//doc:MsgId"),
            "originalMessageId": get_text(".//OrgnlMsgId") or get_text(".//doc:OrgnlMsgId"),
            "originalUetr": get_text(".//OrgnlUETR") or get_text(".//doc:OrgnlUETR"),
            "transactionStatus": get_text(".//TxSts") or get_text(".//doc:TxSts"),
            "statusReasonCode": get_text(".//StsRsnInf/Rsn/Cd") or get_text(".//doc:StsRsnInf/doc:Rsn/doc:Cd"),
            "statusReasonProprietary": get_text(".//StsRsnInf/Rsn/Prtry") or get_text(".//doc:StsRsnInf/doc:Rsn/doc:Prtry"),
            "acceptanceDateTime": get_text(".//AccptncDtTm") or get_text(".//doc:AccptncDtTm"),
            # Added per ISO20022_PARITY_ANALYSIS_REPORT.md - OrgnlTxRef amount parsing
            "originalInstrId": get_text(".//OrgnlInstrId") or get_text(".//doc:OrgnlInstrId"),
            "originalEndToEndId": get_text(".//OrgnlEndToEndId") or get_text(".//doc:OrgnlEndToEndId"),
            "originalTxId": get_text(".//OrgnlTxId") or get_text(".//doc:OrgnlTxId"),
            "originalTxRefAmount": get_text(".//OrgnlTxRef//IntrBkSttlmAmt") or get_text(".//doc:OrgnlTxRef//doc:IntrBkSttlmAmt"),
            "originalTxRefCurrency": get_text(".//OrgnlTxRef//IntrBkSttlmAmt/@Ccy") or get_text(".//doc:OrgnlTxRef//doc:IntrBkSttlmAmt/@Ccy"),
        }
    
    except Exception as e:
        raise ValueError(f"Failed to parse pacs.002: {str(e)}")


async def update_payment_status(
    db: AsyncSession,
    uetr: str,
    status: str,
    reason_code: Optional[str],
    reason_text: Optional[str]
):
    """Update payment status in database."""
    query = text("""
        UPDATE payments SET
            status = :status,
            status_reason_code = :reason_code,
            status_reason_text = :reason_text,
            updated_at = NOW()
        WHERE uetr = :uetr
    """)
    
    await db.execute(query, {
        "uetr": uetr,
        "status": status,
        "reason_code": reason_code,
        "reason_text": reason_text,
    })
    await db.commit()


async def store_status_event(
    db: AsyncSession,
    uetr: str,
    status: str,
    reason_code: Optional[str]
):
    """Store status event for event sourcing."""
    query = text("""
        INSERT INTO payment_events (
            event_id, uetr, event_type, event_data, occurred_at
        ) VALUES (
            gen_random_uuid(), :uetr, :event_type, :event_data, NOW()
        )
    """)
    
    event_type = f"PAYMENT_STATUS_{status}"
    event_data = {
        "status": status,
        "reasonCode": reason_code,
    }
    
    await db.execute(query, {
        "uetr": uetr,
        "event_type": event_type,
        "event_data": json.dumps(event_data),
    })
    await db.commit()
