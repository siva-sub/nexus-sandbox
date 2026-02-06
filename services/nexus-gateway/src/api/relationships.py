"""
FXP Relationships and Tiers Management API

Reference: https://docs.nexusglobalpayments.org/fx-provision/rate-improvements

FX Providers can configure:
1. Tier-based improvements (better rates for larger volumes)
2. PSP-specific improvements (better rates for business partners)

Both improvements are added to the base rate in basis points.
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4
from ..db import get_db

router = APIRouter(prefix="/v1", tags=["FX Rate Improvements"])


from .schemas import (
    TierDefinition,
    RelationshipDefinition,
    TierListResponse,
    RelationshipListResponse
)


# =============================================================================
# Tier Management
# =============================================================================

@router.get(
    "/tiers",
    response_model=TierListResponse,
    summary="List tier-based rate improvements",
    description="""
    Returns tier definitions for an FX Provider.
    
    Tiers define volume-based rate improvements:
    - Transactions in higher tiers receive better rates
    - Improvements are specified in basis points
    - Applied automatically by Nexus during quote generation
    
    Reference: https://docs.nexusglobalpayments.org/fx-provision/rate-improvements
    """
)
async def list_tiers(
    fxp_id: str,
    source_currency: Optional[str] = None,
    destination_currency: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
) -> TierListResponse:
    """
    List all tiers for an FXP.
    """
    # For sandbox: return example tier structure
    # Production would query fx_tier_rates table
    
    example_tiers = [
        TierDefinition(
            tierId=f"tier-{fxp_id}-1",
            fxpId=fxp_id,
            sourceCurrency="SGD",
            destinationCurrency="THB",
            minAmount="0",
            maxAmount="1000",
            improvementBps=0,
            description="Base tier (no improvement)"
        ),
        TierDefinition(
            tierId=f"tier-{fxp_id}-2",
            fxpId=fxp_id,
            sourceCurrency="SGD",
            destinationCurrency="THB",
            minAmount="1000.01",
            maxAmount="5000",
            improvementBps=5,
            description="Tier 2: 5 bps improvement"
        ),
        TierDefinition(
            tierId=f"tier-{fxp_id}-3",
            fxpId=fxp_id,
            sourceCurrency="SGD",
            destinationCurrency="THB",
            minAmount="5000.01",
            maxAmount="50000",
            improvementBps=10,
            description="Tier 3: 10 bps improvement"
        ),
    ]
    
    # Filter by currencies if specified
    if source_currency:
        example_tiers = [t for t in example_tiers 
                        if t.sourceCurrency == source_currency.upper()]
    if destination_currency:
        example_tiers = [t for t in example_tiers 
                        if t.destinationCurrency == destination_currency.upper()]
    
    return TierListResponse(
        fxpId=fxp_id,
        tiers=example_tiers,
        count=len(example_tiers)
    )


@router.post(
    "/tiers",
    response_model=TierDefinition,
    summary="Create tier-based rate improvement",
    description="""
    Create a new tier for volume-based rate improvements.
    
    FXPs can incentivize larger transactions by offering
    better rates at higher volume tiers.
    
    Reference: https://docs.nexusglobalpayments.org/fx-provision/rate-improvements
    """
)
async def create_tier(
    tier: TierDefinition,
    db: AsyncSession = Depends(get_db)
) -> TierDefinition:
    """
    Create a new tier definition.
    """
    # For sandbox: just return with generated ID
    new_tier = tier.model_copy()
    new_tier.tierId = str(uuid4())
    
    return new_tier


@router.delete(
    "/tiers/{tier_id}",
    summary="Delete tier-based rate improvement",
    description="""
    Remove a tier definition.
    
    Note: Active quotes using this tier will continue to
    honour the improvement until they expire (600 seconds).
    """
)
async def delete_tier(
    tier_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Delete a tier.
    """
    return {
        "tierId": tier_id,
        "status": "DELETED",
        "deletedAt": datetime.now(timezone.utc).isoformat()
    }


# =============================================================================
# PSP Relationship Management
# =============================================================================

@router.get(
    "/relationships",
    response_model=RelationshipListResponse,
    summary="List PSP-specific rate improvements",
    description="""
    Returns PSP relationship definitions for an FX Provider.
    
    Relationships define partner-specific rate improvements:
    - Business partners receive better rates
    - Improvement applies to ALL currencies (not currency-specific)
    - Can be time-bound with effectiveFrom/Until
    
    Reference: https://docs.nexusglobalpayments.org/fx-provision/rate-improvements
    """
)
async def list_relationships(
    fxp_id: str,
    db: AsyncSession = Depends(get_db)
) -> RelationshipListResponse:
    """
    List all PSP relationships for an FXP.
    """
    # For sandbox: return example relationships
    now = datetime.now(timezone.utc)
    
    example_relationships = [
        RelationshipDefinition(
            relationshipId=f"rel-{fxp_id}-dbs",
            fxpId=fxp_id,
            pspId="PSP_SG_DBS",
            improvementBps=3,
            effectiveFrom=(now.replace(month=1, day=1)).isoformat(),
            effectiveUntil=None,
            description="DBS Bank strategic partnership"
        ),
        RelationshipDefinition(
            relationshipId=f"rel-{fxp_id}-grab",
            fxpId=fxp_id,
            pspId="PSP_SG_GRAB",
            improvementBps=5,
            effectiveFrom=(now.replace(month=1, day=1)).isoformat(),
            effectiveUntil=None,
            description="GrabPay volume partnership"
        ),
    ]
    
    return RelationshipListResponse(
        fxpId=fxp_id,
        relationships=example_relationships,
        count=len(example_relationships)
    )


@router.post(
    "/relationships",
    response_model=RelationshipDefinition,
    summary="Create PSP-specific rate improvement",
    description="""
    Create a new PSP relationship for partner-specific rates.
    
    The improvement (in basis points) will be applied to
    ALL quotes for this PSP, across all currencies.
    
    FXP must complete KYB on the PSP before creating this.
    
    Reference: https://docs.nexusglobalpayments.org/fx-provision/psp-improvements
    """
)
async def create_relationship(
    relationship: RelationshipDefinition,
    db: AsyncSession = Depends(get_db)
) -> RelationshipDefinition:
    """
    Create a new PSP relationship.
    """
    new_rel = relationship.model_copy()
    new_rel.relationshipId = str(uuid4())
    
    return new_rel


@router.put(
    "/relationships/{relationship_id}",
    response_model=RelationshipDefinition,
    summary="Update PSP-specific rate improvement",
    description="""
    Update an existing PSP relationship.
    
    Typically used to:
    - Adjust improvement basis points
    - Set an end date (effectiveUntil)
    """
)
async def update_relationship(
    relationship_id: str,
    relationship: RelationshipDefinition,
    db: AsyncSession = Depends(get_db)
) -> RelationshipDefinition:
    """
    Update a PSP relationship.
    """
    updated = relationship.model_copy()
    updated.relationshipId = relationship_id
    
    return updated


@router.delete(
    "/relationships/{relationship_id}",
    summary="Delete PSP-specific rate improvement",
    description="""
    Remove a PSP relationship.
    
    Note: Active quotes for this PSP will continue to
    honour the improvement until they expire (600 seconds).
    """
)
async def delete_relationship(
    relationship_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Delete a PSP relationship.
    """
    return {
        "relationshipId": relationship_id,
        "status": "DELETED",
        "deletedAt": datetime.now(timezone.utc).isoformat()
    }
