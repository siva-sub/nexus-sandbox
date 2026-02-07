"""
Payment Return and Recall Processing

pacs.004 - PaymentReturn (Return payment initiated by Destination PSP)
camt.056 - FI to FI Payment Cancellation Request (Recall initiated by Source PSP)
camt.029 - Resolution of Investigation (Response to recall)
pacs.028 - FI to FI Payment Status Request

> [!NOTE] Nexus Release 1 Status
> pacs.004 and camt.056 are not supported in production Release 1.
> This sandbox provides functional simulation for educational purposes.
> Set NEXUS_RELEASE_1_STRICT=true to enforce 501 Not Implemented behavior.

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

from .schemas import (
    Pacs004Request,
    Pacs004Response,
    Camt056Request,
    Camt056Response,
    RecallListResponse,
    Camt029Request,
    Camt029Response,
    Pacs028Request,
    Pacs028Response
)


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
    summary="pacs.004 Payment Return",
    description="""
    **Process pacs.004 Payment Return**
    
    Accepts a payment return request from the Destination PSP.
    
    > [!NOTE] Nexus Release 1 Status
    > In production Release 1, returns use a **new pacs.008** with `NexusOrgnlUETR:` prefix.
    > This sandbox simulates pacs.004 processing for educational purposes.
    > Set `NEXUS_RELEASE_1_STRICT=true` to enforce 501 behavior.
    
    ## Sandbox Behavior
    
    1. Validates the return request
    2. Records the return with reason code
    3. Links return to original payment via UETR
    4. Updates payment status cache
    """
)
async def receive_pacs004(
    request: Pacs004Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
) -> Pacs004Response:
    """Process incoming pacs.004 payment return."""
    
    import os
    # Strict Release 1 mode: return 501 like production
    if os.getenv("NEXUS_RELEASE_1_STRICT", "false").lower() == "true":
        response.headers["X-Nexus-Feature-Status"] = "FUTURE"
        response.headers["X-Nexus-Release"] = "Available in Release 2"
        raise HTTPException(
            status_code=501,
            detail={
                "error": "FEATURE_NOT_IMPLEMENTED",
                "message": "pacs.004 PaymentReturn is not supported in strict Release 1 mode.",
                "alternative": "Use POST /v1/iso20022/pacs008 with NexusOrgnlUETR: prefix in remittance info",
                "hint": "Set NEXUS_RELEASE_1_STRICT=false to enable sandbox simulation"
            }
        )
    
    # Sandbox mode: simulate pacs.004 processing
    processed_at = datetime.now(timezone.utc)
    return_id = str(uuid4())
    
    # Validate reason code
    try:
        reason = ReturnReasonCode(request.returnReasonCode)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid return reason code: {request.returnReasonCode}. "
                   f"Valid codes: {[e.value for e in ReturnReasonCode]}"
        )
    
    # Record the return
    return_record = {
        "returnId": return_id,
        "originalUetr": request.originalUetr,
        "returnReasonCode": reason.value,
        "returnReasonText": request.returnReasonText or "",
        "amount": request.amount,
        "currency": request.currency,
        "initiatedBy": request.initiatedBy or "DESTINATION_PSP",
        "status": "COMPLETED",
        "processedAt": processed_at.isoformat(),
    }
    return_payments.append(return_record)
    
    # Update status cache for pacs.028 queries
    payment_status_cache[request.originalUetr] = {
        "uetr": request.originalUetr,
        "status": "RTRN",
        "reasonCode": reason.value,
        "updatedAt": processed_at.isoformat()
    }
    
    response.headers["X-Nexus-Feature-Status"] = "SANDBOX"
    
    return Pacs004Response(
        originalUetr=request.originalUetr,
        returnId=return_id,
        status="COMPLETED",
        message=f"Payment return processed (sandbox). Reason: {reason.value}",
        processedAt=processed_at.isoformat()
    )


# =============================================================================
# camt.056 - Cancellation/Recall Request Endpoints
# =============================================================================

@router.post(
    "/camt056",
    response_model=Camt056Response,
    summary="camt.056 Cancellation Request (Recall)",
    description="""
    **Process camt.056 Payment Cancellation Request (Recall)**
    
    Source PSP submits a recall request for a previously sent payment.
    
    > [!NOTE] Nexus Release 1 Status
    > In production Release 1, recalls use the Nexus Service Desk.
    > This sandbox simulates camt.056 processing for educational purposes.
    > Set `NEXUS_RELEASE_1_STRICT=true` to enforce 501 behavior.
    
    ## Sandbox Behavior
    
    1. Validates the cancellation request
    2. Creates a pending recall with unique ID
    3. D-PSP can respond via `/recalls/{uetr}/respond`
    4. Resolution tracked via camt.029
    """
)
async def submit_camt056(
    request: Camt056Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
) -> Camt056Response:
    """Submit a payment recall request."""
    
    import os
    # Strict Release 1 mode: return 501 like production
    if os.getenv("NEXUS_RELEASE_1_STRICT", "false").lower() == "true":
        response.headers["X-Nexus-Feature-Status"] = "FUTURE"
        response.headers["X-Nexus-Release"] = "Available in Release 2"
        raise HTTPException(
            status_code=501,
            detail={
                "error": "FEATURE_NOT_IMPLEMENTED",
                "message": "camt.056 is not supported in strict Release 1 mode.",
                "alternative": "Log a 'Payment Recall Request' in the Nexus Service Desk portal",
                "hint": "Set NEXUS_RELEASE_1_STRICT=false to enable sandbox simulation"
            }
        )
    
    # Sandbox mode: simulate camt.056 processing
    processed_at = datetime.now(timezone.utc)
    recall_id = f"RECALL-{uuid4().hex[:12].upper()}"
    
    # Validate reason code
    try:
        reason = CancellationReasonCode(request.cancellationReasonCode)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid cancellation reason code: {request.cancellationReasonCode}. "
                   f"Valid codes: {[e.value for e in CancellationReasonCode]}"
        )
    
    # Check for duplicate recall
    if request.originalUetr in pending_recalls:
        existing = pending_recalls[request.originalUetr]
        if existing["status"] == RecallStatus.PENDING.value:
            raise HTTPException(
                status_code=409,
                detail=f"Recall already pending for UETR {request.originalUetr}. "
                       f"Recall ID: {existing['recallId']}"
            )
    
    # Create recall request  
    pending_recalls[request.originalUetr] = {
        "recallId": recall_id,
        "originalUetr": request.originalUetr,
        "cancellationReasonCode": reason.value,
        "cancellationReasonText": request.cancellationReasonText or "",
        "requestedBy": request.requestedBy or "SOURCE_PSP",
        "status": RecallStatus.PENDING.value,
        "createdAt": processed_at.isoformat(),
        "slaDeadline": None,  # Would be calculated from SLA config
    }
    
    # Update status cache
    payment_status_cache[request.originalUetr] = {
        "uetr": request.originalUetr,
        "status": "RECALL_PENDING",
        "reasonCode": reason.value,
        "updatedAt": processed_at.isoformat()
    }
    
    response.headers["X-Nexus-Feature-Status"] = "SANDBOX"
    
    return Camt056Response(
        originalUetr=request.originalUetr,
        recallId=recall_id,
        status=RecallStatus.PENDING.value,
        message=f"Recall request created (sandbox). Reason: {reason.value}. "
                f"D-PSP can respond via POST /v1/iso20022/recalls/{request.originalUetr}/respond",
        processedAt=processed_at.isoformat()
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
        total=len(recalls),
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
