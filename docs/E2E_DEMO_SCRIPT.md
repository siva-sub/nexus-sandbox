# Nexus Sandbox E2E Demo Script

This document provides step-by-step instructions for demonstrating the complete payment lifecycle in the Nexus Sandbox.

---

## Prerequisites

1. **Start the services**:
   ```bash
   cd /home/siva/Projects/Nexus\ Global\ Payments\ Sandbox
   docker-compose up -d
   ```

2. **Access the dashboard**: Open `http://localhost:8080`

3. **Verify API status**: Green "API: connected" badge in header

> **Quick Alternative**: Don't want to follow all steps? Click **Quick Demo** on the Interactive Demo page (`/demo`) to see a full payment execute in ~10 seconds.

---

## Happy Flow Demo

### Step 1: View Registered Actors

1. Navigate to **Actors** page from sidebar
2. Observe 7+ pre-seeded actors:
   - `DBSSSGSG` (PSP - DBS Singapore)
   - `KASITHBK` (PSP - Kasikorn Bank Thailand)
   - `MABORKKL` (PSP - Maybank Malaysia)
   - `FXP-ABC` (FXP - ABC Currency Exchange)
   - `DBSSSGSG` (SAP - DBS Singapore)
   - `FAST` (IPS - Singapore FAST)
   - `PromptPay` (IPS - Thailand PromptPay)
   - Plus: Philippines, Indonesia, India actors

**Expected**: All actors show status `ACTIVE`

---

### Step 2: Proxy Resolution (acmt.023 → acmt.024)

1. Navigate to **Send Payment** page
2. Fill in:
   - Source Country: **Singapore**
   - Destination Country: **Thailand**
   - Proxy Type: **Mobile Number**
   - Proxy Value: `+66812345678`
3. Click **Resolve Proxy**

**API Call**:
```bash
POST /v1/addressing/resolve
{
  "proxyType": "MBNO",
  "proxyValue": "+66812345678",
  "destinationCountry": "TH"
}
```

**Expected Response**:
```json
{
  "resolutionId": "...",
  "accountNumber": "0123456789",
  "agentBic": "KASITHBK",
  "beneficiaryName": "Somchai Thai",
  "status": "VALIDATED"
}
```

---

### Step 3: FX Quote (camt.030 equivalent)

1. Enter Amount: **1000 SGD**
2. Select **Fee Type**:
   - **INVOICED**: Fee added on top, recipient gets full amount
   - **DEDUCTED**: Fee deducted from transfer, recipient gets less
3. Click **Get Quote**

**API Call**:
```bash
GET /v1/quotes/SG/SGD/TH/THB/SGD/1000
```

**Expected Response**:
```json
{
  "quotes": [{
    "quoteId": "quote-uuid",
    "fxpName": "Nexus FXP Alpha",
    "exchangeRate": "25.50",
    "sourceInterbankAmount": "1000.00",
    "destinationInterbankAmount": "25500.00",
    "expiresAt": "2026-02-03T15:10:00.000Z"
  }]
}
```

**Note**: Fee type affects the total cost:
- INVOICED: Total = Principal + Fee
- DEDUCTED: Total = Principal (recipient gets Principal - Fee converted)

---

### Step 4: Pre-Transaction Disclosure & Intermediary Agents

1. Review the disclosure breakdown:
   - Exchange Rate (market vs customer rate)
   - Fees (Nexus scheme fee, PSP fees)
   - Total amount receiver gets
   - Applied spread in basis points
   
2. View **Intermediary Agents** (Step 13):
   - Source SAP BIC (e.g., `DBSSSGSG`)
   - Destination SAP BIC (e.g., `BBLTHBK`)
   - Routing path visualization

3. Click **Accept Quote**

**API Calls**:
```bash
# Get fee breakdown
GET /v1/fees-and-amounts?quoteId={quoteId}&sourceFeeType=INVOICED

# Get intermediary agents
GET /v1/quotes/{quoteId}/intermediary-agents
```

---

### Step 5: Payment Execution (pacs.008)

1. Review **Sanctions Screening** section (Steps 10-11):
   - Enter recipient address (if required by corridor)
   - Enter date of birth (if required)
   - Enter national ID (if required)

2. Enter **Payment Reference** (Step 12):
   - Optional message to recipient (max 140 chars)
   - Stored in `RmtInf/Strd/CdtrRefInf/Ref`

3. Select **Instruction Priority**:
   - **HIGH**: 25-second timeout (urgent)
   - **NORM**: 4-hour timeout (standard)

4. Check **Explicit Confirmation** checkbox

5. Click **Confirm & Send**

**ISO Message Lifecycle**:
```
┌─────────────────────────────────────────────────────────────┐
│ 1. PSP (DBSSSGSG) → IPS-SG → NEXUS GATEWAY                 │
│    pacs.008 with:                                          │
│    - InstgAgt=DBSSSGSG, InstdAgt=FAST                  │
│    - AccptncDtTm (Acceptance Date Time)                    │
│    - InstrPrty (HIGH/NORM)                                 │
│    - ClrSys (SGFAST)                                       │
│    - IntrmyAgt1 (Source SAP BIC)                           │
│    - IntrmyAgt2 (Dest SAP BIC)                             │
│    - RmtInf (Payment Reference)                            │
├─────────────────────────────────────────────────────────────┤
│ 2. NEXUS GATEWAY transform_pacs008():                       │
│    - InstgAgt: DBSSSGSG → PromptPay (Dest IPS)              │
│    - InstdAgt: FAST → KASITHBK (Dest PSP)              │
│    - PrvsInstgAgt1: FAST (audit trail)                 │
│    - IntrBkSttlmAmt: 1000 SGD → 25500 THB                  │
├─────────────────────────────────────────────────────────────┤
│ 3. NEXUS GATEWAY → IPS-TH → PSP (KASITHBK)                 │
│    Transformed pacs.008 with Thai currency/agents           │
├─────────────────────────────────────────────────────────────┤
│ 4. IPS-TH → NEXUS → IPS-SG → PSP                           │
│    pacs.002 with Status=ACSC (Accepted Settlement Completed) │
│    + HMAC-SHA256 signature for callback authentication       │
└─────────────────────────────────────────────────────────────┘
```

**Mandatory Fields in pacs.008.001.13**:
- `AccptncDtTm` - ISO 8601 timestamp
- `InstrPrty` - HIGH (25s) or NORM (4hr)
- `ClrSys/Prtry` - Clearing system code
- `IntrmyAgt1` - Source SAP
- `IntrmyAgt2` - Destination SAP
- `RmtInf/Strd/CdtrRefInf/Ref` - Payment reference

---

### Step 6: Verify in ISO Explorer

1. Navigate to **Messages** page
2. Search by UETR
3. View the message sequence:
   - `acmt.023` → `acmt.024`
   - `pacs.008` (outbound)
   - `pacs.008` (transformed)
   - `pacs.002` (status)

---

## Unhappy Flow Demos

### Error 1: Invalid Proxy (BE23)

**Input**: Proxy value `+66999999999` (not in directory)

**Expected**:
```json
{
  "status": "INVALID",
  "reasonCode": "BE23",
  "reasonText": "Account/Proxy Invalid"
}
```

**UI**: Red error alert "Beneficiary not found"

---

### Error 2: Expired Quote (AB04)

**Scenario**: Wait 10+ minutes after quote, then try to submit

**Expected**:
```json
{
  "status": "REJECTED",
  "statusReasonCode": "AB04",
  "message": "Quote expired"
}
```

**UI**: Modal "Quote has expired. Request a new quote."

---

### Error 3: Rate Mismatch (AB04)

**Scenario**: Quote rate changed between request and execution

**Expected**:
```json
{
  "status": "REJECTED",
  "statusReasonCode": "AB04",
  "message": "Agreed rate does not match"
}
```

---

### Error 4: Invalid SAP (RC11)

**Scenario**: SAP BIC not found in registry

**Expected**:
```json
{
  "status": "REJECTED",
  "statusReasonCode": "RC11",
  "message": "Invalid Intermediary Agent"
}
```

---

## API Quick Reference

| Step | Endpoint | Method | ISO Message |
|------|----------|--------|-------------|
| Register Actor | `/v1/actors/register` | POST | - |
| Resolve Proxy | `/v1/addressing/resolve` | POST | acmt.023 |
| Get Quote | `/v1/quotes` | GET | camt.030 |
| Submit Payment | `/v1/iso20022/pacs008` | POST | pacs.008 |
| Get Status | `/v1/payments/{uetr}/events` | GET | pacs.002 |

---

## ISO 20022 Status Codes

| Code | Meaning | When |
|------|---------|------|
| `ACSC` | Accepted Settlement Completed | Payment successful |
| `ACCC` | Accepted Credit Settlement Completed | Legacy/alternative success code |
| `AB04` | Aborted - Settlement Fatal Error | Quote expired / rate mismatch |
| `BE23` | Account/Proxy Invalid | Proxy not found |
| `RC11` | Invalid Intermediary Agent | Bad SAP BIC |
| `AM04` | Insufficient Funds | Settlement failure |
| `TM01` | Timeout | Processing exceeded SLA |

---

## Network Mesh View

Navigate to **Network Mesh** to see the real-time topology:

- **Green nodes**: Active actors
- **Blue edges**: Payment flows
- **Animated particles**: Messages in transit

---

**Questions?** Check the [Integration Guide](./INTEGRATION_GUIDE.md) or API docs at `/docs`.
