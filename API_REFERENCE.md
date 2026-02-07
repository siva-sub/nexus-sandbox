# Nexus Global Payments Gateway - Quick API Reference

**Version:** 1.0.0
**Base URL:** `http://localhost:8000` (development) | `https://api.nexuspayments.example.com` (production)
**OpenAPI Docs:** `/docs` | `/redoc`

> **Note:** This is a quick reference guide for the most commonly used endpoints. For complete API documentation including all endpoints, request/response schemas, and ISO 20022 message details, see [docs/api/API_REFERENCE.md](./docs/api/API_REFERENCE.md).

---

## Purpose of This Document

This file (`API_REFERENCE.md` in the root directory) serves as a **quick reference** for developers who want to quickly understand the main API endpoints. It is intentionally concise and focused on the most common use cases.

For **complete API documentation**, including:
- All 60+ endpoints
- Full request/response schemas
- ISO 20022 message specifications
- Error codes and handling
- Webhook/callback formats

See: **[docs/api/API_REFERENCE.md](./docs/api/API_REFERENCE.md)**

---

## Overview

This API implements the complete Nexus Global Payments cross-border instant payment scheme as specified in the [official Nexus documentation](https://docs.nexusglobalpayments.org/).

### Key Features

- **17-Step Payment Lifecycle:** Complete flow from country selection to final confirmation
- **ISO 20022 Messaging:** Industry-standard financial messaging (pacs.008, pacs.002, acmt.023/024, camt.054, etc.)
- **Multi-Actor Ecosystem:** PSPs, IPS Operators, FXPs, SAPs, and PDOs
- **Real-Time FX Quotes:** Aggregated rates with tier-based improvements
- **Proxy Resolution:** Mobile/email/QR → account mapping
- **EMVCo QR Codes:** PromptPay, PayNow, DuitNow, QRPh support

---

## Authentication

**Current:** No authentication (sandbox mode)  
**Production:** Would use OAuth 2.0 / API keys

---

## Health & Status

### GET `/health`

Health check endpoint for monitoring and readiness probes.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-07T02:10:00Z"
}
```

---

## Countries & Currencies

### GET `/v1/countries`

List all participating countries with supported currencies and maximum transaction amounts.

**Reference:** [Nexus Countries API](https://docs.nexusglobalpayments.org/apis/countries)

**Response:**
```json
{
  "countries": [
    {
      "code": "SG",
      "name": "Singapore",
      "currencies": ["SGD"],
      "max_transaction_amount": 100000,
      "ips_operator": "FAST"
    }
  ]
}
```

### GET `/v1/currencies`

List all supported currencies with metadata.

**Response:**
```json
{
  "currencies": [
    {
      "code": "SGD",
      "name": "Singapore Dollar",
      "decimal_places": 2
    }
  ]
}
```

---

## Quotes (Steps 3-6)

### GET `/v1/quotes` (Recommended)

Retrieve FX quotes using query parameters. This is the primary method for Step 3 of the Nexus flow.

**Query Parameters:**
- `sourceCountry`: ISO 3166-1 alpha-2 code (e.g., "SG")
- `destCountry`: ISO 3166-1 alpha-2 code (e.g., "TH")
- `amount`: Transaction amount
- `amountType`: `SOURCE` or `DESTINATION`
- `sourcePspBic` (optional): For PSP-specific rate improvements

**Response:**
```json
{
  "quotes": [
    {
      "quoteId": "Q-1234567890",
      "fxpName": "ACME FX",
      "exchangeRate": 26.50,
      "sourceInterbankAmount": 100.00,
      "destinationInterbankAmount": 2650.00,
      "expiresAt": "2026-02-07T02:15:00Z"
    }
  ]
}
```

### GET `/v1/quotes/{sourceCountry}/{sourceCurrency}/{destCountry}/{destCurrency}/{amountCurrency}/{amount}`

Wrapper for Get Quotes using path parameters for legacy/alternative integration.

**Path Parameters:**
- `sourceCountry`: ISO 3166-1 alpha-2 code (e.g., "SG")
- `sourceCurrency`: ISO 4217 code (e.g., "SGD")
- `destCountry`: ISO 3166-1 alpha-2 code (e.g., "TH")
- `destCurrency`: ISO 4217 code (e.g., "THB")
- `amountCurrency`: Matches source or destination currency
- `amount`: Transaction amount

### GET `/v1/quotes/{quoteId}/intermediary-agents`

Get settlement routing (SAP details) for a quote.

**Reference:** [Step 13 - Request Intermediary Agents](https://docs.nexusglobalpayments.org/payment-setup/step-13-request-intermediary-agents)

**Response:**
```json
{
  "quote_id": "Q-1234567890",
  "source_sap": {
    "bic": "DBSSSGSG",
    "name": "DBS Settlement",
    "country": "SG"
  },
  "destination_sap": {
    "bic": "BBLTHBK",
    "name": "Bangkok Bank Settlement",
    "country": "TH"
  },
  "routing_path": ["S-PSP", "S-IPS", "Nexus", "FXP", "SAP", "D-IPS", "D-PSP"]
}
```

---

## Fees & Amounts

### GET `/v1/fees-and-amounts`

Get detailed fee breakdown for a quote (pre-transaction disclosure).

**Query Parameters:**
- `quoteId`: Quote identifier

**Response:**
```json
{
  "quote_id": "Q-1234567890",
  "source_amount": 100.00,
  "source_currency": "SGD",
  "destination_amount": 2650.00,
  "destination_currency": "THB",
  "fees": {
    "source_psp_fee": 0.50,
    "destination_psp_fee": 10.00,
    "fx_spread": 1.25,
    "nexus_scheme_fee": 0.25
  },
  "total_cost": 102.00
}
```

---

## Rates Management

### GET `/v1/rates`

List all FX rates.

**Query Parameters:**
- `corridor` (optional): Filter by corridor (e.g., "SGD-THB")

**Response:**
```json
{
  "rates": [
    {
      "source_currency": "SGD",
      "destination_currency": "THB",
      "rate": 26.50,
      "spread_bps": 50,
      "fxp_code": "ACME",
      "valid_from": "2026-02-07T00:00:00Z"
    }
  ]
}
```

### POST `/v1/rates`

Submit a new FX rate (FXP endpoint).

**Request Body:**
```json
{
  "source_currency": "SGD",
  "destination_currency": "THB",
  "rate": 26.50,
  "spread_bps": 50
}
```

---

## Addressing & Proxy Resolution

### GET `/v1/countries/{countryCode}/address-types-and-inputs`

Get supported address types and required input fields for a country.

**Response:**
```json
{
  "country_code": "TH",
  "address_types": [
    {
      "address_type_id": "MBNO",
      "address_type_name": "Mobile Number",
      "inputs": [
        {
          "field_name": "value",
          "display_label": "Mobile Number",
          "data_type": "text",
          "attributes": { "required": true }
        }
      ]
    }
  ]
}
```

### POST `/v1/addressing/resolve`

Resolve a proxy to account details (Steps 7-9).

**Request Body:**
```json
{
  "destination_country": "TH",
  "proxy_type": "MBNO",
  "proxy_value": "+66812345678",
  "structured_data": {}
}
```

**Response:**
```json
{
  "status": "VALIDATED",
  "resolution_id": "R-1234567890",
  "account_number": "1234567890",
  "account_type": "BBAN",
  "agent_bic": "KASITHBK",
  "beneficiary_name": "John Doe",
  "display_name": "J. Doe",
  "verified": true,
  "timestamp": "2026-02-07T02:10:00Z"
}
```

---

## ISO 20022 Messages

### POST `/v1/iso20022/pacs008`

Submit a pacs.008 (FI to FI Customer Credit Transfer) payment message.

**Reference:** [Messaging & Translation](https://docs.nexusglobalpayments.org/messaging-and-translation/key-points)

**Query Parameters:**
- `pacs002Endpoint`: Callback URL for pacs.002 status report
- `scenarioCode` (optional): For unhappy flow testing (e.g., "BE02", "AG01")

**Headers:**
- `Content-Type: application/xml`

**Request Body:** ISO 20022 pacs.008.001.13 XML

**Response:**
```json
{
  "uetr": "550e8400-e29b-41d4-a716-446655440000",
  "status": "ACSC",
  "message": "Payment accepted for processing",
  "callback_endpoint": "https://callback.example.com/pacs002",
  "processed_at": "2026-02-07T02:10:00Z"
}
```

---

## QR Codes

### POST `/v1/qr/parse`

Parse an EMVCo QR code.

**Request Body:**
```json
{
  "qr_data": "00020101021229370016A000000677010111011300664812345670..."
}
```

**Response:**
```json
{
  "format_indicator": "01",
  "initiation_type": "11",
  "merchant_account_info": {
    "scheme": "PromptPay",
    "proxy_type": "MBNO",
    "proxy_value": "+66812345678",
    "editable": false
  },
  "transaction_currency": "764",
  "transaction_amount": "100.00",
  "merchant_name": "Coffee Shop",
  "merchant_city": "Bangkok",
  "crc": "1234",
  "crc_valid": true
}
```

### POST `/v1/qr/generate`

Generate an EMVCo QR code.

**Request Body:**
```json
{
  "scheme": "PromptPay",
  "proxy_type": "MBNO",
  "proxy_value": "+66812345678",
  "amount": 100.00,
  "merchant_name": "Coffee Shop",
  "merchant_city": "Bangkok",
  "reference": "INV-001",
  "editable": false
}
```

**Response:**
```json
{
  "qr_data": "00020101021229370016A000000677010111011300664812345670...",
  "scheme": "PromptPay"
}
```

---

## Payments Explorer

### GET `/v1/payments`

List all payments with optional status filter.

**Query Parameters:**
- `status` (optional): Filter by status ("ACCP", "RJCT", "ACSC", etc.)

**Response:**
```json
{
  "payments": [
    {
      "uetr": "550e8400-e29b-41d4-a716-446655440000",
      "status": "ACSC",
      "source_psp": "DBSSSGSG",
      "destination_psp": "KASITHBK",
      "amount": 100.00,
      "currency": "SGD",
      "initiated_at": "2026-02-07T02:10:00Z"
    }
  ]
}
```

### GET `/v1/payments/{uetr}/status`

Get payment status by UETR.

**Response:**
```json
{
  "uetr": "550e8400-e29b-41d4-a716-446655440000",
  "status": "ACSC",
  "source_psp": "DBSSSGSG",
  "destination_psp": "KASITHBK",
  "amount": 100.00,
  "currency": "SGD",
  "initiated_at": "2026-02-07T02:10:00Z",
  "completed_at": "2026-02-07T02:10:05Z"
}
```

### GET `/v1/payments/{uetr}/messages`

Get all ISO 20022 messages for a payment.

**Response:**
```json
{
  "messages": [
    {
      "message_type": "pacs.008",
      "direction": "outbound",
      "xml": "<?xml version=\"1.0\"?>...",
      "timestamp": "2026-02-07T02:10:00Z"
    }
  ]
}
```

### GET `/v1/payments/{uetr}/events`

Get event timeline for a payment.

**Response:**
```json
{
  "uetr": "550e8400-e29b-41d4-a716-446655440000",
  "events": [
    {
      "event_type": "submission",
      "actor": "S-PSP",
      "timestamp": "2026-02-07T02:10:00Z",
      "details": "Payment submitted"
    }
  ]
}
```

---

## Actor Registry

### GET `/v1/actors`

List all registered participants (PSPs, IPS, FXPs, SAPs, PDOs).

**Response:**
```json
{
  "actors": [
    {
      "bic": "DBSSSGSG",
      "name": "DBS Bank Singapore",
      "actor_type": "PSP",
      "country_code": "SG",
      "status": "active"
    }
  ],
  "total": 42
}
```

---

## Payment Service Providers (PSPs)

### GET `/v1/psps`

List all PSPs with optional country filter.

**Query Parameters:**
- `countryCode` (optional): Filter by country

**Response:**
```json
{
  "psps": [
    {
      "psp_id": "PSP001",
      "bic": "DBSSSGSG",
      "name": "DBS Bank Singapore",
      "country_code": "SG",
      "fee_percent": 0.5
    }
  ],
  "total": 11
}
```

### GET `/v1/psps/{bic}`

Get PSP details by BIC.

---

## Instant Payment Systems (IPS)

### GET `/v1/ips`

List all IPS operators.

**Query Parameters:**
- `countryCode` (optional): Filter by country

**Response:**
```json
{
  "operators": [
    {
      "ips_id": "IPS001",
      "name": "FAST",
      "country_code": "SG",
      "clearing_system_id": "SGFASTCL",
      "max_amount": 100000,
      "currency_code": "SGD"
    }
  ],
  "total": 6
}
```

### GET `/v1/ips/{clearingSystemId}/members`

Get member institutions of an IPS.

**Response:**
```json
{
  "clearing_system_id": "SGFASTCL",
  "members": [
    {
      "bic": "DBSSSGSG",
      "name": "DBS Bank"
    }
  ],
  "total": 15
}
```

---

## Proxy Directory Operators (PDO)

### GET `/v1/pdos`

List all PDOs.

**Query Parameters:**
- `countryCode` (optional): Filter by country

**Response:**
```json
{
  "pdos": [
    {
      "pdo_id": "PDO001",
      "name": "Thai NRDD",
      "country_code": "TH",
      "supported_proxy_types": ["MBNO", "EMAL", "NIDN"]
    }
  ],
  "total": 6
}
```

### GET `/v1/pdos/country/{countryCode}/registrations`

Get proxy registrations for a country.

**Query Parameters:**
- `proxy_type` (optional): Filter by type

**Response:**
```json
{
  "pdo_name": "Thai NRDD",
  "registrations": [
    {
      "proxy_type": "MBNO",
      "proxy_value": "+668********78",
      "creditor_name_masked": "J*** D**",
      "bank_bic": "KASITHBK",
      "bank_name": "Bangkok Bank"
    }
  ],
  "total": 1000
}
```

---

## Liquidity Management

### GET `/v1/liquidity/balances`

Get SAP liquidity balances for all currencies.

**Reference:** [Liquidity Management](https://docs.nexusglobalpayments.org/settlement-access-provision/liquidity)

**Response:**
```json
{
  "balances": [
    {
      "currency": "SGD",
      "available": 5000000.00,
      "reserved": 100000.00,
      "total": 5100000.00,
      "low_balance_threshold": 1000000.00
    }
  ]
}
```

### GET `/v1/liquidity/reservations`

Get active liquidity reservations.

**Response:**
```json
{
  "reservations": [
    {
      "reservation_id": "R-1234567890",
      "currency": "SGD",
      "amount": 100.00,
      "uetr": "550e8400-e29b-41d4-a716-446655440000",
      "created_at": "2026-02-07T02:10:00Z",
      "expires_at": "2026-02-07T02:15:00Z"
    }
  ]
}
```

---

## Reconciliation

### GET `/v1/reconciliation/camt054`

Generate camt.054 bank notifications for reconciliation.

**Reference:** [Reconciliation](https://docs.nexusglobalpayments.org/settlement-access-provision/reconciliation)

**Query Parameters:**
- `date`: Date to reconcile (YYYY-MM-DD)
- `actor_bic`: BIC of the actor

**Response:** camt.054.001.13 XML

---

## Returns & Recalls

### POST `/v1/returns/pacs004`

Submit a pacs.004 payment return.

**Request Body:** ISO 20022 pacs.004 XML

### POST `/v1/recalls/camt056`

Submit a camt.056 recall request.

**Request Body:** ISO 20022 camt.056 XML

---

## Demo Data Management

### GET `/v1/demo-data/stats`

Get demo data statistics.

**Response:**
```json
{
  "total_payments": 42,
  "payments_by_status": {
    "ACCP": 30,
    "RJCT": 10,
    "ACSC": 2
  },
  "total_quotes": 100,
  "total_events": 200,
  "oldest_payment": "2026-02-01T00:00:00Z",
  "newest_payment": "2026-02-07T02:10:00Z"
}
```

### DELETE `/v1/demo-data`

Purge old demo data.

**Query Parameters:**
- `age_hours`: Delete data older than this (default: 24)
- `include_quotes`: Also delete quotes (default: false)
- `dry_run`: Preview what would be deleted (default: false)

**Response:**
```json
{
  "dry_run": false,
  "deleted": {
    "payments": 10,
    "events": 50,
    "quotes": 25
  },
  "age_hours": 24,
  "message": "Successfully purged old demo data"
}
```

---

## Error Codes

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `404` - Not Found
- `422` - Unprocessable Entity (schema validation failed)
- `500` - Internal Server Error

### ISO 20022 Status Reason Codes

| Code | Meaning |
|------|---------|
| `ACSC` | Accepted Settlement Completed |
| `ACCC` | Accepted Credit (alternative success code) |
| `RJCT` | Rejected |
| `BE02` | Beneficiary account closed |
| `AG01` | Agent not available |
| `AM05` | Duplication |
| `CUST` | Customer account blocked |

**Reference:** [ISO 20022 Status Codes](https://www.iso20022.org/catalogue-messages/additional-content-messages/external-code-sets)

---

## Rate Limits

**Current:** No rate limiting (sandbox)  
**Production:** Would implement per-actor rate limits

---

## Webhooks & Callbacks

### pacs.002 Status Reports

Callbacks are sent to the `pacs002Endpoint` URL provided during pacs.008 submission.

**Callback Payload:** ISO 20022 pacs.002.001.15 XML

---

## Resources

- [Official Nexus Documentation](https://docs.nexusglobalpayments.org/)
- [ISO 20022 Message Catalogue](https://www.iso20022.org/catalogue-messages)
- [OpenAPI Specification](/openapi.json)
- [Interactive API Docs](/docs)
- [ReDoc Documentation](/redoc)

---

**Generated:** 2026-02-07  
**Maintainer:** Siva Subramanian (hello@sivasub.com)
