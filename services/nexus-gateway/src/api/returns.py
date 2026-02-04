"""
Payment Return and Recall Processing (FUTURE FEATURES)

pacs.004 - PaymentReturn (Return payment initiated by Destination PSP)
camt.056 - FI to FI Payment Cancellation Request (Recall initiated by Source PSP)

> [!IMPORTANT] Nexus Release 1 Status (NotebookLM 2026-02-03):
> - pacs.004 is NOT SUPPORTED in Release 1. Returns use new pacs.008 with NexusOrgnlUETR: prefix.
> - camt.056 is NOT SUPPORTED in Release 1. Recalls use manual Nexus Service Desk workflow.
> - These endpoints return 501 Not Implemented with guidance on Release 1 alternatives.

Reference: https://docs.nexusglobalpayments.org/payment-processing
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

from ..db import get_db


router = APIRouter(prefix="/v1/iso20022", tags=["Payment Returns & Recalls"])


# =============================================================================
# Enums
# =============================================================================

class ReturnReasonCode(str, Enum):
    """ISO 20022 ExternalReturnReasonCode for pacs.004."""
    # Customer Generated
    CUST = "CUST"  # Customer Request (recall approved)
    DUPL = "DUPL"  # Duplicate Payment
    TECH = "TECH"  # Technical Problem
    FRAD = "FRAD"  # Fraud
    
    # Agent Generated
    AC03 = "AC03"  # Invalid Creditor Account Number
    AC04 = "AC04"  # Closed Account Number
    AC06 = "AC06"  # Blocked Account
    AM04 = "AM04"  # Insufficient Funds
    AM09 = "AM09"  # Wrong Amount
    BE04 = "BE04"  # Missing Creditor Address
    FOCR = "FOCR"  # Following Cancellation Request (recall accepted)
    MS02 = "MS02"  # Not Specified Reason (Customer)
    MS03 = "MS03"  # Not Specified Reason (Agent)
    NARR = "NARR"  # Narrative (reason in text)
    UPAY = "UPAY"  # Underpayment


class CancellationReasonCode(str, Enum):
    """ISO 20022 ExternalCancellationReasonCode for camt.056."""
    CUST = "CUST"  # Customer Request
    DUPL = "DUPL"  # Duplicate Payment
    TECH = "TECH"  # Technical Problem
    FRAD = "FRAD"  # Fraudulent origin
    AGNT = "AGNT"  # Agent decision
    UPAY = "UPAY"  # Underpayment
    


class RecallStatus(str, Enum):
    """Status of a recall/cancellation request."""
    PENDING = "PENDING"      # Awaiting D-PSP decision
    ACCEPTED = "ACCEPTED"    # D-PSP accepted, return initiated
    REJECTED = "REJECTED"    # D-PSP rejected recall
    EXPIRED = "EXPIRED"      # No response within SLA
    COMPLETED = "COMPLETED"  # Return payment completed


# =============================================================================
# Request/Response Models
# =============================================================================

class Pacs004Request(BaseModel):
    """pacs.004 PaymentReturn request from Destination PSP."""
    originalUetr: str = Field(..., description="UETR of original payment to return")
    returnUetr: str = Field(default_factory=lambda: str(uuid4()), description="UETR for return payment")
    returnReasonCode: ReturnReasonCode
    returnReasonText: Optional[str] = None
    returnAmount: str = Field(..., description="Amount to return (may be partial)")
    returnCurrency: str = Field(..., pattern="^[A-Z]{3}$")
    instructionPriority: str = Field("NORM", pattern="^(NORM|HIGH)$")


class Pacs004Response(BaseModel):
    """Response after processing pacs.004."""
    originalUetr: str
    returnUetr: str
    status: str
    returnReasonCode: str
    message: str
    processedAt: str


class Camt056Request(BaseModel):
    """camt.056 Cancellation Request from Source PSP (recall)."""
    originalUetr: str = Field(..., description="UETR of payment to cancel/recall")
    cancellationReasonCode: CancellationReasonCode
    cancellationReasonText: Optional[str] = None
    requestedBy: str = Field(..., description="BIC of requesting PSP")
    originalAmount: Optional[str] = None
    recallType: str = Field("FULL", pattern="^(FULL|PARTIAL)$")


class Camt056Response(BaseModel):
    """Response after initiating recall request."""
    originalUetr: str
    recallId: str
    status: RecallStatus
    recallType: str
    message: str
    submittedAt: str


class RecallListResponse(BaseModel):
    """List of recall requests."""
    count: int
    recalls: List[dict]


# =============================================================================
# In-Memory State (would use database in production)
# =============================================================================

# Maps originalUetr -> recall request details
pending_recalls = {}

# Return payments log
return_payments = []


# =============================================================================
# pacs.004 - PaymentReturn Endpoint
# =============================================================================

@router.post(
    "/pacs004",
    response_model=Pacs004Response,
    summary="[FUTURE] pacs.004 Payment Return",
    description="""
    **⚠️ NOT IMPLEMENTED IN NEXUS RELEASE 1**
    
    This endpoint returns 501 Not Implemented per Nexus Release 1 specification.
    
    ## Nexus Release 1 Alternative
    
    In Release 1, returns are processed using a **new pacs.008 payment** in the
    reverse direction, referencing the original UETR in the remittance info:
    
    ```xml
    <AddtlRmtInf>NexusOrgnlUETR:91398cbd-0838-453f-b2c7-536e829f2b8e</AddtlRmtInf>
    ```
    
    **Use POST /v1/iso20022/pacs008 instead** with the NexusOrgnlUETR prefix.
    
    NotebookLM (2026-02-03): "pacs.004 is not yet supported. Returns use new pacs.008."
    """
)
async def receive_pacs004(
    request: Pacs004Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
) -> Pacs004Response:
    """Process incoming pacs.004 payment return - NOT IMPLEMENTED in Release 1."""
    
    # Return 501 Not Implemented per Nexus Release 1 spec
    response.headers["X-Nexus-Feature-Status"] = "FUTURE"
    response.headers["X-Nexus-Release"] = "Available in Release 2"
    
    raise HTTPException(
        status_code=501,
        detail={
            "error": "FEATURE_NOT_IMPLEMENTED",
            "message": "pacs.004 PaymentReturn is not supported in Nexus Release 1.",
            "alternative": "Use POST /v1/iso20022/pacs008 with NexusOrgnlUETR: prefix in remittance info",
            "example": "<AddtlRmtInf>NexusOrgnlUETR:" + request.originalUetr + "</AddtlRmtInf>",
            "reference": "https://docs.nexusglobalpayments.org/payment-processing/return-payments",
            "release": "pacs.004 support planned for Nexus Release 2"
        }
    )


# =============================================================================
# camt.056 - Cancellation/Recall Request Endpoints
# =============================================================================

@router.post(
    "/camt056",
    response_model=Camt056Response,
    summary="[FUTURE] camt.056 Cancellation Request (Recall)",
    description="""
    **⚠️ NOT IMPLEMENTED IN NEXUS RELEASE 1**
    
    This endpoint returns 501 Not Implemented per Nexus Release 1 specification.
    
    ## Nexus Release 1 Alternative
    
    In Release 1, recall requests are **logged manually** in the Nexus Service Desk:
    
    1. Source PSP logs "Payment Recall Request" in Nexus Service Desk
    2. Destination PSP reviews within SLA
    3. If accepted → Destination PSP initiates return via pacs.008
    4. If rejected → Destination PSP provides reason code
    
    **Use the Service Desk portal** at `/service-desk` for manual recall workflow.
    
    NotebookLM (2026-02-03): "camt.056 is not implemented in Nexus Release 1.
    Recalls are handled via manual Service Desk workflow."
    """
)
async def submit_camt056(
    request: Camt056Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
) -> Camt056Response:
    """Submit a payment recall request - NOT IMPLEMENTED in Release 1."""
    
    # Return 501 Not Implemented per Nexus Release 1 spec
    response.headers["X-Nexus-Feature-Status"] = "FUTURE"
    response.headers["X-Nexus-Release"] = "Available in Release 2"
    
    raise HTTPException(
        status_code=501,
        detail={
            "error": "FEATURE_NOT_IMPLEMENTED",
            "message": "camt.056 Payment Cancellation Request is not supported in Nexus Release 1.",
            "alternative": "Log a 'Payment Recall Request' in the Nexus Service Desk portal",
            "workflow": [
                "1. Navigate to /service-desk in the dashboard",
                "2. Create a new Recall Request with the original UETR",
                "3. Destination PSP reviews and accepts/rejects",
                "4. If accepted, D-PSP initiates pacs.008 return payment"
            ],
            "reference": "https://docs.nexusglobalpayments.org/payment-processing/recall-requests",
            "release": "camt.056 support planned for Nexus Release 2"
        }
    )


@router.get(
    "/recalls",
    response_model=RecallListResponse,
    summary="List Recall Requests",
    description="Get list of pending and completed recall requests."
)
async def list_recalls(
    status: Optional[RecallStatus] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=100)
) -> RecallListResponse:
    """List recall requests."""
    
    recalls = list(pending_recalls.values())
    
    if status:
        recalls = [r for r in recalls if r.get("status") == status.value]
    
    return RecallListResponse(
        count=len(recalls),
        recalls=recalls[:limit]
    )


@router.get(
    "/recalls/{uetr}",
    summary="Get Recall Status",
    description="Get status of a specific recall request."
)
async def get_recall_status(
    uetr: str
) -> dict:
    """Get recall status for a specific UETR."""
    
    if uetr not in pending_recalls:
        raise HTTPException(
            status_code=404,
            detail=f"No recall request found for UETR {uetr}"
        )
    
    return pending_recalls[uetr]


@router.post(
    "/recalls/{uetr}/respond",
    summary="Respond to Recall Request (D-PSP)",
    description="""
    Destination PSP accepts or rejects a recall request.
    
    If accepted, D-PSP should then submit pacs.004 to return funds.
    """
)
async def respond_to_recall(
    uetr: str,
    accept: bool = Query(..., description="true=accept, false=reject"),
    reason: Optional[str] = Query(None, description="Rejection reason if not accepting")
) -> dict:
    """D-PSP responds to recall request."""
    
    if uetr not in pending_recalls:
        raise HTTPException(
            status_code=404,
            detail=f"No recall request found for UETR {uetr}"
        )
    
    recall = pending_recalls[uetr]
    
    if recall["status"] != RecallStatus.PENDING.value:
        raise HTTPException(
            status_code=400,
            detail=f"Recall already {recall['status']}"
        )
    
    responded_at = datetime.now(timezone.utc).isoformat()
    
    if accept:
        recall["status"] = RecallStatus.ACCEPTED.value
        recall["acceptedAt"] = responded_at
        message = "Recall accepted. Submit pacs.004 to return funds."
    else:
        recall["status"] = RecallStatus.REJECTED.value
        recall["rejectedAt"] = responded_at
        recall["rejectionReason"] = reason
        message = f"Recall rejected. Reason: {reason or 'Not specified'}"
    
    return {
        "uetr": uetr,
        "recallId": recall["recallId"],
        "status": recall["status"],
        "message": message,
        "respondedAt": responded_at
    }


# =============================================================================
# Return Payment List
# =============================================================================

@router.get(
    "/returns",
    summary="List Payment Returns",
    description="Get list of pacs.004 return payments."
)
async def list_returns(
    limit: int = Query(50, ge=1, le=100)
) -> dict:
    """List return payments."""
    
    return {
        "count": len(return_payments),
        "returns": return_payments[-limit:][::-1]
    }


# =============================================================================
# camt.029 - Resolution of Investigation (Response to camt.056)
# NotebookLM 2026-02-03: "camt.029 is the response to camt.056...used by D-PSP 
# to inform S-PSP whether they accept or reject the recall request"
# =============================================================================

class InvestigationStatus(str, Enum):
    """ISO 20022 ExternalInvestigationExecutionConfirmationCode."""
    ACCP = "ACCP"  # Accepted (recall accepted)
    RJCR = "RJCR"  # Rejected (recall rejected)
    PDCR = "PDCR"  # Pending (additional info needed)
    UWFW = "UWFW"  # Unable to forward (routing issue)


class Camt029Request(BaseModel):
    """camt.029 Resolution of Investigation from Destination PSP."""
    originalUetr: str = Field(..., description="Original UETR from camt.056")
    recallId: str = Field(..., description="Recall ID from camt.056 response")
    investigationStatus: InvestigationStatus
    statusReasonCode: Optional[str] = None
    statusReasonText: Optional[str] = None
    respondingPsp: str = Field(..., description="BIC of responding D-PSP")


class Camt029Response(BaseModel):
    """Response after processing camt.029."""
    originalUetr: str
    recallId: str
    investigationStatus: str
    message: str
    processedAt: str
    nextStep: str


@router.post(
    "/camt029",
    response_model=Camt029Response,
    summary="Receive camt.029 Resolution of Investigation",
    description="""
    **Process Resolution of Investigation from Destination PSP**
    
    This is the formal response to a camt.056 recall request.
    
    NotebookLM (2026-02-03): "camt.029 is the response to camt.056. 
    Used by D-PSP to inform S-PSP whether they accept or reject the recall."
    
    ## Investigation Status Codes
    
    | Code | Meaning | Next Step |
    |------|---------|-----------|
    | ACCP | Accepted | D-PSP submits pacs.004 return |
    | RJCR | Rejected | Recall closed, no return |
    | PDCR | Pending | Additional info requested |
    | UWFW | Unable to Forward | Routing issue |
    """
)
async def receive_camt029(
    request: Camt029Request,
    db: AsyncSession = Depends(get_db)
) -> Camt029Response:
    """Process camt.029 investigation resolution."""
    
    processed_at = datetime.now(timezone.utc)
    
    # 1. Find the original recall
    if request.originalUetr not in pending_recalls:
        raise HTTPException(
            status_code=404,
            detail=f"No pending recall found for UETR {request.originalUetr}"
        )
    
    recall = pending_recalls[request.originalUetr]
    
    # 2. Verify recall ID matches
    if recall.get("recallId") != request.recallId:
        raise HTTPException(
            status_code=400,
            detail=f"Recall ID mismatch. Expected {recall.get('recallId')}"
        )
    
    # 3. Update recall status based on investigation result
    next_step = ""
    if request.investigationStatus == InvestigationStatus.ACCP:
        recall["status"] = RecallStatus.ACCEPTED.value
        recall["camt029ReceivedAt"] = processed_at.isoformat()
        next_step = "Submit pacs.004 PaymentReturn to complete the recall."
        
    elif request.investigationStatus == InvestigationStatus.RJCR:
        recall["status"] = RecallStatus.REJECTED.value
        recall["rejectedAt"] = processed_at.isoformat()
        recall["rejectionReason"] = request.statusReasonText
        next_step = "Recall rejected. Original payment remains with recipient."
        
    elif request.investigationStatus == InvestigationStatus.PDCR:
        recall["status"] = "PENDING_INFO"
        recall["additionalInfoRequestedAt"] = processed_at.isoformat()
        next_step = "Provide additional information requested by D-PSP."
        
    else:  # UWFW
        recall["status"] = "ROUTING_ERROR"
        next_step = "Check routing and resubmit camt.056."
    
    return Camt029Response(
        originalUetr=request.originalUetr,
        recallId=request.recallId,
        investigationStatus=request.investigationStatus.value,
        message=f"Resolution received: {request.investigationStatus.value}",
        processedAt=processed_at.isoformat(),
        nextStep=next_step
    )


# =============================================================================
# pacs.028 - FI to FI Payment Status Request
# NotebookLM 2026-02-03: "Used by S-PSP to query status when pacs.002 not received.
# In Release 1, S-PSP re-sends pacs.008 instead; downstream resends stored pacs.002."
# =============================================================================

class Pacs028Request(BaseModel):
    """pacs.028 Payment Status Request from Source PSP."""
    originalUetr: str = Field(..., description="UETR of payment to query")
    queryingPsp: str = Field(..., description="BIC of requesting PSP")
    queryReason: Optional[str] = Field(None, description="Reason for status query")


class Pacs028Response(BaseModel):
    """Response to pacs.028 status request."""
    originalUetr: str
    paymentFound: bool
    currentStatus: Optional[str] = None
    statusReasonCode: Optional[str] = None
    lastStatusUpdateAt: Optional[str] = None
    advice: str
    respondedAt: str


# In-memory payment status cache (simulates what Nexus tracks)
payment_status_cache = {}


@router.post(
    "/pacs028",
    response_model=Pacs028Response,
    summary="Submit pacs.028 Payment Status Request",
    description="""
    **Query Payment Status**
    
    Source PSP uses this when they haven't received a pacs.002 confirmation.
    
    NotebookLM (2026-02-03): "pacs.028 is the FI to FI Payment Status Request.
    In the first release of Nexus, pacs.028 is not supported. Instead, if a 
    Source PSP gets no response, they are instructed to re-send the original 
    pacs.008. The downstream systems check if they have already processed that 
    UETR. If they have, they resend the stored pacs.002; if not, they process it."
    
    ## Sandbox Behavior
    
    This endpoint simulates the future pacs.028 flow:
    1. Checks internal status cache
    2. If found, returns current status
    3. If not found, advises to re-send pacs.008
    """
)
async def submit_pacs028(
    request: Pacs028Request,
    db: AsyncSession = Depends(get_db)
) -> Pacs028Response:
    """Process pacs.028 payment status request."""
    
    responded_at = datetime.now(timezone.utc)
    
    # 1. Check local status cache first
    if request.originalUetr in payment_status_cache:
        cached = payment_status_cache[request.originalUetr]
        return Pacs028Response(
            originalUetr=request.originalUetr,
            paymentFound=True,
            currentStatus=cached.get("status"),
            statusReasonCode=cached.get("reasonCode"),
            lastStatusUpdateAt=cached.get("updatedAt"),
            advice="Status found in cache. This is the latest known status.",
            respondedAt=responded_at.isoformat()
        )
    
    # 2. Check database
    payment_check = await db.execute(
        text("SELECT status, updated_at FROM payments WHERE uetr = :uetr"),
        {"uetr": request.originalUetr}
    )
    payment = payment_check.fetchone()
    
    if payment:
        return Pacs028Response(
            originalUetr=request.originalUetr,
            paymentFound=True,
            currentStatus=payment.status,
            lastStatusUpdateAt=str(payment.updated_at) if payment.updated_at else None,
            advice="Payment found. This is the current database status.",
            respondedAt=responded_at.isoformat()
        )
    
    # 3. Not found - advise to re-send pacs.008 per Release 1 behavior
    return Pacs028Response(
        originalUetr=request.originalUetr,
        paymentFound=False,
        advice="Payment not found. Per Nexus Release 1 behavior: re-send the original pacs.008. "
               "Downstream systems will check for duplicates and respond with stored pacs.002 if already processed.",
        respondedAt=responded_at.isoformat()
    )


@router.post(
    "/status-cache/{uetr}",
    summary="Update Status Cache (Simulator)",
    description="Simulator endpoint to populate the status cache for pacs.028 testing."
)
async def update_status_cache(
    uetr: str,
    status: str = Query(..., description="Payment status (ACCC, RJCT, ACWP, etc.)"),
    reasonCode: Optional[str] = Query(None, description="Status reason code")
) -> dict:
    """Update the status cache for testing pacs.028."""
    
    updated_at = datetime.now(timezone.utc).isoformat()
    
    payment_status_cache[uetr] = {
        "uetr": uetr,
        "status": status,
        "reasonCode": reasonCode,
        "updatedAt": updated_at
    }
    
    return {
        "uetr": uetr,
        "status": status,
        "cached": True,
        "updatedAt": updated_at
    }
