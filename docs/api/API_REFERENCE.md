# API Reference: Nexus Global Payments (Complete)

> **Purpose**: This is the **complete API documentation** for integrating with the Nexus Global Payments platform. It contains all endpoints, schemas, and specifications.

> **Quick Reference**: For a concise overview of commonly used endpoints, see the root-level [API_REFERENCE.md](../../API_REFERENCE.md) file.

> **Note**: This sandbox implementation currently operates without authentication for development convenience.

## ⚠️ Important: Sandbox vs Official Nexus

This documentation covers **two different environments**:

1. **This Sandbox** (local development): `http://localhost:8000/v1`
   - Runs on your local machine via Docker
   - No authentication required
   - For development and testing only

2. **Official Nexus Global Payments** (production): `https://api.nexusglobalpayments.org/v1`
   - The real Nexus platform operated by founding central banks
   - Requires OAuth 2.0 authentication
   - For production integrations

The URLs shown below reference the **official Nexus platform**. When using this sandbox locally, replace with `http://localhost:8000/v1`.

## Base URLs

| Environment | URL | Notes |
|-------------|-----|-------|
| **This Sandbox (Local)** | `http://localhost:8000/v1` | Use this for local development |
| **Official Production** | `https://api.nexusglobalpayments.org/v1` | Real Nexus platform |
| **Official Sandbox** | `https://sandbox.nexusglobalpayments.org/v1` | Official test environment |

## Authentication

### Official Nexus Platform (Production)

All API requests to the official Nexus platform require OAuth 2.0 Bearer tokens:

```bash
curl -X POST https://auth.nexusglobalpayments.org/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "scope=quotes:read payments:submit proxy:resolve"
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "quotes:read payments:submit proxy:resolve"
}
```

### This Sandbox (Local Development)

This sandbox runs **without authentication** for development convenience. Simply make requests directly:

```bash
curl http://localhost:8000/v1/countries
```

> **Note**: While the code includes OAuth infrastructure (client credentials, token endpoints), authentication is bypassed in sandbox mode.

```bash
curl -X POST https://auth.nexusglobalpayments.org/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "scope=quotes:read payments:submit proxy:resolve"
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "quotes:read payments:submit proxy:resolve"
}
```

---

## 1. Discovery API

### GET /countries

Retrieve list of countries enabled for Nexus payments.

**Response:**
```json
{
  "countries": [
    {
      "code": "SG",
      "name": "Singapore",
      "currencies": ["SGD"],
      "maxAmount": {
        "SGD": 200000.00
      },
      "addressTypes": ["MOBI", "ACCT", "PROXY"]
    },
    {
      "code": "TH",
      "name": "Thailand",
      "currencies": ["THB"],
      "maxAmount": {
        "THB": 5000000.00
      },
      "addressTypes": ["MOBI", "ACCT", "PROMPTPAY"]
    }
  ]
}
```

### GET /countries/{countryCode}

Retrieve details for a specific country.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `countryCode` | path | ISO 3166-1 alpha-2 country code |

### GET /countries/{countryCode}/address-types

Retrieve address types supported in a country.

**Response:**
```json
{
  "addressTypes": [
    {
      "code": "MOBI",
      "displayName": "Mobile Number",
      "requiresProxyResolution": true,
      "clearingSystemId": "SGPNID",
      "inputs": [
        {
          "fieldName": "mobileNumber",
          "displayLabel": "Mobile Number",
          "inputType": "TEL",
          "pattern": "^\\+65[0-9]{8}$",
          "required": true
        }
      ],
      "iso20022Path": "/Document/FIToFICstmrCdtTrf/CdtTrfTxInf/CdtrAcct/Id/Othr/Id"
    },
    {
      "code": "ACCT",
      "displayName": "Bank Account",
      "requiresProxyResolution": false,
      "inputs": [
        {
          "fieldName": "accountNumber",
          "displayLabel": "Account Number",
          "inputType": "TEXT",
          "maxLength": 20,
          "required": true
        },
        {
          "fieldName": "bankCode",
          "displayLabel": "Bank",
          "inputType": "SELECT",
          "required": true
        }
      ]
    }
  ]
}
```

---

## 2. Fees & Amounts API

### GET /fees-and-amounts

Calculate fees and converted amounts for a payment.

**Query Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sourceCountry` | string | Yes | Source country code (ISO 3166-1) |
| `destCountry` | string | Yes | Destination country code |
| `sourceCurrency` | string | No | Source currency (ISO 4217) |
| `destCurrency` | string | No | Destination currency |
| `amount` | number | Yes | Payment amount |
| `amountType` | string | Yes | `SOURCE` or `DESTINATION` |

**Example Request:**
```bash
curl -X GET "https://api.nexusglobalpayments.org/v1/fees-and-amounts?\
sourceCountry=SG&destCountry=TH&\
amount=1000&amountType=SOURCE" \
  -H "Authorization: Bearer {token}"
```

**Response:**
```json
{
  "sourceCountry": "SG",
  "destinationCountry": "TH",
  "sourceCurrency": "SGD",
  "destinationCurrency": "THB",
  "amountType": "SOURCE",
  "requestedAmount": 1000.00,
  "fees": {
    "sourcePspFee": 5.00,
    "sourcePspFeeCurrency": "SGD",
    "destinationPspFee": 0.00,
    "nexusFee": 0.00
  },
  "amounts": {
    "debtorAmount": 1005.00,
    "sourceInterbankAmount": 1000.00,
    "indicativeDestinationAmount": 25850.00,
    "indicativeCreditorAmount": 25850.00
  },
  "indicativeRate": 25.85,
  "rateValidUntil": "2025-03-15T10:35:00Z"
}
```

---

## 3. Quotes API

### GET /quotes

Retrieve FX quotes for a payment.

**Query Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sourceCountry` | string | Yes | Source country code |
| `destCountry` | string | Yes | Destination country code |
| `sourceCurrency` | string | No | Source currency |
| `destCurrency` | string | No | Destination currency |
| `amount` | number | Yes | Payment amount |
| `amountType` | string | Yes | `SOURCE` or `DESTINATION` |

**Response:**
```json
{
  "quotes": [
    {
      "quoteId": "q-550e8400-e29b-41d4-a716-446655440000",
      "fxpId": "fxp-001",
      "fxpName": "ABC FX Provider",
      "sourceCurrency": "SGD",
      "destinationCurrency": "THB",
      "exchangeRate": 25.87,
      "tierImprovement": 2,
      "pspImprovement": 5,
      "amounts": {
        "sourceInterbankAmount": 1000.00,
        "destinationInterbankAmount": 25870.00
      },
      "expiresAt": "2025-03-15T10:40:00Z",
      "isPreferred": true
    },
    {
      "quoteId": "q-550e8400-e29b-41d4-a716-446655440001",
      "fxpId": "fxp-002",
      "fxpName": "XYZ Currency Exchange",
      "sourceCurrency": "SGD",
      "destinationCurrency": "THB",
      "exchangeRate": 25.82,
      "tierImprovement": 0,
      "pspImprovement": 0,
      "amounts": {
        "sourceInterbankAmount": 1000.00,
        "destinationInterbankAmount": 25820.00
      },
      "expiresAt": "2025-03-15T10:40:00Z",
      "isPreferred": false
    }
  ],
  "quotesValidUntil": "2025-03-15T10:40:00Z"
}
```

### GET /quotes/{quoteId}

Retrieve a specific quote by ID.

### GET /quotes/{quoteId}/intermediary-agents

Retrieve intermediary agent (SAP) account details for a quote.

**Response:**
```json
{
  "quoteId": "q-550e8400-e29b-41d4-a716-446655440000",
  "sourceIntermediaryAgent": {
    "bic": "DBSSSGSG",
    "name": "DBS Bank Singapore",
    "accountNumber": "001-123456-789",
    "clearingSystemId": "SGPNID"
  },
  "destinationIntermediaryAgent": {
    "bic": "KASITHBK",
    "name": "Kasikorn Bank Thailand",
    "accountNumber": "123-4-56789-0",
    "clearingSystemId": "THBACC"
  }
}
```

---

## 4. Proxy Resolution API

### POST /v1/addressing/resolve

Resolve a proxy (alias) to account details.

**Request Body:**
```json
{
  "destinationCountry": "TH",
  "proxyType": "MOBI",
  "proxyValue": "+66812345678"
}
```

**Response:**
```json
{
  "resolved": true,
  "creditorName": "Somchai Jaidee",
  "creditorAccount": {
    "accountNumber": "123-4-56789-0",
    "bankBic": "KASITHBK",
    "bankName": "Kasikorn Bank"
  },
  "creditorAgent": {
    "bic": "KASITHBK",
    "name": "Kasikorn Bank Thailand"
  }
}
```

**Error Response (Not Found):**
```json
{
  "resolved": false,
  "error": {
    "code": "PROXY_NOT_FOUND",
    "message": "No account found for the provided proxy"
  }
}
```

---

## 5. Payment Status API

### GET /payments/{uetr}

Retrieve the status of a payment by UETR.

**Response:**
```json
{
  "uetr": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "COMPLETED",
  "statusReason": null,
  "timeline": [
    {
      "status": "INITIATED",
      "timestamp": "2025-03-15T10:25:00Z",
      "actor": "DBSSSGSG"
    },
    {
      "status": "SUBMITTED",
      "timestamp": "2025-03-15T10:26:30Z",
      "actor": "SGFASSXX"
    },
    {
      "status": "FORWARDED",
      "timestamp": "2025-03-15T10:26:45Z",
      "actor": "NEXUS"
    },
    {
      "status": "ACCEPTED",
      "timestamp": "2025-03-15T10:27:10Z",
      "actor": "KASITHBK"
    },
    {
      "status": "COMPLETED",
      "timestamp": "2025-03-15T10:27:15Z",
      "actor": "NEXUS"
    }
  ],
  "amounts": {
    "debtorAmount": 1005.00,
    "debtorCurrency": "SGD",
    "creditorAmount": 25870.00,
    "creditorCurrency": "THB"
  },
  "exchangeRate": 25.87,
  "completedAt": "2025-03-15T10:27:15Z",
  "totalDurationSeconds": 135
}
```

---

## 6. ISO 20022 Messages

### Message Types

| Message | Purpose | Direction |
|---------|---------|-----------|
| `pacs.008` | FI to FI Customer Credit Transfer | PSP → IPS → Nexus → IPS → PSP |
| `pacs.002` | Payment Status Report | PSP → IPS → Nexus → IPS → PSP |
| `acmt.023` | Identification Verification Request | PSP → IPS → Nexus → IPS → PDO |
| `acmt.024` | Identification Verification Report | PDO → IPS → Nexus → IPS → PSP |
| `camt.054` | Bank To Customer Debit/Credit Notification | Nexus → FXP/SAP |

### pacs.008 Key Elements

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>MSG-2025-001</MsgId>
      <CreDtTm>2025-03-15T10:26:30Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>INSTR-001</InstrId>
        <EndToEndId>E2E-001</EndToEndId>
        <UETR>f47ac10b-58cc-4372-a567-0e02b2c3d479</UETR>
      </PmtId>
      <PmtTpInf>
        <InstrPrty>NORM</InstrPrty>
      </PmtTpInf>
      <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
      <XchgRate>25.87</XchgRate>
      <ChrgBr>SLEV</ChrgBr>
      
      <!-- Debtor (Sender) -->
      <Dbtr>
        <Nm>John Smith</Nm>
        <PstlAdr>
          <Ctry>SG</Ctry>
        </PstlAdr>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>001-123456-789</Id>
          </Othr>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>DBSSSGSG</BICFI>
        </FinInstnId>
      </DbtrAgt>
      
      <!-- Creditor (Recipient) -->
      <Cdtr>
        <Nm>Somchai Jaidee</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>123-4-56789-0</Id>
          </Othr>
        </Id>
      </CdtrAcct>
      <CdtrAgt>
        <FinInstnId>
          <BICFI>KASITHBK</BICFI>
        </FinInstnId>
      </CdtrAgt>
      
      <!-- Intermediary Agents (FXP Accounts) -->
      <IntrmyAgt1>
        <FinInstnId>
          <BICFI>DBSSSGSG</BICFI>
        </FinInstnId>
      </IntrmyAgt1>
      <IntrmyAgt1Acct>
        <Id>
          <Othr>
            <Id>FXP-001-SGD</Id>
          </Othr>
        </Id>
      </IntrmyAgt1Acct>
      <IntrmyAgt2>
        <FinInstnId>
          <BICFI>KASITHBK</BICFI>
        </FinInstnId>
      </IntrmyAgt2>
      <IntrmyAgt2Acct>
        <Id>
          <Othr>
            <Id>FXP-001-THB</Id>
          </Othr>
        </Id>
      </IntrmyAgt2Acct>
      
      <!-- Purpose -->
      <Purp>
        <Cd>GDDS</Cd>
      </Purp>
      <RmtInf>
        <Strd>
          <CdtrRefInf>
            <Ref>Invoice 12345</Ref>
          </CdtrRefInf>
        </Strd>
      </RmtInf>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>
```

---

## 7. Error Codes

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad Request - Invalid parameters |
| `401` | Unauthorized - Invalid/expired token |
| `403` | Forbidden - Insufficient permissions |
| `404` | Not Found |
| `409` | Conflict - Duplicate UETR |
| `422` | Unprocessable Entity - Business rule violation |
| `429` | Too Many Requests - Rate limited |
| `500` | Internal Server Error |
| `503` | Service Unavailable |

### Business Error Codes

| Code | Description |
|------|-------------|
| `QUOTE_EXPIRED` | The selected FX quote has expired |
| `QUOTE_NOT_FOUND` | Quote ID not recognized |
| `AMOUNT_EXCEEDS_LIMIT` | Amount exceeds IPS or PSP limits |
| `CURRENCY_NOT_SUPPORTED` | Currency pair not available |
| `CORRIDOR_NOT_AVAILABLE` | Country pair not enabled |
| `PROXY_NOT_FOUND` | Proxy resolution failed |
| `DUPLICATE_UETR` | Payment with this UETR already exists |
| `INSUFFICIENT_DATA` | Missing required FATF R16 data |
| `FXP_UNAVAILABLE` | No FX providers available |
| `SANCTIONS_MATCH` | Payment blocked due to sanctions screening |

### Error Response Format

```json
{
  "error": {
    "code": "QUOTE_EXPIRED",
    "message": "The selected FX quote has expired",
    "details": {
      "quoteId": "q-550e8400-e29b-41d4-a716-446655440000",
      "expiredAt": "2025-03-15T10:40:00Z",
      "currentTime": "2025-03-15T10:45:30Z"
    },
    "traceId": "abc123xyz"
  }
}
```

---

## 8. Rate Limits

| Endpoint | Rate Limit | Window |
|----------|------------|--------|
| `GET /quotes` | 100 requests | Per minute per PSP |
| `GET /fees-and-amounts` | 200 requests | Per minute per PSP |
| `POST /v1/addressing/resolve` | 50 requests | Per minute per PSP |
| `GET /payments/{uetr}` | 500 requests | Per minute per PSP |

**Rate Limit Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1710500400
```

---

## 9. Webhooks

### Webhook Events

| Event | Description |
|-------|-------------|
| `payment.submitted` | Payment submitted to Nexus |
| `payment.forwarded` | Payment forwarded to destination |
| `payment.accepted` | Payment accepted by destination |
| `payment.rejected` | Payment rejected by destination |
| `payment.completed` | Payment fully completed |
| `quote.expiring` | Quote expiring in 2 minutes |

### Webhook Payload

```json
{
  "event": "payment.completed",
  "timestamp": "2025-03-15T10:27:15Z",
  "data": {
    "uetr": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "status": "COMPLETED",
    "sourceCountry": "SG",
    "destinationCountry": "TH",
    "amounts": {
      "creditorAmount": 25870.00,
      "creditorCurrency": "THB"
    }
  },
  "signature": "sha256=abc123..."
}
```

### Webhook Signature Verification

```python
import hmac
import hashlib

def verify_webhook(payload, signature, secret):
    computed = 'sha256=' + hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(computed, signature)
```

---

## Related Documents

- [C4 Architecture](../architecture/C4_ARCHITECTURE.md)
- [Security Model](../security/SECURITY_MODEL.md)
- [Event Sourcing](../architecture/EVENT_SOURCING.md)

---

*API documentation follows OpenAPI 3.1 conventions. Full OpenAPI spec available at `/openapi.yaml`.*
