"""
IPS (Instant Payment System) Operator API endpoints.

Reference: https://docs.nexusglobalpayments.org/payment-processing/role-and-responsibilities-of-the-instant-payment-system-operator-ipso

IPSO responsibilities:
- Operate the domestic instant payment system
- Clear and settle domestic payments
- Connect to Nexus for cross-border payments
- Enforce domestic payment limits and rules
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db

router = APIRouter(prefix="/v1/ips", tags=["Instant Payment Systems"])


from .schemas import (
    IPSOperatorResponse,
    IPSListResponse,
    IPSMemberResponse,
    IPSMembersResponse
)


@router.get("", response_model=IPSListResponse)
async def list_ips_operators(
    country_code: Optional[str] = Query(None, alias="countryCode", description="Filter by country"),
    db: AsyncSession = Depends(get_db)
):
    """
    List all Instant Payment System operators connected to Nexus.
    
    Each IPS operates in a specific country and handles domestic
    instant payments. They connect to Nexus for cross-border routing.
    
    Reference: https://docs.nexusglobalpayments.org/payment-processing/role-of-the-ipso
    """
    if country_code:
        query = text("""
            SELECT ips_id, name, country_code, clearing_system_id, max_amount, currency_code
            FROM ips_operators
            WHERE country_code = :country_code
            ORDER BY name
        """)
        result = await db.execute(query, {"country_code": country_code.upper()})
    else:
        query = text("""
            SELECT ips_id, name, country_code, clearing_system_id, max_amount, currency_code
            FROM ips_operators
            ORDER BY country_code, name
        """)
        result = await db.execute(query)
    
    rows = result.fetchall()
    operators = [
        IPSOperatorResponse(
            ips_id=row.ips_id,
            name=row.name,
            country_code=row.country_code,
            clearing_system_id=row.clearing_system_id,
            max_amount=float(row.max_amount),
            currency_code=row.currency_code
        )
        for row in rows
    ]
    
    return IPSListResponse(operators=operators, total=len(operators))


@router.get("/{clearing_system_id}", response_model=IPSOperatorResponse)
async def get_ips_operator(clearing_system_id: str, db: AsyncSession = Depends(get_db)):
    """
    Get details of a specific IPS operator by clearing system ID.
    
    The clearing system ID is used in ISO 20022 messages to identify
    the domestic payment system (e.g., SGFASG22 for FAST Singapore).
    """
    query = text("""
        SELECT ips_id, name, country_code, clearing_system_id, max_amount, currency_code
        FROM ips_operators
        WHERE clearing_system_id = :clearing_system_id
    """)
    result = await db.execute(query, {"clearing_system_id": clearing_system_id.upper()})
    row = result.fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail=f"IPS with clearing system ID {clearing_system_id} not found")
    
    return IPSOperatorResponse(
        ips_id=row.ips_id,
        name=row.name,
        country_code=row.country_code,
        clearing_system_id=row.clearing_system_id,
        max_amount=float(row.max_amount),
        currency_code=row.currency_code
    )


@router.get("/{clearing_system_id}/members", response_model=IPSMembersResponse)
async def get_ips_members(clearing_system_id: str, db: AsyncSession = Depends(get_db)):
    """
    Get PSPs connected to this IPS.
    
    Returns all Payment Service Providers that are members of this
    instant payment system and can send/receive domestic payments.
    """
    # First verify the IPS exists
    ips_query = text("""
        SELECT country_code FROM ips_operators WHERE clearing_system_id = :clearing_system_id
    """)
    ips_result = await db.execute(ips_query, {"clearing_system_id": clearing_system_id.upper()})
    ips_row = ips_result.fetchone()
    
    if not ips_row:
        raise HTTPException(status_code=404, detail=f"IPS with clearing system ID {clearing_system_id} not found")
    
    # Get PSPs in the same country as the IPS
    psps_query = text("""
        SELECT bic, name
        FROM psps
        WHERE country_code = :country_code
        ORDER BY name
    """)
    result = await db.execute(psps_query, {"country_code": ips_row.country_code})
    rows = result.fetchall()
    
    members = [
        IPSMemberResponse(bic=row.bic, name=row.name, is_active=True)
        for row in rows
    ]
    
    return IPSMembersResponse(
        clearing_system_id=clearing_system_id.upper(),
        members=members,
        total=len(members)
    )
