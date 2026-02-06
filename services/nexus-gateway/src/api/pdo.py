"""
PDO (Proxy Directory Operator) API endpoints.

Reference: https://docs.nexusglobalpayments.org/addressing-and-proxy-resolution/role-of-the-proxy-directory-operator-pdo

PDO responsibilities:
- Maintain proxy-to-account mappings (mobile → bank account)
- Respond to proxy resolution requests
- Enforce data protection (name masking)
- Support multiple proxy types (MOBI, NRIC, UEN, etc.)
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db

router = APIRouter(prefix="/v1/pdos", tags=["Proxy Directory Operators"])


from .schemas import (
    PDOResponse,
    PDOListResponse,
    ProxyRegistrationResponse,
    PDORegistrationsResponse,
    PDOStatsResponse
)


@router.get("", response_model=PDOListResponse)
async def list_pdos(
    country_code: Optional[str] = Query(None, alias="countryCode", description="Filter by country"),
    db: AsyncSession = Depends(get_db)
):
    """
    List all Proxy Directory Operators connected to Nexus.
    
    Each PDO manages proxy registrations for their country, enabling
    payments to be addressed using mobile numbers or other aliases
    instead of full bank account details.
    
    Reference: https://docs.nexusglobalpayments.org/addressing/role-of-the-pdo
    """
    if country_code:
        query = text("""
            SELECT pdo_id, name, country_code, supported_proxy_types
            FROM pdos
            WHERE country_code = :country_code
            ORDER BY name
        """)
        result = await db.execute(query, {"country_code": country_code.upper()})
    else:
        query = text("""
            SELECT pdo_id, name, country_code, supported_proxy_types
            FROM pdos
            ORDER BY country_code, name
        """)
        result = await db.execute(query)
    
    rows = result.fetchall()
    pdos = [
        PDOResponse(
            pdo_id=row.pdo_id,
            name=row.name,
            country_code=row.country_code,
            supported_proxy_types=row.supported_proxy_types if row.supported_proxy_types else []
        )
        for row in rows
    ]
    
    return PDOListResponse(pdos=pdos, total=len(pdos))


@router.get("/{pdo_id}", response_model=PDOResponse)
async def get_pdo(pdo_id: str, db: AsyncSession = Depends(get_db)):
    """Get details of a specific PDO."""
    query = text("""
        SELECT pdo_id, name, country_code, supported_proxy_types
        FROM pdos
        WHERE pdo_id = CAST(:pdo_id AS uuid)
    """)
    try:
        result = await db.execute(query, {"pdo_id": pdo_id})
        row = result.fetchone()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid PDO ID format")
    
    if not row:
        raise HTTPException(status_code=404, detail=f"PDO with ID {pdo_id} not found")
    
    return PDOResponse(
        pdo_id=row.pdo_id,
        name=row.name,
        country_code=row.country_code,
        supported_proxy_types=row.supported_proxy_types if row.supported_proxy_types else []
    )


@router.get("/country/{country_code}/registrations", response_model=PDORegistrationsResponse)
async def get_pdo_registrations(
    country_code: str,
    proxy_type: Optional[str] = Query(None, description="Filter by proxy type"),
    limit: int = Query(50, le=100),
    db: AsyncSession = Depends(get_db)
):
    """
    Get proxy registrations for a country's PDO.
    
    Returns masked proxy registrations (names are masked for privacy).
    This endpoint is for sandbox exploration only.
    
    Reference: https://docs.nexusglobalpayments.org/addressing/masking-of-display-names
    """
    # Get PDO info
    pdo_query = text("""
        SELECT name FROM pdos WHERE country_code = :country_code
    """)
    pdo_result = await db.execute(pdo_query, {"country_code": country_code.upper()})
    pdo_row = pdo_result.fetchone()
    
    if not pdo_row:
        raise HTTPException(status_code=404, detail=f"No PDO found for country {country_code}")
    
    # Get registrations
    if proxy_type:
        reg_query = text("""
            SELECT proxy_type, proxy_value, creditor_name_masked, bank_bic, bank_name
            FROM proxy_registrations
            WHERE country_code = :country_code AND proxy_type = :proxy_type
            ORDER BY proxy_type, proxy_value
            LIMIT :limit
        """)
        result = await db.execute(reg_query, {
            "country_code": country_code.upper(),
            "proxy_type": proxy_type.upper(),
            "limit": limit
        })
    else:
        reg_query = text("""
            SELECT proxy_type, proxy_value, creditor_name_masked, bank_bic, bank_name
            FROM proxy_registrations
            WHERE country_code = :country_code
            ORDER BY proxy_type, proxy_value
            LIMIT :limit
        """)
        result = await db.execute(reg_query, {"country_code": country_code.upper(), "limit": limit})
    
    rows = result.fetchall()
    registrations = [
        ProxyRegistrationResponse(
            proxy_type=row.proxy_type,
            proxy_value=row.proxy_value,
            creditor_name_masked=row.creditor_name_masked,
            bank_bic=row.bank_bic,
            bank_name=row.bank_name
        )
        for row in rows
    ]
    
    return PDORegistrationsResponse(
        pdo_name=pdo_row.name,
        country_code=country_code.upper(),
        registrations=registrations,
        total=len(registrations)
    )


@router.get("/country/{country_code}/stats", response_model=PDOStatsResponse)
async def get_pdo_stats(country_code: str, db: AsyncSession = Depends(get_db)):
    """
    Get statistics for a country's PDO.
    
    Returns counts of registrations by proxy type and resolution metrics.
    """
    # Get PDO info
    pdo_query = text("""
        SELECT name FROM pdos WHERE country_code = :country_code
    """)
    pdo_result = await db.execute(pdo_query, {"country_code": country_code.upper()})
    pdo_row = pdo_result.fetchone()
    
    if not pdo_row:
        raise HTTPException(status_code=404, detail=f"No PDO found for country {country_code}")
    
    # Count registrations by type
    count_query = text("""
        SELECT proxy_type, COUNT(*) as count
        FROM proxy_registrations
        WHERE country_code = :country_code
        GROUP BY proxy_type
    """)
    result = await db.execute(count_query, {"country_code": country_code.upper()})
    rows = result.fetchall()
    
    registrations_by_type = {row.proxy_type: row.count for row in rows}
    total = sum(registrations_by_type.values())
    
    return PDOStatsResponse(
        pdo_name=pdo_row.name,
        total_registrations=total,
        registrations_by_type=registrations_by_type,
        resolution_success_rate=0.95  # Demo value
    )
