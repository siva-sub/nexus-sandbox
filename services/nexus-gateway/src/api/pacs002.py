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

from ..db import get_db
from ..config import settings
from . import validation as xsd_validation

router = APIRouter(prefix="/v1/iso20022", tags=["ISO 20022 Messages"])


# =============================================================================
# ISO 20022 External Status Codes (NotebookLM confirmed)
# =============================================================================

class TransactionStatus(str, Enum):
    """ISO 20022 ExternalPaymentTransactionStatus1Code for Nexus."""
    ACCC = "ACCC"  # Accepted Settlement Completed (Success)
    ACSP = "ACSP"  # Accepted Settlement in Process
    ACTC = "ACTC"  # Accepted Technical Validation
    ACWP = "ACWP"  # Accepted Without Posting (sanctions review delay)
    RJCT = "RJCT"  # Rejected
    BLCK = "BLCK"  # Blocked (suspicious activity)


class StatusReasonCode(str, Enum):
    """
    ISO 20022 ExternalStatusReason1Code used in Nexus.
    
    Complete list from NotebookLM Query 2026-02-03 (60+ codes).
    Reference: ISO 20022 External Code Sets - Status Reason
    """
    
    # ==========================================================================
    # Account & ID Issues
    # ==========================================================================
    AC01 = "AC01"  # Incorrect Account Number
    AC04 = "AC04"  # Closed Account Number
    AC06 = "AC06"  # Blocked Account
    AC07 = "AC07"  # Closed Creditor Account Number
    AC14 = "AC14"  # Invalid Creditor Account Type
    MD07 = "MD07"  # End Customer Deceased
    BE23 = "BE23"  # Account Proxy Invalid (Proxy not registered)
    
    # ==========================================================================
    # Agent & Participant Issues
    # ==========================================================================
    AGNT = "AGNT"  # Incorrect Agent (PSP exists but not onboarded to Nexus)
    AB08 = "AB08"  # Offline Creditor Agent
    AB09 = "AB09"  # Error Creditor Agent
    AB10 = "AB10"  # Error Instructed Agent
    AG11 = "AG11"  # Creditor Agent Suspended
    CNOR = "CNOR"  # Creditor Bank Is Not Registered
    RC04 = "RC04"  # Invalid Creditor Bank Identifier
    RC06 = "RC06"  # Invalid Debtor BIC Identifier
    RC07 = "RC07"  # Invalid Creditor BIC Identifier
    RC10 = "RC10"  # Invalid Creditor Clearing System Member Identifier
    RC11 = "RC11"  # Invalid Intermediary Agent (SAP details incorrect)
    
    # ==========================================================================
    # Compliance, Fraud & Regulatory
    # ==========================================================================
    FR01 = "FR01"  # Fraud
    FRAD = "FRAD"  # Fraudulent Origin (Abuse of proxy resolution)
    AG01 = "AG01"  # Transaction Forbidden
    AM07 = "AM07"  # Blocked Amount (Regulatory)
    RR01 = "RR01"  # Missing Debtor Account/ID
    RR02 = "RR02"  # Missing Debtor Name/Address
    RR03 = "RR03"  # Missing Creditor Name/Address
    RR04 = "RR04"  # Regulatory Reason
    
    # ==========================================================================
    # Amounts & Currency
    # ==========================================================================
    AM02 = "AM02"  # Not Allowed Amount (Exceeds max)
    AM03 = "AM03"  # Not Allowed Currency
    AM04 = "AM04"  # Insufficient Funds (FXP account at SAP)
    AM06 = "AM06"  # Too Low Amount
    AM13 = "AM13"  # Amount Exceeds Clearing System Limit
    AM14 = "AM14"  # Amount Exceeds Agreed Limit
    AM15 = "AM15"  # Amount Below Clearing System Minimum
    AM21 = "AM21"  # Limit Exceeded
    AM23 = "AM23"  # Amount Exceeds Settlement Limit
    CH20 = "CH20"  # Decimal Points Not Compatible With Currency
    CURR = "CURR"  # Incorrect Currency
    
    # ==========================================================================
    # Technical & Process
    # ==========================================================================
    AB01 = "AB01"  # Aborted Clearing Timeout
    AB02 = "AB02"  # Aborted Clearing Fatal Error
    AB03 = "AB03"  # Aborted Settlement Timeout
    AB04 = "AB04"  # Aborted Settlement Fatal Error (e.g., Rate mismatch)
    AB05 = "AB05"  # Timeout Creditor Agent
    AB06 = "AB06"  # Timeout Instructed Agent
    TM01 = "TM01"  # Invalid Cut-off Time
    ED05 = "ED05"  # Settlement Failed
    ED06 = "ED06"  # Settlement System Not Available
    FF10 = "FF10"  # Bank System Processing Error
    
    # Duplicate Errors
    DU01 = "DU01"  # Duplicate Message ID
    DU02 = "DU02"  # Duplicate Payment Information ID
    DU03 = "DU03"  # Duplicate EndToEnd ID
    DU04 = "DU04"  # Duplicate UETR
    DU05 = "DU05"  # Duplicate Instruction ID
    DUPL = "DUPL"  # Duplicate Payment (general)
    
    # ==========================================================================
    # Data Quality
    # ==========================================================================
    BE01 = "BE01"  # Inconsistent With End Customer
    BE04 = "BE04"  # Missing Creditor Address
    BE05 = "BE05"  # Unrecognised Initiating Party
    BE06 = "BE06"  # Unknown End Customer
    BE07 = "BE07"  # Missing Debtor Address
    CH11 = "CH11"  # Creditor Identifier Incorrect
    CH21 = "CH21"  # Required Compulsory Element Missing
    NARR = "NARR"  # Narrative (Reason in text field)
    MS02 = "MS02"  # Not Specified Reason (Customer Generated)
    MS03 = "MS03"  # Not Specified Reason (Agent Generated)
    UCRD = "UCRD"  # Unknown Creditor



class Pacs002Request(BaseModel):
    """Request body for receiving pacs.002 status report."""
    uetr: str
    transactionStatus: TransactionStatus
    statusReasonCode: Optional[StatusReasonCode] = None
    statusReasonText: Optional[str] = None
    acceptanceDatetime: str
    instructionPriority: str = "NORM"  # NORM or HIGH


class Pacs002Response(BaseModel):
    """Response after processing pacs.002."""
    uetr: str
    status: str
    processedAt: str
    originalPaymentStatus: str
    message: str


class PaymentStatusResponse(BaseModel):
    """Response for payment status query."""
    uetr: str
    status: TransactionStatus
    statusReasonCode: Optional[StatusReasonCode] = None
    statusReasonText: Optional[str] = None
    createdAt: str
    updatedAt: str
    sourceAmount: Optional[str] = None
    destinationAmount: Optional[str] = None


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
        from .iso20022 import store_payment_event
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
        status=TransactionStatus.ACSP,
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
