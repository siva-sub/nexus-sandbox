"""
ISO 20022 Message Builders for Nexus Sandbox.
Generates XML messages for testing and integration.
Standardized 2026-02-08 for 100% XSD Schema Compliance.
"""

from datetime import datetime, timezone

def build_pain001(
    uetr: str,
    amount: float,
    currency: str,
    debtor_name: str,
    debtor_account: str,
    debtor_bic: str,
    creditor_name: str,
    creditor_account: str,
    creditor_bic: str
) -> str:
    """Build pain.001 Customer Credit Transfer Initiation."""
    now = datetime.now(timezone.utc).isoformat()
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    msg_id = f"PAIN001-{uetr[:8]}-{int(datetime.now(timezone.utc).timestamp())}"
    
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.12">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>{msg_id}</MsgId>
      <CreDtTm>{now}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <InitgPty>
        <Nm>Nexus Sandbox</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>{uetr}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>1</NbOfTxs>
      <CtrlSum>{amount:.2f}</CtrlSum>
      <ReqdExctnDt>
        <Dt>{today}</Dt>
      </ReqdExctnDt>
      <Dbtr>
        <Nm>{debtor_name}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>{debtor_account}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>{debtor_bic}</BICFI>
        </FinInstnId>
      </DbtrAgt>
      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>{uetr}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="{currency}">{amount:.2f}</InstdAmt>
        </Amt>
        <CdtrAgt>
          <FinInstnId>
            <BICFI>{creditor_bic}</BICFI>
          </FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>{creditor_name}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>{creditor_account}</IBAN>
          </Id>
        </CdtrAcct>
      </CdtTrfTxInf>
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>"""


def build_camt103(
    uetr: str,
    amount: float,
    currency: str,
    reservation_id: str = None
) -> str:
    """Build camt.103 Create Reservation."""
    now = datetime.now(timezone.utc).isoformat()
    msg_id = f"CAMT103-{uetr[:8]}-{int(datetime.now(timezone.utc).timestamp())}"
    rsv_id = reservation_id or f"RSV-{uetr[:8]}"
    
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.103.001.03">
  <CretRsvatn>
    <MsgHdr>
      <MsgId>{msg_id}</MsgId>
      <CreDtTm>{now}</CreDtTm>
    </MsgHdr>
    <RsvatnId>
      <RsvatnId>{rsv_id}</RsvatnId>
      <Tp><Cd>CARE</Cd></Tp>
    </RsvatnId>
    <ValSet>
      <Amt>
        <AmtWthCcy Ccy="{currency}">{amount:.2f}</AmtWthCcy>
      </Amt>
    </ValSet>
  </CretRsvatn>
</Document>"""


def build_pacs004(
    uetr: str,
    original_uetr: str,
    amount: float,
    currency: str,
    return_reason: str = "NARR"
) -> str:
    """Build pacs.004 Payment Return."""
    now = datetime.now(timezone.utc).isoformat()
    msg_id = f"PACS004-{uetr[:8]}-{int(datetime.now(timezone.utc).timestamp())}"
    
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.004.001.14">
  <PmtRtr>
    <GrpHdr>
      <MsgId>{msg_id}</MsgId>
      <CreDtTm>{now}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <TxInf>
      <RtrId>{uetr}</RtrId>
      <OrgnlEndToEndId>{original_uetr}</OrgnlEndToEndId>
      <OrgnlTxId>{original_uetr}</OrgnlTxId>
      <RtrdIntrBkSttlmAmt Ccy="{currency}">{amount:.2f}</RtrdIntrBkSttlmAmt>
      <RtrRsnInf>
        <Rsn>
          <Cd>{return_reason}</Cd>
        </Rsn>
      </RtrRsnInf>
    </TxInf>
  </PmtRtr>
</Document>"""


def build_pacs028(
    request_id: str,
    original_uetr: str
) -> str:
    """Build pacs.028 Payment Status Request."""
    now = datetime.now(timezone.utc).isoformat()
    msg_id = f"PACS028-{request_id[:8]}-{int(datetime.now(timezone.utc).timestamp())}"
    
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.028.001.06">
  <FIToFIPmtStsReq>
    <GrpHdr>
      <MsgId>{msg_id}</MsgId>
      <CreDtTm>{now}</CreDtTm>
    </GrpHdr>
    <TxInf>
      <StsReqId>{request_id}</StsReqId>
      <OrgnlEndToEndId>{original_uetr}</OrgnlEndToEndId>
      <OrgnlTxId>{original_uetr}</OrgnlTxId>
    </TxInf>
  </FIToFIPmtStsReq>
</Document>"""


def build_camt056(
    uetr: str,
    original_uetr: str,
    reason_code: str = "DUPL",
    reason_desc: str = "Duplicate payment"
) -> str:
    """Build camt.056 Payment Cancellation Request."""
    now = datetime.now(timezone.utc).isoformat()
    msg_id = f"CAMT056-{uetr[:8]}-{int(datetime.now(timezone.utc).timestamp())}"
    case_id = f"CASE-{uetr[:8]}"
    
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.056.001.11">
  <FIToFIPmtCxlReq>
    <Assgnmt>
      <Id>{msg_id}</Id>
      <Assgnr>
        <Agt><FinInstnId><BICFI>NEXUSGSG</BICFI></FinInstnId></Agt>
      </Assgnr>
      <Assgne>
        <Agt><FinInstnId><BICFI>NEXUSGSG</BICFI></FinInstnId></Agt>
      </Assgne>
      <CreDtTm>{now}</CreDtTm>
    </Assgnmt>
    <Case>
      <Id>{case_id}</Id>
      <Cretr>
        <Agt><FinInstnId><BICFI>NEXUSGSG</BICFI></FinInstnId></Agt>
      </Cretr>
    </Case>
    <Undrlyg>
      <TxInf>
        <OrgnlEndToEndId>{original_uetr}</OrgnlEndToEndId>
        <OrgnlTxId>{original_uetr}</OrgnlTxId>
        <CxlRsnInf>
          <Rsn>
            <Cd>{reason_code}</Cd>
          </Rsn>
          <AddtlInf>{reason_desc}</AddtlInf>
        </CxlRsnInf>
      </TxInf>
    </Undrlyg>
  </FIToFIPmtCxlReq>
</Document>"""


def build_camt029(
    original_msg_id: str,
    status_code: str = "CNCL",
    status_desc: str = "Cancellation accepted"
) -> str:
    """Build camt.029 Resolution of Investigation."""
    now = datetime.now(timezone.utc).isoformat()
    msg_id = f"CAMT029-{original_msg_id[:8]}-{int(datetime.now(timezone.utc).timestamp())}"
    
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.029.001.13">
  <RsltnOfInvstgtn>
    <Assgnmt>
      <Id>{msg_id}</Id>
      <Assgnr>
        <Agt><FinInstnId><BICFI>NEXUSGSG</BICFI></FinInstnId></Agt>
      </Assgnr>
      <Assgne>
        <Agt><FinInstnId><BICFI>NEXUSGSG</BICFI></FinInstnId></Agt>
      </Assgne>
      <CreDtTm>{now}</CreDtTm>
    </Assgnmt>
    <Sts>
      <Conf>{status_code}</Conf>
    </Sts>
    <CxlDtls>
      <TxInfAndSts>
        <OrgnlGrpInf>
          <OrgnlMsgId>{original_msg_id}</OrgnlMsgId>
          <OrgnlMsgNmId>pacs.008.001.13</OrgnlMsgNmId>
        </OrgnlGrpInf>
        <CxlStsRsnInf>
          <Rsn>
            <Prtry>{status_desc}</Prtry>
          </Rsn>
        </CxlStsRsnInf>
      </TxInfAndSts>
    </CxlDtls>
  </RsltnOfInvstgtn>
</Document>"""


def build_acmt023(
    identification_id: str,
    proxy_type: str,
    proxy_value: str,
    assigner_bic: str = "NEXUSGSG",
    assignee_bic: str = "NEXUSGSG"
) -> str:
    """Build acmt.023 Identification Verification Request."""
    now = datetime.now(timezone.utc).isoformat()
    msg_id = f"ACMT023-{identification_id[:8]}-{int(datetime.now(timezone.utc).timestamp())}"
    
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:acmt.023.001.04">
  <IdVrfctnReq>
    <Assgnmt>
      <MsgId>{msg_id}</MsgId>
      <CreDtTm>{now}</CreDtTm>
      <Assgnr>
        <Agt><FinInstnId><BICFI>{assigner_bic}</BICFI></FinInstnId></Agt>
      </Assgnr>
      <Assgne>
        <Agt><FinInstnId><BICFI>{assignee_bic}</BICFI></FinInstnId></Agt>
      </Assgne>
    </Assgnmt>
    <Vrfctn>
      <Id>{identification_id}</Id>
      <PtyAndAcctId>
        <Acct>
          <Id>
            <Othr>
              <Id>{proxy_value}</Id>
            </Othr>
          </Id>
          <Prxy>
            <Tp>
              <Cd>{proxy_type}</Cd>
            </Tp>
            <Id>{proxy_value}</Id>
          </Prxy>
        </Acct>
      </PtyAndAcctId>
    </Vrfctn>
  </IdVrfctnReq>
</Document>"""


def build_acmt024(
    original_msg_id: str,
    original_identification_id: str,
    verification_result: bool,
    resolved_iban: str = None,
    resolved_name: str = None,
    resolved_account_name: str = None,
    assigner_bic: str = "NEXUSGSG",
    assignee_bic: str = "NEXUSGSG"
) -> str:
    """Build acmt.024 Identification Verification Report."""
    now = datetime.now(timezone.utc).isoformat()
    msg_id = f"ACMT024-{original_identification_id[:8]}-{int(datetime.now(timezone.utc).timestamp())}"
    result_str = "true" if verification_result else "false"

    resolved_block = ""
    if verification_result and resolved_iban:
        party_name = resolved_name or resolved_account_name or "Unknown"
        account_display_name = resolved_account_name or resolved_name or "Unknown"
        resolved_block = f"""
      <UpdtdPtyAndAcctId>
        <Pty>
          <Nm>{party_name}</Nm>
        </Pty>
        <Acct>
          <Id>
            <IBAN>{resolved_iban}</IBAN>
          </Id>
          <Nm>{account_display_name}</Nm>
        </Acct>
      </UpdtdPtyAndAcctId>"""

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:acmt.024.001.04">
  <IdVrfctnRpt>
    <Assgnmt>
      <MsgId>{msg_id}</MsgId>
      <CreDtTm>{now}</CreDtTm>
      <Assgnr>
        <Agt><FinInstnId><BICFI>{assigner_bic}</BICFI></FinInstnId></Agt>
      </Assgnr>
      <Assgne>
        <Agt><FinInstnId><BICFI>{assignee_bic}</BICFI></FinInstnId></Agt>
      </Assgne>
    </Assgnmt>
    <OrgnlAssgnmt>
      <MsgId>{original_msg_id}</MsgId>
    </OrgnlAssgnmt>
    <Rpt>
      <OrgnlId>{original_identification_id}</OrgnlId>
      <Vrfctn>{result_str}</Vrfctn>{resolved_block}
    </Rpt>
  </IdVrfctnRpt>
</Document>"""


def build_pacs008(
    uetr: str,
    amount: float,
    source_currency: str,
    destination_currency: str,
    exchange_rate: float,
    debtor_name: str,
    debtor_account: str,
    debtor_bic: str,
    creditor_name: str,
    creditor_account: str,
    creditor_bic: str,
    quote_id: str,
    source_sap_bic: str,
    source_sap_account: str,
    destination_sap_bic: str,
    destination_sap_account: str,
    instruction_priority: str = "NORM",
    remittance_info: str = "",
    purpose_code: str = ""
) -> str:
    """Build pacs.008 FI to FI Customer Credit Transfer.
    
    Element order (CreditTransferTransaction70):
    PmtId -> PmtTpInf -> IntrBkSttlmAmt -> IntrBkSttlmDt -> SttlmPrty -> InstdAmt -> ChrgBr -> ChrgsInf -> InstgAgt -> InstdAgt -> Dbtr -> DbtrAcct -> DbtrAgt -> CdtrAgt -> Cdtr -> CdtrAcct -> Purp -> RmtInf
    """
    now = datetime.now(timezone.utc).isoformat()
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    msg_id = f"PACS008-{uetr[:8]}-{int(datetime.now(timezone.utc).timestamp())}"
    amount_str = f"{amount:.2f}"

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.13">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>{msg_id}</MsgId>
      <CreDtTm>{now}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>{uetr}</InstrId>
        <EndToEndId>{uetr}</EndToEndId>
        <TxId>{msg_id}</TxId>
        <UETR>{uetr}</UETR>
      </PmtId>
      <PmtTpInf>
        <InstrPrty>{instruction_priority}</InstrPrty>
        <ClrChanl>{'RTGS'}</ClrChanl>
        <SvcLvl>
          <Cd>SDVA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <IntrBkSttlmAmt Ccy="{source_currency}">{amount_str}</IntrBkSttlmAmt>
      <IntrBkSttlmDt>{today}</IntrBkSttlmDt>
      <SttlmPrty>NORM</SttlmPrty>
      <InstdAmt Ccy="{destination_currency}">{(amount * exchange_rate):.2f}</InstdAmt>
      <ChrgBr>SHAR</ChrgBr>
      <ChrgsInf>
        <Amt Ccy="{source_currency}">0.00</Amt>
        <Agt>
          <FinInstnId><BICFI>{debtor_bic}</BICFI></FinInstnId>
        </Agt>
      </ChrgsInf>
      <InstgAgt>
        <FinInstnId><BICFI>{debtor_bic}</BICFI></FinInstnId>
      </InstgAgt>
      <InstdAgt>
        <FinInstnId><BICFI>{source_sap_bic}</BICFI></FinInstnId>
      </InstdAgt>
      <Dbtr>
        <Nm>{debtor_name}</Nm>
        <PstlAdr><Ctry>SG</Ctry></PstlAdr>
      </Dbtr>
      <DbtrAcct>
        <Id><Othr><Id>{debtor_account}</Id></Othr></Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId><BICFI>{source_sap_bic}</BICFI></FinInstnId>
      </DbtrAgt>
      <CdtrAgt>
        <FinInstnId><BICFI>{destination_sap_bic}</BICFI></FinInstnId>
      </CdtrAgt>
      <Cdtr>
        <Nm>{creditor_name}</Nm>
        <PstlAdr><Ctry>TH</Ctry></PstlAdr>
      </Cdtr>
      <CdtrAcct>
        <Id><Othr><Id>{creditor_account}</Id></Othr></Id>
      </CdtrAcct>
      <Purp>
        <Cd>{purpose_code or 'OTHR'}</Cd>
      </Purp>
      <RmtInf>
        <Ustrd>{remittance_info or f"NEXUSUETR|{uetr}"}</Ustrd>
      </RmtInf>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>"""
