"""
Actors API - Plug-and-Play Participant Registry

Reference: Nexus Global Payments Sandbox - Actor Integration
Reference: https://docs.nexusglobalpayments.org/apis/actors

This module provides a registry for sandbox participants to register their
callback URLs for real-time ISO 20022 message routing.

Actors:
- FXP: Foreign Exchange Provider (Direct to Nexus)
- IPSO: Instant Payment System Operator (Direct to Nexus)
- PSP: Payment Service Provider (Indirect via IPS)
- SAP: Settlement Access Provider (Indirect via IPS)
- PDO: Proxy Directory Operator (Indirect via IPS)

Changes:
- Migrated from in-memory registry to PostgreSQL (2026-02-07)
- Added per-actor callback secrets
- Changed IPS to IPSO per Nexus specification
"""

import os
import secrets
import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, HttpUrl
from typing import Optional, Literal
from datetime import datetime, timezone
import uuid
import re
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from .callbacks import test_callback_endpoint

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/actors", tags=["Actor Registry"])

from .schemas import ActorRegistration, Actor, ActorsListResponse

# =============================================================================
# Models
# =============================================================================

ActorType = Literal["FXP", "IPSO", "PSP", "SAP", "PDO"]

# =============================================================================
# Helper Functions
# =============================================================================

def generate_callback_secret() -> str:
    """Generate a secure random callback secret for HMAC signing."""
    return secrets.token_hex(32)


def validate_bic(bic: str) -> bool:
    """
    Validate BIC (SWIFT code) format per ISO 9362.
    
    Format: 4 letters (institution) + 2 letters (country) + 2 letters/digits (location) 
            + optional 3 letters/digits (branch, default 'XXX')
    
    Args:
        bic: BIC code to validate
        
    Returns:
        True if valid, False otherwise
    """
    if not bic:
        return False
    
    bic = bic.upper().strip()
    
    # Must be 8 or 11 characters
    if len(bic) not in (8, 11):
        return False
    
    # First 4 characters: institution code (letters only)
    if not re.match(r'^[A-Z]{4}', bic):
        return False
    
    # Next 2 characters: country code (letters only)
    if not re.match(r'^[A-Z]{4}[A-Z]{2}', bic):
        return False
    
    # Next 2 characters: location code (letters or digits)
    if not re.match(r'^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}', bic):
        return False
    
    # If 11 characters, last 3 must be letters or digits
    if len(bic) == 11:
        if not re.match(r'^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}[A-Z0-9]{3}$', bic):
            return False
    
    return True


# =============================================================================
# Callback Test Response Model
# =============================================================================

class CallbackTestResponse(BaseModel):
    """Response from callback endpoint test."""
    success: bool
    bic: str
    callback_url: Optional[str] = Field(None, alias="callbackUrl")
    status_code: Optional[int] = Field(None, alias="statusCode")
    latency_ms: Optional[float] = Field(None, alias="latencyMs")
    error: Optional[str] = None
    error_type: Optional[str] = Field(None, alias="errorType")
    message: str
    
    class Config:
        populate_by_name = True


# =============================================================================
# Database Operations
# =============================================================================

async def _get_actor_by_bic(db: AsyncSession, bic: str) -> Optional[dict]:
    """Get actor from database by BIC."""
    query = text("""
        SELECT actor_id, bic, actor_type, name, country_code, 
               callback_url, callback_secret, supported_currencies, status, registered_at
        FROM actors
        WHERE bic = :bic
    """)
    result = await db.execute(query, {"bic": bic.upper()})
    row = result.fetchone()
    if row:
        return {
            "actorId": row.actor_id,
            "bic": row.bic,
            "actorType": row.actor_type,
            "name": row.name,
            "countryCode": row.country_code,
            "callbackUrl": row.callback_url,
            "callbackSecret": row.callback_secret,
            "supportedCurrencies": row.supported_currencies or [],
            "status": row.status,
            "registeredAt": row.registered_at.isoformat() if row.registered_at else None
        }
    return None


async def _actor_exists(db: AsyncSession, bic: str) -> bool:
    """Check if an actor with the given BIC exists."""
    query = text("SELECT 1 FROM actors WHERE bic = :bic")
    result = await db.execute(query, {"bic": bic.upper()})
    return result.fetchone() is not None


# =============================================================================
# Endpoints
# =============================================================================

@router.post(
    "/register",
    response_model=Actor,
    summary="Register a new actor for sandbox testing",
    description="""
    Register a sandbox participant (FXP, IPSO, PSP, SAP, or PDO) with an optional
    callback URL for receiving ISO 20022 messages.
    
    **Direct Participants (FXP, IPSO):** Will receive messages directly from Nexus.
    **Indirect Participants (PSP, SAP, PDO):** Should configure their domestic IPS
    callback for realistic testing.
    
    **BIC Validation:** BIC must be 8 or 11 characters in ISO 9362 format.
    
    **Callback Secret:** If not provided, a secure random secret will be generated
    automatically for HMAC signature verification.
    """,
)
async def register_actor(
    request: ActorRegistration,
    db: AsyncSession = Depends(get_db)
):
    """Register a new actor in the sandbox."""
    # Validate BIC format
    if not validate_bic(request.bic):
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid BIC format: {request.bic}. Must be 8 or 11 characters (AAAA BB CC [DDD])"
        )
    
    bic_upper = request.bic.upper().strip()
    
    # Check if actor already exists
    if await _actor_exists(db, bic_upper):
        raise HTTPException(status_code=409, detail=f"Actor with BIC {request.bic} already exists")
    
    # Validate actor type (now includes IPSO instead of IPS)
    valid_types = ["FXP", "IPSO", "PSP", "SAP", "PDO"]
    if request.actor_type.upper() not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid actor_type: {request.actor_type}. Must be one of: {', '.join(valid_types)}"
        )
    
    actor_id = f"actor-{uuid.uuid4().hex[:8]}"
    registered_at = datetime.now(timezone.utc)
    
    # Generate or use provided callback secret
    callback_secret = None
    if hasattr(request, 'callback_secret') and request.callback_secret:
        callback_secret = request.callback_secret
    else:
        callback_secret = generate_callback_secret()
    
    # Insert into database
    insert_query = text("""
        INSERT INTO actors (
            actor_id, bic, actor_type, name, country_code, 
            callback_url, callback_secret, supported_currencies, status, registered_at
        ) VALUES (
            :actor_id, :bic, :actor_type, :name, :country_code,
            :callback_url, :callback_secret, :supported_currencies, 'ACTIVE', :registered_at
        )
    """)
    
    await db.execute(insert_query, {
        "actor_id": actor_id,
        "bic": bic_upper,
        "actor_type": request.actor_type.upper(),
        "name": request.name,
        "country_code": request.country_code.upper(),
        "callback_url": str(request.callback_url) if request.callback_url else None,
        "callback_secret": callback_secret,
        "supported_currencies": request.supported_currencies if request.supported_currencies else [],
        "registered_at": registered_at
    })
    await db.commit()
    
    logger.info(f"Actor registered: {bic_upper} ({request.actor_type.upper()})")
    
    return Actor(
        actorId=actor_id,
        bic=bic_upper,
        actorType=request.actor_type.upper(),
        name=request.name,
        countryCode=request.country_code.upper(),
        callbackUrl=str(request.callback_url) if request.callback_url else None,
        supportedCurrencies=request.supported_currencies if request.supported_currencies else [],
        status="ACTIVE",
        registeredAt=registered_at.isoformat().replace("+00:00", "Z")
    )


@router.get(
    "",
    response_model=ActorsListResponse,
    summary="List all registered actors",
    description="Retrieve a list of all sandbox participants.",
)
async def list_actors(
    actor_type: Optional[ActorType] = None, 
    country_code: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """List registered actors with optional filtering."""
    
    query = text("""
        SELECT actor_id, bic, actor_type, name, country_code, 
               callback_url, supported_currencies, status, registered_at
        FROM actors
        WHERE (:actor_type IS NULL OR actor_type = :actor_type)
        AND (:country_code IS NULL OR country_code = :country_code)
        ORDER BY registered_at DESC
    """)
    
    result = await db.execute(query, {
        "actor_type": actor_type.upper() if actor_type else None,
        "country_code": country_code.upper() if country_code else None
    })
    
    actors = []
    for row in result.fetchall():
        actors.append(Actor(
            actorId=row.actor_id,
            bic=row.bic,
            actorType=row.actor_type,
            name=row.name,
            countryCode=row.country_code,
            callbackUrl=row.callback_url,
            supportedCurrencies=row.supported_currencies or [],
            status=row.status,
            registeredAt=row.registered_at.isoformat().replace("+00:00", "Z") if row.registered_at else None
        ))
    
    return {"actors": actors, "total": len(actors)}


@router.get(
    "/{bic}",
    response_model=Actor,
    summary="Get actor by BIC",
    description="Retrieve details of a specific actor by their BIC code.",
)
async def get_actor(bic: str, db: AsyncSession = Depends(get_db)):
    """Get a specific actor by BIC."""
    actor = await _get_actor_by_bic(db, bic)
    if not actor:
        raise HTTPException(status_code=404, detail=f"Actor with BIC {bic} not found")
    return Actor(**actor)


@router.patch(
    "/{bic}/callback",
    response_model=Actor,
    summary="Update actor callback URL",
    description="Update the callback URL for an existing actor.",
)
async def update_callback(
    bic: str, 
    callback_url: Optional[HttpUrl] = None,
    db: AsyncSession = Depends(get_db)
):
    """Update the callback URL for an actor."""
    # Check if actor exists
    if not await _actor_exists(db, bic):
        raise HTTPException(status_code=404, detail=f"Actor with BIC {bic} not found")
    
    # Update callback URL
    update_query = text("""
        UPDATE actors 
        SET callback_url = :callback_url, updated_at = CURRENT_TIMESTAMP
        WHERE bic = :bic
    """)
    
    await db.execute(update_query, {
        "bic": bic.upper(),
        "callback_url": str(callback_url) if callback_url else None
    })
    await db.commit()
    
    # Return updated actor
    actor = await _get_actor_by_bic(db, bic)
    return Actor(**actor)


@router.delete(
    "/{bic}",
    summary="Deregister an actor",
    description="Remove an actor from the sandbox registry.",
)
async def deregister_actor(bic: str, db: AsyncSession = Depends(get_db)):
    """Remove an actor from the registry."""
    # Check if actor exists
    if not await _actor_exists(db, bic):
        raise HTTPException(status_code=404, detail=f"Actor with BIC {bic} not found")
    
    # Delete actor
    delete_query = text("DELETE FROM actors WHERE bic = :bic")
    await db.execute(delete_query, {"bic": bic.upper()})
    await db.commit()
    
    logger.info(f"Actor deregistered: {bic.upper()}")
    
    return {"message": f"Actor {bic} deregistered successfully"}


@router.post(
    "/{bic}/callback-test",
    response_model=CallbackTestResponse,
    summary="Test actor callback endpoint",
    description="""
    Send a test ping to the actor's registered callback URL.
    
    This verifies that:
    - The callback URL is reachable
    - The endpoint responds within timeout
    - HMAC signature verification works (if implemented by actor)
    
    Returns detailed diagnostic information about the test result.
    """,
)
async def test_actor_callback(bic: str, db: AsyncSession = Depends(get_db)):
    """Test the callback endpoint for a registered actor."""
    actor = await _get_actor_by_bic(db, bic)
    if not actor:
        raise HTTPException(status_code=404, detail=f"Actor with BIC {bic} not found")
    
    callback_url = actor.get("callbackUrl")
    if not callback_url:
        raise HTTPException(
            status_code=422, 
            detail=f"Actor {bic} has no callback URL configured"
        )
    
    # Get actor's callback secret for HMAC
    callback_secret = actor.get("callbackSecret")
    
    # Run the test with actor's secret
    result = await test_callback_endpoint(callback_url, callback_secret)
    
    return CallbackTestResponse(
        success=result["success"],
        bic=bic.upper(),
        callback_url=callback_url,
        status_code=result.get("statusCode"),
        latency_ms=result.get("latencyMs"),
        error=result.get("error"),
        error_type=result.get("errorType"),
        message="Callback test successful" if result["success"] else "Callback test failed"
    )


@router.get(
    "/{bic}/callback-secret",
    summary="Get callback secret",
    description="""
    Retrieve the callback secret for an actor.
    
    **Security Note:** This endpoint should be protected in production.
    The callback secret is used for HMAC signature verification on callbacks.
    """,
)
async def get_callback_secret(bic: str, db: AsyncSession = Depends(get_db)):
    """Get the callback secret for an actor (for HMAC verification)."""
    query = text("SELECT callback_secret FROM actors WHERE bic = :bic")
    result = await db.execute(query, {"bic": bic.upper()})
    row = result.fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail=f"Actor with BIC {bic} not found")
    
    return {
        "bic": bic.upper(),
        "callbackSecret": row.callback_secret,
        "note": "Use this secret to verify HMAC signatures on incoming callbacks"
    }


@router.post(
    "/{bic}/rotate-callback-secret",
    summary="Rotate callback secret",
    description="Generate a new callback secret for the actor.",
)
async def rotate_callback_secret(bic: str, db: AsyncSession = Depends(get_db)):
    """Rotate the callback secret for an actor."""
    # Check if actor exists
    if not await _actor_exists(db, bic):
        raise HTTPException(status_code=404, detail=f"Actor with BIC {bic} not found")
    
    # Generate new secret
    new_secret = generate_callback_secret()
    
    # Update in database
    update_query = text("""
        UPDATE actors 
        SET callback_secret = :new_secret, updated_at = CURRENT_TIMESTAMP
        WHERE bic = :bic
    """)
    
    await db.execute(update_query, {
        "bic": bic.upper(),
        "new_secret": new_secret
    })
    await db.commit()
    
    logger.info(f"Callback secret rotated for actor: {bic.upper()}")
    
    return {
        "bic": bic.upper(),
        "callbackSecret": new_secret,
        "message": "Callback secret rotated successfully. Update your callback endpoint to use the new secret."
    }
