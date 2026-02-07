"""
ISO 20022 Message Templates API

Provides sample XML messages for the frontend "Load Template" functionality.
Uses examples strictly aligned with Nexus specifications.
"""

from fastapi import APIRouter
from typing import Dict

from ..schemas import Iso20022Template

router = APIRouter()

# =============================================================================
# Template Data
# =============================================================================

TEMPLATES: Dict[str, Iso20022Template] = {
    "pacs.008": Iso20022Template(
        messageType="pacs.008",
        name="Standard Payment Instruction",
        description="Release 1 happy path payment from Source PSP to Destination PSP via Nexus.",
        sample_xml="""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.13">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>MSG20260204-001</MsgId>
      <CreDtTm>2026-02-04T18:00:00Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
        <ClrSys>
          <Prtry>NEXUS</Prtry>
        </ClrSys>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>INSTR-001</InstrId>
        <EndToEndId>E2E-001</EndToEndId>
        <TxId>TX-001</TxId>
        <UETR>91398cbd-0838-453f-b2c7-536e829f2b8e</UETR>
      </PmtId>
      <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
      <AccptncDtTm>2026-02-04T18:00:00Z</AccptncDtTm>
      <XchgRate>1.345</XchgRate>
      <ChrgBr>SHAR</ChrgBr>
      <InstgAgt>
        <FinInstnId><BICFI>DBSSSGSG</BICFI></FinInstnId>
      </InstgAgt>
      <InstdAgt>
        <FinInstnId><BICFI>KASITHBK</BICFI></FinInstnId>
      </InstdAgt>
      <Dbtr>
        <Nm>John Doe</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id><Othr><Id>1234567890</Id></Othr></Id>
      </DbtrAcct>
      <Cdtr>
        <Nm>Jane Smith</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id><Othr><Id>0987654321</Id></Othr></Id>
      </CdtrAcct>
      <Purp>
        <Cd>OTHR</Cd>
      </Purp>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>"""
    ),
    "pacs.002.ACCC": Iso20022Template(
        messageType="pacs.002",
        name="Status Report (Accepted)",
        description="Positive acknowledgement (ACCC) indicating successful settlement.",
        sample_xml="""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.002.001.15">
  <FIToFIPmtStsRpt>
    <GrpHdr>
      <MsgId>RPT20260204-001</MsgId>
      <CreDtTm>2026-02-04T18:00:05Z</CreDtTm>
    </GrpHdr>
    <TxInfAndSts>
      <OrgnlMsgId>MSG20260204-001</OrgnlMsgId>
      <OrgnlUETR>91398cbd-0838-453f-b2c7-536e829f2b8e</OrgnlUETR>
      <TxSts>ACCC</TxSts>
    </TxInfAndSts>
  </FIToFIPmtStsRpt>
</Document>"""
    ),
    "pacs.002.RJCT": Iso20022Template(
        messageType="pacs.002",
        name="Status Report (Rejected)",
        description="Negative acknowledgement (RJCT) with reason code.",
        sample_xml="""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.002.001.15">
  <FIToFIPmtStsRpt>
    <GrpHdr>
      <MsgId>RPT20260204-002</MsgId>
      <CreDtTm>2026-02-04T18:00:05Z</CreDtTm>
    </GrpHdr>
    <TxInfAndSts>
      <OrgnlMsgId>MSG20260204-001</OrgnlMsgId>
      <OrgnlUETR>91398cbd-0838-453f-b2c7-536e829f2b8e</OrgnlUETR>
      <TxSts>RJCT</TxSts>
      <StsRsnInf>
        <Rsn><Cd>AC04</Cd></Rsn>
        <AddtlInf>Closed Account Number</AddtlInf>
      </StsRsnInf>
    </TxInfAndSts>
  </FIToFIPmtStsRpt>
</Document>"""
    ),
    "acmt.023": Iso20022Template(
        messageType="acmt.023",
        name="Proxy Resolution Request",
        description="Request to resolve a proxy (Mobile/Email) to IBAN/Account details.",
        sample_xml="""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:acmt.023.001.04">
  <IdVrfctnReq>
    <Assgnmt>
      <MsgId>REQ20260204-999</MsgId>
      <CreDtTm>2026-02-04T18:00:00Z</CreDtTm>
    </Assgnmt>
    <Vrfctn>
      <Id>RESOLVE-001</Id>
      <PtyAndAcctId>
        <Acct>
          <Prxy>
            <Tp><Cd>MBNO</Cd></Tp>
            <Id>+66812345678</Id>
          </Prxy>
        </Acct>
      </PtyAndAcctId>
    </Vrfctn>
  </IdVrfctnReq>
</Document>"""
    ),
    "pain.001": Iso20022Template(
        messageType="pain.001",
        name="Payment Initiation (SAP)",
        description="Corporate to Bank payment initiation (SAP Integration Method 3).",
        sample_xml="""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.12">
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
      <ReqdExctnDt><Dt>2026-02-04</Dt></ReqdExctnDt>
      <Dbtr><Nm>FXP ALPHA</Nm></Dbtr>
      <DbtrAcct>
        <Id><Othr><Id>FX-ACCT-777</Id></Othr></Id>
      </DbtrAcct>
      <DbtrAgt><FinInstnId><BICFI>SAPSSSGSG</BICFI></FinInstnId></DbtrAgt>
      <CdtTrfTxInf>
        <PmtId><EndToEndId>E2E-01</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="THB">25000.00</InstdAmt></Amt>
        <Cdtr><Nm>Jane Smith</Nm></Cdtr>
        <CdtrAcct>
          <Id><Othr><Id>0987654321</Id></Othr></Id>
        </CdtrAcct>
      </CdtTrfTxInf>
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>"""
    ),
    "camt.056": Iso20022Template(
        messageType="camt.056",
        name="Recall Request",
        description="Request to cancel a settled payment (Retraction).",
        sample_xml="""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.056.001.11">
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
    )
}

# =============================================================================
# Endpoints
# =============================================================================

@router.get(
    "/templates",
    response_model=Dict[str, Iso20022Template],
    summary="Get ISO 20022 Message Templates",
    description="Retrieve a dictionary of sample XML templates for supported ISO 20022 message types.",
)
async def get_templates() -> Dict[str, Iso20022Template]:
    """Get all available message templates."""
    return TEMPLATES
