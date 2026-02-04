// Mock Data for GitHub Pages Static Demo
// This file provides static data when the app runs without a backend

export const MOCK_ENABLED = import.meta.env.VITE_MOCK_DATA === "true" || import.meta.env.VITE_GITHUB_PAGES === "true";

// Countries - matching production data
export const mockCountries = [
    {
        countryCode: "SG",
        name: "Singapore",
        currencyCode: "SGD",
        currencyName: "Singapore Dollar",
        flagEmoji: "🇸🇬",
        maxAmount: 50000,
        enabled: true
    },
    {
        countryCode: "TH",
        name: "Thailand",
        currencyCode: "THB",
        currencyName: "Thai Baht",
        flagEmoji: "🇹🇭",
        maxAmount: 1500000,
        enabled: true
    },
    {
        countryCode: "MY",
        name: "Malaysia",
        currencyCode: "MYR",
        currencyName: "Malaysian Ringgit",
        flagEmoji: "🇲🇾",
        maxAmount: 200000,
        enabled: true
    }
];

// Pre-seeded PSPs
export const mockPSPs = [
    { psp_id: "psp-dbs-sg", bic: "DBSGSGSG", name: "DBS Bank Singapore", country_code: "SG", fee_percent: 0.5 },
    { psp_id: "psp-uob-sg", bic: "UOVBSGSG", name: "UOB Singapore", country_code: "SG", fee_percent: 0.45 },
    { psp_id: "psp-bkk-th", bic: "BKKBTHBK", name: "Bangkok Bank", country_code: "TH", fee_percent: 0.4 },
    { psp_id: "psp-kbank-th", bic: "KASITHBK", name: "Kasikornbank", country_code: "TH", fee_percent: 0.35 },
    { psp_id: "psp-mayb-my", bic: "MAYBMYKL", name: "Maybank Malaysia", country_code: "MY", fee_percent: 0.5 }
];

// Pre-seeded IPS
export const mockIPSOperators = [
    { ips_id: "ips-fast", name: "Singapore FAST", country_code: "SG", clearing_system_id: "SGIPSOPS", max_amount: 200000, currency_code: "SGD" },
    { ips_id: "ips-promptpay", name: "Thailand PromptPay", country_code: "TH", clearing_system_id: "THIPSOPS", max_amount: 2000000, currency_code: "THB" },
    { ips_id: "ips-duitnow", name: "Malaysia DuitNow", country_code: "MY", clearing_system_id: "MYIPSOPS", max_amount: 500000, currency_code: "MYR" }
];

// Pre-seeded PDOs
export const mockPDOs = [
    { pdo_id: "pdo-sg", name: "PayNow Directory (SG)", country_code: "SG", supported_proxy_types: ["MBNO", "NRIC", "UEN"] },
    { pdo_id: "pdo-th", name: "PromptPay Directory (TH)", country_code: "TH", supported_proxy_types: ["MBNO", "IDNO", "TXID"] },
    { pdo_id: "pdo-my", name: "DuitNow Directory (MY)", country_code: "MY", supported_proxy_types: ["MBNO", "NRIC", "PSPT"] }
];

// Sample FX Rates
export const mockFXRates = [
    { rate_id: "rate-1", source_currency: "SGD", destination_currency: "THB", rate: 25.85, spread_bps: 50, fxp_code: "NEXUSFXP1", valid_until: new Date(Date.now() + 600000).toISOString() },
    { rate_id: "rate-2", source_currency: "SGD", destination_currency: "MYR", rate: 3.45, spread_bps: 45, fxp_code: "NEXUSFXP1", valid_until: new Date(Date.now() + 600000).toISOString() },
    { rate_id: "rate-3", source_currency: "THB", destination_currency: "SGD", rate: 0.0387, spread_bps: 50, fxp_code: "NEXUSFXP1", valid_until: new Date(Date.now() + 600000).toISOString() }
];

// Sample Payments (for explorer)
export const mockPayments = [
    {
        uetr: "91398cbd-0838-453f-b2c7-536e829f2b8e",
        status: "ACCC",
        statusCode: "ACCC",
        sourceAmount: 1000,
        sourceCurrency: "SGD",
        destinationAmount: 25850,
        destinationCurrency: "THB",
        debtorName: "John Tan",
        creditorName: "Somchai Thai",
        createdAt: "2026-02-04T10:30:00Z",
        completedAt: "2026-02-04T10:30:45Z"
    },
    {
        uetr: "a2b3c4d5-e6f7-4890-abcd-ef1234567890",
        status: "RJCT",
        statusCode: "AM04",
        statusReasonCode: "AM04",
        sourceAmount: 75000,
        sourceCurrency: "SGD",
        destinationAmount: null,
        destinationCurrency: "THB",
        debtorName: "Jane Lim",
        creditorName: "Unknown",
        createdAt: "2026-02-04T09:15:00Z",
        completedAt: "2026-02-04T09:15:12Z"
    }
];

// Sample Liquidity Balances
export const mockLiquidityBalances = [
    { fxp_code: "NEXUSFXP1", sap_bic: "DBSSSGSG", currency: "SGD", balance: 5000000, reserved: 125000 },
    { fxp_code: "NEXUSFXP1", sap_bic: "BBLTHBK", currency: "THB", balance: 150000000, reserved: 3500000 },
    { fxp_code: "NEXUSFXP1", sap_bic: "MABORSMM", currency: "MYR", balance: 15000000, reserved: 450000 }
];

// Sample Quotes
export const mockQuotes = [
    {
        quoteId: "quote-demo-1",
        fxpCode: "NEXUSFXP1",
        fxpName: "Nexus FXP Alpha",
        sourceCurrency: "SGD",
        destinationCurrency: "THB",
        exchangeRate: 25.85,
        sourceAmount: 1000,
        destinationAmount: 25850,
        spreadBps: 50,
        validUntil: new Date(Date.now() + 600000).toISOString(),
        fees: { nexusSchemeFee: 0.50, creditorAgentFee: 1.00, totalFees: 1.50 }
    }
];

// Demo mode indicator
export const DEMO_BANNER_MESSAGE = `
🎮 **GitHub Pages Demo Mode**

This is a static demo of the Nexus Sandbox dashboard. 
For the full interactive experience with real API calls:

\`\`\`bash
git clone https://github.com/siva-sub/nexus-sandbox.git
docker compose -f docker-compose.lite.yml up -d
\`\`\`

Then visit http://localhost:8080
`;
