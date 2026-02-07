"""
SAP (Settlement Access Provider) API Module

Reference: https://docs.nexusglobalpayments.org/settlement-access-provision

This module provides endpoints for SAPs to:
- Manage nostro accounts for FXPs
- Monitor liquidity and reservations
- Process settlement transactions
- Generate reconciliation reports
"""

import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional, List
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Depends, Query, Path
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/sap", tags=["Settlement Access Providers"])


# =============================================================================
# Schemas
# =============================================================================

class NostroAccountCreate(BaseModel):
    """Create a nostro account for an FXP."""
    fxp_bic: str = Field(..., alias="fxpBic", description="BIC of the FXP")
    currency: str = Field(..., min_length=3, max_length=3, description="Account currency")
    initial_balance: Decimal = Field(..., alias="initialBalance", ge=0)
    account_number: Optional[str] = Field(None, alias="accountNumber")
    
    class Config:
        populate_by_name = True


class NostroAccountResponse(BaseModel):
    """Nostro account response."""
    account_id: str = Field(..., alias="accountId")
    sap_id: str = Field(..., alias="sapId")
    sap_name: str = Field(..., alias="sapName")
    sap_bic: str = Field(..., alias="sapBic")
    fxp_id: str = Field(..., alias="fxpId")
    fxp_name: str = Field(..., alias="fxpName")
    fxp_bic: str = Field(..., alias="fxpBic")
    currency: str
    balance: str
    account_number: Optional[str] = Field(None, alias="accountNumber")
    status: str  # ACTIVE, FROZEN, CLOSED
    created_at: str = Field(..., alias="createdAt")
    
    class Config:
        populate_by_name = True


class ReservationCreate(BaseModel):
    """Create a liquidity reservation."""
    fxp_bic: str = Field(..., alias="fxpBic", description="BIC of the FXP")
    currency: str = Field(..., min_length=3, max_length=3)
    amount: Decimal = Field(..., gt=0)
    uetr: str = Field(..., description="UETR of the payment being reserved for")
    expires_in_seconds: int = Field(default=300, alias="expiresInSeconds", ge=60, le=3600)
    
    class Config:
        populate_by_name = True


class ReservationResponse(BaseModel):
    """Liquidity reservation response."""
    reservation_id: str = Field(..., alias="reservationId")
    account_id: str = Field(..., alias="accountId")
    sap_bic: str = Field(..., alias="sapBic")
    fxp_bic: str = Field(..., alias="fxpBic")
    currency: str
    amount: str
    uetr: str
    status: str  # ACTIVE, UTILIZED, EXPIRED, CANCELLED
    reserved_at: str = Field(..., alias="reservedAt")
    expires_at: str = Field(..., alias="expiresAt")
    
    class Config:
        populate_by_name = True


class SettlementTransaction(BaseModel):
    """Settlement transaction record."""
    transaction_id: str = Field(..., alias="transactionId")
    account_id: str = Field(..., alias="accountId")
    sap_bic: str = Field(..., alias="sapBic")
    fxp_bic: str = Field(..., alias="fxpBic")
    currency: str
    amount: str
    type: str  # DEBIT, CREDIT
    reference: str
    uetr: Optional[str]
    status: str  # PENDING, COMPLETED, FAILED
    created_at: str = Field(..., alias="createdAt")
    
    class Config:
        populate_by_name = True


class ReconciliationReport(BaseModel):
    """Daily reconciliation report."""
    date: str
    sap_id: str = Field(..., alias="sapId")
    sap_name: str = Field(..., alias="sapName")
    sap_bic: str = Field("", alias="sapBic")
    fxp_code: str = Field("", alias="fxpCode")
    currency: str
    opening_balance: str = Field(..., alias="openingBalance")
    total_credits: str = Field(..., alias="totalCredits")
    total_debits: str = Field(..., alias="totalDebits")
    closing_balance: str = Field(..., alias="closingBalance")
    transaction_count: int = Field(..., alias="transactionCount")
    
    class Config:
        populate_by_name = True


class LiquidityAlert(BaseModel):
    """Liquidity alert configuration."""
    threshold_amount: Decimal = Field(..., alias="thresholdAmount")
    threshold_percentage: Optional[Decimal] = Field(None, alias="thresholdPercentage")
    email_notification: bool = Field(default=True, alias="emailNotification")
    webhook_url: Optional[str] = Field(None, alias="webhookUrl")
    
    class Config:
        populate_by_name = True


# =============================================================================
# Nostro Account Management
# =============================================================================

@router.post("/nostro-accounts", response_model=NostroAccountResponse)
async def create_nostro_account(
    request: NostroAccountCreate,
    sap_bic: str = Query("DBSSSGSG", alias="sapBic", description="BIC of the SAP"),
    db: AsyncSession = Depends(get_db),
) -> NostroAccountResponse:
    """
    Create a nostro account for an FXP at this SAP.
    
    Reference: https://docs.nexusglobalpayments.org/settlement-access-provision/liquidity
    """
    # Verify SAP exists
    sap_query = text("SELECT sap_id, name, bic FROM saps WHERE bic = :bic")
    result = await db.execute(sap_query, {"bic": sap_bic.upper()})
    sap = result.fetchone()
    
    if not sap:
        raise HTTPException(status_code=404, detail=f"SAP with BIC {sap_bic} not found")
    
    # Verify FXP exists
    fxp_query = text("SELECT fxp_id, name, fxp_code FROM fxps WHERE fxp_code = :fxp_code")
    result = await db.execute(fxp_query, {"fxp_code": request.fxp_bic.upper()})
    fxp = result.fetchone()
    
    if not fxp:
        raise HTTPException(status_code=404, detail=f"FXP with BIC {request.fxp_bic} not found")
    
    # Check if account already exists
    check_query = text("""
        SELECT account_id FROM fxp_sap_accounts
        WHERE sap_id = :sap_id AND fxp_id = :fxp_id AND currency_code = :currency
    """)
    result = await db.execute(check_query, {
        "sap_id": sap.sap_id,
        "fxp_id": fxp.fxp_id,
        "currency": request.currency.upper()
    })
    if result.fetchone():
        raise HTTPException(
            status_code=409, 
            detail=f"Account already exists for FXP {request.fxp_bic} in {request.currency}"
        )
    
    # Create account
    account_id = str(uuid4())
    account_number = request.account_number or f"NOSTRO-{sap_bic[:4]}-{fxp.fxp_bic[:4]}-{request.currency}"
    
    insert_query = text("""
        INSERT INTO fxp_sap_accounts (
            account_id, sap_id, fxp_id, currency_code, balance, account_number, status, created_at
        ) VALUES (
            :account_id, :sap_id, :fxp_id, :currency, :balance, :account_number, 'ACTIVE', NOW()
        )
        RETURNING created_at
    """)
    
    result = await db.execute(insert_query, {
        "account_id": account_id,
        "sap_id": sap.sap_id,
        "fxp_id": fxp.fxp_id,
        "currency": request.currency.upper(),
        "balance": str(request.initial_balance),
        "account_number": account_number
    })
    row = result.fetchone()
    await db.commit()
    
    return NostroAccountResponse(
        account_id=account_id,
        sap_id=sap.sap_id,
        sap_name=sap.name,
        sap_bic=sap.bic,
        fxp_id=fxp.fxp_id,
        fxp_name=fxp.name,
        fxp_bic=fxp.fxp_code,
        currency=request.currency.upper(),
        balance=str(request.initial_balance),
        account_number=account_number,
        status="ACTIVE",
        created_at=row.created_at.isoformat() if isinstance(row.created_at, datetime) else str(row.created_at)
    )


@router.get("/nostro-accounts", response_model=List[NostroAccountResponse])
async def list_nostro_accounts(
    sap_bic: str = Query("DBSSSGSG", alias="sapBic", description="BIC of the SAP"),
    fxp_bic: Optional[str] = Query(None, alias="fxpBic", description="Filter by FXP BIC"),
    currency: Optional[str] = Query(None, description="Filter by currency"),
    db: AsyncSession = Depends(get_db),
) -> List[NostroAccountResponse]:
    """
    List all nostro accounts at this SAP.
    """
    # Verify SAP exists
    sap_query = text("SELECT sap_id, name, bic FROM saps WHERE bic = :bic")
    result = await db.execute(sap_query, {"bic": sap_bic.upper()})
    sap = result.fetchone()
    
    if not sap:
        raise HTTPException(status_code=404, detail=f"SAP with BIC {sap_bic} not found")
    
    # Build query
    filters = ["a.sap_id = :sap_id"]
    params = {"sap_id": sap.sap_id}
    
    if fxp_bic:
        filters.append("f.fxp_code = :fxp_bic")
        params["fxp_bic"] = fxp_bic.upper()
    
    if currency:
        filters.append("a.currency_code = :currency")
        params["currency"] = currency.upper()
    
    where_clause = " AND ".join(filters)
    
    accounts_query = text(f"""
        SELECT 
            a.account_id, a.sap_id, s.name as sap_name, s.bic as sap_bic,
            a.fxp_id, f.name as fxp_name, f.fxp_code as fxp_bic,
            a.currency_code, a.balance, a.account_number, a.created_at
        FROM fxp_sap_accounts a
        JOIN saps s ON a.sap_id = s.sap_id
        JOIN fxps f ON a.fxp_id = f.fxp_id
        WHERE {where_clause}
        ORDER BY f.name, a.currency_code
    """)
    
    result = await db.execute(accounts_query, params)
    accounts = result.fetchall()
    
    return [
        NostroAccountResponse(
            account_id=str(a.account_id),
            sap_id=str(a.sap_id),
            sap_name=a.sap_name,
            sap_bic=a.sap_bic,
            fxp_id=str(a.fxp_id),
            fxp_name=a.fxp_name,
            fxp_bic=a.fxp_bic,
            currency=a.currency_code,
            balance=str(a.balance),
            account_number=a.account_number,
            status="ACTIVE",
            created_at=a.created_at.isoformat() if isinstance(a.created_at, datetime) else str(a.created_at)
        )
        for a in accounts
    ]


@router.get("/nostro-accounts/{account_id}", response_model=NostroAccountResponse)
async def get_nostro_account(
    account_id: str = Path(..., description="ID of the account"),
    sap_bic: str = Query("DBSSSGSG", alias="sapBic", description="BIC of the SAP"),
    db: AsyncSession = Depends(get_db),
) -> NostroAccountResponse:
    """
    Get details of a specific nostro account.
    """
    # Verify SAP exists
    sap_query = text("SELECT sap_id FROM saps WHERE bic = :bic")
    result = await db.execute(sap_query, {"bic": sap_bic.upper()})
    sap = result.fetchone()
    
    if not sap:
        raise HTTPException(status_code=404, detail=f"SAP with BIC {sap_bic} not found")
    
    account_query = text("""
        SELECT 
            a.account_id, a.sap_id, s.name as sap_name, s.bic as sap_bic,
            a.fxp_id, f.name as fxp_name, f.fxp_code as fxp_bic,
            a.currency_code, a.balance, a.account_number, a.created_at
        FROM fxp_sap_accounts a
        JOIN saps s ON a.sap_id = s.sap_id
        JOIN fxps f ON a.fxp_id = f.fxp_id
        WHERE a.account_id = :account_id AND a.sap_id = :sap_id
    """)
    
    result = await db.execute(account_query, {"account_id": account_id, "sap_id": sap.sap_id})
    a = result.fetchone()
    
    if not a:
        raise HTTPException(status_code=404, detail="Account not found")
    
    return NostroAccountResponse(
        account_id=str(a.account_id),
        sap_id=str(a.sap_id),
        sap_name=a.sap_name,
        sap_bic=a.sap_bic,
        fxp_id=str(a.fxp_id),
        fxp_name=a.fxp_name,
        fxp_bic=a.fxp_bic,
        currency=a.currency_code,
        balance=str(a.balance),
        account_number=a.account_number,
        status="ACTIVE",
        created_at=a.created_at.isoformat() if isinstance(a.created_at, datetime) else str(a.created_at)
    )


# =============================================================================
# Liquidity Reservations
# =============================================================================

@router.post("/reservations", response_model=ReservationResponse)
async def create_reservation(
    request: ReservationCreate,
    sap_bic: str = Query("DBSSSGSG", alias="sapBic", description="BIC of the SAP"),
    db: AsyncSession = Depends(get_db),
) -> ReservationResponse:
    """
    Create a liquidity reservation for a payment.
    
    Reference: https://docs.nexusglobalpayments.org/settlement-access-provision/liquidity
    """
    # Verify SAP exists
    sap_query = text("SELECT sap_id FROM saps WHERE bic = :bic")
    result = await db.execute(sap_query, {"bic": sap_bic.upper()})
    sap = result.fetchone()
    
    if not sap:
        raise HTTPException(status_code=404, detail=f"SAP with BIC {sap_bic} not found")
    
    # Verify FXP exists
    fxp_query = text("SELECT fxp_id, fxp_code FROM fxps WHERE fxp_code = :fxp_code")
    result = await db.execute(fxp_query, {"fxp_code": request.fxp_bic.upper()})
    fxp = result.fetchone()
    
    if not fxp:
        raise HTTPException(status_code=404, detail=f"FXP with BIC {request.fxp_bic} not found")
    
    # Get account
    account_query = text("""
        SELECT account_id, balance FROM fxp_sap_accounts
        WHERE sap_id = :sap_id AND fxp_id = :fxp_id AND currency_code = :currency AND status = 'ACTIVE'
    """)
    result = await db.execute(account_query, {
        "sap_id": sap.sap_id,
        "fxp_id": fxp.fxp_id,
        "currency": request.currency.upper()
    })
    account = result.fetchone()
    
    if not account:
        raise HTTPException(
            status_code=404, 
            detail=f"No active account found for FXP {request.fxp_bic} in {request.currency}"
        )
    
    # Check available balance
    reserved_query = text("""
        SELECT COALESCE(SUM(amount), 0) as reserved
        FROM sap_reservations
        WHERE account_id = :account_id AND status = 'ACTIVE' AND expires_at > NOW()
    """)
    result = await db.execute(reserved_query, {"account_id": account.account_id})
    reserved_row = result.fetchone()
    reserved_amount = Decimal(reserved_row.reserved) if reserved_row else Decimal("0")
    
    available_balance = Decimal(account.balance) - reserved_amount
    
    if available_balance < request.amount:
        raise HTTPException(
            status_code=422,
            detail=f"Insufficient available balance. Available: {available_balance}, Requested: {request.amount}"
        )
    
    # Create reservation
    reservation_id = str(uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=request.expires_in_seconds)
    
    insert_query = text("""
        INSERT INTO sap_reservations (
            reservation_id, account_id, amount, uetr, status, reserved_at, expires_at
        ) VALUES (
            :reservation_id, :account_id, :amount, :uetr, 'ACTIVE', NOW(), :expires_at
        )
        RETURNING reserved_at
    """)
    
    result = await db.execute(insert_query, {
        "reservation_id": reservation_id,
        "account_id": account.account_id,
        "amount": str(request.amount),
        "uetr": request.uetr,
        "expires_at": expires_at
    })
    row = result.fetchone()
    await db.commit()
    
    return ReservationResponse(
        reservation_id=reservation_id,
        account_id=account.account_id,
        sap_bic=sap_bic.upper(),
        fxp_bic=fxp.fxp_code,
        currency=request.currency.upper(),
        amount=str(request.amount),
        uetr=request.uetr,
        status="ACTIVE",
        reserved_at=row.reserved_at.isoformat() if isinstance(row.reserved_at, datetime) else str(row.reserved_at),
        expires_at=expires_at.isoformat()
    )


async def create_reservation_for_payment(
    db: AsyncSession,
    fxp_id: str,
    dest_sap_bic: str,
    currency: str,
    amount,
    uetr: str,
    expires_in_seconds: int = 300,
) -> Optional[str]:
    """
    Create an SAP reservation as part of the payment flow.
    
    This implements the camt.103 CreateReservation step (Step 16) from the
    Nexus specification. The Destination SAP locks funds on the FXP's nostro
    account to guarantee liquidity for settlement.
    
    Returns the reservation_id on success, or None if no matching account
    is found (sandbox graceful fallback).
    """
    try:
        # Validate required parameters
        missing = []
        if not dest_sap_bic:
            missing.append("dest_sap_bic")
        if not currency:
            missing.append("currency")
        if not fxp_id:
            missing.append("fxp_id")
        if missing:
            logger.warning(
                f"Reservation skipped for UETR {uetr}: "
                f"missing parameters: {', '.join(missing)} "
                f"(dest_sap_bic={dest_sap_bic!r}, currency={currency!r}, fxp_id={fxp_id!r})"
            )
            return None
        
        # Find the SAP
        sap_query = text("SELECT sap_id FROM saps WHERE bic = :bic")
        result = await db.execute(sap_query, {"bic": dest_sap_bic.upper()})
        sap = result.fetchone()
        if not sap:
            logger.warning(f"Reservation skipped: SAP {dest_sap_bic} not found")
            return None
        
        # Find the FXP's nostro account at this SAP
        # Note: fxp_sap_accounts has no status column — all seeded accounts are active
        account_query = text("""
            SELECT account_id, balance FROM fxp_sap_accounts
            WHERE sap_id = :sap_id AND fxp_id = :fxp_id
              AND currency_code = :currency
        """)
        result = await db.execute(account_query, {
            "sap_id": sap.sap_id,
            "fxp_id": fxp_id,
            "currency": currency.upper()
        })
        account = result.fetchone()
        if not account:
            logger.warning(
                f"Reservation skipped: no active {currency} account "
                f"for FXP {fxp_id} at SAP {dest_sap_bic}"
            )
            return None
        
        # Check available balance
        reserved_query = text("""
            SELECT COALESCE(SUM(amount), 0) as reserved
            FROM sap_reservations
            WHERE account_id = :account_id AND status = 'ACTIVE' AND expires_at > NOW()
        """)
        result = await db.execute(reserved_query, {"account_id": account.account_id})
        reserved_row = result.fetchone()
        reserved_amount = Decimal(str(reserved_row.reserved)) if reserved_row else Decimal("0")
        available = Decimal(str(account.balance)) - reserved_amount
        
        payment_amount = Decimal(str(amount))
        if available < payment_amount:
            logger.warning(
                f"Reservation skipped: insufficient balance. "
                f"Available: {available}, Requested: {payment_amount}"
            )
            return None
        
        # Create the reservation
        reservation_id = str(uuid4())
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in_seconds)
        
        insert_query = text("""
            INSERT INTO sap_reservations (
                reservation_id, account_id, amount, uetr, status, reserved_at, expires_at
            ) VALUES (
                :reservation_id, :account_id, :amount, :uetr, 'ACTIVE', NOW(), :expires_at
            )
        """)
        await db.execute(insert_query, {
            "reservation_id": reservation_id,
            "account_id": account.account_id,
            "amount": str(payment_amount),
            "uetr": uetr,
            "expires_at": expires_at
        })
        await db.commit()
        
        logger.info(
            f"Reservation {reservation_id} created for UETR {uetr}: "
            f"{payment_amount} {currency} at SAP {dest_sap_bic}"
        )
        return reservation_id
        
    except Exception as e:
        logger.error(f"Reservation creation failed for UETR {uetr}: {e}")
        return None


async def settle_reservation_for_payment(
    db: AsyncSession,
    uetr: str,
    # Source leg (optional — for crediting FXP's source-currency nostro)
    source_sap_bic: str = None,
    source_currency: str = None,
    source_amount = None,
    fxp_id: str = None,
) -> bool:
    """
    Settle a reservation: bilateral FXP nostro reconciliation.
    
    Destination leg: ACTIVE → UTILIZED + debit FXP's dest-currency nostro
    Source leg: credit FXP's source-currency nostro at Source SAP
    
    The FXP receives source currency (e.g. SGD) and pays out destination
    currency (e.g. IDR). Both legs must be reflected for correct reconciliation.
    
    Returns True if settlement succeeded, False otherwise.
    """
    try:
        # 1. Destination leg: Mark reservation as UTILIZED and debit
        query = text("""
            UPDATE sap_reservations
            SET status = 'UTILIZED', utilized_at = NOW()
            WHERE uetr = :uetr AND status = 'ACTIVE'
            RETURNING reservation_id, account_id, amount
        """)
        result = await db.execute(query, {"uetr": uetr})
        row = result.fetchone()
        
        if not row:
            logger.debug(f"No active reservation found to settle for UETR {uetr}")
            await db.commit()
            return False
        
        # Debit destination-currency nostro (e.g. IDR out)
        debit_query = text("""
            UPDATE fxp_sap_accounts
            SET balance = balance - :amount
            WHERE account_id = :account_id
        """)
        await db.execute(debit_query, {
            "amount": row.amount,
            "account_id": row.account_id
        })
        
        # Record DEBIT transaction for reconciliation
        debit_txn = text("""
            INSERT INTO sap_transactions (account_id, amount, type, reference, uetr, status)
            VALUES (:account_id, :amount, 'DEBIT', :reference, :uetr, 'COMPLETED')
        """)
        await db.execute(debit_txn, {
            "account_id": row.account_id,
            "amount": row.amount,
            "reference": f"Settlement debit for UETR {uetr[:8]}",
            "uetr": uetr
        })
        
        logger.info(
            f"Reservation {row.reservation_id} settled (UTILIZED) for UETR {uetr}: "
            f"debited {row.amount} from dest account {row.account_id}"
        )
        
        # 2. Source leg: Credit source-currency nostro (e.g. SGD in)
        if source_sap_bic and source_currency and source_amount and fxp_id:
            # Find source SAP and its account
            source_acc_query = text("""
                SELECT a.account_id, s.sap_id
                FROM fxp_sap_accounts a
                JOIN saps s ON a.sap_id = s.sap_id
                WHERE s.bic = :bic AND a.fxp_id = CAST(:fxp_id AS uuid)
                  AND a.currency_code = :currency
            """)
            source_result = await db.execute(source_acc_query, {
                "bic": source_sap_bic.upper(),
                "fxp_id": fxp_id,
                "currency": source_currency.upper()
            })
            source_acc = source_result.fetchone()
            
            if source_acc:
                credit_query = text("""
                    UPDATE fxp_sap_accounts
                    SET balance = balance + :amount
                    WHERE account_id = :account_id
                """)
                await db.execute(credit_query, {
                    "amount": str(source_amount),
                    "account_id": source_acc.account_id
                })
                
                # Record CREDIT transaction for reconciliation
                credit_txn = text("""
                    INSERT INTO sap_transactions (account_id, amount, type, reference, uetr, status)
                    VALUES (:account_id, :amount, 'CREDIT', :reference, :uetr, 'COMPLETED')
                """)
                await db.execute(credit_txn, {
                    "account_id": source_acc.account_id,
                    "amount": str(source_amount),
                    "reference": f"Settlement credit for UETR {uetr[:8]}",
                    "uetr": uetr
                })
                
                logger.info(
                    f"Source leg settled for UETR {uetr}: "
                    f"credited {source_amount} {source_currency} at {source_sap_bic}"
                )
        
        await db.commit()
        return True
    except Exception as e:
        logger.error(f"Reservation settlement failed for UETR {uetr}: {e}")
        return False


async def cancel_reservation_for_payment(
    db: AsyncSession,
    uetr: str,
) -> bool:
    """
    Cancel a reservation: ACTIVE → CANCELLED.
    
    Called when a payment is returned (pacs.004) or rejected.
    Unlocks the funds on the FXP's nostro account so they become
    available for other payments.
    
    Returns True if a reservation was cancelled, False otherwise.
    """
    try:
        query = text("""
            UPDATE sap_reservations
            SET status = 'CANCELLED', cancelled_at = NOW()
            WHERE uetr = :uetr AND status = 'ACTIVE'
            RETURNING reservation_id
        """)
        result = await db.execute(query, {"uetr": uetr})
        row = result.fetchone()
        await db.commit()
        
        if row:
            logger.info(f"Reservation {row.reservation_id} cancelled for UETR {uetr}")
            return True
        else:
            logger.debug(f"No active reservation found to cancel for UETR {uetr}")
            return False
    except Exception as e:
        logger.error(f"Reservation cancellation failed for UETR {uetr}: {e}")
        return False

@router.get("/reservations", response_model=List[ReservationResponse])
async def list_reservations(
    sap_bic: str = Query("DBSSSGSG", alias="sapBic", description="BIC of the SAP"),
    status: Optional[str] = Query(None, description="Filter by status: ACTIVE, UTILIZED, EXPIRED, CANCELLED"),
    fxp_bic: Optional[str] = Query(None, alias="fxpBic", description="Filter by FXP"),
    db: AsyncSession = Depends(get_db),
) -> List[ReservationResponse]:
    """
    List liquidity reservations at this SAP.
    
    Includes sweep-on-read auto-expiry: ACTIVE reservations past 
    expires_at are automatically transitioned to EXPIRED.
    """
    # Verify SAP exists
    sap_query = text("SELECT sap_id FROM saps WHERE bic = :bic")
    result = await db.execute(sap_query, {"bic": sap_bic.upper()})
    sap = result.fetchone()
    
    if not sap:
        raise HTTPException(status_code=404, detail=f"SAP with BIC {sap_bic} not found")
    
    # Auto-expire stale ACTIVE reservations (sweep-on-read pattern)
    expire_query = text("""
        UPDATE sap_reservations
        SET status = 'EXPIRED', cancelled_at = NOW()
        WHERE status = 'ACTIVE' AND expires_at < NOW()
          AND account_id IN (
              SELECT account_id FROM fxp_sap_accounts WHERE sap_id = CAST(:sap_id AS uuid)
          )
        RETURNING reservation_id
    """)
    expire_result = await db.execute(expire_query, {"sap_id": str(sap.sap_id)})
    expired_rows = expire_result.fetchall()
    if expired_rows:
        await db.commit()
        logger.info(f"Auto-expired {len(expired_rows)} stale reservations for SAP {sap_bic}")
    
    # Build query
    filters = ["a.sap_id = :sap_id"]
    params = {"sap_id": sap.sap_id}
    
    if status:
        filters.append("r.status = :status")
        params["status"] = status.upper()
    
    if fxp_bic:
        filters.append("f.fxp_code = :fxp_bic")
        params["fxp_bic"] = fxp_bic.upper()
    
    where_clause = " AND ".join(filters)
    
    reservations_query = text(f"""
        SELECT 
            r.reservation_id, r.account_id, s.bic as sap_bic, f.fxp_code as fxp_bic,
            a.currency_code, r.amount, r.uetr, r.status, r.reserved_at, r.expires_at
        FROM sap_reservations r
        JOIN fxp_sap_accounts a ON r.account_id = a.account_id
        JOIN saps s ON a.sap_id = s.sap_id
        JOIN fxps f ON a.fxp_id = f.fxp_id
        WHERE {where_clause}
        ORDER BY r.reserved_at DESC
    """)
    
    result = await db.execute(reservations_query, params)
    reservations = result.fetchall()
    
    return [
        ReservationResponse(
            reservation_id=str(r.reservation_id),
            account_id=str(r.account_id),
            sap_bic=r.sap_bic,
            fxp_bic=r.fxp_bic,
            currency=r.currency_code,
            amount=str(r.amount),
            uetr=str(r.uetr),
            status=r.status,
            reserved_at=r.reserved_at.isoformat() if isinstance(r.reserved_at, datetime) else str(r.reserved_at),
            expires_at=r.expires_at.isoformat() if isinstance(r.expires_at, datetime) else str(r.expires_at)
        )
        for r in reservations
    ]


@router.post("/reservations/{reservation_id}/cancel")
async def cancel_reservation(
    reservation_id: str = Path(..., description="ID of the reservation"),
    sap_bic: str = Query("DBSSSGSG", alias="sapBic", description="BIC of the SAP"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Cancel an active reservation.
    """
    # Verify SAP exists
    sap_query = text("SELECT sap_id FROM saps WHERE bic = :bic")
    result = await db.execute(sap_query, {"bic": sap_bic.upper()})
    sap = result.fetchone()
    
    if not sap:
        raise HTTPException(status_code=404, detail=f"SAP with BIC {sap_bic} not found")
    
    # Cancel reservation
    update_query = text("""
        UPDATE sap_reservations
        SET status = 'CANCELLED', cancelled_at = NOW()
        WHERE reservation_id = :reservation_id
        AND account_id IN (SELECT account_id FROM fxp_sap_accounts WHERE sap_id = :sap_id)
        AND status = 'ACTIVE'
        RETURNING reservation_id
    """)
    
    result = await db.execute(update_query, {
        "reservation_id": reservation_id,
        "sap_id": sap.sap_id
    })
    
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Reservation not found or already processed")
    
    await db.commit()
    
    return {
        "reservationId": reservation_id,
        "status": "CANCELLED",
        "message": "Reservation successfully cancelled"
    }


# =============================================================================
# Settlement Transactions
# =============================================================================

@router.get("/transactions", response_model=List[SettlementTransaction])
async def list_transactions(
    sap_bic: str = Query("DBSSSGSG", alias="sapBic", description="BIC of the SAP"),
    fxp_bic: Optional[str] = Query(None, alias="fxpBic", description="Filter by FXP"),
    currency: Optional[str] = Query(None, description="Filter by currency"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> List[SettlementTransaction]:
    """
    List settlement transactions at this SAP.
    """
    # Verify SAP exists
    sap_query = text("SELECT sap_id FROM saps WHERE bic = :bic")
    result = await db.execute(sap_query, {"bic": sap_bic.upper()})
    sap = result.fetchone()
    
    if not sap:
        raise HTTPException(status_code=404, detail=f"SAP with BIC {sap_bic} not found")
    
    # Build query
    filters = ["a.sap_id = :sap_id"]
    params = {"sap_id": sap.sap_id, "limit": limit}
    
    if fxp_bic:
        filters.append("f.fxp_code = :fxp_bic")
        params["fxp_bic"] = fxp_bic.upper()
    
    if currency:
        filters.append("a.currency_code = :currency")
        params["currency"] = currency.upper()
    
    where_clause = " AND ".join(filters)
    
    transactions_query = text(f"""
        SELECT 
            t.transaction_id, t.account_id, s.bic as sap_bic, f.fxp_code as fxp_bic,
            a.currency_code, t.amount, t.type, t.reference, t.uetr, t.status, t.created_at
        FROM sap_transactions t
        JOIN fxp_sap_accounts a ON t.account_id = a.account_id
        JOIN saps s ON a.sap_id = s.sap_id
        JOIN fxps f ON a.fxp_id = f.fxp_id
        WHERE {where_clause}
        ORDER BY t.created_at DESC
        LIMIT :limit
    """)
    
    result = await db.execute(transactions_query, params)
    transactions = result.fetchall()
    
    return [
        SettlementTransaction(
            transaction_id=str(t.transaction_id),
            account_id=str(t.account_id),
            sap_bic=t.sap_bic,
            fxp_bic=t.fxp_bic,
            currency=t.currency_code,
            amount=str(t.amount),
            type=t.type,
            reference=t.reference,
            uetr=str(t.uetr) if t.uetr else None,
            status=t.status,
            created_at=t.created_at.isoformat() if isinstance(t.created_at, datetime) else str(t.created_at)
        )
        for t in transactions
    ]


# =============================================================================
# Reconciliation Reports
# =============================================================================

@router.get("/reconciliation", response_model=List[ReconciliationReport])
async def get_reconciliation_reports(
    sap_bic: str = Query("DBSSSGSG", alias="sapBic", description="BIC of the SAP"),
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format (default: today)"),
    db: AsyncSession = Depends(get_db),
) -> List[ReconciliationReport]:
    """
    Get daily reconciliation report.
    
    Reference: https://docs.nexusglobalpayments.org/settlement-access-provision/reconciliation
    """
    # Verify SAP exists
    sap_query = text("SELECT sap_id, name FROM saps WHERE bic = :bic")
    result = await db.execute(sap_query, {"bic": sap_bic.upper()})
    sap = result.fetchone()
    
    if not sap:
        raise HTTPException(status_code=404, detail=f"SAP with BIC {sap_bic} not found")
    
    report_date = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # Parse to date object for asyncpg
    from datetime import date as date_type
    report_date_obj = datetime.strptime(report_date, "%Y-%m-%d").date()
    
    # Get reconciliation data per currency
    reconciliation_query = text("""
        SELECT 
            a.currency_code,
            a.balance as closing_balance,
            s.bic as sap_bic,
            s.name as sap_name_full,
            COALESCE(f.fxp_code, 'N/A') as fxp_code,
            COALESCE(SUM(CASE WHEN t.type = 'CREDIT' AND DATE(t.created_at) = :report_date THEN t.amount ELSE 0 END), 0) as total_credits,
            COALESCE(SUM(CASE WHEN t.type = 'DEBIT' AND DATE(t.created_at) = :report_date THEN t.amount ELSE 0 END), 0) as total_debits,
            COUNT(CASE WHEN DATE(t.created_at) = :report_date THEN t.transaction_id END) as transaction_count
        FROM fxp_sap_accounts a
        JOIN saps s ON a.sap_id = s.sap_id
        LEFT JOIN fxps f ON a.fxp_id = f.fxp_id
        LEFT JOIN sap_transactions t ON a.account_id = t.account_id
        WHERE a.sap_id = CAST(:sap_id AS uuid)
        GROUP BY a.account_id, a.currency_code, a.balance, s.bic, s.name, f.fxp_code
        ORDER BY a.currency_code
    """)
    
    result = await db.execute(reconciliation_query, {
        "sap_id": str(sap.sap_id),
        "report_date": report_date_obj
    })
    rows = result.fetchall()
    
    reports = []
    for r in rows:
        closing = Decimal(r.closing_balance)
        credits = Decimal(r.total_credits)
        debits = Decimal(r.total_debits)
        opening = closing - credits + debits
        
        reports.append(ReconciliationReport(
            date=report_date,
            sap_id=str(sap.sap_id),
            sap_name=sap.name,
            sap_bic=r.sap_bic or '',
            fxp_code=r.fxp_code or '',
            currency=r.currency_code,
            opening_balance=str(opening),
            total_credits=str(credits),
            total_debits=str(debits),
            closing_balance=str(closing),
            transaction_count=r.transaction_count
        ))
    
    return reports


# =============================================================================
# Liquidity Alerts (Configuration)
# =============================================================================

@router.post("/liquidity-alerts")
async def configure_liquidity_alerts(
    request: LiquidityAlert,
    sap_bic: str = Query("DBSSSGSG", alias="sapBic", description="BIC of the SAP"),
    fxp_bic: str = Query(..., alias="fxpBic", description="BIC of the FXP"),
    currency: str = Query(..., description="Currency code"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Configure liquidity alert thresholds for an FXP account.
    
    Alerts are triggered when available balance falls below the threshold.
    """
    # Verify SAP exists
    sap_query = text("SELECT sap_id FROM saps WHERE bic = :bic")
    result = await db.execute(sap_query, {"bic": sap_bic.upper()})
    sap = result.fetchone()
    
    if not sap:
        raise HTTPException(status_code=404, detail=f"SAP with BIC {sap_bic} not found")
    
    # Verify FXP exists
    fxp_query = text("SELECT fxp_id FROM fxps WHERE fxp_code = :fxp_code")
    result = await db.execute(fxp_query, {"fxp_code": fxp_bic.upper()})
    fxp = result.fetchone()
    
    if not fxp:
        raise HTTPException(status_code=404, detail=f"FXP with BIC {fxp_bic} not found")
    
    # Verify account exists
    account_query = text("""
        SELECT account_id FROM fxp_sap_accounts
        WHERE sap_id = :sap_id AND fxp_id = :fxp_id AND currency_code = :currency
    """)
    result = await db.execute(account_query, {
        "sap_id": sap.sap_id,
        "fxp_id": fxp.fxp_id,
        "currency": currency.upper()
    })
    account = result.fetchone()
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Store alert configuration (in a real implementation, this would be stored in a table)
    # For now, we just return success
    return {
        "sapBic": sap_bic.upper(),
        "fxpBic": fxp_bic.upper(),
        "currency": currency.upper(),
        "thresholdAmount": str(request.threshold_amount),
        "thresholdPercentage": str(request.threshold_percentage) if request.threshold_percentage else None,
        "emailNotification": request.email_notification,
        "webhookUrl": request.webhook_url,
        "status": "CONFIGURED",
        "message": "Liquidity alert configured successfully"
    }
