"""
Payments Explorer API - Transaction History and Event Audit
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import json

from ..db import get_db

router = APIRouter(prefix="/v1", tags=["Payments"])

@router.get("/payments")
async def list_payments(
    status: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """List recent payments."""
    query_str = "SELECT * FROM payments"
    params = {}
    
    if status:
        query_str += " WHERE status = :status"
        params["status"] = status
        
    query_str += " ORDER BY initiated_at DESC LIMIT :limit"
    params["limit"] = limit
    
    result = await db.execute(text(query_str), params)
    return {"payments": [dict(row._mapping) for row in result.fetchall()]}

@router.get("/payments/{uetr}/events")
async def get_payment_events(
    uetr: str,
    correlation_id: Optional[str] = Query(None, description="Optional correlation ID for addressing events (acmt.023/acmt.024)"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all events and ISO messages for a transaction.
    
    Per Nexus official documentation: Proxy resolution (acmt.023/acmt.024) occurs 
    BEFORE payment initiation and uses a correlation ID, not the UETR. If you 
    have the correlation_id from proxy resolution, pass it to see addressing events.
    """
    # Get payment events by UETR
    query = text("""
        SELECT * FROM payment_events 
        WHERE uetr = :uetr 
        ORDER BY occurred_at ASC
    """)
    
    result = await db.execute(query, {"uetr": uetr})
    events = []
    for row in result.fetchall():
        event = dict(row._mapping)
        if isinstance(event.get("data"), str):
            event["data"] = json.loads(event["data"])
        events.append(event)
    
    # If correlation_id provided, also get addressing events
    # Per Nexus spec: addressing events are separate from payment events
    if correlation_id:
        addr_query = text("""
            SELECT * FROM payment_events 
            WHERE correlation_id = :correlation_id 
              AND (event_type = 'ADDRESSING_REQUESTED' OR event_type = 'ADDRESSING_RESOLVED' OR event_type = 'ADDRESSING_FAILED')
            ORDER BY occurred_at ASC
        """)
        addr_result = await db.execute(addr_query, {"correlation_id": correlation_id})
        for row in addr_result.fetchall():
            event = dict(row._mapping)
            if isinstance(event.get("data"), str):
                event["data"] = json.loads(event["data"])
            # Mark as addressing event
            event["is_addressing_event"] = True
            events.append(event)
        
    return {"uetr": uetr, "events": events}


@router.get("/payments/{uetr}/messages")
async def get_payment_messages(
    uetr: str,
    correlation_id: Optional[str] = Query(None, description="Optional correlation ID for addressing messages (acmt.023/acmt.024)"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get raw ISO 20022 XML messages for a transaction.
    
    Returns all available message types including Release 1, Optional SAP, and Future messages.
    Reference: ADR-011 - Developer Observability, ADR-013 - E2E Demo Integration
    
    Per Nexus official documentation: Proxy resolution (acmt.023/acmt.024) uses a 
    correlation ID, not the UETR. Pass correlation_id to include addressing messages.
    """
    query = text("""
        SELECT event_type, occurred_at,
               pacs008_message, pacs002_message, acmt023_message, acmt024_message,
               camt054_message, camt103_message, pain001_message,
               pacs004_message, pacs028_message, camt056_message, camt029_message
        FROM payment_events 
        WHERE uetr = :uetr 
        ORDER BY occurred_at ASC
    """)
    
    result = await db.execute(query, {"uetr": uetr})
    messages = []
    
    # Message type definitions
    message_types = {
        "pacs008_message": ("pacs.008", "outbound", "FI to FI Customer Credit Transfer (Payment Instruction)"),
        "pacs002_message": ("pacs.002", "inbound", "Payment Status Report (Acceptance/Rejection)"),
        "acmt023_message": ("acmt.023", "outbound", "Identification Verification Request (Proxy Resolution)"),
        "acmt024_message": ("acmt.024", "inbound", "Identification Verification Report"),
        "camt054_message": ("camt.054", "inbound", "Bank to Customer Debit Credit Notification (Reconciliation)"),
        "camt103_message": ("camt.103", "outbound", "Create Reservation (SAP Integration Method 2a)"),
        "pain001_message": ("pain.001", "outbound", "Customer Credit Transfer Initiation (SAP Integration Method 3)"),
        "pacs004_message": ("pacs.004", "outbound", "Payment Return (Future - Release 2)"),
        "pacs028_message": ("pacs.028", "outbound", "FI to FI Payment Status Request (Future - Release 2)"),
        "camt056_message": ("camt.056", "outbound", "FI to FI Payment Cancellation Request (Recall - Future)"),
        "camt029_message": ("camt.029", "inbound", "Resolution of Investigation (Recall Response - Future)"),
    }
    
    for row in result.fetchall():
        msg = dict(row._mapping)
        
        # Check each message type
        for column, (msg_type, direction, description) in message_types.items():
            if msg.get(column):
                messages.append({
                    "messageType": msg_type,
                    "direction": direction,
                    "description": description,
                    "xml": msg[column],
                    "timestamp": str(msg["occurred_at"]) if msg.get("occurred_at") else None
                })
    
    # If correlation_id provided, also get addressing messages (acmt.023/acmt.024)
    # Per Nexus spec: addressing uses correlation ID, not UETR
    if correlation_id:
        addr_query = text("""
            SELECT event_type, occurred_at, acmt023_message, acmt024_message
            FROM payment_events 
            WHERE correlation_id = :correlation_id
              AND (event_type = 'ADDRESSING_REQUESTED' OR event_type = 'ADDRESSING_RESOLVED' OR event_type = 'ADDRESSING_FAILED')
            ORDER BY occurred_at ASC
        """)
        addr_result = await db.execute(addr_query, {"correlation_id": correlation_id})
        
        for row in addr_result.fetchall():
            msg = dict(row._mapping)
            if msg.get("acmt023_message"):
                messages.append({
                    "messageType": "acmt.023",
                    "direction": "outbound",
                    "description": "Identification Verification Request (Proxy Resolution)",
                    "xml": msg["acmt023_message"],
                    "timestamp": str(msg["occurred_at"]) if msg.get("occurred_at") else None
                })
            if msg.get("acmt024_message"):
                messages.append({
                    "messageType": "acmt.024",
                    "direction": "inbound",
                    "description": "Identification Verification Report",
                    "xml": msg["acmt024_message"],
                    "timestamp": str(msg["occurred_at"]) if msg.get("occurred_at") else None
                })
    
    # Sort all messages by timestamp
    messages.sort(key=lambda x: x["timestamp"] or "")
    
    return {
        "uetr": uetr,
        "messageCount": len(messages),
        "messages": messages
    }


@router.get("/payments/{uetr}/status")
async def get_payment_status(
    uetr: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get current payment status with reason codes.
    
    Returns the latest status from pacs.002 for quick status checks.
    Reference: ADR-011 - Developer Observability
    """
    query = text("""
        SELECT p.*, pe.event_type, pe.data as latest_event_data
        FROM payments p
        LEFT JOIN (
            SELECT DISTINCT ON (uetr) *
            FROM payment_events
            ORDER BY uetr, occurred_at DESC
        ) pe ON p.uetr = pe.uetr
        WHERE p.uetr = :uetr
    """)
    
    result = await db.execute(query, {"uetr": uetr})
    row = result.fetchone()
    
    if not row:
        return {"uetr": uetr, "status": "NOT_FOUND", "message": "Payment not found"}
    
    payment = dict(row._mapping)
    event_data = payment.get("latest_event_data", {})
    if isinstance(event_data, str):
        event_data = json.loads(event_data)
    
    # Status reason codes - check both key names used across the codebase
    reason_code = (
        event_data.get("statusReasonCode") or 
        event_data.get("reason_code") or 
        payment.get("reason_code")
    )
    
    # Reason descriptions map — full set matching pacs008.py scenario_descriptions
    reason_descriptions = {
        "AB04": "Quote Expired / Exchange Rate Mismatch",
        "TM01": "Timeout - Invalid Cut Off Time",
        "DUPL": "Duplicate Payment Detected",
        "AC01": "Incorrect Account Number",
        "AC04": "Closed Account - Recipient account is closed",
        "AM02": "Amount Limit Exceeded - Above max transfer limit",
        "AM04": "Insufficient Funds - Sender balance insufficient",
        "MS02": "Not Specified Reason - Customer Generated",
        "RR04": "Regulatory Block - Transaction blocked by compliance",
        "BE23": "Invalid Proxy - Recipient identifier not found",
        "RC11": "Invalid Settlement Account Provider",
        "AB03": "Timeout - Transaction Aborted",
    }
    
    # Try to get reason description from event data, then fall back to our map
    reason_desc = event_data.get("reason_description")
    if not reason_desc and isinstance(event_data.get("errors"), list) and event_data.get("errors"):
        reason_desc = event_data["errors"][0]
    if not reason_desc:
        reason_desc = reason_descriptions.get(reason_code, "")
    
    return {
        "uetr": uetr,
        "status": payment.get("status", "UNKNOWN"),
        "statusReasonCode": reason_code,
        "reasonDescription": reason_desc or reason_descriptions.get(reason_code, ""),
        "sourcePsp": payment.get("source_psp_bic"),
        "destinationPsp": payment.get("destination_psp_bic"),
        "amount": payment.get("amount"),
        "currency": payment.get("currency"),
        "initiatedAt": str(payment.get("initiated_at")) if payment.get("initiated_at") else None,
        "completedAt": str(payment.get("completed_at")) if payment.get("completed_at") else None
    }

