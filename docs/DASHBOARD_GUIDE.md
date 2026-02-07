# Demo Dashboard User Guide

This guide explains each section of the Nexus Sandbox demo dashboard and how they relate to the [17-step payment lifecycle](https://docs.nexusglobalpayments.org/).

---

## Navigation Overview

The dashboard simulates all five actor types in the Nexus ecosystem:

| Actor | Role | Dashboard |
|-------|------|-----------|
| **PSP** | Payment Service Provider | Send Payment, PSP Dashboard |
| **FXP** | FX Provider | FX Rates |
| **SAP** | Settlement Access Provider | Liquidity |
| **IPS** | Instant Payment System | IPS Dashboard |
| **PDO** | Proxy Directory Operator | PDO Dashboard |

---

## 📤 Send Payment (`/payment`)

**Purpose**: Simulate the sender's PSP initiating a cross-border payment.

**Lifecycle Steps Covered**: 1–17 (complete flow)

**Features**:
- Select destination country and IPS
- Enter amount and see real-time FX quotes
- Select fee type (INVOICED/DEDUCTED)
- Choose best quote from multiple FXPs
- View intermediary agents (settlement routing)
- Enter recipient's proxy (mobile, email)
- Trigger proxy resolution via PDO
- Provide sanctions screening data (FATF R16)
- Enter payment reference (remittance info)
- Select instruction priority (HIGH/NORM)
- Confirm recipient details (explicit confirmation)
- Submit payment with full ISO 20022 pacs.008
- View pacs.002 confirmation

**Enhanced UI Components**:
- **FeeCard**: G20 alignment bar, dual sender/receiver fee tables, 3-tier exchange rates (Market, Customer, Effective), quote countdown
- **LifecycleAccordion**: 3-phase collapsible view (Payment Setup → Quoting & FX → Processing & Settlement) with ISO message badges

**Mandatory Fields in pacs.008**:
- `AccptncDtTm` - Acceptance Date Time
- `InstrPrty` - Instruction Priority (HIGH=25s, NORM=4hr)
- `ClrSys` - Clearing System Code (SGFAST, THBRT)
- `IntrmyAgt1` - Source SAP BIC
- `IntrmyAgt2` - Destination SAP BIC
- `RmtInf` - Payment Reference (sender message)

**Reference**: [Payment Setup](https://docs.nexusglobalpayments.org/payment-setup/)

---

## 🎮 Interactive Demo (`/demo`)

**Purpose**: One-click automated demo of the complete payment lifecycle.

**Lifecycle Steps Covered**: 1–17 (automated)

**Features**:
- **Quick Demo**: Executes full payment in ~10 seconds with pre-filled data
- **Live API Mode**: Toggle to use real form inputs step by step
- **Register Actor**: Register custom actors before sending
- **Happy & Unhappy Flows**: Toggle 9 scenario codes (AB04, TM01, DUPL, etc.)
- **FeeCard**: Embedded Pre-Transaction Disclosure with G20 bar, dual fee tables, exchange rates
- **Lifecycle Accordion**: 3-phase visual (Payment Setup, Quoting & FX, Processing & Settlement)
- **Status Badge**: Dynamic `ACSC` (success) or `RJCT` (rejection) with ISO reason code
- **Payment Explorer Link**: Direct navigation to `/explorer?uetr=...`

**Reference**: [ADR-014 Protocol Parity Interactive Demo](./adr/ADR-014-protocol-parity-interactive-demo.md)

---

## 🏦 PSP Dashboard (`/psp`)

**Purpose**: View operations from either Source or Destination PSP perspective.

**Actor Role**:
- **Source PSP**: Initiates payments, requests quotes, submits pacs.008
- **Destination PSP**: Receives payments, credits recipient, sends pacs.002

**Features**:
- View pending and completed transactions
- See callback delivery status
- Monitor pacs.002 responses
- Track payment timelines

**Reference**: [PSP Implementation](https://docs.nexusglobalpayments.org/participating-entities/psps/)

---

## 💱 FX Rates (FXP) (`/fxp`)

**Purpose**: Manage FX Provider rate configuration and quote responses.

**Lifecycle Steps**: 3–6 (Quoting Phase)

**Features**:
- Configure base rates for currency pairs
- Set spread in basis points (bps)
- Define tier-based rate improvements (volume discounts)
- Manage PSP-specific relationships and markups
- View quote request history
- Monitor accepted vs. rejected quotes
- Simulate rate volatility
- Receive trade notifications via webhooks

**Key Concepts**:
- **Tier-based improvements**: Rates get better with volume
- **PSP Relationships**: Special pricing for preferred partners

**API Endpoints**:
- `POST /v1/fxp/rates` - Submit rates with improvements
- `POST /v1/fxp/psp-relationships` - Configure PSP pricing
- `GET /v1/fxp/notifications` - Trade notifications

**Reference**: [FX Provision](https://docs.nexusglobalpayments.org/fx-provision/)

---

## 💰 Liquidity (SAP) (`/sap`)

**Purpose**: Settlement Access Provider liquidity monitoring and nostro account management.

**Actor Role**: SAPs provide prefunded accounts for cross-border settlement.

**Features**:
- View prefunded balances by currency
- Manage FXP nostro accounts
- Reserve/release liquidity for trades
- Monitor settlement queue
- Track daily settlement volumes
- View position limits
- Generate camt.054 reconciliation reports

**Key Fields**:
- `InstrAgnt` (Instructing Agent)
- `InstdAgnt` (Instructed Agent)
- `SttlmAcct` (Settlement Account)
- `IntrmyAgt1/2` (Intermediary Agents in pacs.008)

**API Endpoints**:
- `GET /v1/sap/nostro-accounts` - List FXP accounts
- `POST /v1/sap/liquidity/reserve` - Reserve liquidity
- `POST /v1/sap/liquidity/release` - Release liquidity
- `POST /v1/sap/reconciliation` - Generate reports

**Reference**: [Settlement Mechanism](https://docs.nexusglobalpayments.org/settlement/)

---

## 🌐 IPS Dashboard (`/ips`)

**Purpose**: Instant Payment System operator view (FAST, PromptPay, DuitNow).

**Lifecycle Steps**: 15–17 (Execution & Confirmation)

**Features**:
- View incoming/outgoing messages
- Monitor message routing
- Track settlement confirmations
- View IPS-specific configurations

**Supported IPS**:
- 🇸🇬 FAST (Singapore)
- 🇹🇭 PromptPay (Thailand)
- 🇲🇾 DuitNow (Malaysia)
- 🇮🇳 UPI (India)
- 🇵🇭 InstaPay (Philippines)

**Reference**: [Participating IPS](https://docs.nexusglobalpayments.org/participating-entities/ips/)

---

## 📇 PDO Dashboard (`/pdo`)

**Purpose**: Proxy Directory Operator—resolve aliases to account details.

**Lifecycle Steps**: 7–9 (Addressing Phase)

**Features**:
- View proxy registrations
- Monitor resolution requests (acmt.023)
- See resolution responses (acmt.024)
- Manage proxy types

**Proxy Types**:
- 📱 Mobile number
- 📧 Email address
- 🆔 National ID
- 📲 QR code

**Reference**: [Proxy Resolution](https://docs.nexusglobalpayments.org/addressing/)

---

## 🔍 Payments Explorer (`/explorer`)

**Purpose**: Developer tool for transaction debugging and lifecycle visualization.

**Features**:
- Search by UETR (Unique End-to-End Transaction Reference)
- View 17-step lifecycle timeline
- Inspect raw ISO 20022 XML (pacs.008, pacs.002)
- See status codes with descriptions
- Access DevDebugPanel for API commands

**Tabs**:
1. **Overview**: Transaction summary, status, participants
2. **Lifecycle**: Visual timeline of 17 steps
3. **Messages**: Raw XML with syntax highlighting
4. **Debug**: Developer commands and gateway context

**Reference**: [ADR-011 Developer Observability](./adr/ADR-011-developer-observability.md)

---

## 📨 Messages (`/messages`)

**Purpose**: Browse and filter ISO 20022 messages across all transactions.

**Message Types**:
| Code | Name | Direction |
|------|------|-----------|
| `pacs.008` | FI to FI Customer Credit Transfer | Outbound |
| `pacs.002` | Payment Status Report | Inbound |
| `acmt.023` | Identification Verification Request | Outbound |
| `acmt.024` | Identification Verification Response | Inbound |
| `camt.054` | Bank to Customer Debit/Credit Notification | Inbound |
| `camt.056` | FI to FI Payment Cancellation Request | Outbound |
| `pacs.004` | Payment Return | Inbound |

**Reference**: [ISO 20022 Catalogue](https://www.iso20022.org/), [ADR-003](./adr/ADR-003-iso20022-message-handling.md)

---

## 🕸️ Network Mesh (`/mesh`)

**Purpose**: Visualize the interconnection between all actors in the Nexus network.

**Features**:
- Interactive network diagram
- See message flow between actors
- Visualize settlement paths
- Monitor connection health

---

## 👥 Actors (`/actors`)

**Purpose**: Registry of all participants in the sandbox.

**Actor Categories**:
- **PSPs**: Banks and payment providers
- **FXPs**: FX rate providers
- **SAPs**: Settlement providers
- **IPS**: National payment systems
- **PDOs**: Proxy directories

**Fields**:
- BIC (Bank Identifier Code)
- LEI (Legal Entity Identifier)
- Country
- Supported currencies

---

## ⚙️ Settings (`/settings`)

**Purpose**: Configure sandbox behavior and preferences.

**Options**:
- Quote validity timeout
- Payment SLA settings
- Mock data configuration
- Logging verbosity
- Purge demo payments

---

## 🌙 Theme Support

The dashboard supports both **light** and **dark** color schemes:

- Click the 🌙/☀️ toggle in the top-right header
- All components use Mantine's `light-dark()` CSS function for automatic adaptation
- Cards, panels, tables, and lifecycle views all adjust seamlessly
- Preference persists via local storage

---

## 🛠️ Service Desk (`/service-desk`)

**Purpose**: Manual investigation, dispute resolution, and payment recall management.

**Actor Role**: Operations teams managing payment exceptions.

**Features**:
- **Search Investigations**: Look up payments by UETR, quote ID, or actor
- **Log New Case**: Create investigation cases for disputes
- **Case Management**: Track case status (OPEN, IN_REVIEW, RESOLVED, CLOSED)
- **Initiate Recalls**: Trigger payment returns via camt.056
- **Status Reports**: View pacs.002 responses and reasons

**API Endpoints**:
- `GET /v1/service-desk/cases` - List all investigation cases
- `POST /v1/service-desk/cases` - Create new investigation case
- `GET /v1/service-desk/cases/{caseId}` - Get case details
- `POST /v1/service-desk/cases/{caseId}/recall` - Initiate payment recall

**Reference**: [Investigations](https://docs.nexusglobalpayments.org/operations/investigations/)

---

## 🎭 Actor Registry (`/actors`)

**Purpose**: Manage sandbox participant registration and callback configuration.

**Features**:
- **View All Actors**: List of all registered PSPs, FXPs, SAPs, PDOs, IPSs
- **Register New Actor**: Add new participants to the sandbox
- **Callback Configuration**: Set callback URLs for each actor
- **Test Callbacks**: Verify callback endpoints are reachable
- **Filter by Type**: View actors by type (PSP, FXP, SAP, PDO, IPS)
- **Country Filter**: View actors by country

**Actor Registration Modal**:
Click the "Register Actor" button to open the registration form with:
- **BIC Code**: 8 or 11 character BIC (ISO 9362 format)
- **Actor Type**: PSP, FXP, SAP, PDO, or IPS
- **Country Code**: 2-letter ISO country code
- **Organization Name**: Full legal name
- **Callback URL**: Optional webhook URL for notifications
- **Supported Currencies**: Multi-select for applicable currencies

**API Endpoints**:
- `GET /v1/actors` - List all actors (with optional filters)
- `POST /v1/actors/register` - Register new actor
- `GET /v1/actors/{bic}` - Get actor details
- `PATCH /v1/actors/{bic}/callback` - Update callback URL
- `POST /v1/actors/{bic}/callback-test` - Test callback endpoint
- `DELETE /v1/actors/{bic}` - Deregister actor

**Reference**: [Actor Onboarding](https://docs.nexusglobalpayments.org/participating-entities/onboarding/)

---

## 📚 API Docs (`/api/docs`)

**Purpose**: Interactive Swagger UI for the Nexus Gateway API.

**Opens in new tab** with full OpenAPI documentation including:
- All 18 endpoint groups
- Request/response schemas
- Try-it-out functionality
- Authentication headers

**Alternative**: ReDoc at `/api/redoc`

---

## System Status Indicator

The bottom of the navigation shows real-time API connectivity:

| Status | Meaning |
|--------|---------|
| 🟢 `connected` | Gateway API is healthy |
| 🔴 `disconnected` | Cannot reach `/health` endpoint |
| ⚪ `checking` | Testing connection |

---

## Quick Reference: 17-Step Lifecycle

| Phase | Steps | Dashboard |
|-------|-------|-----------|
| **Setup** | 1–2 | Send Payment |
| **Quotes** | 3–6 | Send Payment, FXP |
| **Addressing** | 7–9 | Send Payment, PDO |
| **Compliance** | 10–11 | (Background) |
| **Approval** | 12 | Send Payment |
| **Execution** | 13–16 | IPS, Messages |
| **Confirmation** | 17 | PSP, Explorer |

---

Created by [Siva Subramanian](https://linkedin.com/in/sivasub987)
