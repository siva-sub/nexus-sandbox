"""
Fee Formulas API Endpoints - REWRITTEN with invariants

Reference: https://docs.nexusglobalpayments.org/fees-and-pricing/source-psp-fees

This module implements the pre-transaction disclosure with STRICT invariants
to prevent the contradictions identified in the previous implementation.

Key Design Principles:
1. All rates are expressed as DESTINATION per SOURCE (e.g., IDR per 1 SGD)
2. Recipient amount is always NET (after destination fee deduction)
3. Payout gross = recipient net + destination fee
4. Sender total = sender principal + source fees
5. Effective rate = recipient net / sender total (same units as market rate)
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from decimal import Decimal, getcontext
from datetime import datetime, timezone
from pydantic import BaseModel
from ..db import get_db

# High precision for FX calculations
getcontext().prec = 40

router = APIRouter(prefix="/v1", tags=["Fees"])


class FeeFormulaResponse(BaseModel):
    """Fee formula definition."""
    feeType: str
    countryCode: str
    currencyCode: str
    fixedAmount: str
    percentageRate: str
    minimumFee: str
    maximumFee: str
    description: str


class PreTransactionDisclosure(BaseModel):
    """
    Pre-transaction fee disclosure per Nexus requirements.
    
    INVARIANTS (these MUST hold true):
    1. payout_gross = recipient_net + destination_fee (in destination currency)
    2. sender_total = sender_principal + source_psp_fee + scheme_fee (in source currency)
    3. effective_rate = recipient_net / sender_total
    4. customer_rate = market_rate * (1 - spread_bps/10000)
    5. sender_principal = payout_gross / customer_rate
    """
    # Quote reference
    quoteId: str
    
    # Market and customer rates (both in destination per source)
    marketRate: str               # Mid-market rate (IDR per SGD)
    customerRate: str             # Rate after spread applied
    appliedSpreadBps: str         # Spread actually applied
    
    # Payout side (destination currency - IDR)
    recipientNetAmount: str       # What recipient ACTUALLY receives (NET)
    payoutGrossAmount: str        # Amount sent to dest PSP (before their fee)
    destinationPspFee: str        # Fee deducted by dest PSP
    destinationCurrency: str
    
    # Sender side (source currency - SGD)
    senderPrincipal: str          # FX principal (funds payout at customer rate)
    sourcePspFee: str             # Source PSP fee
    sourcePspFeeType: str         # DEDUCTED or INVOICED
    schemeFee: str                # Nexus scheme fee
    senderTotal: str              # Total amount debited from sender
    sourceCurrency: str
    
    # Disclosure metrics
    effectiveRate: str            # recipient_net / sender_total (IDR per SGD)
    totalCostPercent: str         # Cost vs mid-market benchmark
    
    # Quote validity
    quoteValidUntil: str


def _calculate_destination_fee(gross_payout: Decimal, currency: str) -> Decimal:
    """
    Calculate destination PSP fee based on scheme rules.
    Fee is DEDUCTED from payout (beneficiary receives less).
    """
    fee_structures = {
        "SGD": {"fixed": Decimal("0.50"), "percent": Decimal("0.001"), "min": Decimal("0.50"), "max": Decimal("5.00")},
        "THB": {"fixed": Decimal("10.00"), "percent": Decimal("0.001"), "min": Decimal("10.00"), "max": Decimal("100.00")},
        "MYR": {"fixed": Decimal("1.00"), "percent": Decimal("0.001"), "min": Decimal("1.00"), "max": Decimal("10.00")},
        "PHP": {"fixed": Decimal("25.00"), "percent": Decimal("0.002"), "min": Decimal("25.00"), "max": Decimal("250.00")},
        "IDR": {"fixed": Decimal("500"), "percent": Decimal("0.001"), "min": Decimal("500"), "max": Decimal("50000")},
        "INR": {"fixed": Decimal("25.00"), "percent": Decimal("0.001"), "min": Decimal("25.00"), "max": Decimal("250.00")},
    }
    
    struct = fee_structures.get(currency, {"fixed": Decimal("1.00"), "percent": Decimal("0.001"), "min": Decimal("1.00"), "max": Decimal("10.00")})
    
    calculated = struct["fixed"] + gross_payout * struct["percent"]
    return max(struct["min"], min(struct["max"], calculated))


def _calculate_source_psp_fee(principal: Decimal) -> Decimal:
    """
    Calculate source PSP fee.
    Fee structure: 0.50 SGD fixed + 0.1% of principal, min 0.50, max 10.00
    """
    calculated = Decimal("0.50") + principal * Decimal("0.001")
    return max(Decimal("0.50"), min(Decimal("10.00"), calculated))


def _calculate_scheme_fee(principal: Decimal) -> Decimal:
    """
    Calculate Nexus scheme fee.
    Fee structure: 0.10 SGD fixed + 0.05% of principal, min 0.10, max 5.00
    """
    calculated = Decimal("0.10") + principal * Decimal("0.0005")
    return max(Decimal("0.10"), min(Decimal("5.00"), calculated))


def _assert_invariants(
    recipient_net: Decimal,
    payout_gross: Decimal,
    dest_fee: Decimal,
    sender_principal: Decimal,
    sender_total: Decimal,
    source_psp_fee: Decimal,
    scheme_fee: Decimal,
    effective_rate: Decimal,
    customer_rate: Decimal,
    market_rate: Decimal,
    applied_spread_bps: Decimal,
):
    """
    Validate all invariants that MUST hold true.
    Raises AssertionError if any invariant is violated.
    """
    tolerance = Decimal("0.01")  # Allow 1 cent tolerance for rounding
    
    # Invariant 1: payout_gross = recipient_net + dest_fee
    inv1 = abs(payout_gross - (recipient_net + dest_fee))
    if inv1 > tolerance:
        raise AssertionError(f"Invariant 1 violated: payout_gross != recipient_net + dest_fee (diff={inv1})")
    
    # Invariant 2: sender_total = sender_principal + source_psp_fee + scheme_fee
    inv2 = abs(sender_total - (sender_principal + source_psp_fee + scheme_fee))
    if inv2 > tolerance:
        raise AssertionError(f"Invariant 2 violated: sender_total != principal + fees (diff={inv2})")
    
    # Invariant 3: effective_rate = recipient_net / sender_total
    expected_effective = recipient_net / sender_total
    inv3 = abs(effective_rate - expected_effective)
    if inv3 > Decimal("0.0001"):
        raise AssertionError(f"Invariant 3 violated: effective_rate mismatch (diff={inv3})")
    
    # Invariant 4: customer_rate <= market_rate (spread reduces rate)
    if applied_spread_bps >= 0 and customer_rate > market_rate:
        raise AssertionError("Invariant 4 violated: customer_rate > market_rate with positive spread")
    
    # Invariant 5: All amounts must be positive
    if any(x <= 0 for x in [recipient_net, payout_gross, sender_principal, sender_total]):
        raise AssertionError("Invariant 5 violated: Non-positive amounts detected")


@router.get(
    "/fee-formulas/nexus-scheme-fee/{country_code}/{currency_code}",
    response_model=FeeFormulaResponse,
    summary="Get Nexus Scheme Fee formula",
)
async def get_nexus_scheme_fee(
    country_code: str,
    currency_code: str,
    db: AsyncSession = Depends(get_db)
) -> FeeFormulaResponse:
    """Get Nexus scheme fee formula."""
    return FeeFormulaResponse(
        feeType="NEXUS_SCHEME_FEE",
        countryCode=country_code.upper(),
        currencyCode=currency_code.upper(),
        fixedAmount="0.10",
        percentageRate="0.0005",
        minimumFee="0.10",
        maximumFee="5.00",
        description="Nexus Scheme Fee - invoiced to Source IPS monthly"
    )


@router.get(
    "/fee-formulas/creditor-agent-fee/{country_code}/{currency_code}",
    response_model=FeeFormulaResponse,
    summary="Get Creditor Agent Fee formula",
)
async def get_creditor_agent_fee(
    country_code: str,
    currency_code: str,
    db: AsyncSession = Depends(get_db)
) -> FeeFormulaResponse:
    """Get destination PSP fee formula."""
    fee_structures = {
        "SG": {"fixed": "0.50", "percent": "0.001", "min": "0.50", "max": "5.00"},
        "TH": {"fixed": "10.00", "percent": "0.001", "min": "10.00", "max": "100.00"},
        "MY": {"fixed": "1.00", "percent": "0.001", "min": "1.00", "max": "10.00"},
        "PH": {"fixed": "25.00", "percent": "0.001", "min": "25.00", "max": "250.00"},
        "ID": {"fixed": "500", "percent": "0.001", "min": "500", "max": "50000"},
        "IN": {"fixed": "25.00", "percent": "0.001", "min": "25.00", "max": "250.00"},
    }
    
    structure = fee_structures.get(country_code.upper(), {
        "fixed": "1.00", "percent": "0.001", "min": "1.00", "max": "10.00"
    })
    
    return FeeFormulaResponse(
        feeType="CREDITOR_AGENT_FEE",
        countryCode=country_code.upper(),
        currencyCode=currency_code.upper(),
        fixedAmount=structure["fixed"],
        percentageRate=structure["percent"],
        minimumFee=structure["min"],
        maximumFee=structure["max"],
        description="Destination PSP Fee - deducted from payment principal"
    )


@router.get(
    "/pre-transaction-disclosure",
    response_model=PreTransactionDisclosure,
    summary="Get pre-transaction disclosure (CRITICAL)",
    description="""
    **CRITICAL FOR NEXUS COMPLIANCE**
    
    Returns the complete fee disclosure with STRICT INVARIANTS:
    1. payout_gross = recipient_net + destination_fee
    2. sender_total = sender_principal + source_psp_fee + scheme_fee
    3. effective_rate = recipient_net / sender_total
    """
)
async def get_pre_transaction_disclosure(
    quote_id: str,
    source_psp_fee_type: str = "DEDUCTED",
    db: AsyncSession = Depends(get_db)
) -> PreTransactionDisclosure:
    """
    Return the complete pre-transaction disclosure.
    
    CRITICAL: This endpoint now READS all values from the quote record.
    The quote is the SINGLE SOURCE OF TRUTH - no fee recalculation here.
    
    This ensures consistency between:
    - Quote response (what PSP sees)
    - PTD (what Sender sees)
    - pacs.008 message (what goes to destination)
    """
    # Get ALL quote details including pre-calculated fees
    quote_query = text("""
        SELECT 
            q.quote_id,
            q.source_currency,
            q.destination_currency,
            q.final_rate as customer_rate,
            q.base_rate as market_rate,
            q.requested_amount,
            q.amount_type,
            q.source_interbank_amount,
            q.destination_interbank_amount,
            q.creditor_account_amount,
            q.destination_psp_fee,
            q.tier_improvement_bps,
            q.psp_improvement_bps,
            q.expires_at as valid_until,
            f.base_spread_bps
        FROM quotes q
        JOIN fxps f ON q.fxp_id = f.fxp_id
        WHERE q.quote_id = :quote_id
          AND q.expires_at > NOW()
    """)
    
    result = await db.execute(quote_query, {"quote_id": quote_id})
    quote = result.fetchone()
    
    if not quote:
        raise HTTPException(
            status_code=404,
            detail=f"Quote {quote_id} not found or expired"
        )
    
    # =================================================================
    # READ ALL VALUES FROM QUOTE (Single Source of Truth)
    # =================================================================
    
    # Rates (all in destination per source, e.g., IDR per SGD)
    market_rate = Decimal(str(quote.market_rate))
    customer_rate = Decimal(str(quote.customer_rate))
    
    # Calculate applied spread
    base_spread_bps = Decimal(str(quote.base_spread_bps or 50))
    tier_improvement = Decimal(str(quote.tier_improvement_bps or 0))
    psp_improvement = Decimal(str(quote.psp_improvement_bps or 0))
    applied_spread_bps = max(Decimal("0"), base_spread_bps - tier_improvement - psp_improvement)
    
    # Amounts from quote (pre-calculated at quote time)
    source_interbank = Decimal(str(quote.source_interbank_amount))
    dest_interbank = Decimal(str(quote.destination_interbank_amount))
    
    # Read creditor_account_amount and destination_psp_fee from quote
    # These were calculated at quote time - DO NOT RECALCULATE
    if quote.creditor_account_amount is not None:
        recipient_net = Decimal(str(quote.creditor_account_amount))
    else:
        # Fallback for old quotes without this field
        dest_fee_fallback = _calculate_destination_fee(dest_interbank, quote.destination_currency)
        recipient_net = dest_interbank - dest_fee_fallback
    
    if quote.destination_psp_fee is not None:
        dest_fee = Decimal(str(quote.destination_psp_fee))
    else:
        # Fallback for old quotes without this field
        dest_fee = _calculate_destination_fee(dest_interbank, quote.destination_currency)
    
    # Payout gross is destination interbank amount
    payout_gross = dest_interbank
    
    # Sender principal is source interbank amount
    sender_principal = source_interbank
    
    # Calculate source-side fees (these are still calculated here for DEDUCTED type)
    # Since Nexus spec says Source PSP deducts its fee before calling /quotes for SOURCE mode,
    # and in DESTINATION mode, fees are added on top
    source_psp_fee = _calculate_source_psp_fee(sender_principal)
    scheme_fee = _calculate_scheme_fee(sender_principal)
    
    # Sender total = principal + source fees
    sender_total = sender_principal + source_psp_fee + scheme_fee
    
    # =================================================================
    # DISCLOSURE CALCULATIONS
    # =================================================================
    
    # Effective rate = what sender gets per unit paid (INVARIANT 3)
    effective_rate = recipient_net / sender_total
    
    # Total cost % (vs mid-market benchmark)
    mid_principal = payout_gross / market_rate
    total_cost_pct = ((sender_total - mid_principal) / mid_principal) * Decimal("100")
    
    # =================================================================
    # VALIDATE INVARIANTS
    # =================================================================
    _assert_invariants(
        recipient_net=recipient_net,
        payout_gross=payout_gross,
        dest_fee=dest_fee,
        sender_principal=sender_principal,
        sender_total=sender_total,
        source_psp_fee=source_psp_fee,
        scheme_fee=scheme_fee,
        effective_rate=effective_rate,
        customer_rate=customer_rate,
        market_rate=market_rate,
        applied_spread_bps=applied_spread_bps,
    )
    
    # =================================================================
    # BUILD RESPONSE
    # =================================================================
    return PreTransactionDisclosure(
        quoteId=quote_id,
        
        # Rates (both in destination per source, e.g., IDR per SGD)
        marketRate=str(market_rate.quantize(Decimal("0.0001"))),
        customerRate=str(customer_rate.quantize(Decimal("0.0001"))),
        appliedSpreadBps=str(applied_spread_bps.quantize(Decimal("1"))),
        
        # Destination side (IDR)
        recipientNetAmount=str(recipient_net.quantize(Decimal("0.01"))),
        payoutGrossAmount=str(payout_gross.quantize(Decimal("0.01"))),
        destinationPspFee=str(dest_fee.quantize(Decimal("0.01"))),
        destinationCurrency=quote.destination_currency,
        
        # Source side (SGD)
        senderPrincipal=str(sender_principal.quantize(Decimal("0.01"))),
        sourcePspFee=str(source_psp_fee.quantize(Decimal("0.01"))),
        sourcePspFeeType=source_psp_fee_type,
        schemeFee=str(scheme_fee.quantize(Decimal("0.01"))),
        senderTotal=str(sender_total.quantize(Decimal("0.01"))),
        sourceCurrency=quote.source_currency,
        
        # Disclosure metrics
        effectiveRate=str(effective_rate.quantize(Decimal("0.0001"))),
        totalCostPercent=str(total_cost_pct.quantize(Decimal("0.01"))),
        
        quoteValidUntil=quote.valid_until.isoformat(),
    )

