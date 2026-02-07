"""
Centralized Fee Configuration - Single Source of Truth.

Reference: https://docs.nexusglobalpayments.org/fees-and-pricing

This module defines all fee structures to avoid duplication across
quotes.py, fees.py, and fee_formulas.py (per ADR-012).
"""

import logging
from decimal import Decimal
from typing import TypedDict, Optional, Literal

logger = logging.getLogger(__name__)


# Fee types per Nexus spec
# DEDUCTED: Fee deducted from principal amount
# INVOICED: Fee charged separately (not deducted from principal)
FeeType = Literal["DEDUCTED", "INVOICED"]


class FeeStructure(TypedDict):
    """Fee structure definition."""
    fixed: Decimal
    percent: Decimal
    min: Decimal
    max: Decimal


class SourceFeeStructureWithType(FeeStructure):
    """Source PSP fee with currency and type."""
    currency: str
    fee_type: FeeType  # DEDUCTED or INVOICED


class DestinationFeeStructure(FeeStructure):
    """Destination PSP fee with currency."""
    currency: str


# =============================================================================
# Destination PSP Fee Structures (by Country)
# Reference: https://docs.nexusglobalpayments.org/fees-and-pricing#destination-psp-deducted-fee
# =============================================================================

DESTINATION_FEE_STRUCTURES: dict[str, DestinationFeeStructure] = {
    # Singapore
    "SG": {
        "currency": "SGD",
        "fixed": Decimal("0.50"),
        "percent": Decimal("0.001"),  # 0.1%
        "min": Decimal("0.50"),
        "max": Decimal("5.00"),
    },
    # Thailand
    "TH": {
        "currency": "THB",
        "fixed": Decimal("10.00"),
        "percent": Decimal("0.001"),
        "min": Decimal("10.00"),
        "max": Decimal("100.00"),
    },
    # Malaysia
    "MY": {
        "currency": "MYR",
        "fixed": Decimal("1.00"),
        "percent": Decimal("0.001"),
        "min": Decimal("1.00"),
        "max": Decimal("10.00"),
    },
    # Philippines
    "PH": {
        "currency": "PHP",
        "fixed": Decimal("25.00"),
        "percent": Decimal("0.002"),  # 0.2%
        "min": Decimal("25.00"),
        "max": Decimal("250.00"),
    },
    # Indonesia
    "ID": {
        "currency": "IDR",
        "fixed": Decimal("5000"),
        "percent": Decimal("0.001"),
        "min": Decimal("5000"),
        "max": Decimal("50000"),
    },
    # India
    "IN": {
        "currency": "INR",
        "fixed": Decimal("25.00"),
        "percent": Decimal("0.001"),
        "min": Decimal("25.00"),
        "max": Decimal("250.00"),
    },
}

# Default for unsupported countries
DEFAULT_DESTINATION_FEE: DestinationFeeStructure = {
    "currency": "USD",
    "fixed": Decimal("1.00"),
    "percent": Decimal("0.001"),
    "min": Decimal("1.00"),
    "max": Decimal("10.00"),
}


# =============================================================================
# Source PSP Fee Structures (by Currency)
# Reference: "Source PSP Deducted Fee is at the sole discretion of the Source PSP"
# =============================================================================

SOURCE_FEE_STRUCTURES: dict[str, FeeStructure] = {
    "SGD": {
        "fixed": Decimal("0.50"),
        "percent": Decimal("0.001"),
        "min": Decimal("0.50"),
        "max": Decimal("10.00"),
    },
    "THB": {
        "fixed": Decimal("10.00"),
        "percent": Decimal("0.001"),
        "min": Decimal("10.00"),
        "max": Decimal("100.00"),
    },
    "MYR": {
        "fixed": Decimal("1.00"),
        "percent": Decimal("0.001"),
        "min": Decimal("1.00"),
        "max": Decimal("10.00"),
    },
    "PHP": {
        "fixed": Decimal("25.00"),
        "percent": Decimal("0.001"),
        "min": Decimal("25.00"),
        "max": Decimal("250.00"),
    },
    "IDR": {
        "fixed": Decimal("5000"),
        "percent": Decimal("0.001"),
        "min": Decimal("5000"),
        "max": Decimal("50000"),
    },
    "INR": {
        "fixed": Decimal("25.00"),
        "percent": Decimal("0.001"),
        "min": Decimal("25.00"),
        "max": Decimal("250.00"),
    },
}

# Default for unsupported currencies
DEFAULT_SOURCE_FEE: FeeStructure = {
    "fixed": Decimal("1.00"),
    "percent": Decimal("0.001"),
    "min": Decimal("1.00"),
    "max": Decimal("10.00"),
}


# =============================================================================
# Source PSP Fee Types (per Nexus spec)
# Reference: https://docs.nexusglobalpayments.org/fees-and-pricing#source-psp-deducted-fee
# =============================================================================

# Default fee type for Source PSP (can be DEDUCTED or INVOICED)
DEFAULT_SOURCE_FEE_TYPE: FeeType = "DEDUCTED"

# Country-specific fee types (if different from default)
# Invoiced fees are charged separately, not deducted from principal
SOURCE_FEE_TYPES: dict[str, FeeType] = {
    # Countries where Source PSP invoices separately
    # "SG": "INVOICED",  # Example: Singapore PSPs invoice separately
}


# =============================================================================
# Scheme Fee Structure
# =============================================================================

SCHEME_FEE_STRUCTURE: FeeStructure = {
    "fixed": Decimal("0.10"),
    "percent": Decimal("0.0005"),  # 0.05%
    "min": Decimal("0.10"),
    "max": Decimal("5.00"),
}


# =============================================================================
# Fee Calculation Functions
# =============================================================================

def get_destination_fee_structure(country_code: str) -> DestinationFeeStructure:
    """Get destination PSP fee structure for a country."""
    return DESTINATION_FEE_STRUCTURES.get(country_code.upper(), DEFAULT_DESTINATION_FEE)


def get_source_fee_structure(currency: str) -> FeeStructure:
    """Get source PSP fee structure for a currency."""
    return SOURCE_FEE_STRUCTURES.get(currency.upper(), DEFAULT_SOURCE_FEE)


def calculate_destination_psp_fee(amount: Decimal, currency: str) -> tuple[Decimal, str]:
    """
    Calculate destination PSP fee with currency context.
    
    Returns:
        Tuple of (fee_amount, fee_currency)
    """
    logger.debug(f"[FEE-DEBUG] calculate_destination_psp_fee ENTRY: amount={amount}, currency={currency}")
    
    # Lookup by currency to find country structure
    for country, struct in DESTINATION_FEE_STRUCTURES.items():
        if struct["currency"] == currency.upper():
            calculated = struct["fixed"] + amount * struct["percent"]
            fee = max(struct["min"], min(struct["max"], calculated))
            result = fee.quantize(Decimal("0.01"))
            logger.debug(f"[FEE-DEBUG] calculate_destination_psp_fee EXIT: fee={result}, currency={struct['currency']}")
            return result, struct["currency"]
    
    # Use default
    struct = DEFAULT_DESTINATION_FEE
    calculated = struct["fixed"] + amount * struct["percent"]
    fee = max(struct["min"], min(struct["max"], calculated))
    result = fee.quantize(Decimal("0.01"))
    logger.debug(f"[FEE-DEBUG] calculate_destination_psp_fee EXIT (default): fee={result}, currency={currency}")
    return result, currency


def calculate_source_psp_fee(amount: Decimal, currency: str) -> Decimal:
    """
    Calculate source PSP fee with proper currency context.

    Args:
        amount: Principal amount in source currency
        currency: Source currency code (ISO 4217)

    Returns:
        Fee amount in source currency
    """
    logger.debug(f"[FEE-DEBUG] calculate_source_psp_fee ENTRY: amount={amount}, currency={currency}")
    struct = get_source_fee_structure(currency)
    calculated = struct["fixed"] + amount * struct["percent"]
    fee = max(struct["min"], min(struct["max"], calculated)).quantize(Decimal("0.01"))
    logger.debug(f"[FEE-DEBUG] calculate_source_psp_fee EXIT: fee={fee}, structure={struct}")
    return fee


def get_source_fee_type(country_code: str) -> FeeType:
    """
    Get the fee type for a source country.
    
    Args:
        country_code: ISO 3166-1 alpha-2 country code
    
    Returns:
        Fee type: "DEDUCTED" (deducted from principal) or "INVOICED" (charged separately)
    """
    return SOURCE_FEE_TYPES.get(country_code.upper(), DEFAULT_SOURCE_FEE_TYPE)


def calculate_total_cost_to_sender(
    principal: Decimal,
    source_psp_fee: Decimal,
    scheme_fee: Decimal,
    fee_type: FeeType
) -> Decimal:
    """
    Calculate total cost to sender based on fee type.

    For DEDUCTED fees: Total = Principal + Scheme Fee (PSP fee deducted from principal)
    For INVOICED fees: Total = Principal + Scheme Fee + PSP Fee (all charged separately)

    Args:
        principal: Principal amount to send
        source_psp_fee: Source PSP fee amount
        scheme_fee: Nexus scheme fee
        fee_type: Whether PSP fee is DEDUCTED or INVOICED

    Returns:
        Total amount debited from sender's account
    """
    logger.debug(f"[FEE-DEBUG] calculate_total_cost_to_sender ENTRY: principal={principal}, source_psp_fee={source_psp_fee}, scheme_fee={scheme_fee}, fee_type={fee_type}")

    if fee_type == "INVOICED":
        # All fees charged separately - not deducted from principal
        total = principal + scheme_fee + source_psp_fee
        logger.debug(f"[FEE-DEBUG] calculate_total_cost_to_sender EXIT (INVOICED): total={total}")
        return total
    else:
        # DEDUCTED: PSP fee deducted from principal
        total = principal + scheme_fee
        logger.debug(f"[FEE-DEBUG] calculate_total_cost_to_sender EXIT (DEDUCTED): total={total}")
        return total


def calculate_scheme_fee(amount: Decimal) -> Decimal:
    """
    Calculate Nexus scheme fee.
    
    Scheme fee is always in source currency.
    """
    struct = SCHEME_FEE_STRUCTURE
    calculated = struct["fixed"] + amount * struct["percent"]
    return max(struct["min"], min(struct["max"], calculated)).quantize(Decimal("0.01"))
