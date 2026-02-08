# Nexus Global Payments Documentation Analysis
## Comprehensive Technical Summary for Parity Audit

---

## 1. API ENDPOINT SPECIFICATIONS

### 1.1 Core REST APIs

#### Countries API
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/countries` | Retrieve all countries in Nexus with currencies, max amounts, and required message elements |
| GET | `/countries/{countryCode}` | Retrieve a single country by ISO 3166 alpha-2 code |
| GET | `/countries/{countryCode}/currencies/{currencyCode}/max-amounts` | Get maximum payment amount for a specific country/currency |
| GET | `/countries/{countryCode}/address-types` | Get address types for a country (IBAN, ACCT, proxies) |
| GET | `/countries/{countryCode}/address-types-and-inputs` | Get all address types AND their input fields |
| GET | `/countries/{countryCode}/fin-insts/{finInstRole}` | Get PSPs/FXPs/SAPs in a specified country |

#### Currencies API
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/currencies` | Retrieve all currencies available in Nexus |
| GET | `/currencies/{currencyCode}` | Retrieve a single currency by 3-letter code |

#### Quotes API
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/quotes/{sourceCountry}/{sourceCurrency}/{destinationCountry}/{destinationCurrency}/{amountCurrency}/{amount}?finInstTypeId={}&finInstId={}` | Get FX quotes for currency pair |
| GET | `/quotes/{quoteId}/intermediary-agents` | Retrieve SAP accounts for the FXP associated with a quote |

#### Fees and Amounts API
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/fees-and-amounts/{sourceCountry}/{sourceCurrency}/{destinationCountry}/{destinationCurrency}/{amountCurrency}/{amount}/{exchangeRate}` | Calculate fees and settlement amounts |
| GET | `/fee-formulas/nexus-scheme-fee/{countryCode}/{currencyCode}` | Get Nexus scheme fee formula |
| GET | `/fee-formulas/creditor-agent-fee/{countryCode}/{currencyCode}` | Get Destination PSP fee formula |

#### Financial Institutions API
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/fin-insts/{finInstRole}` | Get financial institutions by role (psp/fxp/sap/any) |
| GET | `/countries/{countryCode}/fin-insts/{finInstRole}` | Get FIs in a specific country |

#### Address Types API
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/address-types/{addressTypeId}/inputs` | Get detailed input fields for an address type |

### 1.2 ISO 20022 Message APIs (Asynchronous)

| Method | Endpoint | Query Parameters | Description |
|--------|----------|------------------|-------------|
| POST | `/iso20022/acmt023` | `acmt024Endpoint` (required, URI) | Submit proxy/account resolution request |
| POST | `/iso20022/pacs008` | `pacs002Endpoint` (required, URI) | Submit payment instruction |

**Important:** The Source IPSO must define callback endpoints for asynchronous responses.

### 1.3 Optional Administrative APIs

| API | Method | Used By | Purpose |
|-----|--------|---------|---------|
| `/countries` | PUT | IPSO | Update country data (value limits, mandatory elements) |
| `/fee-formulas` | PUT | IPSO | Update D-PSP fee formula |
| `/fin-insts` | POST/PUT | IPSO | Add/update financial institutions |
| `/rates` | POST | FXP | Add/update live FX rates |
| `/relationships` | POST/PUT | FXP | Update FXP-PSP relationships |
| `/tiers` | POST/PUT/DELETE | FXP | Manage tier-based rate improvements |

---

## 2. PAYMENT FLOWS (Step-by-Step)

### 2.1 High-Level Payment Flow (Happy Path)

```
┌─────────┐     ┌──────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Sender  │────▶│ Source   │────▶│ Source  │────▶│ Source  │────▶│ Nexus   │
│ (Debtor)│     │ PSP      │     │ IPS     │     │ SAP     │     │ Gateway │
└─────────┘     └──────────┘     └─────────┘     └─────────┘     └────┬────┘
                                                                       │
                                                                       ▼
┌─────────┐     ┌──────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Recipient│◀────│ Destination│◀────│ Destination│◀────│ Destination│◀────│ Nexus   │
│ (Creditor)│     │ PSP      │     │ IPS     │     │ SAP     │     │ Gateway │
└─────────┘     └──────────┘     └─────────┘     └─────────┘     └─────────┘
```

### 2.2 Detailed Payment Setup Flow (Source PSP)

**Steps 1-2: Country, Currency & Amount**
1. Source PSP calls `GET /countries` to populate country dropdown
2. Sender selects destination country and currency
3. Sender defines EITHER:
   - Amount to send (in Source Currency), OR
   - Amount for recipient to receive (in Destination Currency)

**Steps 3-6: Exchange Rate Quote**
1. Source PSP calls `GET /quotes` with:
   - sourceCountry, sourceCurrency
   - destinationCountry, destinationCurrency
   - amountCurrency (SRC or DST)
   - amount (after deducting Source PSP fee if applicable)
   - finInstTypeId & finInstId (PSP identifier)

2. Nexus returns list of quotes from available FXPs with:
   - quoteId (UUID)
   - exchangeRate
   - interbankSettlementAmount (both currencies)
   - chargesAmount (Destination PSP Deducted Fee)
   - creditorAccountAmount (final amount to recipient)
   - intermediary agents (SAPs and FXP accounts)

3. Source PSP selects preferred quote
4. Source PSP calls `GET /quotes/{quoteId}/intermediary-agents` to get FXP account details

**Steps 7-9: Addressing & Proxy Resolution**
1. Source PSP calls `GET /countries/{code}/address-types-and-inputs` for address form
2. Sender inputs proxy or account details
3. Source PSP sends ISO 20022 `acmt.023` message via `POST /iso20022/acmt023`
4. Nexus routes to Proxy Directory or Destination PSP
5. Response via `acmt.024` with verified account details and display name

**Steps 10-11: Sanctions Screening**
- Source PSP performs sanctions screening on Sender and Recipient
- May use verified name from acmt.024 response

**Step 12: Sender Approval**
Source PSP MUST display to Sender:
- Exact amount to be debited from Sender's account
- Exact amount to be credited to Recipient's account
- Effective exchange rate (ratio between debit and credit amounts)
- Any fees charged by Source PSP (invoiced or deducted)
- Recipient's verified name (from acmt.024)

**Steps 13-16: Payment Instruction Setup**
1. Source PSP constructs ISO 20022 `pacs.008` message with:
   - UETR (UUID v4)
   - Quote ID in AgreedRate block
   - Intermediary Agents (SAPs with FXP accounts)
   - Charges Information (Source PSP and Destination PSP fees)
   - Debtor, Creditor, and Agent information

2. Source PSP submits `pacs.008` to Source IPS (domestic format or Nexus format)

### 2.3 Source Side Processing (4-Step Settlement)

```
Step  Source PSP    Source IPS    Source SAP    Nexus Gateway
----  ----------    ----------    ----------    -------------
 1    ──pacs.008──▶│             │             │
 2                 │──Validate──▶│             │
 3                 │◀─ACCC/RJCT──│             │
 4                 │─────────────│──pacs.008──▶│
 5                 │             │             │──Validate──▶
 6                 │             │             │◀──Result───
 7                 │◀────────────│◀────────────│──pacs.002──
 8    ◀─pacs.002───│             │             │
```

### 2.4 Destination Side Processing (4-Step Settlement)

```
Step  Nexus Gateway  Dest IPS    Dest SAP    Dest PSP    Recipient
----  -------------  --------    --------    --------    ---------
 1    ───pacs.008───▶│           │           │           │
 2                  │──Validate─▶│           │           │
 3                  │            │──Check────│           │
 4                  │            │──Funds───▶│           │
 5                  │            │◀──ACCC────│           │
 6                  │◀───────────│           │           │
 7                  │────────────│───────────│──Validate─▶│
 8                  │            │           │──Credit──▶│
 9                  │            │           │◀─ACCC─────│
10                  │            │◀──────────│           │
11    ◀──pacs.002───│            │           │           │
```

### 2.5 Quote Expiry Flow

- Each quote is valid for **600 seconds (10 minutes)** from issuance
- Quote expiry is checked when pacs.008 is received by Nexus
- If expired, payment is rejected
- When FXP submits new rate, existing quotes expire in 600 seconds

---

## 3. ISO MESSAGE STRUCTURE AND REQUIRED FIELDS

### 3.1 Supported ISO 20022 Messages (v2025)

| Message | Version | Purpose |
|---------|---------|---------|
| pacs.008 | 001.13 | FI to FI Customer Credit Transfer (payment instruction) |
| pacs.002 | 001.15 | FI to FI Payment Status Report |
| acmt.023 | 001.04 | Identification Verification Request (proxy/account resolution) |
| acmt.024 | 001.04 | Identification Verification Report (response) |

**Future Roadmap:** pacs.004 (returns), pacs.028 (status request), camt.056/029 (cancellation)

### 3.2 pacs.008 - Key Required Fields

```xml
<Document>
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>              <!-- Message ID (unique per sender, 2 months) -->
      <CreDtTm>            <!-- Creation Date Time (UTC) -->
      <NbOfTxs>1</NbOfTxs> <!-- Always 1 for Nexus -->
      <SttlmInf>
        <SttlmMtd>         <!-- Settlement Method -->
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>          <!-- Instruction ID (optional) -->
        <EndToEndId>       <!-- End-to-End ID -->
        <TxId>             <!-- Transaction ID -->
        <UETR>             <!-- Unique End-to-End Transaction Reference (UUID v4) -->
      </PmtId>
      <IntrBkSttlmAmt Ccy="">  <!-- Interbank Settlement Amount -->
      <IntrBkSttlmDt>          <!-- Interbank Settlement Date -->
      <AddtlDtTm>
        <AccptncDtTm>          <!-- Acceptance Date Time (UTC) -->
      </AddtlDtTm>
      <ChrgBr>SHA_R</ChrgBr>   <!-- Charge Bearer (always SHA_R) -->
      <ChrgsInf>               <!-- Charges Information (2 iterations) -->
        <Amt Ccy="">           <!-- Source PSP Deducted Fee -->
        <Agt>                  <!-- Source PSP -->
      </ChrgsInf>
      <ChrgsInf>
        <Amt Ccy="">           <!-- Destination PSP Deducted Fee -->
        <Agt>                  <!-- Destination PSP -->
      </ChrgsInf>
      <InstgAgt>               <!-- Instructing Agent (Source PSP) -->
      <InstdAgt>               <!-- Instructed Agent (Source SAP) -->
      <IntrmyAgt1>             <!-- Intermediary Agent 1 (Source SAP) -->
      <IntrmyAgt1Acct>         <!-- FXP Account at Source SAP -->
      <IntrmyAgt2>             <!-- Intermediary Agent 2 (Destination SAP) -->
      <IntrmyAgt2Acct>         <!-- FXP Account at Destination SAP -->
      <Dbtr>                   <!-- Debtor (Sender) -->
        <Nm>                   <!-- Name -->
        <PstlAdr>              <!-- Postal Address (Country, Town) -->
      </Dbtr>
      <DbtrAcct>               <!-- Debtor Account -->
      <DbtrAgt>                <!-- Debtor Agent (Source PSP) -->
      <CdtrAgt>                <!-- Creditor Agent (Destination PSP) -->
      <Cdtr>                   <!-- Creditor (Recipient) -->
        <Nm>                   <!-- Name -->
      </Cdtr>
      <CdtrAcct>               <!-- Creditor Account -->
      <AgrdRate>               <!-- Agreed Rate (FX) -->
        <QtId>                 <!-- Quote ID (UUID from GET /quotes) -->
      </AgrdRate>
      <RmtInf>                 <!-- Remittance Information (optional, 140 chars) -->
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>
```

### 3.3 pacs.002 - Status Report Fields

**Status Codes (TxSts):**
- `ACCC` - Accepted and credited to recipient (successful)
- `RJCT` - Rejected (with reason code)
- `BLCK` - Funds blocked (suspicious/illicit activity)
- `ACWP` - Accepted without posting (manual follow-up needed)

**Status Reason Codes (StsRsnInf > Rsn > Cd):**
- From ISO 20022 ExternalStatusReason1Code
- Mandatory for RJCT status

### 3.4 acmt.023 - Identification Verification Request

**Two main blocks:**
1. **Assignment** - Request routing info
   - Creator - Sender of payment
   - First Agent - Source PSP
   - Assigner - Source PSP (same as First Agent)
   - Assignee - Destination PDO or Creditor Agent (Nexus updates this)

2. **Verification** - Account/proxy to verify
   - PartyAndAccountIdentification > Account > Proxy (for proxy resolution)
   - PartyAndAccountIdentification > Account > Id (for account resolution)
   - PartyAndAccountIdentification > Agent (Financial Institution)

### 3.5 acmt.024 - Identification Verification Report

**Response block structure:**
- Assignment (updated Assignee = Source PSP)
- Report:
  - Verification (true/false)
  - Reason (error code if Verification=false)
  - OriginalPartyAndAccountIdentification (copy from acmt.023)
  - UpdatedPartyAndAccountIdentification:
    - Party > Name (verified account holder name)
    - Account > Name (display name for Sender)
    - Account > Identification (IBAN or Other)
    - Agent > FinancialInstitutionIdentification (BIC or ClearingSystemMemberId)

---

## 4. FEE HANDLING REQUIREMENTS

### 4.1 Fee Types

| Fee Type | Charged By | Collection Method | Deducted from Payment Value |
|----------|-----------|-------------------|----------------------------|
| Source PSP Invoiced Fee | Source PSP | Separate invoice to Sender | No |
| Source PSP Deducted Fee | Source PSP | Deducted before transfer to SAP | Yes |
| Destination PSP Deducted Fee | Destination PSP | Deducted before crediting Recipient | Yes |
| FXP Revenue | FX Provider | Built into exchange rate spread | No |
| SAP Fee | SAP | Billed to FXP outside Nexus | No |
| Nexus Scheme Fee | Nexus | Billed to Source IPS | No |

### 4.2 Upfront Fee Display Requirements (CRITICAL)

**Before Sender approves payment, Source PSP MUST display:**

1. **Exact amount to be debited** from Sender's account (in Source Currency)
2. **Exact amount to be credited** to Recipient's account (in Destination Currency)
3. **Effective exchange rate** (ratio: credit amount / debit amount)
4. **Any fees** charged by Source PSP

**Two display options for exchange rate:**
- **Option A:** Show only Effective Exchange Rate
- **Option B:** Show fees + defined exchange rate + effective rate

### 4.3 Fee Calculation Logic

**When Sender defines amount in Source Currency:**
```
QuoteRequestAmount = SenderAmount - SourcePSPDeductedFee
InterbankSettlementAmount (SRC) = QuoteRequestAmount
InterbankSettlementAmount (DST) = QuoteRequestAmount × ExchangeRate
CreditorAccountAmount = InterbankSettlementAmount(DST) - DestinationPSPDeductedFee
```

**When Sender defines amount in Destination Currency:**
```
InterbankSettlementAmount (DST) = SenderAmount + DestinationPSPDeductedFee
InterbankSettlementAmount (SRC) = InterbankSettlementAmount(DST) / ExchangeRate
DebtorAccountAmount = InterbankSettlementAmount(SRC) + SourcePSPDeductedFee
```

### 4.4 Destination PSP Deducted Fee Calculation

- Formula is set at **country level** in Nexus Scheme Rulebook
- Changes at minimum on 1st of each month
- **MUST NOT** be hardcoded by Source PSP
- Retrieved via `GET /quotes` or `GET /fee-formulas/creditor-agent-fee/{country}/{currency}`
- Must be recorded in pacs.008 Charges Information block

### 4.5 Charges Information Block in pacs.008

```xml
<ChrgBr>SHA_R</ChrgBr>
<ChrgsInf>
  <Amt Ccy="{SourceCurrency}">{SourcePSPDeductedFee}</Amt>
  <Agt>
    <FinInstnId>
      <BICFI>{SourcePSPBIC}</BICFI>
    </FinInstnId>
  </Agt>
</ChrgsInf>
<ChrgsInf>
  <Amt Ccy="{DestinationCurrency}">{DestinationPSPDeductedFee}</Amt>
  <Agt>
    <FinInstnId>
      <BICFI>{DestinationPSPBIC}</BICFI>
    </FinInstnId>
  </Agt>
</ChrgsInf>
```

---

## 5. CURRENCY HANDLING REQUIREMENTS

### 5.1 Source vs Destination Currency

| Aspect | Source Currency | Destination Currency |
|--------|----------------|---------------------|
| **Definition** | Currency of Sender's account | Currency of Recipient's account |
| **Amount Type** | DebtorAccountAmount | CreditorAccountAmount |
| **Fee Currency** | Source PSP Deducted Fee | Destination PSP Deducted Fee |
| **Interbank Settlement** | Amount transferred to FXP at Source SAP | Amount transferred from FXP at Destination SAP |

### 5.2 Amount Fields Summary

| Field | Currency | Description |
|-------|----------|-------------|
| Instructed Amount | SRC or DST | Amount defined by Sender |
| Interbank Settlement Amount (SRC) | Source Currency | Amount Source PSP transfers to FXP |
| Interbank Settlement Amount (DST) | Destination Currency | Amount FXP transfers to Destination PSP |
| Creditor Account Amount | Destination Currency | Final amount credited to Recipient |

### 5.3 Currency Conversion Flow

1. FXP provides base exchange rate to Nexus
2. Nexus applies tier-based improvements (if applicable)
3. Nexus applies PSP-based improvements (if applicable)
4. Nexus calculates Destination PSP Deducted Fee
5. Quote includes all amounts in both currencies
6. pacs.008 includes AgreedRate with Quote ID
7. Nexus validates exchange rate against Quote ID on receipt of pacs.008

### 5.4 Maximum Transaction Amounts

- Retrieved via `GET /countries/{code}/currencies/{currency}/max-amounts`
- Applied per currency (some countries have multiple currencies)
- Quotes API automatically applies these limits
- Client-side validation recommended (HTML max attribute)

---

## 6. ACTOR REGISTRATION REQUIREMENTS

### 6.1 Key Actors in Nexus

| Actor | Role | Registration Requirements |
|-------|------|--------------------------|
| **PSP (Payment Service Provider)** | Send/receive payments | IPS member, Nexus addendum to scheme rulebook |
| **FXP (FX Provider)** | Provide currency conversion | Business relationship with PSPs, SAP accounts |
| **SAP (Settlement Access Provider)** | Provide IPS access to FXPs | IPS direct member, real-time sanctions screening |
| **PDO (Proxy Directory Operator)** | Operate proxy directory | Onboard via IPSO, provide address type definitions |
| **IPSO (IPS Operator)** | Operate instant payment system | Nexus membership, translation capabilities |

### 6.2 FXP Registration Requirements

1. **Must have accounts at SAPs** in both Source and Destination countries
2. **Must register accounts with Nexus** (locked to specific FXP)
3. **Must provide live FX rates** via API or Service Desk
4. **Must establish business relationships** with PSPs (for PSP-based improvements)
5. **Must honor quotes for 600 seconds** minimum
6. **Should operate 24/7** (exceptions possible for smaller institutions)

### 6.3 PSP Registration Requirements

1. Must be member of Source IPS
2. Must sign Nexus addendum to domestic scheme rulebook
3. Must implement transparency requirements for fee display
4. Must support proxy/account resolution (acmt.023/acmt.024)
5. Must perform sanctions screening

### 6.4 SAP Registration Requirements

1. Must have **direct IPS membership** (no indirect/sponsored access)
2. Must support real-time sanctions screening
3. Must be able to process pacs.008 or equivalent
4. Must not deduct fees from payment value (bill FXP separately)

---

## 7. CALLBACK URL SPECIFICATIONS

### 7.1 Asynchronous Message Callbacks

When submitting ISO messages, the caller must provide callback endpoints:

| Request | Callback Parameter | Response Type |
|---------|-------------------|---------------|
| POST /iso20022/acmt023 | `acmt024Endpoint` (query param) | acmt.024 XML |
| POST /iso20022/pacs008 | `pacs002Endpoint` (query param) | pacs.002 XML |

### 7.2 FXP Notification Webhook

When payment is successfully processed:
- Nexus sends notification to FXP-provided API endpoint
- Sent after receiving pacs.002 with ACCC status
- Includes: UETR, amount, currencies
- FXP uses this for liquidity tracking

### 7.3 Reconciliation Reports

- Available via API with filters (date range, status, FIs)
- Periodic machine-readable reports in camt.054 format
- Contains all transactions with final status (ACCC, RJCT, BLCK)
- UETR included for reconciliation

---

## 8. ERROR HANDLING SPECIFICATIONS

### 8.1 pacs.002 Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| `ACCC` | Accepted and credited to recipient | Payment successful |
| `RJCT` | Rejected | Payment failed (reason code required) |
| `BLCK` | Blocked | Funds held due to suspicious activity |
| `ACWP` | Accepted without posting | Manual processing required |

### 8.2 ISO 20022 Error/Reason Codes

**Message Validation Errors:**
- `FF01` - XSD validation failure
- `CH21` - Mandatory element missing/empty or invalid code

**acmt.024 Error Codes:**
| Code | Meaning | When Used |
|------|---------|-----------|
| `AC01` | Incorrect Account Number | Account doesn't exist at Creditor Agent |
| `AC04` | Closed Account Number | Account closed |
| `AC06` | Blocked Account | Account blocked/frozen |
| `AGNT` | Incorrect Agent | PSP exists but not onboarded to Nexus |
| `AB08` | Offline Creditor Agent | Destination PSP can't respond to resolution |
| `BE23` | Account Proxy Invalid | Proxy not registered |
| `DUPL` | Duplicate Request | Duplicate acmt.023 |
| `FRAD` | Fraudulent Origin | Abuse suspected |
| `MD07` | End Customer Deceased | Account holder deceased |
| `RC06` | Invalid Debtor BIC | Invalid BIC provided |
| `RC07` | Invalid Creditor BIC | Invalid Creditor Agent BIC |
| `RR01` | Missing Debtor Account/ID | Required Sender info missing |
| `RR02` | Missing Debtor Name/Address | Required Sender address missing |

**pacs.002 Reject Codes (Selected):**
- `AB04` - Aborted Settlement Fatal Error (invalid exchange rate)
- `RC11` - Invalid Intermediary Agent (SAP account not recognized)
- `TM01` - Timeout (response not received in time)
- `AM02` - Not allowed amount (exceeds limit)
- `AM09` - Wrong amount (settlement amount issue)

### 8.3 Reject Handling Flow

**In Source Leg:**
1. Reject handled by Source IPS
2. Settlement reservation released
3. Source PSP notified via pacs.002
4. Source PSP reverses debit/reservation on Sender account

**In Destination Leg:**
1. Destination IPS sends RJCT pacs.002 to Nexus
2. Nexus forwards to Source IPS
3. Source IPS reverses settlement with Source SAP
4. Source SAP reverses credit on FXP account
5. Source PSP reverses debit on Sender account

### 8.4 Timeout Handling

**Normal Priority (NORM):**
- Nexus waits for Destination IPS response
- If timeout, payment may be in unknown state
- Investigation required via Service Desk

**High Priority (HIGH):**
- Nexus monitors processing time
- If timeout exceeded, Nexus proactively rejects
- Ensures final status within Maximum Execution Time
- May result in slightly higher reject rate

### 8.5 Duplicate Detection

- Nexus detects duplicates by UETR + Message ID combination
- If duplicate UETR with new Message ID → technical reject
- For investigation, PSP can resend pacs.008 with same UETR
- Each party checks if original was processed

---

## 9. AUTHENTICATION REQUIREMENTS

### 9.1 API Authentication

**For FXP API Access:**
- API credentials provided by Nexus
- Credentials for FXPs do NOT allow `GET /quotes` (prevents seeing competitor rates)
- Separate credentials for FXP-role vs PSP-role if entity is both

**For IPSO/PSP API Access:**
- Credentials provided during onboarding
- Access to appropriate endpoints based on role

### 9.2 Message-Level Security

- ISO 20022 messages use XML Signature
- Destination IPS can verify message was updated by Nexus only
- Prevents tampering in transit

### 9.3 Settlement Certainty Requirements

- Source IPS must ensure settlement before forwarding to Nexus
- Options: reserve against prefund, settle immediately, or other mechanism
- Must handle reject even after settlement (in 4-step model)
- Finality achieved when pacs.002 ACCC received

---

## 10. DATA TRANSLATION REQUIREMENTS

### 10.1 ISO 20022 Code Sets (Mandatory)

| Code Type | Purpose |
|-----------|---------|
| ExternalProxyAccountType1Code | Proxy types (MBNO, EMAL, etc.) |
| ExternalStatusReason1Code | Reject reason codes |
| ExternalVerificationReason1Code | Resolution error codes |
| ExternalClearingSystemIdentification1Code | Clearing system IDs |
| ExternalCategoryPurpose1Code | Payment category codes |
| ExternalPurpose1Code | Payment purpose codes |

### 10.2 Translation Rules

**Outbound (Domestic → Nexus):**
- Must map proprietary codes to ISO 20022 codes
- Can restrict input list to subset
- All output codes must have mapping

**Inbound (Nexus → Domestic):**
- Must NOT restrict input ISO 20022 code list
- Must handle all possible codes from any jurisdiction
- Can map multiple ISO codes to single domestic code
- Should define default "other" code for unmapped values

### 10.3 Character Set

- Latin characters: a-z, A-Z, 0-9
- Special characters: `/ - ? : ( ) . , ' + ! # & % * = ^ _ ` { | } ~ " ; @ [ \ ] $ > <`
- Identifiers must not start/end with `/`
- Identifiers must not contain `//`

---

## 11. WEBHOOK SPECIFICATIONS

### 11.1 FXP Payment Notification

**Trigger:** After Nexus receives pacs.002 with ACCC status

**Content:**
- UETR of payment
- Amount and currencies
- Quote ID reference
- Timestamp

**Purpose:** Enable FXP to track liquidity across accounts

### 11.2 Callback Requirements for ISO Messages

- Caller must provide callback URL in query parameter
- Nexus POSTs response to callback URL
- Response is full ISO 20022 XML message
- HTTP 200 expected from callback endpoint

### 11.3 Reconciliation Report Delivery

- Daily periodic reports in camt.054 format
- Available via API with custom date filters
- Contains all transactions since last report
- UETR included for correlation

---

## 12. COMPLIANCE AND SANCTIONS SCREENING

### 12.1 Required Screening Points

| Actor | Screening Responsibility |
|-------|-------------------------|
| Source PSP | Screen Sender before submitting payment |
| Source SAP | Screen if required by local regulations |
| Destination SAP | Screen if required by local regulations |
| Destination PSP | Screen Recipient before crediting account |

### 12.2 Purpose Codes

- Some jurisdictions require Purpose Codes and/or Category Purpose Codes
- Nexus uses ISO 20022 External Code Sets only
- PSPs must translate domestic codes to/from ISO codes
- Response to `GET /countries` indicates if required for destination

### 12.3 Name and Address Requirements

- acmt.024 provides verified name for sanctions screening
- Structured address (Country, Town) recommended
- Date/Place of Birth optional but helps reduce false positives
- Unstructured address supported but structured preferred

---

## 13. TIMING AND SLA REQUIREMENTS

### 13.1 Quote Validity

- **Minimum:** 600 seconds (10 minutes)
- Quotes expire automatically
- Payment using expired quote is rejected

### 13.2 Payment Priority Levels

| Priority | Behavior | Use Case |
|----------|----------|----------|
| `NORM` | Wait for Destination IPS response | P2P, bill payments |
| `HIGH` | Nexus monitors timeout, proactive reject | POS payments, in-store |

### 13.3 Investigation Timeline

- For missing pacs.002 responses
- Can resend pacs.008 with same UETR to check status
- If original received, returns original status
- If original not received, processes as new

---

## Summary for Parity Audit

This analysis provides the complete specifications for:

1. **17 REST API endpoints** with request/response formats
2. **2 ISO 20022 message submission endpoints** (asynchronous)
3. **4 core ISO message types** (pacs.008, pacs.002, acmt.023, acmt.024)
4. **Step-by-step payment flows** for Source, Destination, and Nexus Gateway
5. **Detailed fee calculation logic** with upfront display requirements
6. **Currency conversion handling** with source vs destination logic
7. **Actor registration** for PSPs, FXPs, SAPs, and PDOs
8. **Error codes** for validation, rejection, and timeout scenarios
9. **Webhook/callback specifications** for async message handling
10. **Authentication** and security requirements

All specifications are based on the official Nexus Global Payments documentation dated January 2026.
