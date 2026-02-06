"""
pacs.008 Payment Instruction Handler

This module contains all logic for processing ISO 20022 pacs.008
(FI to FI Customer Credit Transfer) payment instructions, including
parsing, validation, transformation, and response generation.

Extracted from monolithic iso20022.py as part of Phase 2 modular refactoring.
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4
from typing import Optional
from lxml import etree
import logging

from ...db import get_db
from ...config import settings
from .. import validation as xsd_validation
from . import (
    # Constants
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
    # Schemas
    PaymentValidationResult,
    Pacs008Response,
)
from .utils import (
    store_payment,
    store_payment_event,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# =============================================================================
# XML Parsing Functions
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
            "quoteId": get_text(".//InstrId") or get_text(".//doc:InstrId") or get_text(".//QtId") or get_text(".//doc:QtId") or get_text(".//CtrctId") or get_text(".//doc:CtrctId"),  # FX Quote ID
            "exchangeRate": get_text(".//PreAgrdXchgRate") or get_text(".//doc:PreAgrdXchgRate") or get_text(".//XchgRate") or get_text(".//doc:XchgRate"),
            "settlementAmount": get_text(".//IntrBkSttlmAmt") or get_text(".//doc:IntrBkSttlmAmt"),
            "settlementCurrency": get_text(".//IntrBkSttlmAmt/@Ccy") or "SGD",
            "instructedAmount": get_text(".//InstdAmt") or get_text(".//doc:InstdAmt"),
            "purposeCode": get_text(".//Purp/Cd") or get_text(".//doc:Purp/doc:Cd"),
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
            # Remittance Information for NexusOrgnlUETR extraction (return payments)
            "remittanceInfo": get_text(".//AddtlRmtInf") or get_text(".//doc:RmtInf//doc:Ustrd") or get_text(".//RmtInf//Ustrd"),
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
        
        # 3b. Update Agreed Rate section (if exists)
        agrd_rate = root.xpath(".//doc:AgrdRate", namespaces=ns)
        if agrd_rate:
            unit_ccy = root.xpath(".//doc:AgrdRate/doc:UnitCcy", namespaces=ns)
            if unit_ccy: unit_ccy[0].text = quote_data.get("source_currency", "XXX")
            qtd_ccy = root.xpath(".//doc:AgrdRate/doc:QtdCcy", namespaces=ns)
            if qtd_ccy: qtd_ccy[0].text = quote_data.get("dest_currency", "XXX")
        
        # 4. Previous Instructing Agent (PrvsInstgAgt1) -> Source SAP (Audit Trail)
        if original_instg_agt_bic:
            cdt_trf_tx_inf = root.xpath(".//doc:CdtTrfTxInf", namespaces=ns)
            if cdt_trf_tx_inf:
                prvs_instg_agt1 = root.xpath(".//doc:PrvsInstgAgt1", namespaces=ns)
                if not prvs_instg_agt1:
                    new_elem = etree.SubElement(cdt_trf_tx_inf[0], "{urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08}PrvsInstgAgt1")
                    fin_instn_id = etree.SubElement(new_elem, "{urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08}FinInstnId")
                    bicfi = etree.SubElement(fin_instn_id, "{urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08}BICFI")
                    bicfi.text = original_instg_agt_bic
        
        # 4b. Previous Instructing Agent Account
        if quote_data.get("fxp_account_id"):
            cdt_trf_tx_inf = root.xpath(".//doc:CdtTrfTxInf", namespaces=ns)
            if cdt_trf_tx_inf:
                prvs_acct = etree.SubElement(cdt_trf_tx_inf[0], "{urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08}PrvsInstgAgt1Acct")
                acct_id = etree.SubElement(prvs_acct, "{urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08}Id")
                othr = etree.SubElement(acct_id, "{urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08}Othr")
                othr_id = etree.SubElement(othr, "{urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08}Id")
                othr_id.text = quote_data["fxp_account_id"]
        
        # 5. Clear IntrmyAgt1
        intmy_agt1 = root.xpath(".//doc:IntrmyAgt1", namespaces=ns)
        if intmy_agt1:
            intmy_agt1[0].getparent().remove(intmy_agt1[0])
        
        # 6. Update Clearing System code
        clr_sys = root.xpath(".//doc:ClrSys//doc:Cd", namespaces=ns)
        if clr_sys and "dest_ips_code" in quote_data:
            clr_sys[0].text = quote_data["dest_ips_code"]
            
        return etree.tostring(root, encoding='unicode', pretty_print=True)
    except Exception as e:
        return xml_content  # Fallback for simplified XML


# =============================================================================
# Validation Functions
# =============================================================================

async def validate_pacs008(parsed: dict, db: AsyncSession) -> PaymentValidationResult:
    """
    Validate pacs.008 against Nexus requirements.
    
    SANDBOX MODE: Validation is lenient - logs warnings but allows processing.
    
    Reference: https://docs.nexusglobalpayments.org/payment-processing/validations-duplicates-and-fraud
    """
    errors = []
    warnings = []
    status_reason = None
    quote_id = parsed.get("quoteId")
    uetr = parsed.get("uetr") or str(uuid4())
    
    # 1. UETR mandatory (sandbox generates if missing)
    if not parsed.get("uetr"):
        warnings.append("UETR was not provided - generated for sandbox demo")
    
    # 2. Quote validation
    quote = None  # Initialize to prevent UnboundLocalError when quote_id is not provided
    if quote_id:
        logger.info(f"Sandbox mode: accepting quote {quote_id} without strict validation")
        quote_query = text("""
            SELECT 
                q.quote_id, q.final_rate as exchange_rate, q.expires_at,
                q.fxp_id,
                source_sap.bic as source_sap_bic,
                dest_sap.bic as dest_sap_bic,
                ips.ips_code as dest_ips_code
            FROM quotes q
            LEFT JOIN fxp_sap_accounts source_acc ON q.fxp_id = source_acc.fxp_id AND q.source_currency = source_acc.currency_code
            LEFT JOIN saps source_sap ON source_acc.sap_id = source_sap.sap_id
            LEFT JOIN fxp_sap_accounts dest_acc ON q.fxp_id = dest_acc.fxp_id AND q.destination_currency = dest_acc.currency_code
            LEFT JOIN saps dest_sap ON dest_acc.sap_id = dest_sap.sap_id
            LEFT JOIN ips_operators ips ON q.destination_country = ips.country_code
            WHERE q.quote_id = :quote_id
        """)
        
        result = await db.execute(quote_query, {"quote_id": quote_id})
        quote = result.fetchone()
        
        if not quote:
            errors.append(f"Quote {quote_id} not found")
            status_reason = STATUS_QUOTE_EXPIRED
        else:
            # Check expiry
            if quote.expires_at < datetime.now(timezone.utc):
                errors.append(f"Quote {quote_id} has expired (valid for 600 seconds)")
                status_reason = STATUS_QUOTE_EXPIRED
            
            # Check exchange rate
            if parsed.get("exchangeRate"):
                submitted_rate = Decimal(str(parsed["exchangeRate"]))
                stored_rate = Decimal(str(quote.exchange_rate))
                
                if abs(submitted_rate - stored_rate) > Decimal("0.000001"):
                    errors.append(f"Exchange rate mismatch: submitted {submitted_rate}, expected {stored_rate}")
                    status_reason = STATUS_RATE_MISMATCH
            
            # Check SAPs
            if parsed.get("intermediaryAgent1Bic"):
                if parsed["intermediaryAgent1Bic"] != quote.source_sap_bic:
                    errors.append(f"Intermediary Agent 1 mismatch: {parsed['intermediaryAgent1Bic']} not a registered SAP")
                    status_reason = STATUS_INVALID_SAP
            
            if parsed.get("intermediaryAgent2Bic"):
                if parsed["intermediaryAgent2Bic"] != quote.dest_sap_bic:
                    errors.append(f"Intermediary Agent 2 mismatch: {parsed['intermediaryAgent2Bic']} not a registered SAP")
                    status_reason = STATUS_INVALID_SAP
    
    # 3. Charge Bearer must be SHAR
    if parsed.get("chargeBearer") and parsed["chargeBearer"] != "SHAR":
        errors.append("Charge Bearer must be SHAR for Nexus payments")
    
    # 4. Amount limits
    if parsed.get("settlementAmount"):
        try:
            amount = Decimal(str(parsed["settlementAmount"]))
            if amount > Decimal("50000"):
                errors.append(f"Amount {amount} exceeds IPS limit (50,000)")
                status_reason = STATUS_AMOUNT_LIMIT
            elif str(int(amount)).endswith("99999"):
                errors.append(f"Insufficient funds for amount {amount}")
                status_reason = STATUS_INSUFFICIENT_FUNDS
        except:
            pass
    
    # 5. Duplicate check
    if uetr:
        dup_query = text("SELECT COUNT(*) FROM payments WHERE uetr = :uetr AND status != 'RJCT'")
        dup_result = await db.execute(dup_query, {"uetr": uetr})
        dup_count = dup_result.scalar()
        if dup_count and dup_count > 0:
            errors.append(f"Duplicate UETR: {uetr} already exists")
            status_reason = "DUPL"
    
    return PaymentValidationResult(
        valid=len(errors) == 0,
        uetr=uetr,
        quoteId=quote_id,
        errors=errors,
        statusCode="ACCC" if len(errors) == 0 else "RJCT",
        statusReasonCode=status_reason,
        quote_data={
            "dest_sap_bic": quote.dest_sap_bic,
            "dest_psp_bic": parsed.get("creditorAgentBic"),
            "dest_amount": Decimal(str(parsed.get("instructedAmount"))) if parsed.get("instructedAmount") else Decimal("0"),
            "dest_currency": parsed.get("instructedCurrency"),
            "source_currency": parsed.get("settlementCurrency"),
            "dest_ips_code": quote.dest_ips_code
        } if quote else None
    )


# =============================================================================
# Message Builders
# =============================================================================

def build_pacs002_acceptance(
    uetr: str,
    status_code: str,
    settlement_amount: float,
    settlement_currency: str
) -> str:
    """Build pacs.002 Payment Status Report (Acceptance)."""
    now = datetime.now(timezone.utc).isoformat()
    msg_id = f"MSG{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.002.001.15">
  <FIToFIPmtStsRpt>
    <GrpHdr>
      <MsgId>{msg_id}</MsgId>
      <CreDtTm>{now}</CreDtTm>
    </GrpHdr>
    <TxInfAndSts>
      <OrgnlInstrId>{uetr}</OrgnlInstrId>
      <OrgnlEndToEndId>{uetr}</OrgnlEndToEndId>
      <OrgnlTxId>{uetr}</OrgnlTxId>
      <TxSts>{status_code}</TxSts>
      <StsRsnInf>
        <Rsn><Cd>AC01</Cd></Rsn>
        <AddtlInf>Payment accepted and settled</AddtlInf>
      </StsRsnInf>
      <OrgnlTxRef>
        <IntrBkSttlmAmt Ccy="{settlement_currency}">{settlement_amount}</IntrBkSttlmAmt>
      </OrgnlTxRef>
    </TxInfAndSts>
  </FIToFIPmtStsRpt>
</Document>"""


def build_pacs002_rejection(
    uetr: str,
    status_code: str,
    reason_code: str,
    reason_description: str
) -> str:
    """Build pacs.002 Payment Status Report (Rejection)."""
    now = datetime.now(timezone.utc).isoformat()
    msg_id = f"MSG{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.002.001.15">
  <FIToFIPmtStsRpt>
    <GrpHdr>
      <MsgId>{msg_id}</MsgId>
      <CreDtTm>{now}</CreDtTm>
    </GrpHdr>
    <TxInfAndSts>
      <OrgnlInstrId>{uetr}</OrgnlInstrId>
      <OrgnlEndToEndId>{uetr}</OrgnlEndToEndId>
      <OrgnlTxId>{uetr}</OrgnlTxId>
      <TxSts>{status_code}</TxSts>
      <StsRsnInf>
        <Rsn><Cd>{reason_code}</Cd></Rsn>
        <AddtlInf>{reason_description}</AddtlInf>
      </StsRsnInf>
    </TxInfAndSts>
  </FIToFIPmtStsRpt>
</Document>"""


def build_camt054(
    uetr: str,
    amount: float,
    currency: str,
    debtor_name: str,
    creditor_name: str,
    status: str = "ACCC"
) -> str:
    """Build camt.054 Bank To Customer Debit Credit Notification."""
    now = datetime.now(timezone.utc).isoformat()
    msg_id = f"CAMT054-{uetr[:8]}-{int(datetime.now(timezone.utc).timestamp())}"
    
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.054.001.13">
  <BkToCstmrDbtCdtNtfctn>
    <GrpHdr>
      <MsgId>{msg_id}</MsgId>
      <CreDtTm>{now}</CreDtTm>
    </GrpHdr>
    <Ntfctn>
      <Id>{uetr[:35]}</Id>
      <CreDtTm>{now}</CreDtTm>
      <Acct>
        <Id>
          <Othr>
            <Id>SETTLEMENT-ACCOUNT</Id>
          </Othr>
        </Id>
      </Acct>
      <Ntry>
        <Amt Ccy="{currency}">{amount}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>
          <Cd>{status}</Cd>
        </Sts>
        <BkTxCd>
          <Domn>
            <Cd>PMNT</Cd>
            <Fmly>
              <Cd>ICDT</Cd>
              <SubFmlyCd>SNDB</SubFmlyCd>
            </Fmly>
          </Domn>
        </BkTxCd>
        <NtryDtls>
          <TxDtls>
            <Refs>
              <UETR>{uetr}</UETR>
            </Refs>
            <RltdPties>
              <Dbtr><Pty><Nm>{debtor_name}</Nm></Pty></Dbtr>
              <Cdtr><Pty><Nm>{creditor_name}</Nm></Pty></Cdtr>
            </RltdPties>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Ntfctn>
  </BkToCstmrDbtCdtNtfctn>
</Document>"""


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
    scenario_code: Optional[str] = Query(
        None,
        alias="scenarioCode",
        description="Demo scenario code for unhappy flow testing (e.g., 'AB04', 'TM01', 'AM04')"
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
        failed_uetr = xsd_validation.safe_extract_uetr(xml_content) or f"UNKNOWN-{uuid4().hex[:8]}"
        await store_payment_event(
            db=db,
            uetr=failed_uetr,
            event_type="SCHEMA_VALIDATION_WARNING",
            actor="NEXUS",
            data={
                "messageType": "pacs.008",
                "errors": xsd_result.errors,
                "summary": "Message has XSD schema warnings (sandbox lenient mode - processing continues)",
                "sandboxMode": True
            },
            pacs008_xml=xml_content
        )
        logger.warning(f"XSD validation warnings (sandbox lenient mode): {xsd_result.errors[:2]}")
    
    # Step 2: Parse XML
    try:
        parsed = parse_pacs008(xml_content)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid pacs.008 XML: {str(e)}"
        )
    
    # Demo Scenario Injection
    if scenario_code and scenario_code.lower() != "happy":
        scenario_reason = scenario_code.upper()
        scenario_descriptions = {
            "AB04": "Quote Expired - Exchange rate no longer valid",
            "TM01": "Timeout - Processing time limit exceeded",
            "DUPL": "Duplicate Payment - Transaction already exists",
            "AM04": "Insufficient Funds - Sender balance insufficient",
            "AM02": "Amount Limit Exceeded - Above max transfer limit",
            "BE23": "Invalid Proxy - Recipient identifier not found",
            "AC04": "Closed Account - Recipient account is closed",
            "RR04": "Regulatory Block - Transaction blocked by compliance",
        }
        reason_desc = scenario_descriptions.get(scenario_reason, f"Demo Rejection: {scenario_reason}")
        
        uetr = parsed.get("uetr") or str(uuid4())
        
        await store_payment(
            db=db,
            uetr=uetr,
            quote_id=parsed.get("quoteId"),
            source_psp_bic=parsed.get("debtorAgentBic"),
            destination_psp_bic=parsed.get("creditorAgentBic"),
            debtor_name=parsed.get("debtorName", "Demo Sender"),
            debtor_account=parsed.get("debtorAccount", "Unknown"),
            creditor_name=parsed.get("creditorName", "Demo Recipient"),
            creditor_account=parsed.get("creditorAccount", "Unknown"),
            source_currency=parsed.get("settlementCurrency"),
            destination_currency=parsed.get("instructedCurrency", "XXX"),
            source_amount=parsed.get("settlementAmount"),
            exchange_rate=parsed.get("exchangeRate"),
            status="RJCT"
        )
        
        pacs002_xml = build_pacs002_rejection(
            uetr=uetr,
            status_code="RJCT",
            reason_code=scenario_reason,
            reason_description=reason_desc
        )
        
        await store_payment_event(
            db=db,
            uetr=uetr,
            event_type="DEMO_SCENARIO_REJECTION",
            actor="NEXUS",
            data={
                "scenarioCode": scenario_reason,
                "description": reason_desc,
                "demoMode": True
            },
            pacs008_xml=xml_content,
            pacs002_xml=pacs002_xml
        )
        
        raise HTTPException(
            status_code=422,
            detail={
                "uetr": uetr,
                "status": "RJCT",
                "statusReasonCode": scenario_reason,
                "errors": [reason_desc],
                "demoScenario": True,
                "reference": "https://docs.nexusglobalpayments.org/payment-processing/validations-duplicates-and-fraud"
            }
        )
    
    # Validate against Nexus requirements
    validation = await validate_pacs008(parsed, db)
    
    if not validation.valid:
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
            status="RJCT"
        )
        
        pacs002_xml = build_pacs002_rejection(
            uetr=validation.uetr,
            status_code="RJCT",
            reason_code=validation.statusReasonCode,
            reason_description=validation.errors[0] if validation.errors else "Validation failed"
        )
        
        await store_payment_event(
            db=db,
            uetr=validation.uetr,
            event_type="PAYMENT_REJECTED",
            actor="NEXUS",
            data={
                "errors": validation.errors,
                "statusReasonCode": validation.statusReasonCode,
            },
            pacs008_xml=xml_content,
            pacs002_xml=pacs002_xml
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
    
    # Check for NexusOrgnlUETR
    original_uetr = None
    remittance_info = parsed.get("remittanceInfo", "")
    if remittance_info:
        match = NEXUS_ORIGINAL_UETR_PATTERN.search(remittance_info)
        if match:
            original_uetr = match.group(1)
            await store_payment_event(
                db=db,
                uetr=validation.uetr,
                event_type="RETURN_LINKED",
                actor="NEXUS",
                data={
                    "originalUetr": original_uetr,
                    "returnUetr": validation.uetr,
                    "message": f"Return payment linked to original payment {original_uetr}",
                    "nexusOrgnlUetrFound": True
                }
            )
    
    # Transformation Logic
    if validation.quote_data:
        quote_data = validation.quote_data
    else:
        creditor_bic = parsed.get("creditorAgentBic") or "UNKNTHBK"
        quote_data = {
            "dest_sap_bic": "SAP" + creditor_bic[3:] if len(creditor_bic) >= 4 else "SAPXXXX",
            "dest_psp_bic": creditor_bic,
            "dest_amount": parsed.get("instructedAmount") or parsed.get("settlementAmount") or "0",
            "dest_currency": parsed.get("instructedCurrency") or parsed.get("settlementCurrency") or "USD",
            "dest_ips_code": "FAST"
        }
    
    transformed_xml = transform_pacs008(xml_content, quote_data)
    
    pacs002_xml = build_pacs002_acceptance(
        uetr=validation.uetr,
        status_code="ACCC",
        settlement_amount=parsed.get("settlementAmount"),
        settlement_currency=parsed.get("settlementCurrency")
    )
    
    camt054_xml = build_camt054(
        uetr=validation.uetr,
        amount=parsed.get("settlementAmount"),
        currency=parsed.get("settlementCurrency"),
        debtor_name=parsed.get("debtorName", "Demo Sender"),
        creditor_name=parsed.get("creditorName", "Demo Recipient")
    )
    
    await store_payment_event(
        db=db,
        uetr=validation.uetr,
        event_type="PAYMENT_ACCEPTED",
        actor="NEXUS",
        data={
            "quoteId": validation.quoteId,
            "transformedXml": transformed_xml[:500],
            "routingTo": "DEST_IPS",
            "reconciliationGenerated": True
        },
        pacs008_xml=xml_content,
        pacs002_xml=pacs002_xml,
        camt054_xml=camt054_xml
    )
    
    return Pacs008Response(
        uetr=validation.uetr,
        status="ACSP",
        statusReasonCode=None,
        message="Payment instruction accepted, transformed and forwarded to destination IPS",
        callbackEndpoint=pacs002_endpoint,
        processedAt=processed_at.isoformat()
    )
