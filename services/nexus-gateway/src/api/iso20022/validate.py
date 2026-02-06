from fastapi import APIRouter, HTTPException, Request, Query
from typing import Optional

from .. import validation as xsd_validation
from ..schemas import ValidationResponse

router = APIRouter()

@router.post(
    "/validate",
    response_model=ValidationResponse,
    summary="Validate ISO 20022 message against XSD schema",
    description="""
    Validates any ISO 20022 message against its XSD schema.
    
    **Release 1 (Mandatory):**
    - pacs.008.001.13 (FI to FI Customer Credit Transfer)
    - pacs.002.001.15 (Payment Status Report)
    - acmt.023.001.04 (Identification Verification Request)
    - acmt.024.001.04 (Identification Verification Response)
    - camt.054.001.13 (Bank To Customer Notification)
    
    **Optional (SAP Integration):**
    - camt.103.001.03 (Create Reservation)
    - pain.001.001.12 (Customer Credit Transfer Initiation)
    
    **Future/Roadmap:**
    - pacs.004.001.14 (Payment Return)
    - pacs.028.001.06 (FI to FI Payment Status Request)
    - camt.056.001.11 (FI to FI Payment Cancellation Request)
    - camt.029.001.13 (Resolution of Investigation)
    
    Returns validation errors if the message does not conform to the schema.
    """
)
async def validate_message(
    request: Request,
    message_type: Optional[str] = Query(
        None,
        alias="messageType",
        description="Message type (auto-detected if not specified)"
    )
) -> ValidationResponse:
    """Validate ISO 20022 message against XSD schema."""
    
    # Get raw XML body
    try:
        body = await request.body()
        xml_content = body.decode('utf-8')
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to read XML body: {str(e)}"
        )
    
    # Auto-detect message type if not specified
    if not message_type:
        message_type = xsd_validation.detect_message_type(xml_content)
        if not message_type:
            raise HTTPException(
                status_code=400,
                detail="Could not detect message type. Please specify messageType parameter."
            )
    
    # Validate
    result = xsd_validation.validate_xml(xml_content, message_type)
    
    return ValidationResponse(
        valid=result.valid,
        messageType=result.message_type,
        errors=result.errors,
        warnings=result.warnings
    )


@router.get(
    "/schemas/health",
    tags=["Validation Health"],
    summary="Check XSD schema validation health",
    description="""
    Returns the health status of the XSD schema validation system.
    
    Shows:
    - Loaded schemas
    - Load errors
    - Schema directory path
    """
)
async def get_schema_health() -> dict:
    """Get health status of schema validation system."""
    return xsd_validation.get_validation_health()
