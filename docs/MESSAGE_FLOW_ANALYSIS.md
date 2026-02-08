# Nexus ISO 20022 Message Flow Analysis

## Executive Summary

This document provides a comprehensive technical analysis of the ISO 20022 message flows in the Nexus Global Payments Sandbox, mapped against the [official Nexus documentation](https://docs.nexusglobalpayments.org). It covers the complete 17-step payment lifecycle, all supported message types, actor responsibilities, fee mechanics, settlement models, error handling, and message transformation rules.

**Status:** ✅ Compliant with official Nexus specification (v2025)

---

## 1. System Architecture Overview

### 1.1 Actor Topology

Nexus operates as a multilateral gateway connecting domestic Instant Payment Systems (IPSs) across different countries. Each cross-border payment involves up to **7 actor types**:

```
┌──────────────────────── SOURCE COUNTRY ────────────────────────┐     ┌───────┐     ┌─────────────────── DESTINATION COUNTRY ────────────────┐
│                                                                │     │       │     │                                                        │
│  ┌────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐   │     │ NEXUS │     │  ┌──────────┐    ┌──────────┐    ┌──────────┐           │
│  │ Sender │───▶│ Source   │───▶│ Source   │───▶│ Source   │───┼────▶│GATEWAY│────▶│──│ Dest     │───▶│ Dest     │───▶│ Dest     │──▶Recipient│
│  │(Debtor)│    │ PSP      │    │ IPS/IPSO │    │ SAP      │   │     │       │     │  │ SAP      │    │ IPS/IPSO │    │ PSP      │           │
│  └────────┘    └──────────┘    └──────────┘    └──────────┘   │     └───┬───┘     │  └──────────┘    └──────────┘    └──────────┘           │
│                                                                │         │         │                                                        │
│                    ┌──────┐    ┌──────┐                        │         │         │                    ┌──────┐                             │
│                    │ FXP  │    │ PDO  │                        │         │         │                    │ PDO  │                             │
│                    └──────┘    └──────┘                        │         ▼         │                    └──────┘                             │
└────────────────────────────────────────────────────────────────┘   Coordination    └────────────────────────────────────────────────────────┘
```

### 1.2 Actor Roles and Responsibilities

| Actor | Full Name | Role | Key Responsibilities |
|-------|-----------|------|---------------------|
| **PSP** | Payment Service Provider | Send/receive payments | Fee display, sanctions screening, recipient confirmation, pacs.008 construction |
| **FXP** | FX Provider | Currency conversion | Provide live rates, honor quotes for 600s, hold nostro accounts at SAPs |
| **SAP** | Settlement Access Provider | IPS access for FXPs | Direct IPS membership, real-time screening, nostro account management |
| **PDO** | Proxy Directory Operator | Proxy lookup | Account resolution, display name provision, proxy registration |
| **IPSO** | IPS Operator | Operate domestic IPS | Message translation, settlement certainty, Nexus connectivity |
| **Nexus** | Nexus Gateway | Multilateral hub | Message transformation, FX validation, routing, quote management |

### 1.3 Actor Registration Requirements

**PSP Requirements:**
- Must be member of domestic IPS
- Must sign Nexus addendum to domestic scheme rulebook
- Must implement transparency requirements for upfront fee display
- Must support proxy/account resolution (acmt.023/024)
- Must perform sanctions screening (FATF R16)

**FXP Requirements:**
- Must hold accounts at SAPs in both Source and Destination countries
- Must register accounts with Nexus (locked to specific FXP)
- Must provide live FX rates via API or Service Desk
- Must honor quotes for minimum 600 seconds
- Should operate 24/7 (exceptions for smaller institutions)

**SAP Requirements:**
- Must have **direct** IPS membership (no indirect/sponsored access)
- Must support real-time sanctions screening
- Must NOT deduct fees from payment value (bill FXP separately)

---

## 2. Complete 17-Step Payment Lifecycle

### 2.1 Payment Setup Phase (Steps 1-12)

#### Steps 1-2: Country, Currency & Amount Selection

```
Sender ──▶ Source PSP ──GET /countries──▶ Nexus API
                       ◀── countries[] ──┘
```

1. Source PSP calls `GET /countries` to populate dropdown
2. Sender selects destination country and currency
3. Sender specifies EITHER:
   - **Amount to send** (Source Currency) — system calculates recipient amount
   - **Amount to receive** (Destination Currency) — system calculates debit amount

**API:** `GET /countries` → returns `countries[]` with `currencies[]`, `maxAmounts`, `requiredMessageElements`

#### Steps 3-6: Exchange Rate Quotation

```
Source PSP ──GET /quotes/{src}/{srcCcy}/{dst}/{dstCcy}/{amtCcy}/{amt}──▶ Nexus
           ◀── quotes[] (quoteId, exchangeRate, amounts, fees) ──────┘
```

1. Source PSP calls `GET /quotes` with:
   - `sourceCountry`, `sourceCurrency`, `destinationCountry`, `destinationCurrency`
   - `amountCurrency` (SRC or DST), `amount`
   - `finInstTypeId` & `finInstId` (PSP identifier for relationship-based rate improvements)

2. Nexus applies rate calculation pipeline:
   ```
   FXP Base Rate
   └── + Tier-based improvements (volume discounts)
       └── + PSP-based improvements (relationship pricing)
           └── Destination PSP Deducted Fee calculated
               └── Quote returned with all amounts in both currencies
   ```

3. Each quote includes:
   - `quoteId` (UUID, valid for **600 seconds**)
   - `exchangeRate`, `interbankSettlementAmount` (both currencies)
   - `chargesAmount` (D-PSP fee), `creditorAccountAmount` (final to recipient)
   - Intermediary agents (SAPs and FXP accounts)

4. **PSP auto-selects best quote** — per Nexus spec, the PSP does not need to show the quote list to the Sender

5. Source PSP calls `GET /quotes/{quoteId}/intermediary-agents` for FXP account details

#### Steps 7-9: Addressing & Proxy Resolution

```
Source PSP ──POST /iso20022/acmt023──▶ Nexus ──▶ Destination PDO
                                                       │
                                                       ▼ Lookup
                                                 Dest PSP validates
                                                       │
Source PSP ◀──acmt.024 (name, account, BIC)────────────┘
```

1. Source PSP calls `GET /countries/{code}/address-types-and-inputs` → form fields
2. Sender inputs proxy (mobile, email) or account details (IBAN, account number)
3. Source PSP sends `acmt.023.001.04` via `POST /iso20022/acmt023?acmt024Endpoint={callback}`
4. Nexus routes to:
   - **Proxy resolution:** PDO looks up proxy → returns linked account
   - **Account resolution:** Dest PSP validates account → returns holder details
5. `acmt.024.001.04` callback returns:
   - Verified account holder name (for Confirmation of Payee)
   - Account number and agent BIC
   - Display name for Sender's UI

**acmt.024 Error Codes:**

| Code | Meaning |
|------|---------|
| `AC01` | Incorrect Account Number |
| `AC04` | Account Closed |
| `AC06` | Account Blocked/Frozen |
| `BE23` | Proxy Not Registered |
| `AB08` | Destination PSP Offline |
| `AGNT` | PSP Not Onboarded to Nexus |
| `DUPL` | Duplicate Request |
| `FRAD` | Fraudulent Origin |
| `MD07` | Account Holder Deceased |
| `RC06` | Invalid Debtor BIC |
| `RC07` | Invalid Creditor BIC |
| `RR01` | Missing Sender Account/ID |
| `RR02` | Missing Sender Name/Address |

#### Steps 10-11: Sanctions Screening

| Actor | Screening Responsibility |
|-------|-------------------------|
| Source PSP | Screen Sender **before** submitting payment |
| Source SAP | Screen if required by local regulations |
| Destination SAP | Screen if required by local regulations |
| Destination PSP | Screen Recipient **before** crediting account |

Per FATF Recommendation 16 (Wire Transfers), the PSP must collect:
- Recipient Name (mandatory, from acmt.024)
- Account Number (mandatory)
- PLUS at least one of: Address, Date of Birth, or National ID

#### Step 12: Sender Approval (Pre-Transaction Disclosure)

Source PSP **MUST** display to Sender before approval:

| Item | Description |
|------|-------------|
| **Debit amount** | Exact amount to be debited from Sender's account (Source Currency) |
| **Credit amount** | Exact amount to be credited to Recipient's account (Dest Currency) |
| **Effective exchange rate** | Ratio: credit amount / debit amount |
| **Source PSP fees** | Any fees charged by Source PSP (invoiced or deducted) |
| **Recipient name** | Verified name from acmt.024 response |

**Two FX display options:**
- **Option A:** Show only Effective Exchange Rate (simplest)
- **Option B:** Show fees + defined exchange rate + effective rate (most transparent)

### 2.2 Payment Execution Phase (Steps 13-17)

#### Steps 13-14: Payment Instruction Construction

Source PSP constructs `pacs.008.001.13` with:

```xml
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.13">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>                <!-- Unique per sender, 2-month validity -->
      <CreDtTm>              <!-- UTC timestamp -->
      <NbOfTxs>1</NbOfTxs>   <!-- Always 1 for Nexus -->
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
        <ClrSys><Prtry>{IPS_CODE}</Prtry></ClrSys>  <!-- Mandatory: domestic IPS identifier -->
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>              <!-- Instruction ID (optional) -->
        <EndToEndId>           <!-- End-to-End ID -->
        <TxId>                 <!-- Transaction ID -->
        <UETR>                 <!-- Unique End-to-End Transaction Reference (UUID v4) -->
      </PmtId>
      <PmtTpInf>
        <InstrPrty>NORM|HIGH</InstrPrty>  <!-- Mandatory: payment priority -->
      </PmtTpInf>
      <IntrBkSttlmAmt Ccy="">    <!-- Interbank Settlement Amount (Source Currency) -->
      <IntrBkSttlmDt>            <!-- Settlement Date -->
      <AddtlDtTm>
        <AccptncDtTm>            <!-- Acceptance DateTime (UTC) -->
      </AddtlDtTm>
      <InstdAmt Ccy="">          <!-- Instructed Amount (Destination Currency) -->
      <XchgRate>                 <!-- Exchange Rate from quote -->
      <ChrgBr>SHAR</ChrgBr>     <!-- Charge Bearer -->
      <ChrgsInf>                 <!-- Source PSP Deducted Fee -->
      <ChrgsInf>                 <!-- Destination PSP Deducted Fee -->
      <InstgAgt>                 <!-- Instructing Agent (Source PSP) -->
      <InstdAgt>                 <!-- Instructed Agent (Source SAP) -->
      <IntrmyAgt1>               <!-- Source SAP -->
      <IntrmyAgt1Acct>           <!-- FXP Account at Source SAP -->
      <IntrmyAgt2>               <!-- Destination SAP -->
      <IntrmyAgt2Acct>           <!-- FXP Account at Destination SAP -->
      <Dbtr><Nm>                 <!-- Sender name + address -->
      <DbtrAcct>                 <!-- Sender account -->
      <DbtrAgt>                  <!-- Source PSP (BIC) -->
      <CdtrAgt>                  <!-- Destination PSP (BIC) -->
      <Cdtr><Nm>                 <!-- Recipient name -->
      <CdtrAcct>                 <!-- Recipient account -->
      <Purp><Cd>                 <!-- Purpose code (if required by destination) -->
      <RgltryRptg>               <!-- Regulatory reporting -->
        <DbtCdtRptgInd>BOTH</DbtCdtRptgInd>
        <Authrty><Nm>NEXUS</Nm></Authrty>
        <Dtls><Cd>QREF</Cd><Inf>{quoteId}</Inf></Dtls>
      </RgltryRptg>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>
```

#### Step 15: Source-Side Processing (4-Step Settlement)

```
Step  Source PSP    Source IPS         Source SAP         Nexus Gateway
────  ──────────   ──────────         ──────────         ─────────────
 1    ──pacs.008─▶│                   │                  │
 2                │──Validate────────▶│                  │
 3                │  Reserve funds    │                  │
 4                │◀─ACCC/RJCT───────│                  │
 5                │──────────────────▶│──pacs.008───────▶│
 6                │                   │                  │──Validate quote
 7                │                   │                  │──Transform msg
 8                │                   │                  │──Forward──▶(Dest)
```

**Settlement Mechanism:** Source IPS ensures settlement certainty via:
- **Reservation against prefund** — IPS reserves against S-PSP's prefunded position
- **Immediate settlement** — IPS settles before forwarding
- Must handle rejection even after settlement (in 4-step model)

#### Step 15 (continued): Destination-Side Processing

```
Step  Nexus Gateway  Dest IPS         Dest SAP           Dest PSP      Recipient
────  ─────────────  ────────         ────────           ────────      ─────────
 1    ──pacs.008───▶│                 │                  │             │
 2                  │─Validate───────▶│                  │             │
 3                  │                 │──Check liquidity─▶│             │
 4                  │                 │──Reserve funds───▶│             │
 5                  │                 │◀──ACCC───────────│             │
 6                  │◀───────────────│                  │             │
 7                  │────────────────│──────────────────│──pacs.008──▶│
 8                  │                │                  │──Sanctions──│
 9                  │                │                  │──Credit────▶│ ✓
10                  │                │                  │◀─ACCC──────│
11    ◀─pacs.002───│                │                  │             │
```

#### Steps 16-17: Settlement Completion and Confirmation

```
[Dest PSP] ──pacs.002 (ACCC)──▶ [Dest IPS] ──pacs.002──▶ [Nexus Gateway]
                                                                  │
[Source PSP] ◀──pacs.002 (ACCC)── [Source IPS] ◀──pacs.002──────┘

SAP Reservations: UTILIZED (debit finalized on both legs)
FXP Notification: Nexus notifies FXP of completed payment
Sender Notification: Source PSP confirms to Sender
```

---

## 3. Message Transformation by Nexus

> "Transformation" is different from translation. Whereas translation moves data unchanged from one format to another, **transformation may actually change the value of some elements**.

### 3.1 Transformation Operations

When Nexus receives a `pacs.008` from the Source IPS and before forwarding to the Destination IPS:

| Operation | Description |
|-----------|-------------|
| **Agent rotation** | Instructing/Instructed agents updated to reflect Destination-side actors |
| **Currency conversion** | `IntrBkSttlmAmt` converted from Source Currency to Destination Currency using the exchange rate from the quote |
| **Clearing system update** | `ClrSys/Prtry` updated from Source IPS identifier to Destination IPS identifier |
| **Intermediary agent swap** | IntrmyAgt1/2 updated to reflect Destination-side SAP routing |
| **Quote validation** | Exchange rate verified against the Nexus quote ID embedded in the message |

### 3.2 Agent Mapping — Source to Destination

| pacs.008 Element | Source Leg Value | Destination Leg Value |
|-----------------|-----------------|----------------------|
| `InstgAgt` | Source PSP | Nexus |
| `InstdAgt` | Source SAP | Destination SAP |
| `IntrmyAgt1` | Source SAP | Destination SAP |
| `IntrmyAgt1Acct` | FXP account at S-SAP | FXP account at D-SAP |
| `IntrmyAgt2` | Destination SAP | *(removed or updated)* |
| `ClrSys/Prtry` | Source IPS code (e.g., `SGFAST`) | Destination IPS code (e.g., `THBRT`) |

---

## 4. Fee Architecture

### 4.1 Fee Types

| Fee Type | Charged By | Collection Method | Deducted from Payment? |
|----------|-----------|-------------------|----------------------|
| Source PSP Invoiced Fee | Source PSP | Separate invoice to Sender | **No** |
| Source PSP Deducted Fee | Source PSP | Deducted before transfer to SAP | **Yes** |
| Destination PSP Deducted Fee | Dest PSP | Deducted before crediting Recipient | **Yes** |
| FXP Revenue | FX Provider | Built into exchange rate spread | No |
| SAP Fee | SAP | Billed to FXP outside Nexus | No |
| Nexus Scheme Fee | Nexus | Billed to Source IPSO | No |

### 4.2 Fee Calculation Logic

**When Sender defines amount in Source Currency:**
```
QuoteRequestAmount       = SenderAmount - SourcePSPDeductedFee
IntrBkSttlmAmt (SRC)    = QuoteRequestAmount
IntrBkSttlmAmt (DST)    = QuoteRequestAmount × ExchangeRate
CreditorAccountAmount    = IntrBkSttlmAmt(DST) - DestPSPDeductedFee
```

**When Sender defines amount in Destination Currency:**
```
IntrBkSttlmAmt (DST)    = RecipientAmount + DestPSPDeductedFee
IntrBkSttlmAmt (SRC)    = IntrBkSttlmAmt(DST) / ExchangeRate
DebtorAccountAmount      = IntrBkSttlmAmt(SRC) + SourcePSPDeductedFee
```

### 4.3 Charges Information in pacs.008

Two `ChrgsInf` iterations are mandatory:

```xml
<ChrgBr>SHAR</ChrgBr>
<!-- Iteration 1: Source PSP Deducted Fee -->
<ChrgsInf>
  <Amt Ccy="{SourceCurrency}">{SourcePSPDeductedFee}</Amt>
  <Agt><FinInstnId><BICFI>{SourcePSPBIC}</BICFI></FinInstnId></Agt>
</ChrgsInf>
<!-- Iteration 2: Destination PSP Deducted Fee -->
<ChrgsInf>
  <Amt Ccy="{DestCurrency}">{DestPSPDeductedFee}</Amt>
  <Agt><FinInstnId><BICFI>{DestPSPBIC}</BICFI></FinInstnId></Agt>
</ChrgsInf>
```

> **Critical:** The Destination PSP Deducted Fee formula is set at **country level** in the Nexus Scheme Rulebook, changes monthly, and **MUST NOT** be hardcoded by the Source PSP.

---

## 5. Settlement Models

### 5.1 4-Step vs 5-Step Settlement

Nexus is compatible with both domestic settlement models:

**4-Step Model:**
1. Debtor Agent submits payment instruction to IPS
2. IPS reserves funds (prefund or collateral)
3. IPS sends instruction to Creditor Agent for acceptance/rejection
4. Creditor Agent accepts → IPS settles. Creditor Agent rejects → IPS cancels reservation.

**5-Step Model:**
1. Same as 4-step, plus:
2. IPS starts a **timer** when sending to Creditor Agent
3. If no confirmation received in time, IPS **rejects and cancels reservation**
4. IPS confirms outcome to **both** Debtor and Creditor Agents
5. Creditor Agent credits account only **after** IPS settlement confirmation

**Trade-off:** 5-step gives IPS control over final status at all times, but requires an additional confirmation message.

### 5.2 SAP Reservation Flow (camt.103)

```
Source SAP (S-SAP):                     Dest SAP (D-SAP):
  camt.103 CreateReservation              camt.103 CreateReservation
  └── Lock FXP source-ccy nostro          └── Lock FXP dest-ccy nostro
  └── Expires in 5 minutes               └── Expires in 5 minutes

On pacs.002 ACCC:                       On pacs.002 RJCT:
  Both → UTILIZED (debit finalized)       Both → CANCELLED (funds released)
```

### 5.3 Source PSP Booking Options

**Option 1: Reservation → Booking**
- Reserve funds on Sender's account
- On ACCC → convert to debit
- On RJCT → release reservation

**Option 2: Debit → Optional Reversal**
- Debit Sender's account immediately
- On ACCC → no action needed
- On RJCT → reverse debit (creates debit + credit booking)

---

## 6. Error Handling & Unhappy Paths

### 6.1 pacs.002 Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| `ACCC` | Accepted, credited to recipient | Payment complete — notify Sender |
| `RJCT` | Rejected with reason code | Reverse/release — notify Sender |
| `BLCK` | Blocked — suspicious activity | Funds held — investigation required |
| `ACWP` | Accepted without posting | Manual processing required |

### 6.2 Rejection Flow

**Rejection in Source Leg:**
```
Source IPS ──pacs.002 (RJCT)──▶ Source PSP
     │
     └── Settlement reservation released
     └── Source PSP reverses debit/reservation on Sender account
```

**Rejection in Destination Leg:**
```
Dest IPS ──pacs.002 (RJCT)──▶ Nexus ──pacs.002 (RJCT)──▶ Source IPS
                                                                │
Source IPS reverses settlement with Source SAP                  │
Source SAP reverses credit on FXP account                      │
Source PSP reverses debit on Sender account ◀───────────────────┘
```

### 6.3 ISO 20022 Reason Codes

| Code | Name | Usage |
|------|------|-------|
| `AB04` | Aborted Settlement | Quote expired / invalid exchange rate |
| `TM01` | Timeout | Response not received within SLA |
| `DUPL` | Duplicate Payment | UETR already processed |
| `AC01` | Incorrect Account | Account validation failure |
| `AC04` | Account Closed | Destination account closed |
| `AC06` | Account Inactive | Destination account dormant |
| `AM02` | Amount Limit Exceeded | Exceeds max transaction amount |
| `AM04` | Insufficient Funds | FXP/SAP lacks liquidity |
| `AM09` | Wrong Amount | Settlement amount mismatch |
| `BE23` | Proxy Invalid | Proxy not registered in PDO |
| `AB08` | Agent Unavailable | Destination PSP offline |
| `AGNT` | Incorrect Agent | PSP not onboarded to Nexus |
| `RR04` | Regulatory Block | Sanctions screening failure |
| `RC01` | Intermediary Missing | Required routing agent not found |
| `RC11` | Invalid Intermediary | SAP account not recognized |
| `FF01` | Format Error | XSD validation failure |
| `CH21` | Element Missing/Invalid | Mandatory field missing or improper code usage |

### 6.4 Timeout Handling

| Priority | Timeout Behavior | Use Case |
|----------|-----------------|----------|
| `NORM` | Nexus waits for Dest IPS response; unknown state on timeout → investigation | P2P, bill payments |
| `HIGH` | Nexus monitors processing time; proactive reject if exceeded; guarantees final status | POS, in-store |

### 6.5 Duplicate Detection

- Nexus detects duplicates by `UETR` + `MsgId` combination
- Duplicate UETR with new MsgId → technical reject
- Same UETR with same MsgId → returns original status (safe to retry)
- Investigation: PSP can resend `pacs.008` with same UETR to check status

---

## 7. Special Scenarios

### 7.1 Source PSP = Source SAP (Scenario A)

When the Source PSP is also the Source SAP:
- First leg booked internally (debit Sender → credit FXP account)
- Source IPS sees InstgAgt = InstdAgt → **skips domestic processing**, forwards to Nexus
- On pacs.002 confirmation, Source IPS forwards to Source PSP only (no separate SAP notification)

### 7.2 Destination PSP = Destination SAP (Scenario B)

When the Destination PSP is also the Destination SAP:
- Nexus sets both D-SAP and D-PSP to the same institution in the transformed pacs.008
- Destination IPS sees they are the same → credits recipient directly
- FXP account debit and recipient credit happen at the same institution

### 7.3 Source PSP Acts as FXP (Scenarios 10-12)

Source PSP can provide its own FX when it holds an account at a Destination SAP:
- **No quote required** from Nexus (no `quoteId` in pacs.008)
- Source PSP sets its own exchange rate (Nexus applies it but cannot validate intent)
- Must call `GET /fees-and-amounts/` to calculate D-PSP fee at chosen rate
- **Must not** change rate after calling fee API (would mismatch displayed vs actual amounts)

---

## 8. Supported ISO 20022 Messages

### 8.1 Message Catalog

| Message | Version | XSD Namespace | Purpose |
|---------|---------|---------------|---------|
| `pacs.008` | 001.13 | `urn:iso:std:iso:20022:tech:xsd:pacs.008.001.13` | FI to FI Customer Credit Transfer |
| `pacs.002` | 001.15 | `urn:iso:std:iso:20022:tech:xsd:pacs.002.001.15` | Payment Status Report |
| `pacs.004` | 001.14 | `urn:iso:std:iso:20022:tech:xsd:pacs.004.001.14` | Payment Return |
| `pacs.028` | 001.06 | `urn:iso:std:iso:20022:tech:xsd:pacs.028.001.06` | Payment Status Request |
| `acmt.023` | 001.04 | `urn:iso:std:iso:20022:tech:xsd:acmt.023.001.04` | ID Verification Request |
| `acmt.024` | 001.04 | `urn:iso:std:iso:20022:tech:xsd:acmt.024.001.04` | ID Verification Report |
| `camt.056` | 001.11 | `urn:iso:std:iso:20022:tech:xsd:camt.056.001.11` | Payment Cancellation (Recall) |
| `camt.029` | 001.13 | `urn:iso:std:iso:20022:tech:xsd:camt.029.001.13` | Resolution of Investigation |
| `camt.054` | 001.13 | `urn:iso:std:iso:20022:tech:xsd:camt.054.001.13` | Debit/Credit Notification (Reconciliation) |
| `camt.103` | 001.03 | `urn:iso:std:iso:20022:tech:xsd:camt.103.001.03` | Create Reservation |
| `pain.001` | 001.12 | `urn:iso:std:iso:20022:tech:xsd:pain.001.001.12` | Customer Credit Transfer Initiation |

### 8.2 Asynchronous Callback Pattern

All ISO 20022 message submissions use an async callback model:

| Request | Callback Parameter | Response Message |
|---------|-------------------|-----------------|
| `POST /iso20022/acmt023` | `acmt024Endpoint` (query param) | `acmt.024` XML |
| `POST /iso20022/pacs008` | `pacs002Endpoint` (query param) | `pacs.002` XML |

The Source IPSO must expose HTTP endpoints to receive callback responses. Nexus POSTs the full ISO 20022 XML message to the callback URL and expects HTTP 200 in return.

### 8.3 FXP Payment Notification Webhook

After Nexus receives `pacs.002` with `ACCC`:
- Nexus sends notification to FXP-provided API endpoint
- Includes: UETR, amount, currencies, quote ID reference
- FXP uses this for liquidity tracking and reconciliation

---

## 9. Data Translation Requirements

### 9.1 ISO 20022 External Code Sets

| Code Type | Purpose |
|-----------|---------|
| `ExternalProxyAccountType1Code` | Proxy types (MBNO, EMAL, UEN, etc.) |
| `ExternalStatusReason1Code` | Reject reason codes |
| `ExternalVerificationReason1Code` | Resolution error codes |
| `ExternalClearingSystemIdentification1Code` | Clearing system IDs (max 5 chars) |
| `ExternalCategoryPurpose1Code` | Payment category codes |
| `ExternalPurpose1Code` | Payment purpose codes |

### 9.2 Translation Rules

**Outbound (Domestic → Nexus):**
- Map proprietary codes to ISO 20022 codes
- Can restrict input list to subset
- All output codes must have mapping

**Inbound (Nexus → Domestic):**
- **Must NOT** restrict input ISO 20022 code list
- Must handle all possible codes from any jurisdiction
- Can map multiple ISO codes to single domestic code
- Should define default "other" code for unmapped values

### 9.3 Character Set Constraints

Latin characters: `a-z`, `A-Z`, `0-9`
Special characters: `/ - ? : ( ) . , ' + ! # & % * = ^ _ { | } ~ " ; @ [ \ ] $ > <`

**Rules:**
- Identifiers must not start/end with `/`
- Identifiers must not contain `//`

---

## 10. API Endpoint Reference

### 10.1 Core REST APIs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/countries` | All countries with currencies and limits |
| GET | `/countries/{code}` | Single country by ISO 3166 alpha-2 |
| GET | `/countries/{code}/currencies/{ccy}/max-amounts` | Max payment amount |
| GET | `/countries/{code}/address-types` | Address types for country |
| GET | `/countries/{code}/address-types-and-inputs` | Address types WITH input fields |
| GET | `/countries/{code}/fin-insts/{role}` | Financial institutions by role |
| GET | `/currencies` | All available currencies |
| GET | `/currencies/{code}` | Single currency |
| GET | `/quotes/{src}/{srcCcy}/{dst}/{dstCcy}/{amtCcy}/{amt}` | FX quotes |
| GET | `/quotes/{quoteId}/intermediary-agents` | SAP accounts for FXP |
| GET | `/fees-and-amounts/{src}/{srcCcy}/{dst}/{dstCcy}/{amtCcy}/{amt}/{rate}` | Fee calculation |
| GET | `/fee-formulas/nexus-scheme-fee/{code}/{ccy}` | Nexus scheme fee formula |
| GET | `/fee-formulas/creditor-agent-fee/{code}/{ccy}` | D-PSP fee formula |
| GET | `/fin-insts/{role}` | FIs by role (psp/fxp/sap/any) |
| GET | `/address-types/{id}/inputs` | Input fields for address type |

### 10.2 Administrative APIs

| Method | Endpoint | Used By | Purpose |
|--------|----------|---------|---------|
| PUT | `/countries` | IPSO | Update country data |
| PUT | `/fee-formulas` | IPSO | Update D-PSP fee formula |
| POST/PUT | `/fin-insts` | IPSO | Add/update financial institutions |
| POST | `/rates` | FXP | Add/update live FX rates |
| POST/PUT | `/relationships` | FXP | Update FXP-PSP relationships |
| POST/PUT/DELETE | `/tiers` | FXP | Manage tier-based rate improvements |

---

## 11. Implementation Mapping

### 11.1 Backend (nexus-gateway)

| Component | File | Purpose |
|-----------|------|---------|
| pacs.008 Handler | `pacs008.py` | Payment submission, validation, transformation |
| pacs.002 Builder | `pacs008.py` | Status response generation (ACCC/RJCT) |
| pacs.004 Handler | `pacs004.py` | Payment returns |
| pacs.028 Handler | `pacs028.py` | Status enquiries |
| acmt.023 Handler | `acmt023.py` | Proxy/account resolution requests |
| acmt.024 Handler | `acmt024.py` | Proxy/account resolution responses |
| camt.103 Handler | `camt103.py` | Liquidity reservations |
| Recall Handlers | `recall_handlers.py` | camt.056, camt.029 processing |
| Message Builders | `builders.py` | XML generation utilities |
| XML Templates | `templates.py` | Sample ISO 20022 messages |
| Event Storage | `utils.py` | `store_payment_event` for forensic audit trail |

### 11.2 Frontend (demo-dashboard)

| Component | File | Purpose |
|-----------|------|---------|
| Payment Flow | `Payment.tsx` | Full 17-step payment UI |
| Interactive Demo | `InteractiveDemo.tsx` | Step-by-step pacs.008 preview |
| Message Explorer | `Messages.tsx` | Educational message templates |
| Payment Explorer | `PaymentsExplorer.tsx` | Transaction lookup & audit trail |
| Message Inspector | `MessageInspector.tsx` | XML display with syntax highlighting |
| Lifecycle Hook | `hooks/payment/usePaymentLifecycle.ts` | 17-step state management |
| XML Builder | `services/api.ts` (`buildPacs008Xml`) | Client-side pacs.008 XML generation |

---

## 12. Actor Event Chain (Forensic Audit Trail)

Events stored in `payment_events` table and displayed in PaymentsExplorer:

| Event Type | Actor | Description | Message |
|------------|-------|-------------|---------|
| `PAYMENT_INITIATED` | S-PSP | Source PSP debits/reserves sender account | — |
| `SOURCE_IPS_SETTLEMENT` | S-IPS | Source IPS ensures settlement certainty | — |
| `RESERVATION_CREATED` | S-SAP | Source SAP locks FXP nostro (source currency) | camt.103 |
| `RESERVATION_CREATED` | D-SAP | Dest SAP locks FXP nostro (dest currency) | camt.103 |
| `PACS008_FORWARDED` | NEXUS | Nexus forwards transformed pacs.008 | pacs.008 |
| `DEST_IPS_FORWARDED` | D-IPS | Dest IPS forwards to Dest PSP | — |
| `RECIPIENT_CREDITED` | D-PSP | Dest PSP credits recipient | — |
| `PACS002_RECEIVED` | NEXUS | pacs.002 response received | pacs.002 |
| `RESERVATION_UTILIZED` | S-SAP | Source SAP reservation utilized | pacs.002 |
| `RESERVATION_UTILIZED` | D-SAP | Dest SAP reservation utilized | pacs.002 |
| `RESERVATION_CANCELLED` | S-SAP | Source SAP reservation cancelled (on RJCT) | pacs.002 |
| `RESERVATION_CANCELLED` | D-SAP | Dest SAP reservation cancelled (on RJCT) | pacs.002 |
| `PAYMENT_REJECTED` | NEXUS | Payment validation failed | pacs.002 |
| `DEMO_SCENARIO_REJECTION` | NEXUS | Demo rejection triggered | pacs.002 |
| `SCHEMA_VALIDATION_FAILED` | NEXUS | XSD validation error | — |

---

## 13. Timing & SLA Requirements

| Metric | Value | Details |
|--------|-------|---------|
| Quote validity | **600 seconds** (10 min) | Payment using expired quote → `AB04` reject |
| NORM priority timeout | **4 hours** | Nexus waits; unknown state on timeout |
| HIGH priority timeout | **25 seconds** | Nexus proactively rejects if exceeded |
| SAP reservation expiry | **5 minutes** | Auto-cancelled if not utilized |
| MsgId uniqueness window | **2 months** | Per sending institution |

---

## 14. Reconciliation

### 14.1 camt.054 Reports

- Daily periodic reports in `camt.054.001.13` format
- Available via API with custom date range filters
- Contains all transactions with final status (ACCC, RJCT, BLCK)
- UETR included for correlation with domestic records

### 14.2 FXP Notification

After `pacs.002 ACCC`:
- Nexus notifies FXP via webhook to FXP-provided endpoint
- Content: UETR, amount, currencies, quote ID, timestamp
- Purpose: Enable FXP to track liquidity across SAP accounts

---

## 15. IPSO Message Responsibilities

> Source: [Role and responsibilities of the IPSO](https://docs.nexusglobalpayments.org/payment-processing/role-and-responsibilities-of-the-instant-payment-system-operator-ipso)

The Instant Payment System Operator (IPSO) is the **central hub** between Nexus and domestic PSPs. The IPSO handles message forwarding, translation, timing enforcement, and PSP onboarding.

### 15.1 Message Forwarding Chain

```
                 ┌─────────────────────────────────────────────────────────────┐
                 │                    IPSO Responsibilities                    │
                 └─────────────────────────────────────────────────────────────┘

 Source Flow:  PSP ──pacs.008──▶ S-IPS ──pacs.008──▶ Nexus Gateway
 Return Flow:  PSP ◀──pacs.002── S-IPS ◀──pacs.002── Nexus Gateway

 Dest Flow:    D-IPS ◀──pacs.008── Nexus Gateway
               D-IPS ──pacs.002──▶ Nexus Gateway

 Proxy Flow:   PDO  ◀──acmt.023── Nexus Gateway (via IPSO)
               PDO  ──acmt.024──▶ Nexus Gateway (via IPSO)
```

### 15.2 IPSO Core Duties

| Responsibility | Description | Messages |
|---------------|-------------|----------|
| **Message Translation** | Translate between domestic format and ISO 20022 if domestic IPS doesn't use ISO 20022 natively | pacs.008, pacs.002, acmt.023/024 |
| **Message Forwarding** | Route pacs.008 from PSP → Nexus, and pacs.002 from Nexus → PSP | pacs.008, pacs.002 |
| **Timeout Enforcement** | For HIGH priority: reject if D-PSP doesn't respond within SLA. For NORM: wait until response arrives | pacs.002 (RJCT) |
| **Settlement Certainty** | Ensure settlement between SAP and PSP can be performed before sending positive pacs.002 | camt.103 |
| **PSP Onboarding** | Register PSP capabilities with Nexus (acmt.023 support, pacs.028 support, etc.) | — |
| **Reconciliation** | Provide camt.054 reports to PSPs; reconcile Nexus transactions against domestic records | camt.054 |
| **Code Translation** | Map domestic error/status codes to ISO 20022 ExternalStatusReason1Code set | — |
| **Proxy Routing** | Forward acmt.023 to the PDO, translating if domestic proxy format differs | acmt.023, acmt.024 |

### 15.3 IPSO Timing Requirements

- IPSO must adhere to **Maximum Execution Time (MET)** defined by Nexus Scheme governance
- For **HIGH priority**: IPSO must cancel payment and send RJCT pacs.002 if D-PSP doesn't respond in time
- For **NORM priority**: IPSO waits; if Nexus doesn't receive pacs.002 in time, Nexus waits until received or resend is requested
- End-to-end execution time = MET(Source IPS) + MET(Nexus) + MET(Dest IPS)

---

## 16. FXP ↔ PSP ↔ SAP Communication Flows

> Source: [FX Provision](https://docs.nexusglobalpayments.org/fx-provision/role-of-the-fx-provider), [Settlement Access Provision](https://docs.nexusglobalpayments.org/settlement-access-provision/key-points)

### 16.1 FXP Rate Posting (FXP → Nexus)

```
FXP ──POST /rates──▶ Nexus API
     {
       sourceCurrency: "SGD",
       destinationCurrency: "THB",
       exchangeRate: 25.45,        // Base rate for all Nexus payments
       validFrom: "2026-02-08T00:00:00Z"
     }
```

- FXP provides **standing rates** via `POST /rates/` — not per-transaction bids
- Rate applies to ALL Nexus payments until FXP posts an updated rate
- FXP can define **volume tiers** that improve the base rate for larger transactions
- For payments below the lowest tier, the base rate applies

### 16.2 PSP Quote Selection (PSP → Nexus → FXP quotes)

```
PSP ──GET /quotes──▶ Nexus API ──(internal)──▶ Calculate from FXP rates
                    ◀── quotes[] ──┘

Each quote includes:
  - quoteId (UUID, valid 600 seconds)
  - fxpName, exchangeRate
  - interbankSettlementAmount (source + dest currency)
  - chargesAmount (D-PSP fee)
  - creditorAccountAmount (final to recipient)
```

### 16.3 Intermediary Agent Retrieval (PSP → FXP accounts)

```
PSP ──GET /quotes/{quoteId}/intermediary-agents──▶ Nexus API
     ◀──
     {
       intermediaryAgent1: {       // Source SAP
         finInstId: { BICFI: "OCBCSGSG" },
         account: { otherId: "1234567890" }   // FXP account at Source SAP
       },
       intermediaryAgent2: {       // Destination SAP
         finInstId: { BICFI: "KASITHBK" },
         account: { otherId: "8881234569" }   // FXP account at Dest SAP
       }
     }
```

- These accounts are embedded in `pacs.008` as `IntrmyAgt1` and `IntrmyAgt2`
- Nexus validates these accounts belong to the FXP that issued the quote

### 16.4 FX Quote ID in pacs.008

Per official docs, the FX Quote ID is placed in the `AgrdRate/QtId` element:

```xml
<XchgRateInf>
  <AgrdRate>
    <QtId>{quoteId}</QtId>    <!-- FX Quote ID (UUID from GET /quotes) -->
  </AgrdRate>
  <PreAgrdXchgRate>25.45</PreAgrdXchgRate>
</XchgRateInf>
```

> **If no Quote ID is present** → Source PSP is acting as FXP (provides own FX)
> **If Quote ID is present** → Source PSP is using a third-party FXP

### 16.5 Nexus Quote Validation (on pacs.008 receipt)

When Nexus receives a pacs.008:

| Check | Failure Code | Description |
|-------|:--------:|-------------|
| Quote ID present? | — | Determines if 3rd-party FXP or self-FX |
| Quote expired? | `AB04` | Quote validity exceeded (600s) |
| Exchange rate matches quote? | `AB04` | Rate in pacs.008 ≠ rate in original quote |
| Intermediary agents valid? | `RC11` | Accounts don't belong to the FXP |
| IntrmyAgt2 registered as Source PSP's? | `RC11` | For self-FX: account must be registered with Nexus |

### 16.6 FXP↔SAP Account Structure

```
                Source Country                    Destination Country
                ┌──────────────┐                  ┌──────────────────┐
FXP Account ──▶ │  Source SAP   │     ◀── FX ──▶  │  Destination SAP  │ ◀── FXP Account
  (receives     │  (IPS member) │                  │  (IPS member)     │   (pays out
   source ccy)  └──────────────┘                  └──────────────────┘    dest ccy)
```

**Three FXP access models:**
1. **FXP = IPS member** → acts as SAP to itself (e.g., major international bank)
2. **FXP = IPS member in one country** → uses SAP in the other country
3. **FXP = non-bank FX dealer** → uses SAPs in both countries

### 16.7 FXP Notification (Nexus → FXP)

After successful payment (`pacs.002` with `ACCC`):

```
Nexus ──webhook──▶ FXP endpoint
  {
    uetr: "d47ac10b-...",
    quoteId: "abc123-...",
    sourceAmount: "100.00 SGD",
    destinationAmount: "2545.00 THB",
    exchangeRate: "25.45",
    timestamp: "2026-02-08T11:00:00Z"
  }
```

- FXP uses this to track liquidity changes across SAP accounts
- FXP should use UETR to avoid double-counting (SAP may also notify)

---

## 17. Complete Payment Status Reference

> Source: [pacs.002 Payment Status Report](https://docs.nexusglobalpayments.org/messaging-and-translation/message-pacs.002-payment-status-report), [Rejects](https://docs.nexusglobalpayments.org/payment-processing/unsuccessful-payments-exceptions/rejects)

### 17.1 Transaction Status Codes (pacs.002)

| Code | Status | Meaning | Who Sets It | What Happens Next |
|------|--------|---------|-------------|-------------------|
| `ACCC` | **Accepted** | Credited to recipient's account | D-PSP via D-IPS | Settlement finalized; SAP reservations utilized; FXP notified; Sender notified of success |
| `RJCT` | **Rejected** | Payment refused with reason code | Any actor (Nexus, D-IPS, D-PSP, D-SAP) | SAP reservations cancelled; settlement reversed if needed; Sender notified with reason |
| `BLCK` | **Blocked** | Funds frozen — suspicious/illicit activity | D-SAP or D-PSP | Funds held; investigation required; no automatic reversal |

> **Note:** The Source SAP may only respond with `ACCC` or `RJCT` — never `BLCK`.

### 17.2 Complete Rejection Reason Codes (ExternalStatusReason1Code)

**Nexus Validation Rejections (set by Nexus Gateway):**

| Code | Name | Description | Trigger |
|------|------|-------------|---------|
| `AB04` | Aborted Settlement Fatal Error | Invalid exchange rate vs. quote | Exchange rate in pacs.008 ≠ rate from original quote |
| `RC11` | Invalid Intermediary Agent | Intermediary agent accounts unrecognized | IntrmyAgt accounts don't belong to FXP |
| `CH21` | Missing Mandatory Element | Required field absent from pacs.008 | AccptncDtTm, ClrSys, ChrgBr etc. missing |
| `DUPL` | Duplicate Payment | UETR + MsgId combination already processed | Duplicate detection on receipt |
| `TM01` | Cut-off Time | Acceptance timestamp too far in past | AccptncDtTm validation failure |
| `AM09` | Wrong Amount | Settlement amount mismatch | Instructed amount exceeds IPS MaxAmt cap |

**Destination-Side Rejections (set by D-IPS, D-SAP, or D-PSP):**

| Code | Name | Description | Typical Cause |
|------|------|-------------|---------------|
| `AC01` | Incorrect Account | Account number invalid or doesn't exist | Account validation failure at D-PSP |
| `AC04` | Account Closed | Destination account permanently closed | Recipient closed their account |
| `AC06` | Account Inactive | Destination account dormant/blocked | Account frozen or suspended |
| `AM02` | Amount Limit Exceeded | Exceeds per-transaction ceiling | IPS or regulatory cap breached |
| `AM04` | Insufficient Funds | FXP/SAP lacks liquidity | FXP account at SAP underfunded |
| `BE23` | Proxy Not Registered | Address type / proxy lookup failed | Proxy not in PDO directory |
| `FF01` | Invalid File Format | Structural XML errors | Malformed ISO 20022 message |
| `MS03` | Sanctions Screening Failure | Compliance block | Sender or recipient flagged |
| `RR04` | Regulatory Reason | Regulatory reporting failure | Local regulatory requirement not met |
| `NARR` | Narrative | Free-text reason provided | Catch-all — reason in additional info text |
| `NOAS` | No Answer from Customer | D-PSP timeout on customer confirmation | Multi-factor auth or approval timeout |
| `FOCR` | Following Cancellation Request | Payment cancelled on request | Recall initiated by Source PSP |

### 17.3 Payment Status Lifecycle

```
                          ┌──────────────┐
                          │  pacs.008    │
                          │  submitted   │
                          └──────┬───────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼             ▼
             ┌──────────┐ ┌──────────┐ ┌──────────┐
             │  ACCC    │ │  RJCT    │ │  BLCK    │
             │ Accepted │ │ Rejected │ │ Blocked  │
             └──────────┘ └──────────┘ └──────────┘
                  │             │             │
                  ▼             ▼             ▼
             Settlement   Reservation    Investigation
             Finalized    Cancelled      Required
```

All three codes are **final** — once a pacs.002 with any of these codes is received, the payment status cannot change. The UETR is consumed and cannot be reused.

### 17.4 Priority-Based Timeout Behavior

| Priority | Timeout | On Timeout |
|----------|---------|------------|
| `HIGH` | ≤25 seconds | Nexus proactively sends RJCT pacs.002 to **both** S-IPS and D-IPS |
| `NORM` | Up to 4 hours | Nexus waits; unknown state on timeout. Source PSP can resend pacs.008 to investigate |

---

## 18. Fixes Applied During Audit

1. **camt.103 Namespace**: Fixed from `001.02` → `001.03` in `pacs008.py` (3 occurrences)
2. **camt.054 Namespace**: Fixed from `001.11` → `001.13` in `pacs008.py`
3. **pacs.002 Structure**: Fixed `OrgnlMsgId` → `OrgnlEndToEndId` per XSD
4. **ClrSys Element**: Fixed `<Cd>` → `<Prtry>` in `buildPacs008Xml` (api.ts) — Nexus uses proprietary IPS names
5. **ClrSys Placement**: Moved from `PmtTpInf` → `SttlmInf` in InteractiveDemo.tsx XML preview
6. **Default Clearing Code**: Changed from `"NGP"` → `"NEXUS"` to match template
7. **RgltryRptg/Cd**: Changed `QUOTE_ID` → `QREF` with null-safety on quoteId
8. **quoteId Parser**: Removed `InstrId` fallback — per docs, FX Quote ID lives in `AgrdRate/QtId` only
9. **UUID Validation**: Added `_valid_uuid()` guard on `quote_id` and `correlation_id` in `store_payment`
10. **Backend `templates.py` — camt.056**: Fixed `Underlyg` → `Undrlyg` (typo, XSD uses `Undrlyg`)
11. **Backend `templates.py` — pain.001**: Fixed invalid BIC `SAPSSSGSG` → `OCBCSGSG` (9→8 chars)
12. **Backend `templates.py` — pacs.002 ACCC**: Added missing `OrgnlInstrId` and `OrgnlTxId`
13. **Frontend `Messages.tsx`**: Restored `AddtlDtTm > AccptncDtTm` after XSD analysis confirmed compliance (pacs.008.001.13 L229)
14. **Frontend `mockData.ts`**: Restored `AddtlDtTm > AccptncDtTm` with dynamic timestamp
15. **Frontend `InteractiveDemo.tsx`**: Restored `AddtlDtTm > AccptncDtTm` in interactive flow XML
16. **Frontend `api.ts`**: Restored `AddtlDtTm > AccptncDtTm` in `buildPacs008Xml`, updated element ordering comment
17. **Verification**: Confirmed 17-step flow logic in `pacs008.py` and `InteractiveDemo.tsx` matches documentation. Validated `PaymentsExplorer.tsx` lifecycle visualization.

---

## 19. References

1. [Nexus Official Documentation](https://docs.nexusglobalpayments.org)
2. [Payment Flow — Happy Path](https://docs.nexusglobalpayments.org/payment-processing/payment-flow-happy-path)
3. [Proxy Resolution Process](https://docs.nexusglobalpayments.org/addressing-and-proxy-resolution/proxy-and-account-resolution-process)
4. [ISO 20022 Messages](https://docs.nexusglobalpayments.org/messaging-and-translation/general-usage-of-iso-20022)
5. [Rejects and Error Codes](https://docs.nexusglobalpayments.org/payment-processing/validations-duplicates-and-fraud/rejects)
6. [Managing Liquidity](https://docs.nexusglobalpayments.org/settlement-access-provision/managing-liquidity)
7. [Message Transformation by Nexus](https://docs.nexusglobalpayments.org/messaging-and-translation/message-transformation-by-nexus)
8. [Specific Message Elements](https://docs.nexusglobalpayments.org/messaging-and-translation/specific-message-elements)
9. [4-Step vs 5-Step Settlement](https://docs.nexusglobalpayments.org/payment-processing/annex-4-step-vs-5-step-processes-in-domestic-clearing-and-settlement)
10. [Booking Flow for Source PSPs](https://docs.nexusglobalpayments.org/payment-processing/payment-flow-happy-path/booking-flow-for-source-psps)
11. [Special Scenarios](https://docs.nexusglobalpayments.org/payment-processing/special-scenarios)
12. [Fees](https://docs.nexusglobalpayments.org/payment-processing/fees)
13. [ISO 20022 External Code Sets](https://www.iso20022.org/catalogue-messages/additional-content-messages/external-code-sets)
14. [Role of the IPSO](https://docs.nexusglobalpayments.org/payment-processing/role-and-responsibilities-of-the-instant-payment-system-operator-ipso)
15. [FX Provision Guide](https://docs.nexusglobalpayments.org/fx-provision/role-of-the-fx-provider)
16. [Settlement Access Provision](https://docs.nexusglobalpayments.org/settlement-access-provision/key-points)
17. [Notifying FXPs of Completed Payments](https://docs.nexusglobalpayments.org/payment-processing/payment-flow-happy-path/notifying-fxps-of-completed-payments)
18. [Time-Critical vs Non-Time-Critical Payments](https://docs.nexusglobalpayments.org/payment-processing/time-critical-vs-non-time-critical-payments)
