# Nexus ISO 20022 Message Examples

This document provides concrete XML examples for all 11 ISO 20022 message types supported by the Nexus Sandbox. These examples follow the Nexus technical specifications exactly.

## Table of Contents
1. [pacs.008.001.08 - Payment Instruction](#pacs008)
2. [pacs.002.001.10 - Payment Status Report](#pacs002)
3. [acmt.023.001.03 - Proxy Resolution Request](#acmt023)
4. [acmt.024.001.03 - Proxy Resolution Report](#acmt024)
5. [camt.054.001.08 - Reconciliation Report](#camt054)
6. [camt.103.001.03 - Create Reservation](#camt103)
7. [pain.001.001.11 - Payment Initiation](#pain001)
8. [pacs.004.001.11 - Payment Return](#pacs004)
9. [pacs.028.001.05 - Payment Status Request](#pacs028)
10. [camt.056.001.10 - Recall Request](#camt056)
11. [camt.029.001.11 - Recall Response](#camt029)

---

<a name="pacs008"></a>
## 1. pacs.008.001.08 - Payment Instruction
**Purpose:** Sent from Source PSP to Nexus (via Source IPS) to initiate a cross-border payment.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
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
        <FinInstnId><BICFI>DBSGSGSG</BICFI></FinInstnId>
      </InstgAgt>
      <InstdAgt>
        <FinInstnId><BICFI>BKKBTHBK</BICFI></FinInstnId>
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
</Document>
```

---

<a name="pacs002"></a>
## 2. pacs.002.001.10 - Payment Status Report
**Purpose:** Returned by Destination PSP/IPS to acknowledge or reject the payment.

### Happy Path (ACCC)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.002.001.10">
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
</Document>
```

---

<a name="acmt023"></a>
## 3. acmt.023.001.03 - Proxy Resolution Request
**Purpose:** Sent from Source PSP to Nexus to resolve a mobile/email proxy to account details.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:acmt.023.001.03">
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
</Document>
```

---

<a name="acmt024"></a>
## 4. acmt.024.001.03 - Proxy Resolution Report
**Purpose:** Returned by Nexus (via PDO) to provide account numbers and beneficiary names.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:acmt.024.001.03">
  <IdVrfctnRpt>
    <Assgnmt>
      <MsgId>RPT20260204-999</MsgId>
      <CreDtTm>2026-02-04T18:00:01Z</CreDtTm>
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
</Document>
```

---

<a name="camt054"></a>
## 5. camt.054.001.08 - Reconciliation Report
**Purpose:** Sent from Nexus Gateway to IPS Operators for end-of-day settlement reconciliation.

```xml
<?xml version="1.0" encoding="UTF-8"?>
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
        <NtryDt><Dt>2026-02-04</Dt></NtryDt>
      </Ntry>
    </Ntfctn>
  </BkToCstmrDbtCdtNtfctn>
</Document>
```

---

<a name="camt103"></a>
## 6. camt.103.001.03 - Create Reservation
**Purpose:** SAP Integration Method 2a - Used by Destination IPS to authorize a debit from FXP account at SAP.

```xml
<?xml version="1.0" encoding="UTF-8"?>
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
</Document>
```

---

<a name="pain001"></a>
## 7. pain.001.001.11 - Payment Initiation
**Purpose:** SAP Integration Method 3 - Destination IPS acts as a corporate client to initiate payment via SAP's corporate API.

```xml
<?xml version="1.0" encoding="UTF-8"?>
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
</Document>
```

---

<a name="pacs004"></a>
## 8. pacs.004.001.11 - Payment Return
**Purpose:** Formal payment return message (Future Roadmap). *Note: Release 1 uses pacs.008.*

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.004.001.11">
  <PmtRtr>
    <GrpHdr>
      <MsgId>RET20260204-001</MsgId>
      <CreDtTm>2026-02-04T18:30:00Z</CreDtTm>
    </GrpHdr>
    <OrgnlGrpInf>
      <OrgnlMsgId>MSG20260204-001</OrgnlMsgId>
      <OrgnlMsgNmId>pacs.008.001.08</OrgnlMsgNmId>
    </OrgnlGrpInf>
    <TxInf>
      <RtrId>RTR-01</RtrId>
      <OrgnlUETR>91398cbd-0838-453f-b2c7-536e829f2b8e</OrgnlUETR>
      <RtrdIntrBkSttlmAmt Ccy="SGD">1000.00</RtrdIntrBkSttlmAmt>
      <RtrRsnInf><Rsn><Cd>CUST</Cd></Rsn></RtrRsnInf>
    </TxInf>
  </PmtRtr>
</Document>
```

---

<a name="pacs028"></a>
## 9. pacs.028.001.05 - Payment Status Request
**Purpose:** Sent to Nexus to request current status if pacs.002 is not received (Future Roadmap).

```xml
<?xml version="1.0" encoding="UTF-8"?>
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
</Document>
```

---

<a name="camt056"></a>
## 10. camt.056.001.10 - Recall Request
**Purpose:** Sent after settlement to request retrieval of funds (Retraction/Cancellation).

```xml
<?xml version="1.0" encoding="UTF-8"?>
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
</Document>
```

---

<a name="camt029"></a>
## 11. camt.029.001.11 - Recall Response
**Purpose:** Response to camt.056 indicating if recall was accepted or rejected.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.029.001.11">
  <RsltnOfInvstgtn>
    <Assgnmt>
      <MsgId>RSP20260204-01</MsgId>
      <CreDtTm>2026-02-04T19:15:00Z</CreDtTm>
    </Assgnmt>
    <Sts><Conf>RJCR</Conf></Sts> <!-- RJCR = Rejected Cancellation Request -->
    <CxlDetails>
      <TxInfAndSts>
        <OrgnlUETR>91398cbd-0838-453f-b2c7-536e829f2b8e</OrgnlUETR>
        <CxlStsId>RJCR</CxlStsId>
        <AddtlRgaInf>Funds already withdrawn by beneficiary</AddtlRgaInf>
      </TxInfAndSts>
    </CxlDetails>
  </RsltnOfInvstgtn>
</Document>
```
