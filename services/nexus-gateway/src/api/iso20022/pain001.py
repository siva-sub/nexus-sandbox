from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from uuid import uuid4

from ...db import get_db
from .. import validation as xsd_validation
from ..schemas import Pain001Response
from .utils import store_payment_event

router = APIRouter()

@router.post(
    "/pain001",
    response_model=Pain001Response,
    summary="Submit pain.001 Customer Credit Transfer Initiation",
    description="""
    **Optional - SAP Integration Method 3**
    
    Accepts a pain.001 (Customer Credit Transfer Initiation) message
    from the Destination IPS acting as a corporate client to the D-SAP.
    
    This is used when the D-SAP's corporate payment channel is leveraged
    for initiating domestic leg payments.
    
    Reference: https://docs.nexusglobalpayments.org/settlement-access-provision/processing-payments-as-an-sap
    """
)
async def process_pain001(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Pain001Response:
    """Process pain.001 Customer Credit Transfer Initiation."""
    processed_at = datetime.now(timezone.utc)
    request_id = str(uuid4())
    
    try:
        body = await request.body()
        xml_content = body.decode('utf-8')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read XML: {str(e)}")
    
    # XSD Validation
    xsd_result = xsd_validation.validate_pain001(xml_content)
    if not xsd_result.valid:
        # Forensic Logging
        failed_uetr = xsd_validation.safe_extract_uetr(xml_content) or f"UNKNOWN-{uuid4().hex[:8]}"
        await store_payment_event(
            db=db,
            uetr=failed_uetr,
            event_type="SCHEMA_VALIDATION_FAILED",
            actor="NEXUS",
            data={
                "messageType": "pain.001",
                "errors": xsd_result.errors
            },
            pain001_xml=xml_content
        )
        raise HTTPException(
            status_code=400,
            detail={"error": "XSD_VALIDATION_FAILED", "errors": xsd_result.errors}
        )
    
    return Pain001Response(
        requestId=request_id,
        status="ACCEPTED",
        message="pain.001 accepted - forwarding to SAP corporate channel",
        processedAt=processed_at.isoformat()
    )
