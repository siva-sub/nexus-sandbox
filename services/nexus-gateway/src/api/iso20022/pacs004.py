from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from uuid import uuid4

from ...db import get_db
from .. import validation as xsd_validation
from ..schemas import Pacs004Response
from .utils import store_payment_event

router = APIRouter()

@router.post(
    "/pacs004",
    response_model=Pacs004Response,
    summary="Submit pacs.004 Payment Return",
    description="""
    **Future/Roadmap - Not in Release 1**
    
    Accepts a pacs.004 (Payment Return) message for returning funds
    after settlement. Currently, Nexus Release 1 uses pacs.008 with
    NexusOrgnlUETR in remittance info for returns.
    
    This endpoint is provided for future compatibility.
    
    Reference: https://docs.nexusglobalpayments.org/payment-processing/returns
    """
)
async def process_pacs004(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Pacs004Response:
    """Process pacs.004 Payment Return."""
    processed_at = datetime.now(timezone.utc)
    return_id = str(uuid4())
    
    try:
        body = await request.body()
        xml_content = body.decode('utf-8')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read XML: {str(e)}")
    
    # XSD Validation
    xsd_result = xsd_validation.validate_pacs004(xml_content)
    if not xsd_result.valid:
        # Forensic Logging
        failed_uetr = xsd_validation.safe_extract_uetr(xml_content) or f"UNKNOWN-{uuid4().hex[:8]}"
        await store_payment_event(
            db=db,
            uetr=failed_uetr,
            event_type="SCHEMA_VALIDATION_FAILED",
            actor="NEXUS",
            data={
                "messageType": "pacs.004",
                "errors": xsd_result.errors
            },
            pacs004_xml=xml_content
        )
        raise HTTPException(
            status_code=400, 
            detail={"error": "XSD_VALIDATION_FAILED", "errors": xsd_result.errors}
        )
    
    # Extract original UETR from XML (simplified)
    original_uetr = "EXTRACTED_FROM_XML"
    
    return Pacs004Response(
        returnId=return_id,
        originalUetr=original_uetr,
        status="ACCEPTED",
        message="Payment return processed (Future - use pacs.008 with NexusOrgnlUETR for Release 1)",
        processedAt=processed_at.isoformat()
    )
