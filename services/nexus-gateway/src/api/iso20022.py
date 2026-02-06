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

from fastapi import APIRouter
from .iso20022 import (
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
    # Module routers
    pacs008,
    acmt023,
    acmt024,
    pain001,
    camt103,
    pacs004,
    pacs028,
    recall_handlers,
    validate,
)
from .schemas import Iso20022Template

from .iso20022 import (
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
    # Module routers
    pacs008,
    acmt023,
    acmt024,
    pain001,
    camt103,
    pacs004,
    pacs028,
    recall_handlers,
    validate,
)

router = APIRouter(prefix="/v1/iso20022", tags=["ISO 20022 Messages"])

# Include modular message handler routers
router.include_router(pacs008.router, tags=["pacs.008 - Payment Instructions"])
router.include_router(acmt023.router, tags=["acmt.023 - Proxy Resolution Request"])
router.include_router(acmt024.router, tags=["acmt.024 - Proxy Resolution Report"])
router.include_router(pain001.router, tags=["pain.001 - Credit Initiation"])
router.include_router(camt103.router, tags=["camt.103 - Create Reservation"])
router.include_router(pacs004.router, tags=["pacs.004 - Payment Return"])
router.include_router(pacs028.router, tags=["pacs.028 - Payment Status Request"])
router.include_router(recall_handlers.router, tags=["Recall & Cancellation"])
router.include_router(validate.router, tags=["Validation & Health"])


# =============================================================================
# GET /iso20022/templates - Message Examples
# =============================================================================

@router.get(
    "/templates",
    response_model=dict[str, Iso20022Template],
    summary="Get ISO 20022 Message Templates",
    description="Returns reference XML samples for all supported ISO 20022 messages."
)
async def get_iso20022_templates():
    """Return dictionary of message templates for frontend usage."""
    return {
        "pacs.008": {
            "messageType": "pacs.008",
            "name": "FI To FI Customer Credit Transfer",
            "description": "Payment instruction message",
            "sample_xml": """<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.13">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>PACS008-2026-0203-001</MsgId>
      <CreDtTm>2026-02-03T10:30:05Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>INGA</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <EndToEndId>E2E-2026-0203-001</EndToEndId>
        <TxId>TXN-2026-0203-001</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="THB">26452.10</IntrBkSttlmAmt>
      <ChrgBr>SHAR</ChrgBr>
      <Dbtr>
        <Nm>JOHN DOE</Nm>
      </Dbtr>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>DBSSSGSG</BICFI>
        </FinInstnId>
      </DbtrAgt>
      <CdtrAgt>
        <FinInstnId>
          <BICFI>KASITHBK</BICFI>
        </FinInstnId>
      </CdtrAgt>
      <Cdtr>
        <Nm>SOMCHAI THONGCHAI</Nm>
      </Cdtr>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>"""
        },
        "pacs.002": {
            "messageType": "pacs.002",
            "name": "Payment Status Report",
            "description": "Payment confirmation/rejection status",
            "sample_xml": """<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.002.001.10">
  <FIToFIPmtStsRpt>
    <GrpHdr>
      <MsgId>PACS002-2026-0203-001</MsgId>
      <CreDtTm>2026-02-03T10:30:10Z</CreDtTm>
    </GrpHdr>
    <TxInfAndSts>
      <OrgnlEndToEndId>E2E-2026-0203-001</OrgnlEndToEndId>
      <OrgnlTxId>TXN-2026-0203-001</OrgnlTxId>
      <TxSts>ACCC</TxSts>
      <StsRsnInf>
        <Rsn>
          <Cd>0000</Cd>
        </Rsn>
        <AddtlInf>Payment completed successfully</AddtlInf>
      </StsRsnInf>
      <AccptncDtTm>2026-02-03T10:30:10Z</AccptncDtTm>
    </TxInfAndSts>
  </FIToFIPmtStsRpt>
</Document>"""
        },
        "acmt.023": {
            "messageType": "acmt.023",
            "name": "Identification Verification Request",
            "description": "Proxy resolution request sent to PDO",
            "sample_xml": """<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:acmt.023.001.03">
  <IdVrfctnReq>
    <Assgnmt>
      <MsgId>ACMT023-2026-0203-001</MsgId>
      <CreDtTm>2026-02-03T10:30:00Z</CreDtTm>
      <Assgnr>
        <Pty>
          <Id>
            <OrgId>
              <LEI>529900T8BM49AURSDO55</LEI>
            </OrgId>
          </Id>
        </Pty>
      </Assgnr>
      <Assgne>
        <Pty>
          <Id>
            <OrgId>
              <Othr>
                <Id>NEXUSGW</Id>
              </Othr>
            </OrgId>
          </Id>
        </Pty>
      </Assgne>
    </Assgnmt>
    <Vrfctn>
      <Id>+66812345678</Id>
      <Tp>MOBL</Tp>
    </Vrfctn>
  </IdVrfctnReq>
</Document>"""
        },
        "acmt.024": {
            "messageType": "acmt.024",
            "name": "Identification Verification Report",
            "description": "Proxy resolution response from PDO",
            "sample_xml": """<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:acmt.024.001.03">
  <IdVrfctnRpt>
    <Assgnmt>
      <MsgId>ACMT024-2026-0203-001</MsgId>
      <CreDtTm>2026-02-03T10:30:01Z</CreDtTm>
    </Assgnmt>
    <Rpt>
      <OrgnlId>REQ20260204-999</OrgnlId>
      <Vrfctn>true</Vrfctn>
      <UpdtdPtyAndAcctId>
        <Pty><Nm>Jane Smith</Nm></Pty>
        <Acct>
          <Id><Othr><Id>0987654321</Id></Othr></Id>
        </Acct>
        <Agt><FinInstnId><BICFI>BKKBTHBK</BICFI></FinInstnId></Agt>
      </UpdtdPtyAndAcctId>
    </Rpt>
  </IdVrfctnRpt>
</Document>"""
        },
        "camt.054": {
            "messageType": "camt.054",
            "name": "Bank to Customer Debit/Credit Notification",
            "description": "Reconciliation report for IPS Operators",
            "sample_xml": """<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.054.001.08">
  <BkToCstmrDbtCdtNtfctn>
    <GrpHdr>
      <MsgId>RECON-20260204</MsgId>
      <CreDtTm>2026-02-04T23:59:59Z</CreDtTm>
    </GrpHdr>
    <Ntfctn>
      <Id>RECON-001</Id>
      <CreDtTm>2026-02-04T23:59:59Z</CreDtTm>
      <Ntry>
        <Amt Ccy="SGD">1000.00</Amt>
        <Sts>BOOK</Sts>
        <BkTxCd>
          <Domn>
            <Cd>PMNT</Cd>
            <Fmly><Cd>ICDT</Cd></Fmly>
          </Domn>
        </BkTxCd>
      </Ntry>
    </Ntfctn>
  </BkToCstmrDbtCdtNtfctn>
</Document>"""
        },
        "camt.103": {
            "messageType": "camt.103",
            "name": "Create Reservation",
            "description": "Liquidity reservation request (Method 2a)",
            "sample_xml": """<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.103.001.03">
  <CretRsvatn>
    <GrpHdr>
      <MsgId>RSV20260204-001</MsgId>
      <CreDtTm>2026-02-04T18:00:02Z</CreDtTm>
    </GrpHdr>
    <RsvatnId>RSV-TX-001</RsvatnId>
    <CurRsvatn>
      <Amt Ccy="THB">25000.00</Amt>
      <Tp><Cd>AVLB</Cd></Tp>
    </CurRsvatn>
  </CretRsvatn>
</Document>"""
        },
        "pain.001": {
            "messageType": "pain.001",
            "name": "Customer Credit Transfer Initiation",
            "description": "Payment initiation request (Method 3)",
            "sample_xml": """<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.11">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>INIT20260204-123</MsgId>
      <CreDtTm>2026-02-04T18:00:03Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <InitgPty><Nm>Destination IPS</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>P-INIT-01</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <Dbtr><Nm>FXP ALPHA</Nm></Dbtr>
      <CdtTrfTxInf>
        <PmtId><EndToEndId>E2E-01</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="THB">25000.00</InstdAmt></Amt>
      </CdtTrfTxInf>
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>"""
        },
        "pacs.004": {
            "messageType": "pacs.004",
            "name": "Payment Return",
            "description": "Return of funds (reversal)",
            "sample_xml": """<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.004.001.11">
  <PmtRtr>
    <GrpHdr>
      <MsgId>RET20260204-001</MsgId>
      <CreDtTm>2026-02-04T18:30:00Z</CreDtTm>
    </GrpHdr>
    <TxInf>
      <RtrId>RTR-01</RtrId>
      <OrgnlUETR>91398cbd-0838-453f-b2c7-536e829f2b8e</OrgnlUETR>
      <RtrdIntrBkSttlmAmt Ccy="SGD">1000.00</RtrdIntrBkSttlmAmt>
      <RtrRsnInf><Rsn><Cd>CUST</Cd></Rsn></RtrRsnInf>
    </TxInf>
  </PmtRtr>
</Document>"""
        },
        "pacs.028": {
            "messageType": "pacs.028",
            "name": "FI To FI Payment Status Request",
            "description": "Status enquiry for a transaction",
            "sample_xml": """<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.028.001.05">
  <FIToFIPmtStsReq>
    <GrpHdr>
      <MsgId>QRY20260204-01</MsgId>
      <CreDtTm>2026-02-04T18:05:00Z</CreDtTm>
    </GrpHdr>
    <TxInf>
      <OrgnlUETR>91398cbd-0838-453f-b2c7-536e829f2b8e</OrgnlUETR>
      <InstgAgt><FinInstnId><BICFI>DBSGSGSG</BICFI></FinInstnId></InstgAgt>
    </TxInf>
  </FIToFIPmtStsReq>
</Document>"""
        },
        "camt.056": {
            "messageType": "camt.056",
            "name": "FI To FI Payment Cancellation Request",
            "description": "Request to cancel an incorrect payment",
            "sample_xml": """<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.056.001.10">
  <FIToFIPmtCxlReq>
    <GrpHdr>
      <MsgId>RCL20260204-01</MsgId>
      <CreDtTm>2026-02-04T19:00:00Z</CreDtTm>
    </GrpHdr>
    <Underlyg>
      <TxInf>
        <OrgnlUETR>91398cbd-0838-453f-b2c7-536e829f2b8e</OrgnlUETR>
        <CxlRsnInf><Rsn><Cd>DUPL</Cd></Rsn></CxlRsnInf>
      </TxInf>
    </Underlyg>
  </FIToFIPmtCxlReq>
</Document>"""
        },
        "camt.029": {
            "messageType": "camt.029",
            "name": "Resolution Of Investigation",
            "description": "Response to a cancellation request",
            "sample_xml": """<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.029.001.11">
  <RsltnOfInvstgtn>
    <Assgnmt>
      <MsgId>RSP20260204-01</MsgId>
      <CreDtTm>2026-02-04T19:15:00Z</CreDtTm>
    </Assgnmt>
    <Sts><Conf>RJCR</Conf></Sts>
    <CxlDetails>
      <TxInfAndSts>
        <OrgnlUETR>91398cbd-0838-453f-b2c7-536e829f2b8e</OrgnlUETR>
        <CxlStsId>RJCR</CxlStsId>
      </TxInfAndSts>
    </CxlDetails>
  </RsltnOfInvstgtn>
</Document>"""
        },
    }


# pacs.008 endpoint now handled by modular pacs008.py router
# (included via router.include_router above)


# acmt.023 / acmt.024 endpoints now handled by modular routers
# (Identification Verification Request / Report)



# pacs.008, pain.001, camt.103, etc. are now handled by modular routers
# (included via router.include_router above)

