"""
Nexus Global Payments Gateway - Main Application

This module implements the core Nexus Gateway API as specified in the
official Nexus documentation: https://docs.nexusglobalpayments.org/apis/overview

The gateway serves as the central hub for:
- FX quote generation and management
- Payment routing between IPS operators
- Rate management for FX providers
- Proxy resolution coordination

Reference: https://docs.nexusglobalpayments.org/introduction/overview-of-nexus
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from src.api import countries, quotes, rates, fees, health, currencies, fin_insts, fee_formulas, iso20022, address_types, relationships, intermediary_agents, pacs002, reconciliation, liquidity, returns, qr, addressing, payments_explorer, actors, psp, ips, pdo, demo_data
from src.config import settings
from src.db import database
from src.observability import setup_tracing


# Application lifespan for startup/shutdown events
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Manage application lifecycle.
    
    Startup:
    - Connect to PostgreSQL database
    - Initialize Redis cache
    - Connect to Kafka for event publishing
    
    Shutdown:
    - Close all connections gracefully
    """
    # Startup
    await database.connect()
    
    yield
    
    # Shutdown
    await database.disconnect()


# Create FastAPI application
app = FastAPI(
    title="Nexus Global Payments Gateway",
    description="""
## 🌐 Nexus Sandbox API

A complete educational implementation of the [Nexus Global Payments](https://docs.nexusglobalpayments.org/) 
cross-border instant payment scheme.

### What is Nexus?

Nexus is a multilateral payment scheme that connects domestic instant payment systems (IPS) 
internationally, enabling **instant cross-border payments** at low cost. Originally developed 
by the Bank for International Settlements (BIS), Nexus is now operated by Nexus Global Payments Ltd.

### 17-Step Payment Lifecycle

This API implements the complete 17-step payment flow:

| Steps | Phase | Description |
|-------|-------|-------------|
| 1-2 | Setup | Country, Currency & Amount selection |
| 3-6 | Quotes | FX rate aggregation and quote locking |
| 7-9 | Addressing | Proxy resolution (mobile, email, QR) |
| 10-11 | Compliance | Sanctions screening & KYC checks |
| 12 | Approval | Sender confirms with full transparency |
| 13-16 | Execution | pacs.008 routing through SAPs |
| 17 | Confirmation | pacs.002 status report to Sender |

### Actor Types

| Actor | Role |
|-------|------|
| **PSP** | Payment Service Provider (banks, payment apps) |
| **IPS** | Instant Payment System operator (FAST, PromptPay, etc.) |
| **FXP** | Foreign Exchange Provider |
| **SAP** | Settlement Access Provider (holds FXP accounts in each IPS) |
| **PDO** | Proxy Directory Operator (mobile → account lookup) |

### ISO 20022 Messages

- `pacs.008` - FI to FI Customer Credit Transfer (Step 15)
- `pacs.002` - Payment Status Report (Step 17)
- `acmt.023` - Identification Verification Request (proxy resolution)
- `acmt.024` - Identification Verification Report (account details)
- `camt.054` - Bank to Customer Debit/Credit Notification (reconciliation)
- `pacs.004` - Payment Return (not yet supported)
- `camt.056` - FI to FI Payment Cancellation Request (recall)

### Reference Documentation

- [Official Nexus Documentation](https://docs.nexusglobalpayments.org/)
- [ISO 20022 Message Catalogue](https://www.iso20022.org/catalogue-messages)
- [BIS Innovation Hub - Nexus](https://www.bis.org/about/bisih/topics/suptech_regtech/nexus.htm)

---

⚠️ **Disclaimer**: This is an educational sandbox. Not affiliated with Nexus Global Payments Ltd.
    """,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    contact={
        "name": "Siva Subramanian",
        "url": "https://www.linkedin.com/in/sivasub987/",
        "email": "hello@sivasub.com",
    },
    license_info={
        "name": "MIT License",
        "url": "https://opensource.org/licenses/MIT",
    },
    openapi_tags=[
        {
            "name": "Health",
            "description": "Service health and readiness probes",
        },
        {
            "name": "Countries",
            "description": "Participating countries, currencies, and maximum transaction amounts. Reference: [Countries API](https://docs.nexusglobalpayments.org/apis/countries)",
        },
        {
            "name": "Quotes",
            "description": "FX quote generation and management (Steps 3-6). Aggregates rates from FXPs and applies tier-based improvements.",
        },
        {
            "name": "Rates",
            "description": "FXP rate management. Base rates, tier improvements, and PSP-specific enhancements.",
        },
        {
            "name": "Fees",
            "description": "Fee structure including Source PSP fees, Destination PSP fees, FX spread, and Nexus scheme fees.",
        },
        {
            "name": "Reference Data",
            "description": "Currencies, financial institutions, and static reference data.",
        },
        {
            "name": "ISO 20022 Messages",
            "description": "Core payment messaging with pacs.008, pacs.002, acmt.023/024. Reference: [Messaging & Translation](https://docs.nexusglobalpayments.org/messaging-and-translation/key-points)",
        },
        {
            "name": "Addressing",
            "description": "Proxy resolution and account verification (Steps 7-9). Supports mobile, email, QR, and IBAN addressing types.",
        },
        {
            "name": "FX Rate Improvements",
            "description": "Tier-based and PSP-specific rate improvements. Reference: [Rate Improvements](https://docs.nexusglobalpayments.org/fx-provision/rates-from-third-party-fx-providers)",
        },
        {
            "name": "Reconciliation",
            "description": "camt.054 reports for daily transaction reconciliation between actors.",
        },
        {
            "name": "Liquidity Management",
            "description": "SAP liquidity monitoring, reservations, and low-balance alerts.",
        },
        {
            "name": "Payment Returns & Recalls",
            "description": "pacs.004 returns and camt.056 recall requests for exception handling.",
        },
        {
            "name": "QR Codes",
            "description": "EMVCo-compliant QR generation for PayNow, PromptPay, QRPh, and DuitNow.",
        },
        {
            "name": "Payments",
            "description": "Payment lifecycle tracking, status queries, and developer observability.",
        },
        {
            "name": "Actor Registry",
            "description": "Plug-and-play participant registration with callback URL configuration.",
        },
        {
            "name": "Payment Service Providers",
            "description": "PSP management - banks and payment apps participating in Nexus.",
        },
        {
            "name": "Instant Payment Systems",
            "description": "IPS operator configuration - FAST (SG), PromptPay (TH), DuitNow (MY), etc.",
        },
        {
            "name": "Proxy Directory Operators",
            "description": "PDO management for mobile/email → account resolution.",
        },
    ],
    lifespan=lifespan,
)

# CORS middleware for demo UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup OpenTelemetry tracing
if settings.otel_enabled:
    setup_tracing(app)
    FastAPIInstrumentor.instrument_app(app)

# =============================================================================
# API Routes
# =============================================================================

# Health check (not versioned)
app.include_router(health.router, tags=["Health"])

# V1 API routes
# Reference: https://docs.nexusglobalpayments.org/apis/overview
app.include_router(
    countries.router,
    prefix="/v1",
    tags=["Countries"],
)

app.include_router(
    quotes.router,
    prefix="/v1",
    tags=["Quotes"],
)

app.include_router(
    rates.router,
    prefix="/v1",
    tags=["Rates"],
)

app.include_router(
    fees.router,
    prefix="/v1",
    tags=["Fees"],
)

# New endpoints from NotebookLM specification research
app.include_router(
    currencies.router,
    tags=["Reference Data"],
)

app.include_router(
    fin_insts.router,
    tags=["Reference Data"],
)

app.include_router(
    fee_formulas.router,
    tags=["Fees"],
)

# ISO 20022 Message Processing (Core Payment Flow)
# Reference: https://docs.nexusglobalpayments.org/messaging-and-translation/key-points
app.include_router(
    iso20022.router,
    tags=["ISO 20022 Messages"],
)

# Addressing API (form validation)
app.include_router(
    address_types.router,
    tags=["Addressing"],
)

# FXP Rate Improvements (tiers and PSP relationships)
# Reference: https://docs.nexusglobalpayments.org/fx-provision/rate-improvements
app.include_router(
    relationships.router,
    tags=["FX Rate Improvements"],
)

# Quote Intermediary Agents (Step 13 of payment flow)
# Reference: https://docs.nexusglobalpayments.org/payment-setup/step-13-request-intermediary-agents
app.include_router(
    intermediary_agents.router,
    tags=["Quotes"],
)

# pacs.002 Payment Status Report (Step 17 completion)
# Reference: https://docs.nexusglobalpayments.org/messaging-and-translation/message-pacs.002
app.include_router(
    pacs002.router,
    tags=["ISO 20022 Messages"],
)

# Reconciliation (camt.054 Bank to Customer Notification)
# Reference: https://docs.nexusglobalpayments.org/settlement-access-provision/reconciliation
app.include_router(
    reconciliation.router,
    tags=["Reconciliation"],
)

# SAP Liquidity Management (FXP balances, reservations, notifications)
# Reference: https://docs.nexusglobalpayments.org/settlement-access-provision/liquidity
app.include_router(
    liquidity.router,
    tags=["Liquidity Management"],
)

# Payment Returns and Recalls (pacs.004, camt.056)
# Reference: NotebookLM 2026-02-03 - Returns and recall flows
app.include_router(
    returns.router,
    tags=["Payment Returns & Recalls"],
)

app.include_router(
    qr.router,
    tags=["QR Codes"],
)

app.include_router(
    addressing.router,
    tags=["Addressing"],
)

app.include_router(
    payments_explorer.router,
    tags=["Payments"],
)

# Actor Registry (Plug-and-Play participant configuration)
# Reference: NotebookLM 2026-02-03 - Actor Connectivity Models
app.include_router(
    actors.router,
    tags=["Actor Registry"],
)

# PSP (Payment Service Provider) endpoints
# Reference: https://docs.nexusglobalpayments.org/apis/financial-institutions
app.include_router(
    psp.router,
    tags=["Payment Service Providers"],
)

# IPS (Instant Payment System) operator endpoints
# Reference: https://docs.nexusglobalpayments.org/payment-processing/role-of-the-ipso
app.include_router(
    ips.router,
    tags=["Instant Payment Systems"],
)

# PDO (Proxy Directory Operator) endpoints
# Reference: https://docs.nexusglobalpayments.org/addressing/role-of-the-pdo
app.include_router(
    pdo.router,
    tags=["Proxy Directory Operators"],
)

# Demo Data Management (test data cleanup)
app.include_router(
    demo_data.router,
    prefix="/v1/demo-data",
    tags=["Demo Data"],
)


# =============================================================================
# Root endpoint
# =============================================================================

@app.get("/", include_in_schema=False)
async def root():
    """Root endpoint with API information."""
    return {
        "name": "Nexus Global Payments Gateway",
        "version": "0.1.0",
        "documentation": "/docs",
        "reference": "https://docs.nexusglobalpayments.org/",
        "status": "sandbox",
    }
