# Nexus Sandbox Usage Guide

> **Quick Start**: Get started with cross-border payments simulation in under 5 minutes.

## Prerequisites

| Requirement | Version | Check |
|-------------|---------|-------|
| Docker | 20.10+ | `docker --version` |
| Docker Compose | 2.x | `docker compose version` |
| Memory | 4GB+ | Available RAM |

---

## 🚀 Getting Started

### 1. Start the Sandbox

```bash
# Clone and start
git clone https://github.com/siva-sub/nexus-sandbox.git
cd nexus-sandbox
./start.sh
```

Or manually:
```bash
docker compose up -d
```

Wait for health checks (~30 seconds):
```bash
docker compose ps
# All services should show "healthy"
```

### 2. Access the Dashboard

| Service | URL | Description |
|---------|-----|-------------|
| **Dashboard** | http://localhost:8080 | Main UI |
| **API Docs** | http://localhost:8080/api/docs | Swagger UI |
| **ReDoc** | http://localhost:8080/api/redoc | Alternative docs |
| **Jaeger** | http://localhost:16686 | Distributed tracing |

**Status Check**: Look for 🟢 "Gateway: connected" in the sidebar.

---

## ⚡ Interactive Demo (Quick Start)

Don't want to fill in every field? Use the automated demo:

1. Open http://localhost:8080
2. Click **"Demo Scenarios"** in the sidebar (or go to `/demo`)
3. Click **Quick Demo** → Watch a full payment execute in ~10 seconds
4. Explore the result:
   - **FeeCard**: G20 alignment bar, dual sender/receiver fee tables, 3-tier exchange rates
   - **Lifecycle Trace**: 3-phase Accordion (Payment Setup → Quoting & FX → Processing & Settlement)
   - **Status Badge**: Shows `ACSC` (Settlement Confirmed) on success

> **Tip**: Click **Quick Demo** multiple times — each generates a unique UETR and explores a different scenario.

---

## 💸 Your First Payment (Manual)

### Step 1: Select Destination

1. Open http://localhost:8080
2. Go to **Send Payment** (first item in sidebar)
3. Choose **Singapore → Thailand** corridor

### Step 2: Get FX Quote

1. Enter amount: **1,000 SGD**
2. Select **Fee Type**:
   - **INVOICED**: Fee added on top (recipient gets full amount)
   - **DEDUCTED**: Fee deducted from transfer (you pay less, recipient gets less)
3. Click **Get Quote**
4. Compare quotes from multiple FXPs
5. Select the best rate

### Step 3: Resolve Recipient

1. Select **Mobile Number** (MBNO)
2. Enter: `+66812345678`
3. Click **Resolve Proxy**
4. Verify beneficiary: "Somchai Thai"

### Step 4: Confirm & Send

1. Review **Pre-Transaction Disclosure (PTD)** — now displayed via the enhanced **FeeCard**:
   - G20 target alignment progress bar (< 3% total cost)
   - Sender fee breakdown table (Principal + Source PSP Fee + Nexus Scheme Fee = Total Debited)
   - Receiver fee breakdown table (Payout Gross − Destination PSP Fee = Recipient Receives)
   - 3-tier exchange rates (Market FX, Customer Rate after spread, Effective All-In Rate)
   - Quote countdown timer
2. Enter **Payment Reference** (optional message to recipient, max 140 chars)
3. Provide **Sanctions Screening Data** (required for FATF R16 compliance):
   - Recipient address
   - Date of birth (if required)
   - National ID (if required)
4. Check **Explicit Confirmation** checkbox to confirm recipient details
5. Select **Instruction Priority**:
   - **HIGH**: 25-second timeout (urgent payments)
   - **NORM**: 4-hour timeout (standard payments)
6. Click **Confirm & Send**
7. Watch the **Lifecycle Accordion** complete — 3 phased groups with step-by-step timeline

> **Note**: The payment instruction includes mandatory ISO 20022 fields:
> - `AccptncDtTm` (Acceptance Date Time)
> - `InstrPrty` (Instruction Priority: HIGH/NORM)
> - `ClrSys` (Clearing System: SGFAST, THBRT, etc.)
> - `IntrmyAgt1/2` (Source/Destination SAP BICs)
> - `RmtInf` (Payment Reference)

### Step 5: Explore Results

| Tab | What to See |
|-----|-------------|
| **Overview** | Transaction status, amount, participants |
| **Lifecycle** | 17-step timeline with step indicators |
| **Messages** | Raw pacs.008 and pacs.002 XML with syntax highlighting |
| **Debug** | API commands and gateway context |

> **Theme**: Use the 🌙/☀️ toggle in the header to switch between light and dark mode. All panels adapt automatically.

---

## 🔴 Error Scenarios

Test edge cases with these trigger values:

| Scenario | Trigger Value | Error Code | Description |
|----------|---------------|------------|-------------|
| **Proxy Not Found** | `+66999999999` | `BE23` | Account/Proxy Invalid |
| **Quote Expired** | Wait 10+ minutes | `AB04` | Quote validity exceeded |
| **Amount Too High** | `> 50,000` | `AM02` | Maximum limit exceeded |
| **Insufficient Funds** | Amount ending in `99999` | `AM04` | Not enough liquidity |
| **Closed Account** | `+60999999999` | `AC04` | Account closed |
| **Regulatory Block** | `+62999999999` | `RR04` | Regulatory reason |
| **Duplicate Payment** | Reuse same UETR | `DUPL` | Duplicate transaction |
| **Invalid SAP** | (Internal) | `RC11` | Invalid Intermediary Agent |

---

## 🔍 Exploring Further

### Actor Dashboards

Each actor type has a dedicated view:

| Dashboard | Route | Purpose |
|-----------|-------|---------|
| PSP Dashboard | `/psp` | Source/Destination banks |
| FXP Dashboard | `/fxp` | FX rate management & PSP relationships |
| SAP Dashboard | `/sap` | Settlement accounts & liquidity |
| IPS Dashboard | `/ips` | Payment system operators |
| PDO Dashboard | `/pdo` | Proxy directory |

### Callback Authentication

When you register an actor with a `callbackUrl`, callbacks are authenticated using HMAC-SHA256:

**Headers:**
```http
X-Callback-Signature: sha256=abc123def456...
X-Callback-Timestamp: 1704067200
```

**Verification (Python):**
```python
import hmac
import hashlib

def verify_callback(payload: str, signature: str, secret: str, timestamp: str) -> bool:
    message = f"{timestamp}:{payload}"
    expected = hmac.new(
        secret.encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```

**Test your callback:**
```bash
POST /v1/actors/{bic}/callback-test
```

### Developer Tools

| Tool | Route | Description |
|------|-------|-------------|
| Payments Explorer | `/explorer` | UETR lookup, lifecycle, XML |
| Messages | `/messages` | Browse all ISO 20022 messages |
| Network Mesh | `/mesh` | Actor interconnection map |

### Message Storage

All ISO 20022 XML messages are stored in the database (`payment_events` table):

| Column | Message Type | Description |
|--------|--------------|-------------|
| `pacs008_message` | pacs.008 | Payment instruction (FI to FI Customer Credit Transfer) |
| `pacs002_message` | pacs.002 | Status report (Payment Status Report) |
| `acmt023_message` | acmt.023 | Proxy resolution request |
| `acmt024_message` | acmt.024 | Proxy resolution response |
| `camt054_message` | camt.054 | Reconciliation report |
| `pacs004_message` | pacs.004 | Return payment (Release 2) |
| `camt056_message` | camt.056 | Cancellation request (Recall) |

Retrieve messages via API:
```bash
GET /v1/payments/{uetr}/messages
```

---

## 📚 Next Steps

- **[Dashboard Guide](./DASHBOARD_GUIDE.md)** - Detailed UI reference
- **[Integration Guide](./INTEGRATION_GUIDE.md)** - Connect your system
- **[E2E Demo Script](./E2E_DEMO_SCRIPT.md)** - Live demonstration
- **[Unhappy Flows](./UNHAPPY_FLOWS.md)** - Error scenario triggers
- **[API Reference](./api/API_REFERENCE.md)** - Endpoint documentation
- **[Troubleshooting](./TROUBLESHOOTING.md)** - Common issues

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| Dashboard not loading | Check `docker compose ps` - wait for healthy |
| "Gateway: disconnected" | Restart: `docker compose restart nexus-gateway` |
| Quote returning empty | Check FXP service: `docker compose logs fxp-simulator` |
| Proxy not resolving | Verify PDO service: `docker compose logs pdo-simulator` |

### Demo Data & Mock Mode

The sandbox includes pre-seeded demo data loaded from `migrations/003_seed_data.sql`:

**Countries & Currencies:**
- Singapore (SGD), Thailand (THB), Malaysia (MYR)
- Philippines (PHP), Indonesia (IDR), India (INR)

**IPS Operators:**
- FAST (Singapore), PromptPay (Thailand), DuitNow (Malaysia)
- InstaPay (Philippines), BI-FAST (Indonesia), UPI (India)

**FXP Rates:**
- Mock FX rates are generated dynamically in demo mode
- Real rates can be submitted via `POST /v1/fxp/rates`

**Mock vs Real Mode:**
- Set `MOCK_ENABLED=true` in frontend for offline demos
- Real backend calls require running `nexus-gateway` service

### Useful Commands

```bash
# View logs
docker compose logs -f nexus-gateway

# Restart specific service
docker compose restart demo-dashboard

# Full reset (removes all data)
docker compose down -v && docker compose up -d

# Check database messages
docker compose exec postgres psql -U nexus -c "SELECT uetr, status FROM payment_events LIMIT 5;"

# View stored XML messages
docker compose exec postgres psql -U nexus -c "SELECT uetr, LEFT(pacs008_message, 100) FROM payment_events WHERE pacs008_message IS NOT NULL LIMIT 1;"
```

---

Created by [Siva Subramanian](https://linkedin.com/in/sivasub987)
