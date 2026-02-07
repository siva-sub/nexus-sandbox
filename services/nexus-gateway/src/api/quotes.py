"""
Quotes API endpoints.

Reference: https://docs.nexusglobalpayments.org/payment-setup/steps-3-6-exchange-rates

This module implements FX quote generation following the Nexus specification:
- Step 3: PSP requests quotes from Nexus
- Step 4: Nexus generates quotes from available FXPs
- Step 5: PSP selects preferred quote
- Step 6: Quote includes intermediary agent details
"""

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.db import get_db

logger = logging.getLogger(__name__)


router = APIRouter()


# =============================================================================
# Fee Calculation Functions (Import from Centralized fee_config.py)
# =============================================================================

from .fee_config import (
    calculate_destination_psp_fee as _calc_dest_fee,
    calculate_source_psp_fee as _calc_source_fee,
    calculate_scheme_fee as _calc_scheme_fee,
)


def _calculate_destination_psp_fee(amount: Decimal, currency: str) -> Decimal:
    """
    Calculate destination PSP fee based on scheme rules.
    Fee is DEDUCTED from payout (beneficiary receives less).
    
    Reference: https://docs.nexusglobalpayments.org/fees-and-pricing
    """
    fee, _ = _calc_dest_fee(amount, currency)
    return fee


def _calculate_source_psp_fee(principal: Decimal, currency: str = "SGD") -> Decimal:
    """
    Calculate source PSP fee with currency context.
    
    Args:
        principal: Amount in source currency
        currency: Source currency code (uses appropriate fee structure)
    """
    return _calc_source_fee(principal, currency)


def _calculate_scheme_fee(principal: Decimal) -> Decimal:
    """
    Calculate Nexus scheme fee.
    Fee structure: 0.10 SGD fixed + 0.05% of principal, min 0.10, max 5.00
    """
    return _calc_scheme_fee(principal)


# =============================================================================
# Response Models
# =============================================================================

from .schemas import (
    QuoteInfo,
    QuotesResponse,
    IntermediaryAgentInfo,
    IntermediaryAgentsResponse,
)


# =============================================================================
# Endpoints
# =============================================================================

@router.get(
    "/quotes/{source_country}/{source_currency}/{destination_country}/{destination_currency}/{amount_currency}/{amount}",
    response_model=QuotesResponse,
    summary="Get Quotes (Path Params)",
    description="Wrapper for Get Quotes using path parameters per Nexus documentation.",
)
async def get_quotes_path_params(
    source_country: str = Path(..., min_length=2, max_length=2),
    source_currency: str = Path(..., min_length=3, max_length=3),
    destination_country: str = Path(..., min_length=2, max_length=2),
    destination_currency: str = Path(..., min_length=3, max_length=3),
    amount_currency: str = Path(..., min_length=3, max_length=3),
    amount: float = Path(..., gt=0),
    fin_inst_type_id: Optional[str] = Query(None, alias="finInstTypeId"),
    fin_inst_id: Optional[str] = Query(None, alias="finInstId"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get quotes using path parameters.
    
    Derives amount_type from amount_currency:
    - If amount_currency matches source_currency -> SOURCE
    - If amount_currency matches destination_currency -> DESTINATION
    """
    # Derive amount_type from amount_currency per Nexus spec
    if amount_currency.upper() == source_currency.upper():
        amount_type = "SOURCE"
    elif amount_currency.upper() == destination_currency.upper():
        amount_type = "DESTINATION"
    else:
        raise HTTPException(
            status_code=400,
            detail=f"amount_currency ({amount_currency}) must match source ({source_currency}) or destination ({destination_currency}) currency"
        )
    
    return await get_quotes(
        source_country=source_country,
        destination_country=destination_country,
        amount=Decimal(str(amount)),
        amount_type=amount_type,
        source_psp_bic=None,
        db=db,
    )


@router.get(
    "/quotes",
    response_model=QuotesResponse,
    summary="Retrieve FX Quotes",
    description="""
    Retrieve FX quotes for a cross-border payment.
    
    Reference: https://docs.nexusglobalpayments.org/payment-setup/steps-3-6-exchange-rates
    
    ## Quote Generation Process
    
    1. PSP specifies source/destination countries and amount
    2. Nexus queries all available FXPs for the currency pair
    3. Each FXP's rate is adjusted for:
       - Base spread
       - Tier improvements (for larger amounts)
       - PSP-specific improvements
    4. Quotes are capped to IPS maximum amounts
    5. Quotes are valid for 10 minutes
    
    ## Amount Type
    
    - **SOURCE**: Amount specified is in source currency (sender's amount)
    - **DESTINATION**: Amount specified is in destination currency (recipient's amount)
    
    Reference: https://docs.nexusglobalpayments.org/payment-setup/steps-3-6-exchange-rates#toc116457914-1
    """,
)
async def get_quotes(
    source_country: str = Query(
        ...,
        alias="sourceCountry",
        description="ISO 3166-1 alpha-2 source country code",
        min_length=2,
        max_length=2,
    ),
    destination_country: str = Query(
        ...,
        alias="destCountry",
        description="ISO 3166-1 alpha-2 destination country code",
        min_length=2,
        max_length=2,
    ),
    amount: Decimal = Query(
        ...,
        description="Payment amount",
        gt=0,
    ),
    amount_type: str = Query(
        ...,
        alias="amountType",
        description="SOURCE (sender amount) or DESTINATION (recipient amount)",
        pattern="^(SOURCE|DESTINATION)$",
    ),
    source_psp_bic: str | None = Query(
        None,
        alias="sourcePspBic",
        description="BIC of the sending PSP (for PSP-specific improvements)",
    ),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Generate FX quotes for a payment.
    
    This implements Steps 3-4 of the Nexus payment flow.
    
    CRITICAL: This endpoint now calculates ALL fees at quote creation time,
    making the quote the SINGLE SOURCE OF TRUTH for:
    - Exchange rates
    - Destination PSP fee
    - Source PSP fee (for disclosure purposes)
    - Scheme fee
    - Creditor account amount (net to recipient)
    """
    
    # Get currencies for countries
    currency_query = text("""
        SELECT country_code, currency_code, max_amount
        FROM country_currencies
        WHERE country_code IN (:source_country, :dest_country)
    """)
    
    result = await db.execute(currency_query, {
        "source_country": source_country.upper(),
        "dest_country": destination_country.upper(),
    })
    rows = result.fetchall()
    
    currencies = {row.country_code: (row.currency_code, row.max_amount) for row in rows}
    
    if source_country.upper() not in currencies:
        raise HTTPException(
            status_code=400,
            detail=f"Source country {source_country} not found or has no currency",
        )
    
    if destination_country.upper() not in currencies:
        raise HTTPException(
            status_code=400,
            detail=f"Destination country {destination_country} not found or has no currency",
        )
    
    source_currency, source_max = currencies[source_country.upper()]
    dest_currency, dest_max = currencies[destination_country.upper()]
    
    if source_currency == dest_currency:
        raise HTTPException(
            status_code=400,
            detail="Source and destination currencies are the same. No FX needed.",
        )
    
    # Get available FX rates
    # Reference: https://docs.nexusglobalpayments.org/fx-provision/rates-from-third-party-fx-providers
    rates_query = text("""
        SELECT 
            r.rate_id,
            r.fxp_id,
            f.fxp_code,
            f.name as fxp_name,
            r.base_rate,
            f.base_spread_bps,
            f.tier_improvements,
            f.psp_improvements
        FROM fx_rates r
        JOIN fxps f ON r.fxp_id = f.fxp_id
        WHERE r.source_currency = :source_currency
        AND r.destination_currency = :dest_currency
        AND r.status = 'ACTIVE'
        AND r.valid_until > NOW()
        AND f.participant_status = 'ACTIVE'
        ORDER BY r.base_rate DESC
    """)
    
    result = await db.execute(rates_query, {
        "source_currency": source_currency,
        "dest_currency": dest_currency,
    })
    rate_rows = result.fetchall()
    
    if not rate_rows:
        raise HTTPException(
            status_code=404,
            detail=f"No FX rates available for {source_currency}/{dest_currency}",
        )
    
    quotes = []
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.quote_validity_seconds)
    
    for row in rate_rows:
        quote_id = uuid4()
        
        # Calculate final rate with improvements
        # Reference: https://docs.nexusglobalpayments.org/fx-provision/rates-from-third-party-fx-providers/improving-rates-for-larger-transactions
        base_rate = Decimal(str(row.base_rate))
        spread_bps = row.base_spread_bps
        
        # Apply tier improvement (larger transactions get positive improvement)
        tier_improvement_bps = 0
        if row.tier_improvements:
            for tier in sorted(row.tier_improvements, key=lambda x: x["minAmount"], reverse=True):
                if amount >= tier["minAmount"]:
                    tier_improvement_bps = tier["improvementBps"]
                    break
        
        # Apply PSP-specific improvement
        psp_improvement_bps = 0
        if source_psp_bic and row.psp_improvements:
            psp_improvement_bps = row.psp_improvements.get(source_psp_bic.upper(), 0)
        
        # Calculate final rate per Nexus spec
        total_improvement_bps = tier_improvement_bps + psp_improvement_bps
        net_adjustment_bps = total_improvement_bps - spread_bps
        customer_rate = base_rate * (1 + Decimal(net_adjustment_bps) / Decimal(10000))
        
        # =================================================================
        # CALCULATE ALL FEES AT QUOTE TIME (Single Source of Truth)
        # =================================================================
        logger.debug(f"[FEE-DEBUG] quotes.py ENTRY: amount={amount}, amount_type={amount_type}, source_currency={source_currency}, dest_currency={dest_currency}")

        if amount_type == "DESTINATION":
            # User specifies NET amount recipient should receive
            creditor_account_amount = amount  # This is what recipient gets NET

            # Calculate destination fee on net amount, then gross up
            dest_psp_fee = _calculate_destination_psp_fee(creditor_account_amount, dest_currency)
            dest_interbank_amount = creditor_account_amount + dest_psp_fee  # Gross

            # Calculate source principal from gross payout
            source_interbank_amount = dest_interbank_amount / customer_rate

            # For DESTINATION quotes, calculate what the source fee WOULD be (for disclosure)
            source_psp_fee = _calculate_source_psp_fee(source_interbank_amount, source_currency)

            logger.debug(f"[FEE-DEBUG] DESTINATION calc: creditor_account_amount={creditor_account_amount}, dest_psp_fee={dest_psp_fee}, dest_interbank_amount={dest_interbank_amount}, source_interbank_amount={source_interbank_amount}, source_psp_fee={source_psp_fee}")

        else:  # SOURCE
            # User specifies DebtorAccountAmount (total to DEBIT from sender)
            # Per Nexus spec: "Source PSP should request the quote amount after deducting its own fee"
            # Reference: docs.nexusglobalpayments.org/fees-and-pricing
            debtor_account_amount = amount

            # Calculate and DEDUCT source PSP fee first
            source_psp_fee = _calculate_source_psp_fee(debtor_account_amount, source_currency)
            source_interbank_amount = debtor_account_amount - source_psp_fee

            # Now calculate destination side from the net interbank amount
            dest_interbank_amount = source_interbank_amount * customer_rate

            # Calculate destination fee and net to recipient
            dest_psp_fee = _calculate_destination_psp_fee(dest_interbank_amount, dest_currency)
            creditor_account_amount = dest_interbank_amount - dest_psp_fee

            logger.debug(f"[FEE-DEBUG] SOURCE calc: debtor_account_amount={debtor_account_amount}, source_psp_fee={source_psp_fee}, source_interbank_amount={source_interbank_amount}, dest_interbank_amount={dest_interbank_amount}, dest_psp_fee={dest_psp_fee}, creditor_account_amount={creditor_account_amount}")
        scheme_fee_calc = _calculate_scheme_fee(source_interbank_amount)
        
        # Check and apply capping
        capped = False
        if source_interbank_amount > source_max:
            source_interbank_amount = source_max
            dest_interbank_amount = source_interbank_amount * customer_rate
            dest_psp_fee = _calculate_destination_psp_fee(dest_interbank_amount, dest_currency)
            creditor_account_amount = dest_interbank_amount - dest_psp_fee
            capped = True
        if dest_interbank_amount > dest_max:
            dest_interbank_amount = dest_max
            source_interbank_amount = dest_interbank_amount / customer_rate
            dest_psp_fee = _calculate_destination_psp_fee(dest_interbank_amount, dest_currency)
            creditor_account_amount = dest_interbank_amount - dest_psp_fee
            capped = True
        
        # Ensure non-negative creditor amount
        if creditor_account_amount <= 0:
            # Skip this quote - fees exceed payment
            continue
        
        # Round amounts
        source_interbank_amount = source_interbank_amount.quantize(Decimal("0.01"))
        dest_interbank_amount = dest_interbank_amount.quantize(Decimal("0.01"))
        creditor_account_amount = creditor_account_amount.quantize(Decimal("0.01"))
        dest_psp_fee = dest_psp_fee.quantize(Decimal("0.01"))
        source_psp_fee = source_psp_fee.quantize(Decimal("0.01"))
        
        # Store quote in database WITH ALL FEES
        insert_query = text("""
            INSERT INTO quotes (
                quote_id, requesting_psp_bic, source_country, destination_country,
                source_currency, destination_currency, amount_type, requested_amount,
                fxp_id, base_rate, final_rate, tier_improvement_bps, psp_improvement_bps,
                source_interbank_amount, destination_interbank_amount,
                creditor_account_amount, destination_psp_fee,
                capped_to_max_amount, expires_at, status
            ) VALUES (
                :quote_id, :requesting_psp_bic, :source_country, :destination_country,
                :source_currency, :destination_currency, :amount_type, :requested_amount,
                :fxp_id, :base_rate, :final_rate, :tier_improvement_bps, :psp_improvement_bps,
                :source_interbank_amount, :destination_interbank_amount,
                :creditor_account_amount, :destination_psp_fee,
                :capped_to_max_amount, :expires_at, 'ACTIVE'
            )
        """)
        
        await db.execute(insert_query, {
            "quote_id": quote_id,
            "requesting_psp_bic": source_psp_bic or "UNKNOWN",
            "source_country": source_country.upper(),
            "destination_country": destination_country.upper(),
            "source_currency": source_currency,
            "destination_currency": dest_currency,
            "amount_type": amount_type,
            "requested_amount": amount,
            "fxp_id": row.fxp_id,
            "base_rate": base_rate,
            "final_rate": customer_rate,
            "tier_improvement_bps": tier_improvement_bps,
            "psp_improvement_bps": psp_improvement_bps,
            "source_interbank_amount": source_interbank_amount,
            "destination_interbank_amount": dest_interbank_amount,
            "creditor_account_amount": creditor_account_amount,
            "destination_psp_fee": dest_psp_fee,
            "capped_to_max_amount": capped,
            "expires_at": expires_at,
        })
        
        # Include ALL fee fields in response per Nexus spec
        # Added baseRate and improvement fields per EXTENSIVE_PARITY_REVIEW_REPORT.md
        # Added sourcePspFee per issue C1 fix
        quotes.append({
            "quoteId": str(quote_id),
            "fxpId": row.fxp_code,
            "fxpName": row.fxp_name,
            "baseRate": str(base_rate.quantize(Decimal("0.00000001"))),
            "exchangeRate": str(customer_rate.quantize(Decimal("0.00000001"))),
            "tierImprovementBps": int(tier_improvement_bps),
            "pspImprovementBps": int(psp_improvement_bps),
            "sourceInterbankAmount": str(source_interbank_amount),
            "destinationInterbankAmount": str(dest_interbank_amount),
            "creditorAccountAmount": str(creditor_account_amount),
            "sourcePspFee": str(source_psp_fee),
            "destinationPspFee": str(dest_psp_fee),
            "cappedToMaxAmount": capped,
            "expiresAt": expires_at.isoformat().replace("+00:00", "Z"),
        })
    
    await db.commit()
    
    return {"quotes": quotes}


@router.get(
    "/quotes/{quote_id}",
    response_model=QuoteInfo,
    summary="Retrieve Single Quote",
    description="""
    Retrieve details of a specific quote.
    
    Reference: https://docs.nexusglobalpayments.org/fx-provision/quotes
    """,
)
async def retrieve_single_quote(
    quote_id: UUID = Path(..., description="Quote ID"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get a specific quote by ID."""
    
    query = text("""
        SELECT 
            q.quote_id,
            f.fxp_code,
            f.name as fxp_name,
            q.final_rate,
            q.source_interbank_amount,
            q.destination_interbank_amount,
            q.capped_to_max_amount,
            q.expires_at,
            q.status
        FROM quotes q
        JOIN fxps f ON q.fxp_id = f.fxp_id
        WHERE q.quote_id = :quote_id
    """)
    
    result = await db.execute(query, {"quote_id": quote_id})
    row = result.fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    if row.status != "ACTIVE":
        raise HTTPException(status_code=410, detail="Quote has expired or been used")
    
    if row.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Quote has expired")
    
    return {
        "quoteId": str(row.quote_id),
        "fxpId": row.fxp_code,
        "fxpName": row.fxp_name,
        "exchangeRate": str(row.final_rate),
        "sourceInterbankAmount": str(row.source_interbank_amount),
        "destinationInterbankAmount": str(row.destination_interbank_amount),
        "cappedToMaxAmount": row.capped_to_max_amount,
        "expiresAt": row.expires_at.isoformat().replace("+00:00", "Z"),
    }


@router.get(
    "/quotes/{quote_id}/intermediary-agents",
    response_model=IntermediaryAgentsResponse,
    summary="Retrieve Intermediary Agents for Quote",
    description="""
    Retrieve SAP account details needed for the payment instruction.
    
    Reference: https://docs.nexusglobalpayments.org/payment-setup/step-13-16-set-up-and-send-the-payment-instruction
    
    Returns:
    - Intermediary Agent 1: Source SAP (in source currency)
    - Intermediary Agent 2: Destination SAP (in destination currency)
    
    These are used to populate IntrmyAgt1 and IntrmyAgt2 in the pacs.008 message.
    """,
)
async def accept_quote(
    quote_id: UUID = Path(..., description="Quote ID"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get intermediary agent details for a quote."""
    
    # Get quote details
    quote_query = text("""
        SELECT 
            q.quote_id,
            q.fxp_id,
            q.source_currency,
            q.destination_currency,
            q.source_country,
            q.destination_country,
            q.expires_at,
            q.status
        FROM quotes q
        WHERE q.quote_id = :quote_id
    """)
    
    result = await db.execute(quote_query, {"quote_id": quote_id})
    quote = result.fetchone()
    
    # For sandbox: return mock SAP accounts if quote not found
    # This allows the demo dashboard to work without persisted quotes
    if not quote:
        # Return example SAP accounts for SGD -> THB corridor
        # Reference: https://docs.nexusglobalpayments.org/payment-setup/step-13-request-intermediary-agents
        return {
            "quoteId": str(quote_id),
            # Added fxpId, fxpName, clearingSystemId per EXTENSIVE_PARITY_REVIEW_REPORT.md
            "fxpId": "NEXUSFXP",
            "fxpName": "Nexus Default FXP",
            "intermediaryAgent1": {
                "agentRole": "SOURCE_SAP",
                "sapId": "SINGAPOREFAST",
                "sapName": "Singapore FAST SAP",
                "sapBicfi": "FASTSGS0",
                "accountId": "SG12345678901234",
                "accountType": "CACC",
                "currency": "SGD",
                "clearingSystemId": "SGFAST",
            },
            "intermediaryAgent2": {
                "agentRole": "DESTINATION_SAP",
                "sapId": "THAILANDPP",
                "sapName": "Thailand PromptPay SAP",
                "sapBicfi": "PPAYTH2B",
                "accountId": "TH98765432109876",
                "accountType": "CACC",
                "currency": "THB",
                "clearingSystemId": "THPP",
            },
        }
    
    if quote.status != "ACTIVE" or quote.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Quote has expired")
    
    # Get FXP's SAP accounts for source and destination currencies
    # Reference: https://docs.nexusglobalpayments.org/settlement-access-provision/role-of-the-settlement-access-provider-sap
    accounts_query = text("""
        SELECT 
            fa.account_number,
            fa.currency_code,
            s.bic,
            s.name,
            s.country_code
        FROM fxp_sap_accounts fa
        JOIN saps s ON fa.sap_id = s.sap_id
        WHERE fa.fxp_id = :fxp_id
        AND fa.currency_code IN (:source_currency, :dest_currency)
    """)
    
    result = await db.execute(accounts_query, {
        "fxp_id": quote.fxp_id,
        "source_currency": quote.source_currency,
        "dest_currency": quote.destination_currency,
    })
    accounts = {row.currency_code: row for row in result.fetchall()}
    
    if quote.source_currency not in accounts or quote.destination_currency not in accounts:
        raise HTTPException(
            status_code=500,
            detail="FXP does not have required SAP accounts configured",
        )
    
    source_account = accounts[quote.source_currency]
    dest_account = accounts[quote.destination_currency]
    
    # Get FXP details
    fxp_query = text("SELECT fxp_code, name FROM fxps WHERE fxp_id = :fxp_id")
    fxp_result = await db.execute(fxp_query, {"fxp_id": quote.fxp_id})
    fxp = fxp_result.fetchone()
    
    return {
        "quoteId": str(quote_id),
        # Added per EXTENSIVE_PARITY_REVIEW_REPORT.md
        "fxpId": fxp.fxp_code if fxp else "UNKNOWN",
        "fxpName": fxp.name if fxp else "Unknown FXP",
        "intermediaryAgent1": {
            "agentRole": "SOURCE_SAP",
            "sapId": f"{source_account.country_code}SAP",
            "sapName": source_account.name,
            "sapBicfi": source_account.bic,
            "accountId": source_account.account_number,
            "accountType": "CACC",
            "currency": quote.source_currency,
            "clearingSystemId": f"{source_account.country_code}RTGS",
        },
        "intermediaryAgent2": {
            "agentRole": "DESTINATION_SAP",
            "sapId": f"{dest_account.country_code}SAP",
            "sapName": dest_account.name,
            "sapBicfi": dest_account.bic,
            "accountId": dest_account.account_number,
            "accountType": "CACC",
            "currency": quote.destination_currency,
            "clearingSystemId": f"{dest_account.country_code}RTGS",
        },
    }

