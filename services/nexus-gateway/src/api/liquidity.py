"""
SAP Liquidity Management API

Reference: NotebookLM query 2026-02-03

FX Providers prefund accounts at SAPs (deposit or credit line).
SAPs provide tooling for balance management and reject on AM04 (insufficient funds).
Nexus sends real-time notifications to FXPs after successful payments.
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from ..db import get_db

router = APIRouter(prefix="/v1/liquidity", tags=["Liquidity Management"])


# =============================================================================
# Pydantic Models
# =============================================================================

from .schemas import (
    FxpBalance,
    LiquidityReservation,
    PaymentNotification,
    InterbankSettlementCalc
)


# =============================================================================
# GET /liquidity/balances - FXP Balances at SAPs
# =============================================================================

@router.get(
    "/balances",
    response_model=list[FxpBalance],
    summary="Get FXP balances at all SAPs",
    description="""
    Returns the FXP's current balances at all connected SAPs.
    
    **NotebookLM Confirmed Requirements:**
    
    - FXPs prefund accounts at SAPs (deposit or credit line)
    - SAPs provide tooling for balance management
    - 24/7/365 liquidity monitoring required
    - Nexus operates outside standard business hours
    """
)
async def get_fxp_balances(
    fxp_id: str = Query(..., alias="fxpId", description="FX Provider ID"),
    currency: Optional[str] = Query(None, description="Filter by currency"),
    db: AsyncSession = Depends(get_db)
) -> list[FxpBalance]:
    """Get FXP balances at all connected SAPs."""
    now = datetime.now(timezone.utc)
    
    # For sandbox: return example balances
    # Production would query sap_balances table
    balances = [
        FxpBalance(
            fxpId=fxp_id,
            sapId="SAP_SG_FAST",
            accountId="FXP-SGD-001",
            currency="SGD",
            availableBalance="5000000.00",
            reservedBalance="250000.00",
            totalBalance="5250000.00",
            creditLimit="10000000.00",
            lastUpdated=now.isoformat()
        ),
        FxpBalance(
            fxpId=fxp_id,
            sapId="SAP_TH_PROMPTPAY",
            accountId="FXP-THB-001",
            currency="THB",
            availableBalance="129250000.00",
            reservedBalance="6500000.00",
            totalBalance="135750000.00",
            creditLimit="250000000.00",
            lastUpdated=now.isoformat()
        ),
        FxpBalance(
            fxpId=fxp_id,
            sapId="SAP_MY_DUITNOW",
            accountId="FXP-MYR-001",
            currency="MYR",
            availableBalance="17500000.00",
            reservedBalance="875000.00",
            totalBalance="18375000.00",
            creditLimit="35000000.00",
            lastUpdated=now.isoformat()
        ),
    ]
    
    if currency:
        balances = [b for b in balances if b.currency == currency.upper()]
    
    return balances


# =============================================================================
# POST /liquidity/reserve - Create Liquidity Reservation
# =============================================================================

@router.post(
    "/reserve",
    response_model=LiquidityReservation,
    summary="Reserve liquidity for a payment",
    description="""
    Creates a liquidity reservation on the FXP's account at the SAP.
    
    **Settlement Reservation Process (NotebookLM):**
    1. Destination SAP validates FXP has sufficient funds
    2. If satisfied, reserves amount on FXP's account
    3. Reservation held until payment completes or times out
    
    **Failure Scenario:**
    - If insufficient funds, rejects with AM04
    - On rejection, Source IPS reverses settlement reservation
    """
)
async def reserve_liquidity(
    fxp_id: str = Query(..., alias="fxpId"),
    sap_id: str = Query(..., alias="sapId"),
    uetr: str = Query(..., description="Payment UETR"),
    amount: str = Query(..., description="Amount to reserve"),
    currency: str = Query(..., description="Currency code"),
    db: AsyncSession = Depends(get_db)
) -> LiquidityReservation:
    """Create a liquidity reservation."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=10)  # Match quote expiry
    
    # For sandbox: always succeed
    # Production would check balance and create reservation
    
    # Simulate insufficient funds check
    amount_decimal = Decimal(amount)
    if amount_decimal > Decimal("10000000"):  # Example threshold
        raise HTTPException(
            status_code=422,
            detail={
                "error": "AM04",
                "message": "Insufficient funds for reservation",
                "availableBalance": "10000000.00",
                "requestedAmount": amount
            }
        )
    
    return LiquidityReservation(
        reservationId=f"RES-{uetr[:8]}",
        fxpId=fxp_id,
        sapId=sap_id,
        uetr=uetr,
        amount=amount,
        currency=currency,
        status="RESERVED",
        createdAt=now.isoformat(),
        expiresAt=expires_at.isoformat()
    )


# =============================================================================
# DELETE /liquidity/reserve/{reservationId} - Release Reservation
# =============================================================================

@router.delete(
    "/reserve/{reservation_id}",
    summary="Release a liquidity reservation",
    description="""
    Releases a liquidity reservation, returning funds to available balance.
    
    Called when:
    - Payment is rejected at any point
    - Quote expires before payment submission
    - Timeout triggers reversal
    """
)
async def release_reservation(
    reservation_id: str,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Release a liquidity reservation."""
    return {
        "reservationId": reservation_id,
        "status": "RELEASED",
        "releasedAt": datetime.now(timezone.utc).isoformat(),
        "message": "Reservation released successfully"
    }


# =============================================================================
# GET /liquidity/notifications - FXP Payment Notifications
# =============================================================================

@router.get(
    "/notifications",
    response_model=list[PaymentNotification],
    summary="Get payment notifications for FXP",
    description="""
    Returns recent payment notifications sent by Nexus to the FXP.
    
    **NotebookLM Confirmed:**
    - Nexus sends notifications immediately after ACCC status
    - Contains: execution date, UETR, amounts, exchange rate
    - FXPs use this to update internal ledgers
    - SAPs may also send separate notifications (optional)
    """
)
async def get_fxp_notifications(
    fxp_id: str = Query(..., alias="fxpId"),
    since: Optional[str] = Query(None, description="Since timestamp (ISO 8601)"),
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db)
) -> list[PaymentNotification]:
    """Get payment notifications for FXP."""
    now = datetime.now(timezone.utc)
    
    # For sandbox: return example notifications
    notifications = [
        PaymentNotification(
            uetr="f47ac10b-58cc-4372-a567-0e02b2c3d479",
            executionDate=(now - timedelta(hours=1)).isoformat(),
            sourceAmount="1000.00",
            sourceCurrency="SGD",
            destinationAmount="25850.00",
            destinationCurrency="THB",
            exchangeRate="25.85",
            fxpId=fxp_id,
            sourceSapId="SAP_SG_FAST",
            destinationSapId="SAP_TH_PROMPTPAY",
            status="ACCC"
        ),
        PaymentNotification(
            uetr="a47bc20c-58cc-4372-b567-1f02b2c3d480",
            executionDate=(now - timedelta(hours=3)).isoformat(),
            sourceAmount="500.00",
            sourceCurrency="SGD",
            destinationAmount="1750.00",
            destinationCurrency="MYR",
            exchangeRate="3.50",
            fxpId=fxp_id,
            sourceSapId="SAP_SG_FAST",
            destinationSapId="SAP_MY_DUITNOW",
            status="ACCC"
        ),
    ]
    
    if status:
        notifications = [n for n in notifications if n.status == status.upper()]
    
    return notifications[:limit]


# =============================================================================
# GET /liquidity/settlement-calc - Interbank Settlement Calculation
# =============================================================================

@router.get(
    "/settlement-calc",
    response_model=InterbankSettlementCalc,
    summary="Calculate interbank settlement amounts",
    description="""
    Calculates the interbank settlement amounts for Source and Destination legs.
    
    **Formulas (NotebookLM Confirmed):**
    
    **Source Leg (Source PSP → Source SAP):**
    - If Sender defined Source Amount: 
      `InterbankAmount = InstructedAmount - SourcePspFee`
    - If Sender defined Destination Amount:
      `InterbankAmount = InstructedAmount + (DestPspFee converted to SourceCurrency)`
    
    **Destination Leg (Destination SAP → Destination PSP):**
    `InterbankAmount(Dest) = InterbankAmount(Source) × ExchangeRate`
    
    **Key Rule:** SAP is PROHIBITED from deducting fees - must invoice FXP separately.
    """
)
async def calculate_settlement(
    instructed_amount: str = Query(..., alias="instructedAmount"),
    instructed_currency: str = Query(..., alias="instructedCurrency"),
    source_psp_fee: str = Query("0.00", alias="sourcePspFee"),
    dest_psp_fee: str = Query("0.00", alias="destPspFee"),
    exchange_rate: str = Query(..., alias="exchangeRate"),
    amount_type: str = Query("SOURCE", alias="amountType", description="SOURCE or DESTINATION"),
    db: AsyncSession = Depends(get_db)
) -> InterbankSettlementCalc:
    """Calculate interbank settlement amounts."""
    instructed = Decimal(instructed_amount)
    source_fee = Decimal(source_psp_fee)
    dest_fee = Decimal(dest_psp_fee)
    rate = Decimal(exchange_rate)
    
    notes = []
    
    if amount_type.upper() == "SOURCE":
        # Sender defined source amount
        source_interbank = instructed - source_fee
        dest_interbank = source_interbank * rate
        method = "SOURCE_DEFINED"
        notes.append("Sender defined the source (sending) amount")
        notes.append(f"Source interbank = {instructed} - {source_fee} = {source_interbank}")
    else:
        # Sender defined destination amount
        # Need to work backwards: dest_fee converted to source currency
        dest_fee_in_source = dest_fee / rate
        source_interbank = instructed + dest_fee_in_source
        dest_interbank = source_interbank * rate
        method = "DESTINATION_DEFINED"
        notes.append("Sender defined the destination (receiving) amount")
        notes.append(f"Dest fee in source currency = {dest_fee} / {rate} = {dest_fee_in_source:.4f}")
        notes.append(f"Source interbank = {instructed} + {dest_fee_in_source:.4f} = {source_interbank:.2f}")
    
    notes.append(f"Destination interbank = {source_interbank:.2f} × {rate} = {dest_interbank:.2f}")
    notes.append("SAP MUST NOT deduct fees from interbank amount - invoice FXP separately")
    
    return InterbankSettlementCalc(
        sourceLeg={
            "description": "Source PSP → Source SAP",
            "interbankSettlementAmount": f"{source_interbank:.2f}",
            "currency": instructed_currency,
        },
        destinationLeg={
            "description": "Destination SAP → Destination PSP",
            "interbankSettlementAmount": f"{dest_interbank:.2f}",
            "currency": "THB" if instructed_currency == "SGD" else "SGD",  # Example
        },
        calculationMethod=method,
        notes=notes
    )
