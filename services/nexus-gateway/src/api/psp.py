"""
PSP (Payment Service Provider) API endpoints.

Reference: https://docs.nexusglobalpayments.org/apis/financial-institutions
Reference: https://docs.nexusglobalpayments.org/introduction/terminology

PSPs are banks or financial institutions that:
- Source PSP (Debtor Agent): Initiates cross-border payments on behalf of senders
- Destination PSP (Creditor Agent): Receives payments and credits recipients
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db

router = APIRouter(prefix="/v1/psps", tags=["Payment Service Providers"])


from .schemas import PSPResponse, PSPListResponse, PSPPaymentSummary


@router.get("", response_model=PSPListResponse)
async def list_psps(
    country_code: Optional[str] = Query(None, alias="countryCode", description="Filter by country code"),
    db: AsyncSession = Depends(get_db)
):
    """
    List all registered Payment Service Providers.
    
    PSPs can act as:
    - Source PSP (sending payments)
    - Destination PSP (receiving payments)
    
    Reference: https://docs.nexusglobalpayments.org/apis/financial-institutions
    """
    if country_code:
        query = text("""
            SELECT psp_id, bic, name, country_code, fee_percent
            FROM psps
            WHERE country_code = :country_code
            ORDER BY name
        """)
        result = await db.execute(query, {"country_code": country_code.upper()})
    else:
        query = text("""
            SELECT psp_id, bic, name, country_code, fee_percent
            FROM psps
            ORDER BY country_code, name
        """)
        result = await db.execute(query)
    
    rows = result.fetchall()
    psps = [
        PSPResponse(
            psp_id=row.psp_id,
            bic=row.bic,
            name=row.name,
            country_code=row.country_code,
            fee_percent=float(row.fee_percent) if row.fee_percent else 0.0
        )
        for row in rows
    ]
    
    return PSPListResponse(psps=psps, total=len(psps))


@router.get("/{bic}", response_model=PSPResponse)
async def get_psp(bic: str, db: AsyncSession = Depends(get_db)):
    """
    Get details of a specific PSP by BIC.
    
    Reference: https://docs.nexusglobalpayments.org/messaging/financial-institution-identification
    """
    query = text("""
        SELECT psp_id, bic, name, country_code, fee_percent
        FROM psps
        WHERE bic = :bic
    """)
    result = await db.execute(query, {"bic": bic.upper()})
    row = result.fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail=f"PSP with BIC {bic} not found")
    
    return PSPResponse(
        psp_id=row.psp_id,
        bic=row.bic,
        name=row.name,
        country_code=row.country_code,
        fee_percent=float(row.fee_percent) if row.fee_percent else 0.0
    )


@router.get("/{bic}/payment-summary", response_model=PSPPaymentSummary)
async def get_psp_payment_summary(bic: str, db: AsyncSession = Depends(get_db)):
    """
    Get payment summary for a PSP.
    
    Shows aggregate statistics for payments where this PSP acted as
    either Source PSP (sender) or Destination PSP (receiver).
    """
    # For sandbox, return demo data
    # In production, this would query the payments table
    return PSPPaymentSummary(
        total_sent=42,
        total_received=38,
        total_amount_sent=125000.00,
        total_amount_received=98500.00,
        currency="SGD"
    )
