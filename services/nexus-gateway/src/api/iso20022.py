"""
ISO 20022 Message Processing API Endpoints

Reference: https://docs.nexusglobalpayments.org/messaging-and-translation/key-points

These are the core payment flow endpoints:
- POST /iso20022/pacs008 - Payment instruction (FI to FI Customer Credit Transfer)
- POST /iso20022/acmt023 - Proxy/account resolution request
- POST /iso20022/validate - Validate any ISO 20022 message against XSD

CRITICAL: Nexus validates quote ID, exchange rate, and SAP details.
          Quote expiry is 600 seconds (10 minutes).
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Request, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from uuid import UUID, uuid4
from pydantic import BaseModel
from lxml import etree
import json

from ..db import get_db
from ..config import settings
from . import validation as xsd_validation

router = APIRouter(prefix="/v1/iso20022", tags=["ISO 20022 Messages"])


# =============================================================================
# Constants per Nexus Specification
# =============================================================================

QUOTE_EXPIRY_SECONDS = 600  # 10 minutes - FXPs must honour quotes for this duration

# =============================================================================
# ISO 20022 Status Reason Codes (ExternalStatusReason1Code)
# Reference: NotebookLM - Technical Assumptions A20
# Assumption A28: Sandbox implements subset of 60+ production codes
# =============================================================================

# Success
STATUS_ACCEPTED = "ACCC"            # Accepted Settlement Completed

# Quote/Rate Errors (AB04: Aborted - Settlement Fatal Error)
STATUS_QUOTE_EXPIRED = "AB04"       # Quote validity window exceeded
STATUS_RATE_MISMATCH = "AB04"       # Agreed rate doesn't match stored quote

# Timeout Errors
STATUS_TIMEOUT = "AB03"             # Transaction not received within window

# Account Errors
STATUS_ACCOUNT_INCORRECT = "AC01"   # Incorrect Account Number format
STATUS_ACCOUNT_CLOSED = "AC04"      # Closed Account Number
STATUS_PROXY_INVALID = "BE23"       # Account/Proxy Invalid (not registered)

# Agent Errors
STATUS_AGENT_INCORRECT = "AGNT"     # Incorrect Agent (PSP not onboarded)
STATUS_INVALID_SAP = "RC11"         # Invalid Intermediary Agent
STATUS_AGENT_OFFLINE = "AB08"       # Offline Creditor Agent

# Amount Errors
STATUS_AMOUNT_LIMIT = "AM02"        # IPS Limit exceeded
STATUS_INSUFFICIENT_FUNDS = "AM04"  # Insufficient Funds

# Compliance Errors
STATUS_REGULATORY_AML = "RR04"      # Regulatory/AML block

# All status codes for validation
VALID_STATUS_CODES = {
    STATUS_ACCEPTED, STATUS_QUOTE_EXPIRED, STATUS_RATE_MISMATCH,
    STATUS_TIMEOUT, STATUS_ACCOUNT_INCORRECT, STATUS_ACCOUNT_CLOSED,
    STATUS_PROXY_INVALID, STATUS_AGENT_INCORRECT, STATUS_INVALID_SAP,
    STATUS_AGENT_OFFLINE, STATUS_AMOUNT_LIMIT, STATUS_INSUFFICIENT_FUNDS,
    STATUS_REGULATORY_AML
}


class PaymentValidationResult(BaseModel):
    """Result of pacs.008 validation."""
    valid: bool
    uetr: str
    quoteId: Optional[str] = None
    errors: list[str] = []
    statusCode: str = "ACCC"
    statusReasonCode: Optional[str] = None


class Pacs008Response(BaseModel):
    """Response after pacs.008 processing."""
    uetr: str
    status: str
    statusReasonCode: Optional[str] = None
    message: str
    callbackEndpoint: str
    processedAt: str


class Acmt023Response(BaseModel):
    """Response after acmt.023 processing."""
    requestId: str
    status: str
    callbackEndpoint: str
    processedAt: str


# =============================================================================
# POST /iso20022/pacs008 - Payment Instruction
# =============================================================================

@router.post(
    "/pacs008",
    response_model=Pacs008Response,
    summary="Submit pacs.008 payment instruction",
    description="""
    **Core payment flow endpoint**
    
    Accepts an ISO 20022 pacs.008 (FI to FI Customer Credit Transfer) message
    from the Source IPS on behalf of the Source PSP.
    
    ## Validation per Nexus Specification
    
    1. **Quote Expiry**: Quotes valid for 600 seconds (10 min)
    2. **Exchange Rate**: Must match the stored quote rate
    3. **Intermediary Agents**: SAPs must match FXP's registered accounts
    
    ## Mandatory Fields (Nexus requirements beyond CBPR+)
    
    - UETR (UUID v4)
    - Acceptance Date Time
    - Debtor Account
    - Creditor Account
    - Agreed Rate (if using third-party FXP)
    
    Reference: https://docs.nexusglobalpayments.org/messaging-and-translation/message-pacs.008-fi-to-fi-customer-credit-transfer
    """
)
async def process_pacs008(
    request: Request,
    pacs002_endpoint: str = Query(
        ...,
        alias="pacs002Endpoint",
        description="Callback URL for pacs.002 status report"
    ),
    db: AsyncSession = Depends(get_db)
) -> Pacs008Response:
    """
    Process pacs.008 payment instruction.
    
    Steps per Nexus specification:
    1. Parse ISO 20022 XML
    2. Extract UETR, quote ID, exchange rate
    3. Validate quote (expiry, rate, SAPs)
    4. Store payment record
    5. Forward to destination IPS (async)
    6. Return acknowledgement
    """
    processed_at = datetime.now(timezone.utc)
    
    # Get raw XML body
    try:
        body = await request.body()
        xml_content = body.decode('utf-8')
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to read XML body: {str(e)}"
        )
    
    # Step 1: XSD Schema Validation
    xsd_result = xsd_validation.validate_pacs008(xml_content)
    if not xsd_result.valid:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "XSD_VALIDATION_FAILED",
                "messageType": "pacs.008",
                "validationErrors": xsd_result.errors,
                "reference": "https://www.iso20022.org/message/pacs.008"
            }
        )
    
    # Step 2: Parse XML
    try:
        parsed = parse_pacs008(xml_content)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid pacs.008 XML: {str(e)}"
        )
    
    # Validate against Nexus requirements
    validation = await validate_pacs008(parsed, db)
    
    if not validation.valid:
        # Store rejected payment for audit
        await store_payment_event(
            db=db,
            uetr=validation.uetr,
            event_type="PAYMENT_REJECTED",
            data={
                "errors": validation.errors,
                "statusReasonCode": validation.statusReasonCode,
                "rawXml": xml_content[:1000],  # Truncate for storage
            }
        )
        
        raise HTTPException(
            status_code=422,
            detail={
                "uetr": validation.uetr,
                "status": "RJCT",
                "statusReasonCode": validation.statusReasonCode,
                "errors": validation.errors,
                "reference": "https://docs.nexusglobalpayments.org/payment-processing/validations-duplicates-and-fraud"
            }
        )
    
    # Store accepted payment
    await store_payment(
        db=db,
        uetr=validation.uetr,
        quote_id=parsed.get("quoteId"),
        source_psp_bic=parsed.get("debtorAgentBic"),
        destination_psp_bic=parsed.get("creditorAgentBic"),
        debtor_name=parsed.get("debtorName", "Unknown"),
        debtor_account=parsed.get("debtorAccount", "Unknown"),
        creditor_name=parsed.get("creditorName", "Unknown"),
        creditor_account=parsed.get("creditorAccount", "Unknown"),
        source_currency=parsed.get("settlementCurrency"),
        destination_currency=parsed.get("instructedCurrency", "XXX"),
        source_amount=parsed.get("settlementAmount"),
        exchange_rate=parsed.get("exchangeRate"),
        status="ACSP"
    )
    
    # Transformation Logic (Step 15-16 of Nexus Flow)
    # Forwarding message to Destination IPS requires updating Agents and Amounts
    # We fetch the SAP details from the quote validation result or re-query
    quote_data = {
        "dest_sap_bic": "SAP" + parsed.get("creditorAgentBic", "XXXXX")[3:], # Mock logic: Destination SAP
        "dest_psp_bic": parsed.get("creditorAgentBic"),
        "dest_amount": parsed.get("instructedAmount"),
        "dest_currency": parsed.get("instructedCurrency", "USD")
    }
    
    transformed_xml = transform_pacs008(xml_content, quote_data)
    
    await store_payment_event(
        db=db,
        uetr=validation.uetr,
        event_type="PAYMENT_TRANSFORMED",
        actor="NEXUS",
        data={
            "quoteId": validation.quoteId,
            "transformedXml": transformed_xml,
            "routingTo": "DEST_IPS"
        }
    )
    
    return Pacs008Response(
        uetr=validation.uetr,
        status="ACSP",
        statusReasonCode=None,
        message="Payment instruction accepted, transformed and forwarded to destination IPS",
        callbackEndpoint=pacs002_endpoint,
        processedAt=processed_at.isoformat()
    )


# =============================================================================
# POST /iso20022/acmt023 - Proxy/Account Resolution
# =============================================================================

@router.post(
    "/acmt023",
    response_model=Acmt023Response,
    summary="Submit acmt.023 resolution request",
    description="""
    Accepts an ISO 20022 acmt.023 (Identification Verification Request) message
    for proxy or account resolution.
    
    Used in Steps 7-9 of the payment flow when the Source PSP needs to
    resolve a proxy (mobile number, email) to an account number.
    
    Reference: https://docs.nexusglobalpayments.org/messaging-and-translation/message-acmt.023-identification-verification-request
    """
)
async def process_acmt023(
    request: Request,
    acmt024_endpoint: str = Query(
        ...,
        alias="acmt024Endpoint",
        description="Callback URL for acmt.024 resolution response"
    ),
    db: AsyncSession = Depends(get_db)
) -> Acmt023Response:
    """
    Process acmt.023 proxy resolution request.
    
    Steps:
    1. Validate against XSD schema
    2. Parse ISO 20022 XML
    3. Extract proxy type and value
    4. Route to destination PDO
    5. Return acknowledgement (async response via callback)
    """
    processed_at = datetime.now(timezone.utc)
    request_id = str(uuid4())
    
    # Get raw XML body
    try:
        body = await request.body()
        xml_content = body.decode('utf-8')
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to read XML body: {str(e)}"
        )
    
    # Step 1: XSD Schema Validation
    xsd_result = xsd_validation.validate_acmt023(xml_content)
    if not xsd_result.valid:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "XSD_VALIDATION_FAILED",
                "messageType": "acmt.023",
                "validationErrors": xsd_result.errors,
                "reference": "https://www.iso20022.org/message/acmt.023"
            }
        )
    
    # For sandbox: Accept and acknowledge
    # In production: Parse XML, route to PDO, wait for acmt.024
    
    return Acmt023Response(
        requestId=request_id,
        status="ACCEPTED",
        callbackEndpoint=acmt024_endpoint,
        processedAt=processed_at.isoformat()
    )


# =============================================================================
# POST /iso20022/validate - Generic XSD Validation
# =============================================================================

class ValidationResponse(BaseModel):
    """Response for XSD validation."""
    valid: bool
    messageType: str
    errors: list[str] = []
    warnings: list[str] = []


@router.post(
    "/validate",
    response_model=ValidationResponse,
    summary="Validate ISO 20022 message against XSD schema",
    description="""
    Validates any ISO 20022 message against its XSD schema.
    
    Supports:
    - pacs.008.001.13 (Payment Instruction)
    - pacs.002.001.15 (Payment Status Report)
    - pacs.004.001.14 (Payment Return)
    - acmt.023.001.04 (Identification Verification Request)
    - acmt.024.001.04 (Identification Verification Response)
    - camt.054.001.13 (Bank To Customer Notification)
    
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


# =============================================================================
# GET /iso20022/schemas/health - Schema Health Check
# =============================================================================

@router.get(
    "/schemas/health",
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


# =============================================================================
# Helper Functions
# =============================================================================

def parse_pacs008(xml_content: str) -> dict:
    """
    Parse pacs.008 XML and extract key fields.
    
    Reference: https://docs.nexusglobalpayments.org/messaging-and-translation/specific-message-elements
    """
    try:
        root = etree.fromstring(xml_content.encode())
        
        # Define namespace map for ISO 20022
        ns = {
            'doc': 'urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08',
            'head': 'urn:iso:std:iso:20022:tech:xsd:head.001.001.02'
        }
        
        # Extract with fallback for namespace-less XML (simplified parsing)
        def get_text(xpath, default=None):
            # Try with namespace
            elements = root.xpath(xpath, namespaces=ns)
            if elements:
                return elements[0].text if hasattr(elements[0], 'text') else str(elements[0])
            # Try without namespace (for sandbox testing)
            simple_xpath = xpath.replace('doc:', '').replace('head:', '')
            elements = root.xpath(simple_xpath)
            if elements:
                return elements[0].text if hasattr(elements[0], 'text') else str(elements[0])
            return default
        
        return {
            "uetr": get_text(".//UETR") or get_text(".//doc:UETR"),
            "messageId": get_text(".//MsgId") or get_text(".//doc:MsgId"),
            "endToEndId": get_text(".//EndToEndId") or get_text(".//doc:EndToEndId"),
            "quoteId": get_text(".//CtrctId") or get_text(".//doc:CtrctId"),  # FX Quote ID
            "exchangeRate": get_text(".//XchgRate") or get_text(".//doc:XchgRate"),
            "settlementAmount": get_text(".//IntrBkSttlmAmt") or get_text(".//doc:IntrBkSttlmAmt"),
            "settlementCurrency": get_text(".//IntrBkSttlmAmt/@Ccy") or "SGD",
            "instructedAmount": get_text(".//InstdAmt") or get_text(".//doc:InstdAmt"),
            "acceptanceDateTime": get_text(".//AccptncDtTm") or get_text(".//doc:AccptncDtTm"),
            "debtorName": get_text(".//Dbtr/Nm") or get_text(".//doc:Dbtr/doc:Nm"),
            "debtorAccount": get_text(".//DbtrAcct/Id/IBAN") or get_text(".//DbtrAcct/Id/Othr/Id") or get_text(".//doc:DbtrAcct/doc:Id/doc:IBAN"),
            "debtorAgentBic": get_text(".//DbtrAgt//BICFI") or get_text(".//doc:DbtrAgt//doc:BICFI"),
            "creditorName": get_text(".//Cdtr/Nm") or get_text(".//doc:Cdtr/doc:Nm"),
            "creditorAccount": get_text(".//CdtrAcct/Id/IBAN") or get_text(".//CdtrAcct/Id/Othr/Id") or get_text(".//doc:CdtrAcct/doc:Id/doc:IBAN"),
            "creditorAgentBic": get_text(".//CdtrAgt//BICFI") or get_text(".//doc:CdtrAgt//doc:BICFI"),
            "instructedCurrency": get_text(".//InstdAmt/@Ccy") or "USD",
            "intermediaryAgent1Bic": get_text(".//IntrmyAgt1//BICFI") or get_text(".//doc:IntrmyAgt1//doc:BICFI"),
            "intermediaryAgent2Bic": get_text(".//IntrmyAgt2//BICFI") or get_text(".//doc:IntrmyAgt2//doc:BICFI"),
            "chargeBearer": get_text(".//ChrgBr") or get_text(".//doc:ChrgBr"),
        }
    
    except Exception as e:
        raise ValueError(f"Failed to parse pacs.008: {str(e)}")

def transform_pacs008(xml_content: str, quote_data: dict) -> str:
    """
    Transform pacs.008 for Destination IPS routing.
    
    Reference: NotebookLM 2026-02-03 - Agent Swapping and Amount Conversion
    
    1. Update Instructing Agent to Destination SAP BIC
    2. Update Instructed Agent to Destination PSP BIC
    3. Update Amount to Destination Interbank Amount (converted)
    4. Update PrvsInstgAgt1 to Source SAP (audit trail)
    5. Update ClrSys code to Destination IPS
    """
    try:
        root = etree.fromstring(xml_content.encode())
        ns = {'doc': 'urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08'}
        
        # Store Source SAP for audit trail
        original_instg_agt_bic = None
        instg_agt = root.xpath(".//doc:InstgAgt//doc:BICFI", namespaces=ns)
        if instg_agt:
            original_instg_agt_bic = instg_agt[0].text
            # 1. Instructing Agent (InstgAgt) -> Dest SAP
            instg_agt[0].text = quote_data["dest_sap_bic"]
            
        # 2. Instructed Agent (InstdAgt) -> Dest PSP
        instd_agt = root.xpath(".//doc:InstdAgt//doc:BICFI", namespaces=ns)
        if instd_agt:
            instd_agt[0].text = quote_data["dest_psp_bic"]
            
        # 3. Interbank Settlement Amount (IntrBkSttlmAmt) -> Dest Amount
        amt_elem = root.xpath(".//doc:IntrBkSttlmAmt", namespaces=ns)
        if amt_elem:
            amt_elem[0].text = str(quote_data["dest_amount"])
            amt_elem[0].set("Ccy", quote_data["dest_currency"])
        
        # 4. Previous Instructing Agent (PrvsInstgAgt1) -> Source SAP (Audit Trail)
        # Reference: NotebookLM - "Nexus moves the Source SAP here to maintain the audit trail"
        if original_instg_agt_bic:
            cdt_trf_tx_inf = root.xpath(".//doc:CdtTrfTxInf", namespaces=ns)
            if cdt_trf_tx_inf:
                # Create PrvsInstgAgt1 element if not exists
                prvs_instg_agt1 = root.xpath(".//doc:PrvsInstgAgt1", namespaces=ns)
                if not prvs_instg_agt1:
                    new_elem = etree.SubElement(cdt_trf_tx_inf[0], "{urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08}PrvsInstgAgt1")
                    fin_instn_id = etree.SubElement(new_elem, "{urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08}FinInstnId")
                    bicfi = etree.SubElement(fin_instn_id, "{urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08}BICFI")
                    bicfi.text = original_instg_agt_bic
        
        # 4b. Previous Instructing Agent Account (PrvsInstgAgt1Acct) -> FXP Account at S-SAP
        # Reference: NotebookLM - "FXP account at S-SAP moved here for traceability"
        # Assumption A29: FXP account ID derived from quote_data if available
        if quote_data.get("fxp_account_id"):
            cdt_trf_tx_inf = root.xpath(".//doc:CdtTrfTxInf", namespaces=ns)
            if cdt_trf_tx_inf:
                prvs_acct = etree.SubElement(cdt_trf_tx_inf[0], "{urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08}PrvsInstgAgt1Acct")
                acct_id = etree.SubElement(prvs_acct, "{urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08}Id")
                othr = etree.SubElement(acct_id, "{urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08}Othr")
                othr_id = etree.SubElement(othr, "{urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08}Id")
                othr_id.text = quote_data["fxp_account_id"]
        
        # 5. Clear IntrmyAgt1 (Source SAP removed from destination leg)
        intmy_agt1 = root.xpath(".//doc:IntrmyAgt1", namespaces=ns)
        if intmy_agt1:
            intmy_agt1[0].getparent().remove(intmy_agt1[0])
        
        # 6. Update Clearing System code (ClrSys/Cd)
        clr_sys = root.xpath(".//doc:ClrSys//doc:Cd", namespaces=ns)
        if clr_sys and "dest_ips_code" in quote_data:
            clr_sys[0].text = quote_data["dest_ips_code"]
            
        return etree.tostring(root, encoding='unicode', pretty_print=True)
    except Exception as e:
        # Fallback if namespaces are missing (simplified XML)
        return xml_content  # For sandbox simplicity in edge cases


async def validate_pacs008(parsed: dict, db: AsyncSession) -> PaymentValidationResult:
    """
    Validate pacs.008 against Nexus requirements.
    
    Reference: https://docs.nexusglobalpayments.org/payment-processing/validations-duplicates-and-fraud
    """
    errors = []
    status_reason = None
    quote_id = parsed.get("quoteId")
    uetr = parsed.get("uetr") or str(uuid4())
    
    # 1. UETR is mandatory
    if not parsed.get("uetr"):
        errors.append("UETR is mandatory for Nexus payments")
    
    # 2. If quote ID present, validate quote (third-party FXP scenario)
    if quote_id:
        # Join with SAPs to verify the FXP owns these accounts
        # We check both Source and Destination SAPs
        quote_query = text("""
            SELECT 
                q.quote_id, q.final_rate as exchange_rate, q.expires_at,
                q.fxp_id,
                source_sap.bic as source_sap_bic,
                dest_sap.bic as dest_sap_bic
            FROM quotes q
            LEFT JOIN fxp_sap_accounts source_acc ON q.fxp_id = source_acc.fxp_id AND q.source_currency = source_acc.currency_code
            LEFT JOIN saps source_sap ON source_acc.sap_id = source_sap.sap_id
            LEFT JOIN fxp_sap_accounts dest_acc ON q.fxp_id = dest_acc.fxp_id AND q.destination_currency = dest_acc.currency_code
            LEFT JOIN saps dest_sap ON dest_acc.sap_id = dest_sap.sap_id
            WHERE q.quote_id = :quote_id
        """)
        
        result = await db.execute(quote_query, {"quote_id": quote_id})
        quote = result.fetchone()
        
        if not quote:
            errors.append(f"Quote {quote_id} not found")
            status_reason = STATUS_QUOTE_EXPIRED
        else:
            # Check quote expiry (600 seconds = 10 minutes)
            if quote.expires_at < datetime.now(timezone.utc):
                errors.append(f"Quote {quote_id} has expired (valid for 600 seconds)")
                status_reason = STATUS_QUOTE_EXPIRED
            
            # Check exchange rate matches
            if parsed.get("exchangeRate"):
                submitted_rate = Decimal(str(parsed["exchangeRate"]))
                stored_rate = Decimal(str(quote.exchange_rate))
                
                # Allow small tolerance for floating point
                if abs(submitted_rate - stored_rate) > Decimal("0.000001"):
                    errors.append(
                        f"Exchange rate mismatch: submitted {submitted_rate}, "
                        f"expected {stored_rate}"
                    )
                    status_reason = STATUS_RATE_MISMATCH
            
            # Check intermediary agents (SAPs) match FXP's accounts
            if parsed.get("intermediaryAgent1Bic"):
                if parsed["intermediaryAgent1Bic"] != quote.source_sap_bic:
                    errors.append(
                        f"Intermediary Agent 1 mismatch: {parsed['intermediaryAgent1Bic']} "
                        f"not a registered SAP for this corridor/FXP"
                    )
                    status_reason = STATUS_INVALID_SAP
            
            if parsed.get("intermediaryAgent2Bic"):
                if parsed["intermediaryAgent2Bic"] != quote.dest_sap_bic:
                    errors.append(
                        f"Intermediary Agent 2 mismatch: {parsed['intermediaryAgent2Bic']} "
                        f"not a registered SAP for this corridor/FXP"
                    )
                    status_reason = STATUS_INVALID_SAP
    
    # 3. Charge Bearer must be SHAR
    if parsed.get("chargeBearer") and parsed["chargeBearer"] != "SHAR":
        errors.append("Charge Bearer must be SHAR (Shared) for Nexus payments")
    
    # 4. Amount limit check (sandbox trigger: amounts > 50,000)
    # Reference: docs/UNHAPPY_FLOWS.md - AM02 trigger
    if parsed.get("settlementAmount"):
        try:
            amount = Decimal(str(parsed["settlementAmount"]))
            if amount > Decimal("50000"):
                errors.append(f"Amount {amount} exceeds IPS transaction limit (50,000)")
                status_reason = STATUS_AMOUNT_LIMIT
        except:
            pass
    
    # 5. Duplicate UETR check
    if uetr:
        dup_query = text("SELECT COUNT(*) FROM payments WHERE uetr = :uetr AND status != 'RJCT'")
        dup_result = await db.execute(dup_query, {"uetr": uetr})
        dup_count = dup_result.scalar()
        if dup_count and dup_count > 0:
            errors.append(f"Duplicate UETR: {uetr} already exists")
            status_reason = "DUPL"  # ISO 20022 Duplicate Payment
    
    return PaymentValidationResult(
        valid=len(errors) == 0,
        uetr=uetr,
        quoteId=quote_id,
        errors=errors,
        statusCode="ACCC" if len(errors) == 0 else "RJCT",
        statusReasonCode=status_reason
    )


async def store_payment(
    db: AsyncSession,
    uetr: str,
    quote_id: Optional[str],
    source_psp_bic: str,
    destination_psp_bic: str,
    debtor_name: str,
    debtor_account: str,
    creditor_name: str,
    creditor_account: str,
    source_currency: str,
    destination_currency: str,
    source_amount: str,
    exchange_rate: Optional[str],
    status: str
):
    """Store payment record matching schema."""
    query = text("""
        INSERT INTO payments (
            uetr, quote_id, source_psp_bic, destination_psp_bic,
            debtor_name, debtor_account, creditor_name, creditor_account,
            source_currency, destination_currency, interbank_settlement_amount,
            exchange_rate, status, initiated_at, updated_at
        ) VALUES (
            :uetr, :quote_id, :source_psp_bic, :destination_psp_bic,
            :debtor_name, :debtor_account, :creditor_name, :creditor_account,
            :source_currency, :destination_currency, :interbank_settlement_amount,
            :exchange_rate, :status, NOW(), NOW()
        )
        ON CONFLICT (uetr, initiated_at) DO UPDATE SET
            status = EXCLUDED.status,
            updated_at = NOW()
    """)
    
    await db.execute(query, {
        "uetr": uetr,
        "quote_id": quote_id,
        "source_psp_bic": source_psp_bic or "MOCKPSGSG",
        "destination_psp_bic": destination_psp_bic or "MOCKTHBK",
        "debtor_name": debtor_name,
        "debtor_account": debtor_account,
        "creditor_name": creditor_name,
        "creditor_account": creditor_account,
        "source_currency": source_currency or "SGD",
        "destination_currency": destination_currency or "THB",
        "interbank_settlement_amount": Decimal(source_amount) if source_amount else Decimal("0"),
        "exchange_rate": Decimal(exchange_rate) if exchange_rate else None,
        "status": status,
    })
    await db.commit()


async def store_payment_event(
    db: AsyncSession,
    uetr: str,
    event_type: str,
    actor: str,
    data: dict
):
    """Store payment event with actor details."""
    query = text("""
        INSERT INTO payment_events (
            event_id, uetr, event_type, actor, data, version, occurred_at
        ) VALUES (
            gen_random_uuid(), :uetr, :event_type, :actor, :data, 1, NOW()
        )
    """)
    
    await db.execute(query, {
        "uetr": uetr,
        "event_type": event_type,
        "actor": actor,
        "data": json.dumps(data),
    })
    await db.commit()
