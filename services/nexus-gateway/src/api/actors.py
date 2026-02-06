"""
Actors API - Plug-and-Play Participant Registry

Reference: Nexus Global Payments Sandbox - Actor Integration
Reference: NotebookLM 2026-02-03 - Actor Connectivity Models

This module provides a registry for sandbox participants to register their
callback URLs for real-time ISO 20022 message routing.

Actors:
- FXP: Foreign Exchange Provider (Direct to Nexus)
- IPS: Instant Payment System Operator (Direct to Nexus)
- PSP: Payment Service Provider (Indirect via IPS)
- SAP: Settlement Access Provider (Indirect via IPS)
- PDO: Proxy Directory Operator (Indirect via IPS)

Assumption A25: Actors can self-register their callback_url for sandbox testing.
Assumption A26: BIC is used as the unique identifier for actors.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, HttpUrl
from typing import Optional, Literal
from datetime import datetime, timezone
import uuid
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db

router = APIRouter(prefix="/v1/actors", tags=["Actor Registry"])

from .schemas import ActorRegistration, Actor, ActorsListResponse

# =============================================================================
# Models
# =============================================================================

ActorType = Literal["FXP", "IPS", "PSP", "SAP", "PDO"]

# =============================================================================
# In-Memory Registry (Sandbox Simplification)
# =============================================================================
# Assumption A27: Sandbox uses in-memory registry for actor data.
# Production would use a persistent database table.

_actor_registry: dict[str, dict] = {
    # Pre-seeded actors for sandbox
    "DBSGSGSG": {
        "actorId": "actor-dbs-sg",
        "bic": "DBSGSGSG",
        "actorType": "PSP",
        "name": "DBS Bank Singapore",
        "countryCode": "SG",
        "callbackUrl": None,
        "registeredAt": "2026-01-01T00:00:00.000Z",
        "status": "ACTIVE"
    },
    "BKKBTHBK": {
        "actorId": "actor-bangkok-bank",
        "bic": "BKKBTHBK",
        "actorType": "PSP",
        "name": "Bangkok Bank",
        "countryCode": "TH",
        "callbackUrl": None,
        "registeredAt": "2026-01-01T00:00:00.000Z",
        "status": "ACTIVE"
    },
    "MAYBMYKL": {
        "actorId": "actor-maybank-my",
        "bic": "MAYBMYKL",
        "actorType": "PSP",
        "name": "Maybank Malaysia",
        "countryCode": "MY",
        "callbackUrl": None,
        "registeredAt": "2026-01-01T00:00:00.000Z",
        "status": "ACTIVE"
    },
    "NEXUSFXP1": {
        "actorId": "actor-fxp-alpha",
        "bic": "NEXUSFXP1",
        "actorType": "FXP",
        "name": "Nexus FXP Alpha",
        "countryCode": "SG",
        "callbackUrl": None,
        "registeredAt": "2026-01-01T00:00:00.000Z",
        "status": "ACTIVE"
    },
    "SGIPSOPS": {
        "actorId": "actor-sg-ips",
        "bic": "SGIPSOPS",
        "actorType": "IPS",
        "name": "Singapore FAST IPS",
        "countryCode": "SG",
        "callbackUrl": None,
        "registeredAt": "2026-01-01T00:00:00.000Z",
        "status": "ACTIVE"
    },
    "THIPSOPS": {
        "actorId": "actor-th-ips",
        "bic": "THIPSOPS",
        "actorType": "IPS",
        "name": "Thailand PromptPay IPS",
        "countryCode": "TH",
        "callbackUrl": None,
        "registeredAt": "2026-01-01T00:00:00.000Z",
        "status": "ACTIVE"
    },
}

# =============================================================================
# Endpoints
# =============================================================================

@router.post(
    "/register",
    response_model=Actor,
    summary="Register a new actor for sandbox testing",
    description="""
    Register a sandbox participant (FXP, IPS, PSP, SAP, or PDO) with an optional
    callback URL for receiving ISO 20022 messages.
    
    **Direct Participants (FXP, IPS):** Will receive messages directly from Nexus.
    **Indirect Participants (PSP, SAP, PDO):** Should configure their domestic IPS
    callback for realistic testing.
    """,
)
async def register_actor(request: ActorRegistration):
    """Register a new actor in the sandbox."""
    if request.bic.upper() in _actor_registry:
        raise HTTPException(status_code=409, detail=f"Actor with BIC {request.bic} already exists")
    
    actor_id = f"actor-{uuid.uuid4().hex[:8]}"
    registered_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    
    actor_data = {
        "actorId": actor_id,
        "bic": request.bic.upper(),
        "actorType": request.actor_type,
        "name": request.name,
        "countryCode": request.country_code.upper(),
        "callbackUrl": str(request.callback_url) if request.callback_url else None,
        "registeredAt": registered_at,
        "status": "ACTIVE"
    }
    
    _actor_registry[request.bic.upper()] = actor_data
    
    return Actor(**actor_data)


@router.get(
    "",
    response_model=ActorsListResponse,
    summary="List all registered actors",
    description="Retrieve a list of all sandbox participants.",
)
async def list_actors(actor_type: Optional[ActorType] = None, country_code: Optional[str] = None):
    """List registered actors with optional filtering."""
    actors = list(_actor_registry.values())
    
    if actor_type:
        actors = [a for a in actors if a["actorType"] == actor_type]
    if country_code:
        actors = [a for a in actors if a["countryCode"] == country_code.upper()]
    
    return {"actors": [Actor(**a) for a in actors]}


@router.get(
    "/{bic}",
    response_model=Actor,
    summary="Get actor by BIC",
    description="Retrieve details of a specific actor by their BIC code.",
)
async def get_actor(bic: str):
    """Get a specific actor by BIC."""
    actor = _actor_registry.get(bic.upper())
    if not actor:
        raise HTTPException(status_code=404, detail=f"Actor with BIC {bic} not found")
    return Actor(**actor)


@router.patch(
    "/{bic}/callback",
    response_model=Actor,
    summary="Update actor callback URL",
    description="Update the callback URL for an existing actor.",
)
async def update_callback(bic: str, callback_url: Optional[HttpUrl] = None):
    """Update the callback URL for an actor."""
    actor = _actor_registry.get(bic.upper())
    if not actor:
        raise HTTPException(status_code=404, detail=f"Actor with BIC {bic} not found")
    
    actor["callbackUrl"] = str(callback_url) if callback_url else None
    return Actor(**actor)


@router.delete(
    "/{bic}",
    summary="Deregister an actor",
    description="Remove an actor from the sandbox registry.",
)
async def deregister_actor(bic: str):
    """Remove an actor from the registry."""
    if bic.upper() not in _actor_registry:
        raise HTTPException(status_code=404, detail=f"Actor with BIC {bic} not found")
    
    del _actor_registry[bic.upper()]
    return {"message": f"Actor {bic} deregistered successfully"}
