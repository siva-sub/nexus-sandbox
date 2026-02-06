"""
Countries API endpoints.

Reference: https://docs.nexusglobalpayments.org/apis/countries

This module implements the discovery endpoints for Nexus-enabled countries,
including available currencies, max amounts, address types, and PSP listings.
"""

from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_db


router = APIRouter()


# =============================================================================
# Response Models
# Matching the structure from https://docs.nexusglobalpayments.org/apis/countries
# =============================================================================

from .schemas import (
    CurrencyInfo,
    RequiredMessageElements,
    CountryInfo,
    CountriesResponse,
    PspInfo,
    FinancialInstitutionsResponse,
    AddressTypeInfo,
    AddressTypesResponse,
)


# =============================================================================
# Endpoints
# =============================================================================

@router.get(
    "/countries",
    response_model=CountriesResponse,
    summary="Retrieve All Countries",
    description="""
    Retrieve all countries enabled in Nexus.
    
    Reference: https://docs.nexusglobalpayments.org/apis/countries#get-countries
    
    Returns a list of countries with their:
    - Country code (ISO 3166-1 alpha-2)
    - Supported currencies with max transaction amounts
    - Required message elements for ISO 20022 messages
    """,
)
async def retrieve_all_countries(
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Get all Nexus-enabled countries.
    
    This endpoint is typically called at the start of a payment flow to
    determine available corridors.
    """
    # Query countries with currencies
    query = text("""
        SELECT 
            c.country_id,
            c.country_code,
            c.name,
            COALESCE(
                json_agg(
                    DISTINCT jsonb_build_object(
                        'currencyCode', cc.currency_code,
                        'maxAmount', cc.max_amount::text
                    )
                ) FILTER (WHERE cc.currency_code IS NOT NULL),
                '[]'
            ) as currencies,
            COALESCE(
                jsonb_build_object(
                    'pacs008',
                    array_agg(DISTINCT cre.element_name) FILTER (WHERE cre.message_type = 'pacs008')
                ),
                '{}'::jsonb
            ) as required_message_elements
        FROM countries c
        LEFT JOIN country_currencies cc ON c.country_code = cc.country_code
        LEFT JOIN country_required_elements cre ON c.country_code = cre.country_code
        GROUP BY c.country_id, c.country_code, c.name
        ORDER BY c.name
    """)
    
    result = await db.execute(query)
    rows = result.fetchall()
    
    countries = []
    for row in rows:
        countries.append({
            "countryId": row.country_id,
            "countryCode": row.country_code,
            "name": row.name,
            "currencies": row.currencies,
            "requiredMessageElements": row.required_message_elements,
        })
    
    return {"countries": countries}


@router.get(
    "/countries/{country_code}",
    response_model=CountryInfo,
    summary="Retrieve Single Country",
    description="""
    Retrieve details for a specific country.
    
    Reference: https://docs.nexusglobalpayments.org/apis/countries#get-countries-countrycode
    """,
)
async def retrieve_single_country(
    country_code: str = Path(
        ...,
        description="ISO 3166-1 alpha-2 country code",
        alias="countryCode",
        min_length=2,
        max_length=2,
        pattern="^[A-Z]{2}$",
    ),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get details for a specific country."""
    
    query = text("""
        SELECT 
            c.country_id,
            c.country_code,
            c.name,
            COALESCE(
                json_agg(
                    DISTINCT jsonb_build_object(
                        'currencyCode', cc.currency_code,
                        'maxAmount', cc.max_amount::text
                    )
                ) FILTER (WHERE cc.currency_code IS NOT NULL),
                '[]'
            ) as currencies,
            COALESCE(
                jsonb_build_object(
                    'pacs008',
                    array_agg(DISTINCT cre.element_name) FILTER (WHERE cre.message_type = 'pacs008')
                ),
                '{}'::jsonb
            ) as required_message_elements
        FROM countries c
        LEFT JOIN country_currencies cc ON c.country_code = cc.country_code
        LEFT JOIN country_required_elements cre ON c.country_code = cre.country_code
        WHERE c.country_code = :country_code
        GROUP BY c.country_id, c.country_code, c.name
    """)
    
    result = await db.execute(query, {"country_code": country_code.upper()})
    row = result.fetchone()
    
    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Country {country_code} not found in Nexus",
        )
    
    return {
        "countryId": row.country_id,
        "countryCode": row.country_code,
        "name": row.name,
        "currencies": row.currencies,
        "requiredMessageElements": row.required_message_elements,
    }


@router.get(
    "/countries/{country_code}/psps",
    response_model=FinancialInstitutionsResponse,
    summary="Retrieve PSPs in Country",
    description="""
    Retrieve all Payment Service Providers (PSPs) in a country.
    
    Reference: https://docs.nexusglobalpayments.org/apis/financial-institutions
    
    PSPs are banks and payment apps that participate in Nexus
    as senders or receivers of payments.
    """,
)
async def retrieve_country_psps(
    country_code: str = Path(
        ...,
        description="ISO 3166-1 alpha-2 country code",
        alias="countryCode",
        min_length=2,
        max_length=2,
    ),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get PSPs for a specific country."""
    
    query = text("""
        SELECT 
            psp_id::text,
            bic,
            name,
            fee_percent
        FROM psps
        WHERE country_code = :country_code
        AND participant_status = 'ACTIVE'
        ORDER BY name
    """)
    
    result = await db.execute(query, {"country_code": country_code.upper()})
    rows = result.fetchall()
    
    psps = [
        {
            "pspId": row.psp_id,
            "bic": row.bic,
            "name": row.name,
            "feePercent": float(row.fee_percent),
        }
        for row in rows
    ]
    
    return {"psps": psps}


@router.get(
    "/countries/{country_code}/address-types",
    response_model=AddressTypesResponse,
    summary="Retrieve Address Types",
    description="""
    Retrieve available address types for a country.
    
    Reference: https://docs.nexusglobalpayments.org/addressing-and-proxy-resolution/address-types-and-inputs/address-types
    
    Address types define how recipients can be addressed:
    - MOBI: Mobile phone number (proxy)
    - ACCT: Bank account number
    - IBAN: International bank account
    - etc.
    """,
)
async def retrieve_address_types(
    country_code: str = Path(
        ...,
        description="ISO 3166-1 alpha-2 country code",
        alias="countryCode",
        min_length=2,
        max_length=2,
    ),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get address types for a country."""
    
    query = text("""
        SELECT 
            code,
            display_name,
            requires_proxy_resolution
        FROM address_types
        WHERE country_code = :country_code
        ORDER BY display_order, code
    """)
    
    result = await db.execute(query, {"country_code": country_code.upper()})
    rows = result.fetchall()
    
    address_types = [
        {
            "code": row.code,
            "displayName": row.display_name,
            "requiresProxyResolution": row.requires_proxy_resolution,
        }
        for row in rows
    ]
    
    return {"addressTypes": address_types}


@router.get(
    "/countries/{countryCode}/addressTypesAndInputs",
    response_model=AddressTypesResponse,
    include_in_schema=False,
)
async def retrieve_address_types_alias(
    country_code: str = Path(..., alias="countryCode", min_length=2, max_length=2),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Alias for /address-types to match official API documentation path:
    /countries/{countryCode}/addressTypesAndInputs/
    """
    return await retrieve_address_types(country_code, db)


@router.get(
    "/countries/{country_code}/currencies/{currency_code}/max-amounts",
    summary="Retrieve Currency Max Amounts",
    description="""
    Retrieve maximum transaction amounts for a currency in a country.
    
    Reference: https://docs.nexusglobalpayments.org/fx-provision/maximum-value-of-a-nexus-payment
    
    Max amounts are determined by IPS limits and are used during
    quote generation to cap interbank settlement amounts.
    """,
)
async def retrieve_max_amounts(
    country_code: str = Path(..., alias="countryCode", min_length=2, max_length=2),
    currency_code: str = Path(..., alias="currencyCode", min_length=3, max_length=3),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get max amount for a currency in a country."""
    
    query = text("""
        SELECT max_amount
        FROM country_currencies
        WHERE country_code = :country_code
        AND currency_code = :currency_code
    """)
    
    result = await db.execute(query, {
        "country_code": country_code.upper(),
        "currency_code": currency_code.upper(),
    })
    row = result.fetchone()
    
    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Currency {currency_code} not found for country {country_code}",
        )
    return {
        "countryCode": country_code.upper(),
        "currencyCode": currency_code.upper(),
        "maxAmount": str(row.max_amount),
    }


class UpdateCountryRequest(BaseModel):
    """Request to update country details (Admin only)."""
    max_amount: Optional[str] = Field(None, alias="maxAmount")
    # Add other updatable fields as needed (e.g. required elements)


@router.put(
    "/countries/{country_code}",
    summary="Update Country Details (Admin)",
    description="""
    Update configuration for a specific country.
    
    This is an administrative endpoint used to update limits or requirements.
    """,
    response_model=CountryInfo
)
async def update_country(
    body: UpdateCountryRequest,
    country_code: str = Path(..., alias="countryCode", min_length=2, max_length=2),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Update country configuration."""
    
    # Check if country exists
    check_query = text("SELECT country_id FROM countries WHERE country_code = :cc")
    result = await db.execute(check_query, {"cc": country_code.upper()})
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Country not found")

    # Update logic (Stub implementation for Sandbox)
    # In a real app, this would update DB columns
    if body.max_amount:
        # Mock update
        pass

    # Return updated info (re-using existing retrieval logic)
    return await retrieve_single_country(country_code, db)
