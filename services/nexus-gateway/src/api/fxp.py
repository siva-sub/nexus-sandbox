"""
FXP (Foreign Exchange Provider) API Module

Reference: https://docs.nexusglobalpayments.org/apis/financial-institutions

This module provides endpoints for FXPs to:
- Submit FX rates for corridors
- Withdraw rates
- Manage PSP relationships
- Receive trade notifications
"""

from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional, List
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Depends, Query, Path
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_db

router = APIRouter(prefix="/v1/fxp", tags=["FX Providers"])


# =============================================================================
# Schemas
# =============================================================================

class FXPRateSubmission(BaseModel):
    """FXP rate submission request."""
    source_currency: str = Field(..., alias="sourceCurrency", min_length=3, max_length=3)
    destination_currency: str = Field(..., alias="destinationCurrency", min_length=3, max_length=3)
    rate: Decimal = Field(..., gt=0, description="Base exchange rate")
    spread_bps: int = Field(..., alias="spreadBps", ge=0, le=1000, description="Spread in basis points")
    valid_for_seconds: int = Field(default=600, alias="validForSeconds", ge=60, le=3600)
    
    class Config:
        populate_by_name = True


class FXPRateResponse(BaseModel):
    """FXP rate response."""
    rate_id: str = Field(..., alias="rateId")
    fxp_id: str = Field(..., alias="fxpId")
    fxp_name: str = Field(..., alias="fxpName")
    source_currency: str = Field(..., alias="sourceCurrency")
    destination_currency: str = Field(..., alias="destinationCurrency")
    rate: str
    spread_bps: int = Field(..., alias="spreadBps")
    effective_rate: str = Field(..., alias="effectiveRate")
    valid_until: str = Field(..., alias="validUntil")
    status: str
    
    class Config:
        populate_by_name = True


class PSPRelationshipCreate(BaseModel):
    """Create PSP relationship with tier."""
    psp_bic: str = Field(..., alias="pspBic")
    tier: str = Field(..., description="Tier name: STANDARD, VOLUME, PREMIUM")
    improvement_bps: int = Field(..., alias="improvementBps", ge=0, le=100)
    
    class Config:
        populate_by_name = True


class PSPRelationshipResponse(BaseModel):
    """PSP relationship response."""
    relationship_id: str = Field(..., alias="relationshipId")
    fxp_id: str = Field(..., alias="fxpId")
    psp_bic: str = Field(..., alias="pspBic")
    psp_name: str = Field(..., alias="pspName")
    tier: str
    improvement_bps: int = Field(..., alias="improvementBps")
    created_at: str = Field(..., alias="createdAt")
    
    class Config:
        populate_by_name = True


class TradeNotification(BaseModel):
    """Trade notification sent to FXP when their rate is selected."""
    trade_id: str = Field(..., alias="tradeId")
    uetr: str
    quote_id: str = Field(..., alias="quoteId")
    fxp_id: str = Field(..., alias="fxpId")
    source_currency: str = Field(..., alias="sourceCurrency")
    destination_currency: str = Field(..., alias="destinationCurrency")
    amount: str
    rate: str
    timestamp: str
    
    class Config:
        populate_by_name = True


class FXPBalanceResponse(BaseModel):
    """FXP balance at SAP."""
    sap_id: str = Field(..., alias="sapId")
    sap_name: str = Field(..., alias="sapName")
    sap_bic: str = Field(..., alias="sapBic")
    currency: str
    total_balance: str = Field(..., alias="totalBalance")
    reserved_balance: str = Field(..., alias="reservedBalance")
    available_balance: str = Field(..., alias="availableBalance")
    status: str  # ACTIVE, LOW, CRITICAL
    
    class Config:
        populate_by_name = True


# =============================================================================
# Rate Management
# =============================================================================

@router.post("/rates", response_model=FXPRateResponse)
async def submit_rate(
    request: FXPRateSubmission,
    fxp_bic: str = Query("FXP-GLOBAL", alias="fxpBic", description="BIC of the FXP"),
    db: AsyncSession = Depends(get_db),
) -> FXPRateResponse:
    """
    Submit FX rates for a corridor.
    
    FXPs use this endpoint to publish their rates to Nexus.
    The rate will be included in quote aggregation for the specified corridor.
    
    Reference: https://docs.nexusglobalpayments.org/fx-provision/rates-from-third-party-fx-providers
    """
    # Verify FXP exists
    fxp_query = text("SELECT fxp_id, name FROM fxps WHERE fxp_code = :fxp_code")
    result = await db.execute(fxp_query, {"fxp_code": fxp_bic.upper()})
    fxp = result.fetchone()
    
    if not fxp:
        raise HTTPException(status_code=404, detail=f"FXP with BIC {fxp_bic} not found")
    
    # Calculate effective rate (rate minus spread)
    spread_factor = Decimal(request.spread_bps) / Decimal("10000")
    effective_rate = request.rate * (Decimal("1") - spread_factor)
    
    # Create rate entry
    rate_id = str(uuid4())
    valid_until = datetime.now(timezone.utc) + timedelta(seconds=request.valid_for_seconds)
    
    insert_query = text("""
        INSERT INTO fxp_rates (
            rate_id, fxp_id, source_currency, destination_currency,
            base_rate, spread_bps, effective_rate, valid_until, status, created_at
        ) VALUES (
            :rate_id, :fxp_id, :source_currency, :destination_currency,
            :base_rate, :spread_bps, :effective_rate, :valid_until, 'ACTIVE', NOW()
        )
    """)
    
    await db.execute(insert_query, {
        "rate_id": rate_id,
        "fxp_id": fxp.fxp_id,
        "source_currency": request.source_currency.upper(),
        "destination_currency": request.destination_currency.upper(),
        "base_rate": str(request.rate),
        "spread_bps": request.spread_bps,
        "effective_rate": str(effective_rate),
        "valid_until": valid_until,
    })
    await db.commit()
    
    return FXPRateResponse(
        rate_id=rate_id,
        fxp_id=fxp.fxp_id,
        fxp_name=fxp.name,
        source_currency=request.source_currency.upper(),
        destination_currency=request.destination_currency.upper(),
        rate=str(request.rate),
        spread_bps=request.spread_bps,
        effective_rate=str(effective_rate),
        valid_until=valid_until.isoformat(),
        status="ACTIVE"
    )


@router.delete("/rates/{rate_id}")
async def withdraw_rate(
    rate_id: str = Path(..., description="ID of the rate to withdraw"),
    fxp_bic: str = Query("FXP-GLOBAL", alias="fxpBic", description="BIC of the FXP"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Withdraw a previously submitted rate.
    
    Marks the rate as WITHDRAWN so it will not be included in future quotes.
    
    Reference: https://docs.nexusglobalpayments.org/fx-provision/rates-from-third-party-fx-providers
    """
    # Verify FXP exists
    fxp_query = text("SELECT fxp_id FROM fxps WHERE fxp_code = :fxp_code")
    result = await db.execute(fxp_query, {"fxp_code": fxp_bic.upper()})
    fxp = result.fetchone()
    
    if not fxp:
        raise HTTPException(status_code=404, detail=f"FXP with BIC {fxp_bic} not found")
    
    # Mark rate as withdrawn
    update_query = text("""
        UPDATE fxp_rates 
        SET status = 'WITHDRAWN', withdrawn_at = NOW()
        WHERE rate_id = :rate_id AND fxp_id = :fxp_id AND status = 'ACTIVE'
        RETURNING rate_id
    """)
    
    result = await db.execute(update_query, {
        "rate_id": rate_id,
        "fxp_id": fxp.fxp_id
    })
    
    if not result.fetchone():
        raise HTTPException(status_code=404, detail=f"Rate {rate_id} not found or already withdrawn")
    
    await db.commit()
    
    return {
        "rateId": rate_id,
        "status": "WITHDRAWN",
        "message": "Rate successfully withdrawn. It will no longer be included in quotes."
    }


@router.get("/rates", response_model=List[FXPRateResponse])
async def list_active_rates(
    fxp_bic: str = Query("FXP-GLOBAL", alias="fxpBic", description="BIC of the FXP"),
    corridor: Optional[str] = Query(None, description="Filter by corridor (e.g., SGD-THB)"),
    db: AsyncSession = Depends(get_db),
) -> List[FXPRateResponse]:
    """
    List active rates submitted by the FXP.
    
    Returns all rates that are currently active and being included in quotes.
    """
    # Verify FXP exists
    fxp_query = text("SELECT fxp_id, name FROM fxps WHERE fxp_code = :fxp_code")
    result = await db.execute(fxp_query, {"fxp_code": fxp_bic.upper()})
    fxp = result.fetchone()
    
    if not fxp:
        raise HTTPException(status_code=404, detail=f"FXP with BIC {fxp_bic} not found")
    
    # Build query
    corridor_filter = ""
    params = {"fxp_id": fxp.fxp_id}
    
    if corridor:
        parts = corridor.split("-")
        if len(parts) == 2:
            corridor_filter = "AND source_currency = :src AND destination_currency = :dst"
            params["src"] = parts[0].upper()
            params["dst"] = parts[1].upper()
    
    rates_query = text(f"""
        SELECT 
            rate_id, source_currency, destination_currency,
            base_rate, spread_bps, effective_rate, valid_until, status
        FROM fxp_rates
        WHERE fxp_id = :fxp_id AND status = 'ACTIVE' AND valid_until > NOW()
        {corridor_filter}
        ORDER BY created_at DESC
    """)
    
    result = await db.execute(rates_query, params)
    rates = result.fetchall()

    return [
        FXPRateResponse(
            rate_id=str(r.rate_id),
            fxp_id=str(fxp.fxp_id),
            fxp_name=fxp.name,
            source_currency=r.source_currency,
            destination_currency=r.destination_currency,
            rate=str(r.base_rate),
            spread_bps=r.spread_bps,
            effective_rate=str(r.effective_rate),
            valid_until=r.valid_until.isoformat() if isinstance(r.valid_until, datetime) else str(r.valid_until),
            status=r.status
        )
        for r in rates
    ]


@router.get("/rates/history", response_model=List[FXPRateResponse])
async def list_rate_history(
    fxp_bic: str = Query("FXP-GLOBAL", alias="fxpBic", description="BIC of the FXP"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> List[FXPRateResponse]:
    """
    List historical rates submitted by the FXP (including expired/withdrawn).
    """
    # Verify FXP exists
    fxp_query = text("SELECT fxp_id, name FROM fxps WHERE fxp_code = :fxp_code")
    result = await db.execute(fxp_query, {"fxp_code": fxp_bic.upper()})
    fxp = result.fetchone()
    
    if not fxp:
        raise HTTPException(status_code=404, detail=f"FXP with BIC {fxp_bic} not found")
    
    rates_query = text("""
        SELECT 
            rate_id, source_currency, destination_currency,
            base_rate, spread_bps, effective_rate, valid_until, status
        FROM fxp_rates
        WHERE fxp_id = :fxp_id
        ORDER BY created_at DESC
        LIMIT :limit
    """)
    
    result = await db.execute(rates_query, {"fxp_id": fxp.fxp_id, "limit": limit})
    rates = result.fetchall()
    
    return [
        FXPRateResponse(
            rate_id=r.rate_id,
            fxp_id=fxp.fxp_id,
            fxp_name=fxp.name,
            source_currency=r.source_currency,
            destination_currency=r.destination_currency,
            rate=str(r.base_rate),
            spread_bps=r.spread_bps,
            effective_rate=str(r.effective_rate),
            valid_until=r.valid_until.isoformat() if isinstance(r.valid_until, datetime) else str(r.valid_until),
            status=r.status
        )
        for r in rates
    ]


# =============================================================================
# PSP Relationship Management
# =============================================================================

@router.post("/psp-relationships", response_model=PSPRelationshipResponse)
async def create_psp_relationship(
    request: PSPRelationshipCreate,
    fxp_bic: str = Query("FXP-GLOBAL", alias="fxpBic", description="BIC of the FXP"),
    db: AsyncSession = Depends(get_db),
) -> PSPRelationshipResponse:
    """
    Create a relationship with a PSP for tier-based rate improvements.
    
    Reference: https://docs.nexusglobalpayments.org/fx-provision/rate-improvements
    """
    # Verify FXP exists
    fxp_query = text("SELECT fxp_id FROM fxps WHERE fxp_code = :fxp_code")
    result = await db.execute(fxp_query, {"fxp_code": fxp_bic.upper()})
    fxp = result.fetchone()
    
    if not fxp:
        raise HTTPException(status_code=404, detail=f"FXP with BIC {fxp_bic} not found")
    
    # Verify PSP exists
    psp_query = text("SELECT psp_id, name FROM psps WHERE bic = :bic")
    result = await db.execute(psp_query, {"bic": request.psp_bic.upper()})
    psp = result.fetchone()
    
    if not psp:
        raise HTTPException(status_code=404, detail=f"PSP with BIC {request.psp_bic} not found")
    
    # Check if relationship already exists
    check_query = text("""
        SELECT relationship_id FROM fxp_psp_relationships
        WHERE fxp_id = :fxp_id AND psp_id = :psp_id
    """)
    result = await db.execute(check_query, {"fxp_id": fxp.fxp_id, "psp_id": psp.psp_id})
    existing = result.fetchone()
    
    if existing:
        # Update existing relationship
        update_query = text("""
            UPDATE fxp_psp_relationships
            SET tier = :tier, improvement_bps = :improvement_bps, updated_at = NOW()
            WHERE relationship_id = :rel_id
            RETURNING relationship_id, created_at
        """)
        result = await db.execute(update_query, {
            "tier": request.tier,
            "improvement_bps": request.improvement_bps,
            "rel_id": existing.relationship_id
        })
        row = result.fetchone()
        await db.commit()
        
        return PSPRelationshipResponse(
            relationship_id=row.relationship_id,
            fxp_id=fxp.fxp_id,
            psp_bic=request.psp_bic.upper(),
            psp_name=psp.name,
            tier=request.tier,
            improvement_bps=request.improvement_bps,
            created_at=row.created_at.isoformat() if isinstance(row.created_at, datetime) else str(row.created_at)
        )
    
    # Create new relationship
    rel_id = str(uuid4())
    insert_query = text("""
        INSERT INTO fxp_psp_relationships (
            relationship_id, fxp_id, psp_id, tier, improvement_bps, created_at
        ) VALUES (
            :rel_id, :fxp_id, :psp_id, :tier, :improvement_bps, NOW()
        )
        RETURNING created_at
    """)
    
    result = await db.execute(insert_query, {
        "rel_id": rel_id,
        "fxp_id": fxp.fxp_id,
        "psp_id": psp.psp_id,
        "tier": request.tier,
        "improvement_bps": request.improvement_bps
    })
    row = result.fetchone()
    await db.commit()
    
    return PSPRelationshipResponse(
        relationship_id=rel_id,
        fxp_id=fxp.fxp_id,
        psp_bic=request.psp_bic.upper(),
        psp_name=psp.name,
        tier=request.tier,
        improvement_bps=request.improvement_bps,
        created_at=row.created_at.isoformat() if isinstance(row.created_at, datetime) else str(row.created_at)
    )


@router.get("/psp-relationships", response_model=List[PSPRelationshipResponse])
async def list_psp_relationships(
    fxp_bic: str = Query("FXP-GLOBAL", alias="fxpBic", description="BIC of the FXP"),
    db: AsyncSession = Depends(get_db),
) -> List[PSPRelationshipResponse]:
    """
    List all PSP relationships for the FXP.
    """
    # Verify FXP exists
    fxp_query = text("SELECT fxp_id FROM fxps WHERE fxp_code = :fxp_code")
    result = await db.execute(fxp_query, {"fxp_code": fxp_bic.upper()})
    fxp = result.fetchone()
    
    if not fxp:
        raise HTTPException(status_code=404, detail=f"FXP with BIC {fxp_bic} not found")
    
    rels_query = text("""
        SELECT 
            r.relationship_id, r.fxp_id, p.bic as psp_bic, p.name as psp_name,
            r.tier, r.improvement_bps, r.created_at
        FROM fxp_psp_relationships r
        JOIN psps p ON r.psp_id = p.psp_id
        WHERE r.fxp_id = :fxp_id
        ORDER BY r.created_at DESC
    """)
    
    result = await db.execute(rels_query, {"fxp_id": fxp.fxp_id})
    relationships = result.fetchall()
    
    return [
        PSPRelationshipResponse(
            relationship_id=str(r.relationship_id),
            fxp_id=str(r.fxp_id),
            psp_bic=r.psp_bic,
            psp_name=r.psp_name,
            tier=r.tier,
            improvement_bps=r.improvement_bps,
            created_at=r.created_at.isoformat() if isinstance(r.created_at, datetime) else str(r.created_at)
        )
        for r in relationships
    ]


@router.delete("/psp-relationships/{psp_bic}")
async def delete_psp_relationship(
    psp_bic: str = Path(..., description="BIC of the PSP"),
    fxp_bic: str = Query("FXP-GLOBAL", alias="fxpBic", description="BIC of the FXP"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Delete a PSP relationship.
    """
    # Verify FXP exists
    fxp_query = text("SELECT fxp_id FROM fxps WHERE fxp_code = :fxp_code")
    result = await db.execute(fxp_query, {"fxp_code": fxp_bic.upper()})
    fxp = result.fetchone()
    
    if not fxp:
        raise HTTPException(status_code=404, detail=f"FXP with BIC {fxp_bic} not found")
    
    # Get PSP ID
    psp_query = text("SELECT psp_id FROM psps WHERE bic = :bic")
    result = await db.execute(psp_query, {"bic": psp_bic.upper()})
    psp = result.fetchone()
    
    if not psp:
        raise HTTPException(status_code=404, detail=f"PSP with BIC {psp_bic} not found")
    
    # Delete relationship
    delete_query = text("""
        DELETE FROM fxp_psp_relationships
        WHERE fxp_id = :fxp_id AND psp_id = :psp_id
        RETURNING relationship_id
    """)
    
    result = await db.execute(delete_query, {
        "fxp_id": fxp.fxp_id,
        "psp_id": psp.psp_id
    })
    
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Relationship not found")
    
    await db.commit()
    
    return {
        "message": f"Relationship with PSP {psp_bic} deleted successfully"
    }


# =============================================================================
# Trade Notifications
# =============================================================================

@router.get("/trades", response_model=List[TradeNotification])
async def list_trades(
    fxp_bic: str = Query("FXP-GLOBAL", alias="fxpBic", description="BIC of the FXP"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> List[TradeNotification]:
    """
    List trade notifications for the FXP.
    
    These are sent when the FXP's rate is selected for a payment.
    """
    # Verify FXP exists
    fxp_query = text("SELECT fxp_id FROM fxps WHERE fxp_code = :fxp_code")
    result = await db.execute(fxp_query, {"fxp_code": fxp_bic.upper()})
    fxp = result.fetchone()
    
    if not fxp:
        raise HTTPException(status_code=404, detail=f"FXP with BIC {fxp_bic} not found")
    
    # Get trades - in sandbox mode, generate sample trades from existing rates
    trades_query = text("""
        SELECT 
            rate_id as trade_id, rate_id as quote_id,
            :fxp_id_str as fxp_id, source_currency, destination_currency,
            base_rate as amount, effective_rate as rate,
            created_at as timestamp
        FROM fxp_rates
        WHERE fxp_id = :fxp_id_uuid
        ORDER BY created_at DESC
        LIMIT :limit
    """)
    
    result = await db.execute(trades_query, {"fxp_id_str": str(fxp.fxp_id), "fxp_id_uuid": fxp.fxp_id, "limit": limit})
    trades = result.fetchall()
    
    return [
        TradeNotification(
            trade_id=str(r.trade_id),
            uetr=f"sandbox-{str(r.trade_id)[:8]}",
            quote_id=str(r.quote_id),
            fxp_id=str(r.fxp_id),
            source_currency=r.source_currency,
            destination_currency=r.destination_currency,
            amount=str(r.amount),
            rate=str(r.rate),
            timestamp=r.timestamp.isoformat() if isinstance(r.timestamp, datetime) else str(r.timestamp)
        )
        for r in trades
    ]


# =============================================================================
# Liquidity (SAP Balances)
# =============================================================================

@router.get("/liquidity", response_model=List[FXPBalanceResponse])
async def get_liquidity_balances(
    fxp_bic: str = Query("FXP-GLOBAL", alias="fxpBic", description="BIC of the FXP"),
    db: AsyncSession = Depends(get_db),
) -> List[FXPBalanceResponse]:
    """
    Get FXP liquidity balances at all SAPs.
    
    Reference: https://docs.nexusglobalpayments.org/settlement-access-provision/liquidity
    """
    # Verify FXP exists
    fxp_query = text("SELECT fxp_id FROM fxps WHERE fxp_code = :fxp_code")
    result = await db.execute(fxp_query, {"fxp_code": fxp_bic.upper()})
    fxp = result.fetchone()
    
    if not fxp:
        raise HTTPException(status_code=404, detail=f"FXP with BIC {fxp_bic} not found")
    
    # Get balances from all SAP accounts
    balances_query = text("""
        SELECT 
            s.sap_id, s.name as sap_name, s.bic as sap_bic,
            a.currency_code, a.balance as total_balance,
            COALESCE(SUM(r.amount), 0) as reserved_balance
        FROM saps s
        JOIN fxp_sap_accounts a ON s.sap_id = a.sap_id
        LEFT JOIN sap_reservations r ON a.account_id = r.account_id AND r.status = 'ACTIVE'
        WHERE a.fxp_id = :fxp_id
        GROUP BY s.sap_id, s.name, s.bic, a.currency_code, a.balance
        ORDER BY s.name, a.currency_code
    """)
    
    result = await db.execute(balances_query, {"fxp_id": fxp.fxp_id})
    balances = result.fetchall()
    
    return [
        FXPBalanceResponse(
            sap_id=str(r.sap_id),
            sap_name=r.sap_name,
            sap_bic=r.sap_bic,
            currency=r.currency_code,
            total_balance=str(r.total_balance),
            reserved_balance=str(r.reserved_balance),
            available_balance=str(Decimal(str(r.total_balance)) - Decimal(str(r.reserved_balance))),
            status="LOW" if Decimal(str(r.total_balance)) - Decimal(str(r.reserved_balance)) < Decimal("1000") else "ACTIVE"
        )
        for r in balances
    ]
