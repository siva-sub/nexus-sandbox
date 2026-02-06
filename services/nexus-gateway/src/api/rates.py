"""
Rates API endpoints for FXP rate management.

Reference: https://docs.nexusglobalpayments.org/fx-provision/rates-from-third-party-fx-providers

FX Providers submit and manage their rates through these endpoints.
"""

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_db


router = APIRouter()


# =============================================================================
# Request/Response Models
# =============================================================================

from .schemas import RateSubmission, RateResponse


# =============================================================================
# Endpoints
# =============================================================================

@router.post(
    "/rates",
    response_model=RateResponse,
    status_code=201,
    summary="Submit FX Rate",
    description="""
    Submit a new FX rate.
    
    Reference: https://docs.nexusglobalpayments.org/fx-provision/rates-from-third-party-fx-providers
    
    FX Providers submit rates for currency pairs they support.
    Rates are used by Nexus to generate quotes for payments.
    
    ## Rate Improvements
    
    Base rates are adjusted by:
    - FXP's configured spread
    - Tier improvements for larger transactions
    - PSP-specific improvements
    
    These adjustments are applied at quote generation time, not here.
    """,
)
async def submit_rate(
    rate: RateSubmission,
    # TODO: Get FXP ID from JWT token
    fxp_code: str = "FXP-ABC",  # Temporary: should come from auth
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Submit a new FX rate."""
    
    # Get FXP ID from code
    fxp_query = text("""
        SELECT fxp_id, fxp_code, name
        FROM fxps
        WHERE fxp_code = :fxp_code
        AND participant_status = 'ACTIVE'
    """)
    
    result = await db.execute(fxp_query, {"fxp_code": fxp_code})
    fxp = result.fetchone()
    
    if not fxp:
        raise HTTPException(status_code=403, detail="FXP not found or not active")
    
    # Check if currencies are valid
    currency_query = text("""
        SELECT currency_code FROM currencies
        WHERE currency_code IN (:source, :dest)
    """)
    
    result = await db.execute(currency_query, {
        "source": rate.source_currency.upper(),
        "dest": rate.destination_currency.upper(),
    })
    currencies = [row.currency_code for row in result.fetchall()]
    
    if rate.source_currency.upper() not in currencies:
        raise HTTPException(
            status_code=400,
            detail=f"Source currency {rate.source_currency} not supported",
        )
    
    if rate.destination_currency.upper() not in currencies:
        raise HTTPException(
            status_code=400,
            detail=f"Destination currency {rate.destination_currency} not supported",
        )
    
    # Expire any existing active rates for this currency pair
    expire_query = text("""
        UPDATE fx_rates
        SET status = 'SUPERSEDED'
        WHERE fxp_id = :fxp_id
        AND source_currency = :source
        AND destination_currency = :dest
        AND status = 'ACTIVE'
    """)
    
    await db.execute(expire_query, {
        "fxp_id": fxp.fxp_id,
        "source": rate.source_currency.upper(),
        "dest": rate.destination_currency.upper(),
    })
    
    # Insert new rate
    rate_id = uuid4()
    valid_from = datetime.utcnow()
    valid_until = valid_from + timedelta(seconds=rate.valid_seconds)
    
    insert_query = text("""
        INSERT INTO fx_rates (
            rate_id, fxp_id, source_currency, destination_currency,
            base_rate, valid_from, valid_until, status
        ) VALUES (
            :rate_id, :fxp_id, :source, :dest,
            :rate, :valid_from, :valid_until, 'ACTIVE'
        )
    """)
    
    await db.execute(insert_query, {
        "rate_id": rate_id,
        "fxp_id": fxp.fxp_id,
        "source": rate.source_currency.upper(),
        "dest": rate.destination_currency.upper(),
        "rate": rate.base_rate,
        "valid_from": valid_from,
        "valid_until": valid_until,
    })
    
    await db.commit()
    
    return {
        "rateId": str(rate_id),
        "fxpId": fxp.fxp_code,
        "sourceCurrency": rate.source_currency.upper(),
        "destinationCurrency": rate.destination_currency.upper(),
        "baseRate": str(rate.base_rate),
        "validFrom": valid_from.isoformat().replace("+00:00", "Z"),
        "validUntil": valid_until.isoformat().replace("+00:00", "Z"),
        "status": "ACTIVE",
    }


@router.delete(
    "/rates/{rate_id}",
    status_code=204,
    summary="Withdraw FX Rate",
    description="""
    Withdraw an FX rate.
    
    Reference: https://docs.nexusglobalpayments.org/fx-provision/rates-from-third-party-fx-providers
    
    FX Providers can withdraw rates that should no longer be used for quotes.
    Any pending quotes using this rate will still be valid until expiry.
    """,
)
async def withdraw_rate(
    rate_id: UUID = Path(..., alias="rateId", description="Rate ID to withdraw"),
    # TODO: Get FXP ID from JWT token
    fxp_code: str = "FXP-ABC",  # Temporary: should come from auth
    db: AsyncSession = Depends(get_db),
) -> None:
    """Withdraw an FX rate."""
    
    # Get FXP ID
    fxp_query = text("""
        SELECT fxp_id FROM fxps WHERE fxp_code = :fxp_code
    """)
    
    result = await db.execute(fxp_query, {"fxp_code": fxp_code})
    fxp = result.fetchone()
    
    if not fxp:
        raise HTTPException(status_code=403, detail="FXP not found")
    
    # Update rate status
    update_query = text("""
        UPDATE fx_rates
        SET status = 'WITHDRAWN'
        WHERE rate_id = :rate_id
        AND fxp_id = :fxp_id
        AND status = 'ACTIVE'
        RETURNING rate_id
    """)
    
    result = await db.execute(update_query, {
        "rate_id": rate_id,
        "fxp_id": fxp.fxp_id,
    })
    
    if not result.fetchone():
        raise HTTPException(
            status_code=404,
            detail="Rate not found or not owned by this FXP",
        )
    
    await db.commit()


@router.get(
    "/rates",
    summary="List FXP Rates",
    description="""
    List current rates for an FXP.
    
    This is a sandbox-only endpoint for debugging rate management.
    """,
)
async def list_rates(
    fxp_code: str = "FXP-ABC",
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """List current FXP rates (sandbox only)."""
    
    query = text("""
        SELECT 
            r.rate_id,
            f.fxp_code,
            r.source_currency,
            r.destination_currency,
            r.base_rate,
            r.valid_from,
            r.valid_until,
            r.status
        FROM fx_rates r
        JOIN fxps f ON r.fxp_id = f.fxp_id
        WHERE f.fxp_code = :fxp_code
        AND r.valid_until > NOW()
        ORDER BY r.created_at DESC
        LIMIT 50
    """)
    
    result = await db.execute(query, {"fxp_code": fxp_code})
    rows = result.fetchall()
    
    rates = [
        {
            "rateId": str(row.rate_id),
            "fxpId": row.fxp_code,
            "sourceCurrency": row.source_currency,
            "destinationCurrency": row.destination_currency,
            "baseRate": str(row.base_rate),
            "validFrom": row.valid_from.isoformat().replace("+00:00", "Z"),
            "validUntil": row.valid_until.isoformat().replace("+00:00", "Z"),
            "status": row.status,
        }
        for row in rows
    ]
    
    return {"rates": rates}
