from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from uuid import uuid4

from ...db import get_db
from .. import validation as xsd_validation
from ..schemas import Pacs028Response
from .utils import store_payment_event

router = APIRouter()

@router.post(
    "/pacs028",
    response_model=Pacs028Response,
    summary="Submit pacs.028 Payment Status Request",
    description="""
    **Future/Roadmap - Not in Release 1**
    
    Accepts a pacs.028 (FI to FI Payment Status Request) message to query
    the current status of a payment that has not yet reached a final state.
    
    Reference: https://docs.nexusglobalpayments.org/messaging-and-translation/message-pacs.028-fi-to-fi-payment-status-request
    """
)
async def process_pacs028(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Pacs028Response:
    """Process pacs.028 Payment Status Request."""
    processed_at = datetime.now(timezone.utc)
    request_id = str(uuid4())
    
    try:
        body = await request.body()
        xml_content = body.decode('utf-8')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read XML: {str(e)}")
    
    # XSD Validation
    xsd_result = xsd_validation.validate_pacs028(xml_content)
    if not xsd_result.valid:
        # Forensic Logging
        failed_uetr = xsd_validation.safe_extract_uetr(xml_content) or f"UNKNOWN-{uuid4().hex[:8]}"
        await store_payment_event(
            db=db,
            uetr=failed_uetr,
            event_type="SCHEMA_VALIDATION_FAILED",
            actor="NEXUS",
            data={
                "messageType": "pacs.028",
                "errors": xsd_result.errors
            },
            pacs028_xml=xml_content
        )
        raise HTTPException(
            status_code=400,
            detail={"error": "XSD_VALIDATION_FAILED", "errors": xsd_result.errors}
        )
    
    original_uetr = xsd_validation.safe_extract_uetr(xml_content) or "UNKNOWN"
    
    return Pacs028Response(
        requestId=request_id,
        originalUetr=original_uetr,
        currentStatus="PENDING",
        processedAt=processed_at.isoformat()
    )
