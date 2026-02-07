# Nexus Sandbox Integration Guide

This guide explains how external developers can plug their own components (FXP, IPSO, PSP, SAP, PDO) into the Nexus Sandbox for testing and validation.

## 1. Sandbox Overview: Why Protocol Parity Matters

A "Sandbox" in the Nexus context is more than just a mock API. It is a **high-fidelity simulation** that enforces the official Nexus Technical Blueprint.

### What this Sandbox provides:
- **✅ Protocol Parity**: Every message (pacs.008, pacs.002, etc.) is handled as real ISO 20022 XML, not simplified JSON. 
- **✅ Message Inspection**: Every XML payload is stored and viewable in the **ISO Explorer** for forensic audit.
- **✅ Real Transformations**: See how Nexus performs **Agent Swapping** and **Amount Conversion** between source and destination legs.
- **✅ Compliance Validation**: All messages are validated against official XSD schemas (Release 1, Optional SAP, and Roadmap types).
- **✅ Deterministic Error Handling**: Simulate rejections with real ISO 20022 reason codes (BE23, AB04, AM02, etc.).

### Supported Corridors
| Source Country | Destination Country | Currency Pair |
|----------------|---------------------|---------------|
| Singapore (SG) | Thailand (TH)       | SGD → THB     |
| Singapore (SG) | Malaysia (MY)       | SGD → MYR     |
| Thailand (TH)  | Singapore (SG)      | THB → SGD     |

### Pre-Seeded Actors

The sandbox includes 6 pre-registered actors for immediate testing:

| BIC          | Actor Type | Name                     | Country |
|--------------|------------|--------------------------|---------|
| `DBSSSGSG`   | PSP        | DBS Bank Singapore       | SG      |
| `KASITHBK`   | PSP        | Kasikorn Bank Thailand   | TH      |
| `MABORKKL`   | PSP        | Maybank Malaysia         | MY      |
| `FXP-ABC`    | FXP        | ABC Currency Exchange    | SG      |
| `SGIPSOPS`   | IPSO       | Singapore FAST IPS       | SG      |
| `THIPSOPS`   | IPSO       | Thailand PromptPay IPS   | TH      |

---

## 2. Registering Your Actor

### 2.1. Self-Service Registration API

Register your component using the following endpoint:

```bash
POST /v1/actors/register
Content-Type: application/json

{
  "bic": "YOURPSPXXX",
  "actorType": "PSP",  // FXP | IPSO | PSP | SAP | PDO
  "name": "Your Organization Name",
  "countryCode": "SG",
  "callbackUrl": "https://your-server.com/nexus/callback"  // Optional
}
```

**Response:**
```json
{
  "actorId": "actor-a1b2c3d4",
  "bic": "YOURPSPXXX",
  "actorType": "PSP",
  "name": "Your Organization Name",
  "countryCode": "SG",
  "callbackUrl": "https://your-server.com/nexus/callback",
  "registeredAt": "2026-02-03T14:30:00.000Z",
  "status": "ACTIVE"
}
```

### 2.2. Viewing Registered Actors

```bash
GET /v1/actors
GET /v1/actors?actorType=FXP
GET /v1/actors?countryCode=SG
GET /v1/actors/YOURPSPXXX
```

### 2.3. Updating Callback URL

```bash
PATCH /v1/actors/YOURPSPXXX/callback
Content-Type: application/json

{
  "callbackUrl": "https://new-server.com/nexus/callback"
}
```

---

## 3. Connectivity Models

### Direct Participants (FXP, IPSO)

| Actor Type | Connection | Protocol | Callback Support |
|------------|------------|----------|------------------|
| **FXP**    | Direct to Nexus Gateway | HTTPS REST API | ✅ Supported |
| **IPSO**   | Direct to Nexus Gateway | ISO 20022 / VPN | ✅ Supported |

**FXP Integration Flow:**
1. Register your FXP via `/v1/actors/register`.
2. Submit rates via `POST /v1/rates`.
3. Receive "Trade Notification" webhooks when your rate is selected.

### Indirect Participants (PSP, SAP, PDO)

| Actor Type | Connection | Protocol | Callback Support |
|------------|------------|----------|------------------|
| **PSP**    | Via Domestic IPSO | Domestic Standard | ❌ Via IPSO |
| **SAP**    | Via Domestic IPSO | Domestic Standard | ❌ Via IPSO |
| **PDO**    | Via Domestic IPSO | ISO 20022 API | ❌ Via IPSO |

**PSP Integration Flow:**
1. Connect to your simulated domestic IPSO endpoint (e.g., `ips-sg`).
2. Send `pacs.008` messages for payment initiation.
3. Receive `pacs.002` status responses from IPSO.

---

## 4.1. Sanctions Screening (FATF R16 Compliance)

The sandbox implements **FATF Recommendation 16** sanctions screening for cross-border payments.

### Screening Process

Sanctions screening occurs during **Steps 10-11** of the payment flow:

1. **Data Collection**: Sender and recipient information is collected
2. **Screening**: Names are checked against sanctions lists
3. **Decision**: Payment is blocked if a match is found

**API Endpoint**:
```bash
POST /v1/sanctions/screen
Content-Type: application/json

{
  "debtorName": "John Doe",
  "creditorName": "Jane Smith",
  "debtorCountry": "SG",
  "creditorCountry": "TH",
  "amount": 1000,
  "currency": "SGD"
}
```

**Response**:
```json
{
  "screeningResult": "PASS",
  "debtorMatch": false,
  "creditorMatch": false,
  "matchedLists": [],
  "timestamp": "2026-02-07T10:30:00Z"
}
```

### Demo Sanctions List

The sandbox includes a demo sanctions list for testing. The following names will trigger **RR04** (Regulatory Block):
- Kim Jong Un
- Vladimir Putin
- Osama bin Laden

Configure via environment variable:
```bash
SANCTIONS_REJECT_NAMES=Kim Jong Un,Vladimir Putin,Osama bin Laden
```

### Error Codes

| Code | Description |
|------|-------------|
| `RR04` | Regulatory Block - AML/CFT screening failed |
| `AM02` | Amount Limit Exceeded - Above reporting threshold |
| `AC06` | Account Inactive - Recipient account is dormant |

**Reference**: [Sanctions Screening](https://docs.nexusglobalpayments.org/compliance/sanctions-screening/)

---

## 4.2. FXP Integration

Foreign Exchange Providers (FXPs) submit rates and receive trade notifications.

### Rate Submission

```bash
POST /v1/fxp/rates
Content-Type: application/json

{
  "fxpCode": "FXP-ABC",
  "sourceCurrency": "SGD",
  "destinationCurrency": "THB",
  "baseRate": 25.85,
  "spreadBps": 50,
  "validFrom": "2026-02-07T00:00:00Z",
  "validUntil": "2026-02-07T23:59:59Z"
}
```

### Tier-Based Improvements

FXPs can offer better rates for high-volume transactions:

```bash
POST /v1/fxp/tier-improvements
Content-Type: application/json

{
  "fxpCode": "FXP-ABC",
  "currencyPair": "SGD-THB",
  "improvements": [
    {"minAmount": 1000, "improvementBps": 5},
    {"minAmount": 10000, "improvementBps": 10},
    {"minAmount": 50000, "improvementBps": 15}
  ]
}
```

### PSP Relationship Pricing

FXPs can offer preferential rates to specific PSPs:

```bash
POST /v1/fxp/psp-relationships
Content-Type: application/json

{
  "fxpCode": "FXP-ABC",
  "pspBic": "DBSSSGSG",
  "improvementBps": 5
}
```

**Reference**: [FX Provision](https://docs.nexusglobalpayments.org/fx-provision/)

---

## 4.3. SAP Integration

Settlement Access Providers (SAPs) manage FXP nostro/vostro accounts.

### Liquidity Management

```bash
# Check FXP account balance
GET /v1/sap/accounts/{fxpId}

# Credit FXP account (after receiving funds)
POST /v1/sap/accounts/{fxpId}/credit
{
  "amount": 1000000,
  "currency": "SGD",
  "reference": "Funding from FXP head office"
}

# Debit FXP account (for settlement)
POST /v1/sap/accounts/{fxpId}/debit
{
  "amount": 50000,
  "currency": "THB",
  "reference": "Settlement for quote {quoteId}"
}
```

### Intermediary Agent Information

```bash
GET /v1/sap/intermediary-agent
```

Returns SAP routing information for payment settlement.

**Reference**: [Settlement Access](https://docs.nexusglobalpayments.org/settlement-access-provision/)

---

## 5. ISO 20022 Message Examples

### 4.1. Proxy Resolution (`acmt.023` / `acmt.024`)

**Request (acmt.023):**
```bash
POST /v1/addressing/resolve
Content-Type: application/json

{
  "proxyType": "MBNO",
  "proxyValue": "+66812345678",
  "destinationCountry": "TH"
}
```

**Response (acmt.024 equivalent):**
```json
{
  "resolutionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "accountNumber": "0123456789",
  "accountType": "BBAN",
  "agentBic": "KASITHBK",
  "beneficiaryName": "Somchai Thai",
  "displayName": "Somchai T.",
  "status": "VALIDATED",
  "timestamp": "2026-02-03T14:45:00.000Z"
}
```

Refer to the [Message Examples Guide](./MESSAGE_EXAMPLES.md) for full ISO 20022 XML payloads for all 11 supported types.

### 4.2. Payment Instruction (`pacs.008`)

Refer to `/v1/iso20022/pacs008` for submitting payment instructions. The gateway performs:

1. **Quote Validation**: Checks `AgreedRate` UUID against stored quotes.
2. **Agent Swapping**:
   - `InstgAgt`: Source PSP → Destination SAP
   - `InstdAgt`: Source SAP → Destination PSP
3. **Amount Conversion**: `IntrBkSttlmAmt` converted using agreed FX rate.

---

## 5. Message Observation & Audit

One of the primary values of the Nexus Sandbox is the ability to inspect the real-time transformation and transmission of messages.

### 5.1. How to Inspect Messages via API

Retrieve all messages linked to a UETR using the Message Observatory API:

```bash
GET http://localhost:8000/v1/payments/{uetr}/messages
```

This returns a list of all 11 message types (if triggered), including:
- Original incoming message (e.g., `pacs.008` from Source PSP)
- Transformed outgoing message (e.g., `pacs.008` to Destination IPS)
- Confirmation/Rejection messages (`pacs.002`)
- Proxy resolution audit trail (`acmt.023`, `acmt.024`)

### 5.2. ISO Explorer (UI)

Visit the **ISO Explorer** in the Dashboard to view a side-by-side comparison of message flows:
- **Dashboard**: `http://localhost:8080/explorer`
- **Messages Tab**: Click on any transaction and select the "Messages" tab to see syntax-highlighted XML.

---

## 6. Integration Testing Workflow

Follow this step-by-step guide to validate your external component:

1. **Register Your Actor**: Use `POST /v1/actors/register` with your `callbackUrl`.
2. **Retrieve Reference XML**: Copy the baseline payload from [MESSAGE_EXAMPLES.md](./MESSAGE_EXAMPLES.md).
3. **Submit a Payment**: Send a `pacs.008` to `POST /v1/iso20022/pacs008`.
4. **Trigger Unhappy Flows**: Use the trigger values in Section 7.4 to ensure your error handling is compliant.
5. **Verify Lifecycle Trace**: Confirm the transaction reaches **ACSC** (Settlement Confirmed) status in the explorer.
6. **Audit XML Transformations**: Use the Message Observatory API to confirm `Agent Swapping` occurred correctly for your corridor.

---

## 7. Testing Your Integration

### 5.1. End-to-End Flow

1. **Register Actor** → `POST /v1/actors/register`
2. **Request Quote** → `GET /v1/quotes?sourceCountry=SG&destCountry=TH&amount=1000&amountType=SOURCE`
3. **Resolve Proxy** → `POST /v1/addressing/resolve`
4. **Submit Payment** → `POST /v1/iso20022/pacs008`
5. **Check Status** → `GET /v1/payments/{uetr}/events`

### 5.2. Dashboard Verification

View your transaction lifecycle at:
- **Payment Dashboard**: `http://localhost:8080`
- **ISO Explorer**: `http://localhost:8080/messages`
- **Mesh Visualizer**: `http://localhost:8080/mesh`
- **Service Desk**: `http://localhost:8080/service-desk` (manual disputes/recalls)

### 5.3. Happy Flow Testing

| Step | Actor | Endpoint | Expected Result |
|------|-------|----------|-----------------|
| Quote Retrieval | FXP | `GET /v1/fxp/rates` | Valid rates with finalRate |
| Proxy Resolution | IPS→PDO | `POST /v1/addressing/resolve` | account + BIC returned |
| Payment Instruction | IPS | `POST /v1/iso20022/pacs008` | ACSP status, callback URL |
| Settlement Confirmation | All | Callback to `pacs002Endpoint` | ACSC status in pacs.002 |

### 5.4. Unhappy Flow Testing

Test error handling by triggering specific rejection scenarios:

| Scenario | Trigger Value | Expected Code | Actor Response |
|----------|--------------|---------------|----------------|
| Invalid Proxy | Phone: `+66999999999` | BE23 | pacs.002 RJCT |
| Quote Expired | Wait 10+ min after quote | AB04 | pacs.002 RJCT |
| Amount Limit | Amount > 50,000 | AM02 | pacs.002 RJCT |
| Insufficient Funds | Amount ending in `99999` | AM04 | pacs.002 RJCT |
| Closed Account | Phone: `+60999999999` | AC04 | pacs.002 RJCT |
| Regulatory Block | Phone: `+62999999999` | RR04 | pacs.002 RJCT |
| Duplicate Payment | Reuse UETR | DUPL | pacs.002 RJCT |

### 5.5. Callback Testing

Test that your `callbackUrl` correctly receives ISO messages:

```bash
# 1. Register with callback URL
curl -X POST http://localhost:8000/v1/actors/register \
  -H "Content-Type: application/json" \
  -d '{"bic": "TESTSGSG", "name": "Test Actor", "actorType": "PSP", "callbackUrl": "https://your-webhook.com/nexus"}'

# 2. Test callback delivery
curl -X POST http://localhost:8000/v1/actors/TESTSGSG/callback-test

# 3. Verify your endpoint received the test message
```

### 5.6. Return Payment Testing (pacs.008 with NexusOrgnlUETR)

In Nexus Release 1, return payments use `pacs.008` with the original UETR in remittance info:

```xml
<RmtInf>
  <AddtlRmtInf>NexusOrgnlUETR:91398cbd-0838-453f-b2c7-536e829f2b8e</AddtlRmtInf>
</RmtInf>
```

**Testing Steps:**
1. Complete a payment successfully (ACSC status)
2. Note the original UETR
3. Submit a new `pacs.008` with `NexusOrgnlUETR:` prefix
4. Verify `RETURN_LINKED` event in Message Observatory

> **Note:** The Nexus Sandbox fully supports `pacs.004` (Return) and `camt.056` (Recall) workflows for testing purposes, enabling developers to simulate refund and cancellation scenarios.

---

## 6. FXP Integration Guide

### 6.1. Rate Submission with Improvements

FXPs can submit rates with tier-based improvements:

```bash
POST /v1/fxp/rates
Content-Type: application/json

{
  "fxpId": "YOURFXPXXX",
  "sourceCurrency": "SGD",
  "destinationCurrency": "THB",
  "baseRate": 25.45,
  "improvements": [
    { "tier": 0, "bpsImprovement": 5 },
    { "tier": 10000, "bpsImprovement": 10 },
    { "tier": 50000, "bpsImprovement": 15 }
  ],
  "validUntil": "2026-02-03T16:00:00Z"
}
```

### 6.2. PSP Relationship Configuration

Configure PSP-specific pricing:

```bash
POST /v1/fxp/psp-relationships
Content-Type: application/json

{
  "fxpId": "YOURFXPXXX",
  "pspId": "DBSSSGSG",
  "markupBps": 2,
  "specialTerms": "preferential"
}
```

### 6.3. Trade Notifications

FXPs receive webhooks when their rate is selected:

```bash
GET /v1/fxp/notifications
```

Response includes trade details, UETR, and settlement instructions.

---

## 7. SAP Integration Guide

### 7.1. Nostro Account Management

Settlement Access Providers manage FXP accounts:

```bash
POST /v1/sap/nostro-accounts
Content-Type: application/json

{
  "fxpId": "FXP-ABC",
  "accountNumber": "1234567890",
  "accountCurrency": "SGD",
  "sapBic": "SGSAPXXX"
}
```

### 7.2. Liquidity Operations

Reserve liquidity for trades:

```bash
POST /v1/sap/liquidity/reserve
Content-Type: application/json

{
  "fxpId": "FXP-ABC",
  "amount": 100000,
  "currency": "SGD",
  "referenceUetr": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

Release reserved liquidity:

```bash
POST /v1/sap/liquidity/release
Content-Type: application/json

{
  "fxpId": "FXP-ABC",
  "currency": "SGD",
  "referenceUetr": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

### 7.3. Reconciliation Reports

Generate camt.054-style reconciliation:

```bash
POST /v1/sap/reconciliation
Content-Type: application/json

{
  "fxpId": "FXP-ABC",
  "startDate": "2026-02-01",
  "endDate": "2026-02-03"
}
```

---

## 8. Callback Authentication (HMAC)

All callbacks are authenticated using HMAC-SHA256 signatures to ensure message integrity.

### 8.1. Callback Headers

```http
POST /your/callback/endpoint
X-Callback-Signature: sha256=abc123def456...
X-Callback-Timestamp: 1704067200
Content-Type: application/json
```

### 8.2. Signature Verification

**Python:**
```python
import hmac
import hashlib

def verify_callback(payload: str, signature: str, secret: str, timestamp: str) -> bool:
    """
    Verify HMAC-SHA256 callback signature
    
    Args:
        payload: Raw request body as string
        signature: Value from X-Callback-Signature header (without 'sha256=' prefix)
        secret: Shared secret provided during actor registration
        timestamp: Value from X-Callback-Timestamp header
    """
    message = f"{timestamp}:{payload}"
    expected = hmac.new(
        secret.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```

**Node.js:**
```javascript
const crypto = require('crypto');

function verifyCallback(payload, signature, secret, timestamp) {
    const message = `${timestamp}:${payload}`;
    const expected = crypto
        .createHmac('sha256', secret)
        .update(message)
        .digest('hex');
    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
    );
}
```

### 8.3. Test Endpoint

Verify your callback handling:

```bash
curl -X POST http://localhost:8000/v1/actors/YOURBIC/callback-test
```

This sends a test callback with a valid HMAC signature to your registered URL.

---

## 9. Assumptions & Limitations

| Assumption | Description |
|------------|-------------|
| A25 | Self-service registration via `callbackUrl` |
| A26 | Direct connectivity for FXP/IPSO only |
| A27 | In-memory registry for sandbox simplicity |

For the complete list, see `docs/assumptions/09_actor_integration.md`.

---

**Questions?** Check the API docs at `http://localhost:8080/api/docs` (Swagger UI) or `/api/redoc`.
