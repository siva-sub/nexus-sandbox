"""
Bank to Customer Debit/Credit Notification (camt.054) for Reconciliation

Reference: NotebookLM query 2026-02-03

Purpose: Allows IPS Operators to reconcile transactions with Nexus
Version: camt.054.001.11
Frequency: Daily (configurable) or on-demand via API
Content: All transactions with final status (ACCC, BLCK, RJCT) in period
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import datetime, timezone, timedelta
from ..db import get_db

router = APIRouter(prefix="/v1/reconciliation", tags=["Reconciliation"])


# =============================================================================
# Pydantic Models for camt.054 Response
# =============================================================================

from .schemas import TransactionEntry, TransactionSummary, Camt054Response


# =============================================================================
# GET /reconciliation/camt054 - Generate Reconciliation Report
# =============================================================================

@router.get(
    "/camt054",
    response_model=Camt054Response,
    summary="Generate camt.054 reconciliation report",
    description="""
    **IPS Reconciliation Report**
    
    Generates a camt.054.001.11 Bank to Customer Debit/Credit Notification
    for an IPS Operator to reconcile their transactions with Nexus.
    
    ## Report Contents (NotebookLM confirmed)
    
    - **Summary**: Total count, total amount, net debit/credit
    - **Entries**: All transactions with final status in period
    - **IDs**: Message ID, Instruction ID, UETR, Clearing System Ref, FX Quote ID
    - **Parties**: Debtor/Creditor names and agents (BIC)
    
    ## Filters
    
    - **period_start/period_end**: Custom date range (ISO 8601)
    - **status**: Filter by status (ACCC, BLCK, RJCT, or ALL)
    - Default: Last 24 hours, ALL statuses
    
    ## Frequency Options
    
    - **Daily**: Auto-generated at IPS-configured time
    - **On-demand**: Call this API for custom period
    
    Reference: https://docs.nexusglobalpayments.org/settlement-access-provision/reconciliation
    """
)
async def generate_camt054(
    ips_operator_id: str = Query(..., alias="ipsOperatorId", description="IPS Operator ID"),
    period_start: Optional[str] = Query(None, alias="periodStart", description="Period start (ISO 8601)"),
    period_end: Optional[str] = Query(None, alias="periodEnd", description="Period end (ISO 8601)"),
    status: str = Query("ALL", description="Filter by status: ACCC, BLCK, RJCT, or ALL"),
    db: AsyncSession = Depends(get_db)
) -> Camt054Response:
    """Generate camt.054 reconciliation report from real payment data."""
    now = datetime.now(timezone.utc)
    
    # Default period: last 24 hours
    if not period_end:
        end_dt = now
    else:
        end_dt = datetime.fromisoformat(period_end.replace('Z', '+00:00'))
    
    if not period_start:
        start_dt = end_dt - timedelta(hours=24)
    else:
        start_dt = datetime.fromisoformat(period_start.replace('Z', '+00:00'))
    
    # Query real payments from database
    status_filter = ""
    if status != "ALL":
        status_filter = "AND status = :status"
    
    query = text(f"""
        SELECT 
            p.uetr::text,
            p.quote_id,
            p.status,
            p.source_psp_bic as debtor_agent,
            p.destination_psp_bic as creditor_agent,
            p.debtor_name,
            p.debtor_account,
            p.creditor_name,
            p.creditor_account,
            p.source_amount::text as amount,
            p.source_currency as currency,
            p.created_at,
            COALESCE(
                (SELECT data->>'statusReasonCode' FROM payment_events 
                 WHERE payment_events.uetr = p.uetr 
                 AND event_type IN ('PAYMENT_REJECTED', 'PAYMENT_BLOCKED')
                 ORDER BY created_at DESC LIMIT 1),
                NULL
            ) as status_reason_code
        FROM payments p
        WHERE p.created_at >= :start_dt
        AND p.created_at <= :end_dt
        AND p.status IN ('ACCC', 'RJCT', 'BLCK')
        {status_filter}
        ORDER BY p.created_at DESC
        LIMIT 1000
    """)
    
    params = {"start_dt": start_dt, "end_dt": end_dt}
    if status != "ALL":
        params["status"] = status
    
    result = await db.execute(query, params)
    rows = result.fetchall()
    
    # Build entries from real data
    entries = []
    for row in rows:
        entries.append(TransactionEntry(
            messageId=f"MSG-{row.uetr[:8]}",
            instructionId=f"INS-{row.uetr[:8]}",
            uetr=row.uetr,
            clearingSystemRef=f"NEXUS-{row.uetr[:12]}",
            nexusFxQuoteId=row.quote_id,
            transactionStatus=row.status,
            statusReasonCode=row.status_reason_code,
            debtorName=row.debtor_name or "Unknown",
            debtorAgent=row.debtor_agent or "UNKNOWN",
            creditorName=row.creditor_name or "Unknown",
            creditorAgent=row.creditor_agent or "UNKNOWN",
            amount=row.amount or "0.00",
            currency=row.currency or "XXX",
            transactionDateTime=row.created_at.isoformat() if row.created_at else now.isoformat()
        ))
    
    # If no real data found, include demo example
    if len(entries) == 0:
        entries.append(TransactionEntry(
            messageId="MSG-DEMO-001",
            instructionId="INS-DEMO-001",
            uetr="00000000-0000-0000-0000-000000000000",
            clearingSystemRef="NEXUS-DEMO-00000",
            nexusFxQuoteId=None,
            transactionStatus="ACCC",
            statusReasonCode=None,
            debtorName="(No payments in period)",
            debtorAgent="XXXXX",
            creditorName="(Run Interactive Demo to generate data)",
            creditorAgent="XXXXX",
            amount="0.00",
            currency="SGD",
            transactionDateTime=now.isoformat()
        ))
    
    # Calculate summary from real data
    success_count = sum(1 for e in entries if e.transactionStatus == "ACCC")
    rejected_count = sum(1 for e in entries if e.transactionStatus == "RJCT")
    blocked_count = sum(1 for e in entries if e.transactionStatus == "BLCK")
    
    total_amount = sum(float(e.amount) for e in entries if e.amount and e.amount != "0.00")
    currency = entries[0].currency if entries else "SGD"
    
    return Camt054Response(
        messageId=f"CAMT054-{ips_operator_id}-{now.strftime('%Y%m%d%H%M%S')}",
        creationDateTime=now.isoformat(),
        periodStart=start_dt.isoformat(),
        periodEnd=end_dt.isoformat(),
        ipsOperatorId=ips_operator_id,
        summary=TransactionSummary(
            totalCount=len(entries),
            totalAmount=f"{total_amount:.2f}",
            currency=currency,
            netDebitCredit="DBIT" if total_amount > 0 else "CRDT",
            successCount=success_count,
            rejectedCount=rejected_count,
            blockedCount=blocked_count
        ),
        entries=entries
    )


# =============================================================================
# GET /reconciliation/summary - Quick Summary
# =============================================================================

@router.get(
    "/summary",
    summary="Get reconciliation summary",
    description="""
    Quick summary of transaction statuses without full entries.
    Useful for dashboards and monitoring.
    """
)
async def get_reconciliation_summary(
    ips_operator_id: str = Query(..., alias="ipsOperatorId"),
    period_hours: int = Query(24, alias="periodHours", ge=1, le=168),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Get quick reconciliation summary."""
    now = datetime.now(timezone.utc)
    period_start = now - timedelta(hours=period_hours)
    
    # For sandbox: return example summary
    return {
        "ipsOperatorId": ips_operator_id,
        "periodStart": period_start.isoformat(),
        "periodEnd": now.isoformat(),
        "periodHours": period_hours,
        "counts": {
            "total": 127,
            "successful": 118,
            "rejected": 7,
            "blocked": 2
        },
        "amounts": {
            "totalProcessed": "1250000.00",
            "successful": "1180000.00",
            "rejected": "65000.00",
            "blocked": "5000.00",
            "currency": "SGD"
        },
        "successRate": "92.9%"
    }
