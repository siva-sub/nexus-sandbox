"""
ISO 20022 Message Processing Package

This package contains modular handlers for ISO 20022 payment messages.
ISO 20022 Package

This package contains modular ISO 20022 message handlers
extracted from the monolithic iso20022.py file.

Structure:
- constants.py: Status codes and configuration constants
- schemas.py: Pydantic response models
- utils.py: Shared database operations
- pacs008.py: pacs.008 payment instruction handler (EXTRACTED)
- (Other message handlers to be extracted in future phases)
"""

# Import constants
from .constants import (
    QUOTE_EXPIRY_SECONDS,
    NEXUS_ORIGINAL_UETR_PREFIX,
    NEXUS_ORIGINAL_UETR_PATTERN,
    STATUS_ACCEPTED,
    STATUS_QUOTE_EXPIRED,
    STATUS_RATE_MISMATCH,
    STATUS_TIMEOUT,
    STATUS_ACCOUNT_INCORRECT,
    STATUS_ACCOUNT_CLOSED,
    STATUS_PROXY_INVALID,
    STATUS_AGENT_INCORRECT,
    STATUS_INVALID_SAP,
    STATUS_AGENT_OFFLINE,
    STATUS_AMOUNT_LIMIT,
    STATUS_INSUFFICIENT_FUNDS,
    STATUS_REGULATORY_AML,
    VALID_STATUS_CODES,
)

# Import schemas from centralized module
from ..schemas import (
    PaymentValidationResult,
    Pacs008Response,
    Acmt023Response,
    Acmt024Response,
    Pacs028Response,
    Pain001Response,
    Camt103Response,
    Pacs004Response,
    Camt056Response,
    Camt029Response,
    ValidationResponse,
    Iso20022Template,
)

# Import routers for modular message handlers
from . import (
    pacs008, 
    acmt023, 
    acmt024, 
    pain001, 
    camt103, 
    pacs004, 
    pacs028, 
    recall_handlers, 
    validate
)

__all__ = [
    # Constants
    "QUOTE_EXPIRY_SECONDS",
    "NEXUS_ORIGINAL_UETR_PREFIX",
    "NEXUS_ORIGINAL_UETR_PATTERN",
    "STATUS_ACCEPTED",
    "STATUS_QUOTE_EXPIRED",
    "STATUS_RATE_MISMATCH",
    "STATUS_TIMEOUT",
    "STATUS_ACCOUNT_INCORRECT",
    "STATUS_ACCOUNT_CLOSED",
    "STATUS_PROXY_INVALID",
    "STATUS_AGENT_INCORRECT",
    "STATUS_INVALID_SAP",
    "STATUS_AGENT_OFFLINE",
    "STATUS_AMOUNT_LIMIT",
    "STATUS_INSUFFICIENT_FUNDS",
    "STATUS_REGULATORY_AML",
    "VALID_STATUS_CODES",
    # Schemas
    "PaymentValidationResult",
    "Pacs008Response",
    "Acmt023Response",
    "Acmt024Response",
    "Pacs028Response",
    "Pain001Response",
    "Camt103Response",
    "Pacs004Response",
    "Camt056Response",
    "Camt029Response",
    "ValidationResponse",
    "Iso20022Template",
    # Routers
    "pacs008",
    "acmt023",
    "acmt024",
    "pain001",
    "camt103",
    "pacs004",
    "pacs028",
    "recall_handlers",
    "validate",
    "router",  # Combined router
]

# Create combined router for all ISO 20022 message handlers
from fastapi import APIRouter

router = APIRouter(prefix="/v1/iso20022", tags=["ISO 20022 Messages"])

# Include all submodule routers
router.include_router(pacs008.router, tags=["pacs.008"])
router.include_router(acmt023.router, tags=["acmt.023"])
router.include_router(acmt024.router, tags=["acmt.024"])
router.include_router(pain001.router, tags=["pain.001"])
router.include_router(camt103.router, tags=["camt.103"])
router.include_router(pacs004.router, tags=["pacs.004"])
router.include_router(pacs028.router, tags=["pacs.028"])
router.include_router(recall_handlers.router, tags=["Recalls"])
router.include_router(validate.router, tags=["Validation"])
