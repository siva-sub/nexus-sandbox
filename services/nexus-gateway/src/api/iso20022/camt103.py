from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from uuid import uuid4

from ...db import get_db
from .. import validation as xsd_validation
from ..schemas import Camt103Response
from .utils import store_payment_event

router = APIRouter()

@router.post(
    "/camt103",
    response_model=Camt103Response,
    summary="Submit camt.103 Create Reservation",
    description="""
    **Optional - SAP Integration Method 2a**
    
    Accepts a camt.103 (Create Reservation) message for liquidity reservation
    at the Destination SAP. This creates a debit authorization for the
    FXP's account before the payment is processed.
    
    Reference: https://docs.nexusglobalpayments.org/settlement-access-provision/liquidity
    """
)
async def process_camt103(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Camt103Response:
    """Process camt.103 Create Reservation."""
    processed_at = datetime.now(timezone.utc)
    reservation_id = str(uuid4())
    
    try:
        body = await request.body()
        xml_content = body.decode('utf-8')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read XML: {str(e)}")
    
    # XSD Validation
    xsd_result = xsd_validation.validate_camt103(xml_content)
    if not xsd_result.valid:
        # Forensic Logging
        failed_uetr = xsd_validation.safe_extract_uetr(xml_content) or f"UNKNOWN-{uuid4().hex[:8]}"
        await store_payment_event(
            db=db,
            uetr=failed_uetr,
            event_type="SCHEMA_VALIDATION_FAILED",
            actor="NEXUS",
            data={
                "messageType": "camt.103",
                "errors": xsd_result.errors
            },
            camt103_xml=xml_content
        )
        raise HTTPException(
            status_code=400,
            detail={"error": "XSD_VALIDATION_FAILED", "errors": xsd_result.errors}
        )
    
    return Camt103Response(
        reservationId=reservation_id,
        status="CREATED",
        message="Liquidity reservation created at SAP",
        processedAt=processed_at.isoformat()
    )
