from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from uuid import uuid4

from ...db import get_db
from .. import validation as xsd_validation
from ..schemas import Camt056Response, Camt029Response
from .utils import store_payment_event

router = APIRouter()

@router.post(
    "/camt056",
    response_model=Camt056Response,
    summary="Submit camt.056 Payment Cancellation Request (Recall)",
    description="""
    **Future/Roadmap - Not in Release 1**
    
    Accepts a camt.056 (FI to FI Payment Cancellation Request) for recalling
    funds after settlement due to fraud, error, or other reasons.
    
    For Release 1, use the Service Desk portal (/service-desk) for manual recall.
    
    Reference: https://docs.nexusglobalpayments.org/payment-processing/recall-and-return
    """
)
async def process_camt056(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Camt056Response:
    """Process camt.056 Payment Cancellation Request."""
    processed_at = datetime.now(timezone.utc)
    recall_id = str(uuid4())
    
    try:
        body = await request.body()
        xml_content = body.decode('utf-8')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read XML: {str(e)}")
    
    # XSD Validation
    xsd_result = xsd_validation.validate_camt056(xml_content)
    if not xsd_result.valid:
        # Forensic Logging
        failed_uetr = xsd_validation.safe_extract_uetr(xml_content) or f"UNKNOWN-{uuid4().hex[:8]}"
        await store_payment_event(
            db=db,
            uetr=failed_uetr,
            event_type="SCHEMA_VALIDATION_FAILED",
            actor="NEXUS",
            data={
                "messageType": "camt.056",
                "errors": xsd_result.errors
            },
            camt056_xml=xml_content
        )
        raise HTTPException(
            status_code=400,
            detail={"error": "XSD_VALIDATION_FAILED", "errors": xsd_result.errors}
        )
    
    original_uetr = "EXTRACTED_FROM_XML"
    
    return Camt056Response(
        recallId=recall_id,
        originalUetr=original_uetr,
        status="ACCEPTED",
        message="Recall request acknowledged (Future - use Service Desk for Release 1)",
        processedAt=processed_at.isoformat()
    )


@router.post(
    "/camt029",
    response_model=Camt029Response,
    summary="Submit camt.029 Resolution of Investigation",
    description="""
    **Future/Roadmap - Not in Release 1**
    
    Accepts a camt.029 (Resolution of Investigation) message as a response
    to a camt.056 recall request. Indicates whether the recall was accepted
    or rejected by the beneficiary's PSP.
    
    Reference: https://docs.nexusglobalpayments.org/payment-processing/recall-and-return
    """
)
async def process_camt029(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Camt029Response:
    """Process camt.029 Resolution of Investigation."""
    processed_at = datetime.now(timezone.utc)
    resolution_id = str(uuid4())
    
    try:
        body = await request.body()
        xml_content = body.decode('utf-8')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read XML: {str(e)}")
    
    # XSD Validation
    xsd_result = xsd_validation.validate_camt029(xml_content)
    if not xsd_result.valid:
        # Forensic Logging
        failed_uetr = xsd_validation.safe_extract_uetr(xml_content) or f"UNKNOWN-{uuid4().hex[:8]}"
        await store_payment_event(
            db=db,
            uetr=failed_uetr,
            event_type="SCHEMA_VALIDATION_FAILED",
            actor="NEXUS",
            data={
                "messageType": "camt.029",
                "errors": xsd_result.errors
            },
            camt029_xml=xml_content
        )
        raise HTTPException(
            status_code=400,
            detail={"error": "XSD_VALIDATION_FAILED", "errors": xsd_result.errors}
        )
    
    return Camt029Response(
        resolutionId=resolution_id,
        recallId="EXTRACTED_FROM_XML",
        status="RECEIVED",
        resolution="PENDING_REVIEW",
        message="Resolution of investigation received (Future - use Service Desk for Release 1)",
        processedAt=processed_at.isoformat()
    )
