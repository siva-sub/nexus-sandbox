"""
acmt.024 - Identification Verification Report

This module handles the proxy resolution reports provided by a Destination PDO
responding to an acmt.023 request.

Reference: https://docs.nexusglobalpayments.org/messaging-and-translation/message-acmt.024-identification-verification-report
"""
from fastapi import APIRouter, Depends, Query, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from uuid import uuid4
import logging

from ...db import get_db
from .. import validation as xsd_validation
from ..schemas import Acmt024Response
from .utils import store_payment_event

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post(
    "/acmt024",
    response_model=Acmt024Response,
    summary="Submit acmt.024 resolution report",
    description="""
    Accepts an ISO 20022 acmt.024 (Identification Verification Report) message
    providing details of a resolved proxy or account.
    
    Used in Step 9 of the payment flow when the Destination PDO responds
    to an acmt.023 request.
    """
)
async def process_acmt024(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Acmt024Response:
    """Process acmt.024 proxy resolution report."""
    processed_at = datetime.now(timezone.utc)
    request_id = str(uuid4())
    
    try:
        body = await request.body()
        xml_content = body.decode('utf-8')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read XML: {str(e)}")
    
    # XSD Validation
    xsd_result = xsd_validation.validate_acmt024(xml_content)
    if not xsd_result.valid:
        # Forensic Logging
        failed_uetr = xsd_validation.safe_extract_uetr(xml_content) or f"UNKNOWN-{uuid4().hex[:8]}"
        await store_payment_event(
            db=db,
            uetr=failed_uetr,
            event_type="SCHEMA_VALIDATION_FAILED",
            actor="NEXUS",
            data={
                "messageType": "acmt.024",
                "errors": xsd_result.errors
            },
            acmt024_xml=xml_content
        )
        raise HTTPException(
            status_code=400,
            detail={"error": "XSD_VALIDATION_FAILED", "errors": xsd_result.errors}
        )
    
    return Acmt024Response(
        requestId=request_id,
        status="RECEIVED",
        debtorNameMasked="REDACTED",
        processedAt=processed_at.isoformat()
    )
