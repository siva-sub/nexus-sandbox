import * as mock from "./mockData";
const { MOCK_ENABLED } = mock;

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

// Helper for fetch with error handling
async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options?.headers,
        },
    });

    if (!response.ok) {
        // Try to parse error body for structured error info
        let errorBody = null;
        try {
            errorBody = await response.json();
        } catch {
            // Ignore JSON parse errors
        }
        const error = new Error(`API Error: ${response.status} ${response.statusText}`) as Error & {
            status?: number;
            statusReasonCode?: string;
            detail?: string;
            errorBody?: unknown
        };
        error.status = response.status;
        error.statusReasonCode = errorBody?.statusReasonCode || errorBody?.error;
        error.detail = errorBody?.message || errorBody?.detail;
        error.errorBody = errorBody;
        throw error;
    }

    return response.json();
}


// Countries API
export async function getCountries() {
    if (MOCK_ENABLED) return { countries: mock.mockCountries };
    return fetchJSON<{ countries: import("../types").Country[] }>("/v1/countries");
}

// Quotes API
export async function getQuotes(
    sourceCountry: string,
    destCountry: string,
    amount: number,
    amountType: "SOURCE" | "DESTINATION" = "SOURCE"
) {
    if (MOCK_ENABLED) return { quotes: mock.mockQuotes };
    const params = new URLSearchParams({
        sourceCountry,
        destCountry,
        amount: amount.toString(),
        amountType
    });
    return fetchJSON<{ quotes: import("../types").Quote[] }>(
        `/v1/quotes?${params.toString()}`
    );
}

// Fee disclosure API
export async function getPreTransactionDisclosure(quoteId: string) {
    if (MOCK_ENABLED) return mock.mockQuotes[0].fees as any;
    return fetchJSON<import("../types").FeeBreakdown>(
        `/v1/pre-transaction-disclosure?quote_id=${quoteId}`
    );
}

// Address types and inputs API (Combined)
export async function getAddressTypes(countryCode: string) {
    if (MOCK_ENABLED) {
        const pdo = mock.mockPDOs.find(p => p.country_code === countryCode);
        return {
            countryCode,
            addressTypes: (pdo?.supported_proxy_types || []).map(type => ({
                address_type_id: type,
                name: type === "MBNO" ? "Mobile Number" : type,
                description: `Resolve via ${type}`,
                inputs: [{ field_id: "value", label: "Value", type: "text", required: true }]
            }))
        };
    }
    return fetchJSON<{ countryCode: string; addressTypes: import("../types").AddressTypeWithInputs[] }>(
        `/v1/countries/${countryCode}/address-types-and-inputs`
    );
}

// Proxy resolution (acmt.023)
export async function resolveProxy(
    country: string,
    type: string,
    value: string,
    structuredData?: Record<string, string>
): Promise<import("../types").ProxyResolutionResult> {
    if (MOCK_ENABLED) {
        return {
            resolutionId: "mock-res-123",
            accountNumber: "1234567890",
            accountType: "BBAN",
            agentBic: country === "TH" ? "BKKBTHBK" : "MAYBMYKL",
            beneficiaryName: "Mock Beneficiary",
            displayName: "M. Beneficiary",
            status: "VALIDATED",
            timestamp: new Date().toISOString()
        } as any;
    }
    return fetchJSON<import("../types").ProxyResolutionResult>(
        "/v1/addressing/resolve",
        {
            method: "POST",
            body: JSON.stringify({
                destinationCountry: country,
                proxyType: type,
                proxyValue: value,
                structuredData
            }),
        }
    );
}

// Submit payment (pacs.008) - Requires ISO 20022 XML per Nexus specification
// Reference: NotebookLM confirms JSON is NOT supported for pacs.008
export interface Pacs008Params {
    uetr: string;
    quoteId: string;
    exchangeRate: number;
    sourceAmount: number;
    sourceCurrency: string;
    destinationAmount: number;
    destinationCurrency: string;
    debtorName: string;
    debtorAccount: string;
    debtorAgentBic: string;
    creditorName: string;
    creditorAccount: string;
    creditorAgentBic: string;
    // For scenario injection (demo purposes)
    scenarioCode?: string;
}

export interface Pacs008Response {
    uetr: string;
    status: string;
    statusReasonCode?: string;
    message: string;
    callbackEndpoint: string;
    processedAt: string;
}

// Build ISO 20022 pacs.008 XML per Nexus specification
function buildPacs008Xml(params: Pacs008Params): string {
    const now = new Date().toISOString();
    const msgId = `MSG${Date.now()}`;
    const endToEndId = `E2E${Date.now()}`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${now}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>INDA</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <EndToEndId>${endToEndId}</EndToEndId>
        <UETR>${params.uetr}</UETR>
      </PmtId>
      <IntrBkSttlmAmt Ccy="${params.sourceCurrency}">${params.sourceAmount.toFixed(2)}</IntrBkSttlmAmt>
      <IntrBkSttlmDt>${now.split('T')[0]}</IntrBkSttlmDt>
      <AccptncDtTm>${now}</AccptncDtTm>
      <ChrgBr>SHAR</ChrgBr>
      <InstdAmt Ccy="${params.destinationCurrency}">${params.destinationAmount.toFixed(2)}</InstdAmt>
      <XchgRate>${params.exchangeRate}</XchgRate>
      <CtrctId>${params.quoteId}</CtrctId>
      <Dbtr>
        <Nm>${params.debtorName}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>${params.debtorAccount}</Id>
          </Othr>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>${params.debtorAgentBic}</BICFI>
        </FinInstnId>
      </DbtrAgt>
      <Cdtr>
        <Nm>${params.creditorName}</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>${params.creditorAccount}</Id>
          </Othr>
        </Id>
      </CdtrAcct>
      <CdtrAgt>
        <FinInstnId>
          <BICFI>${params.creditorAgentBic}</BICFI>
        </FinInstnId>
      </CdtrAgt>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;
}

// Submit payment (pacs.008) - Requires ISO 20022 XML per Nexus specification
// Reference: NotebookLM confirms JSON is NOT supported for pacs.008
export async function submitPacs008(params: Pacs008Params): Promise<Pacs008Response> {
    if (MOCK_ENABLED) {
        return {
            uetr: params.uetr,
            status: "ACSP",
            message: "Payment accepted for processing (Mock)",
            callbackEndpoint: "https://mock-callback.example.com",
            processedAt: new Date().toISOString()
        };
    }
    const xml = buildPacs008Xml(params);
    const callbackUrl = `${window.location.origin}/api/callback/pacs002`;

    const response = await fetch(`${API_BASE}/v1/iso20022/pacs008?pacs002Endpoint=${encodeURIComponent(callbackUrl)}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/xml",
        },
        body: xml,
    });

    if (!response.ok) {
        let errorBody = null;
        try {
            errorBody = await response.json();
        } catch {
            // Ignore JSON parse errors
        }
        const error = new Error(`API Error: ${response.status} ${response.statusText}`) as Error & {
            status?: number;
            statusReasonCode?: string;
            detail?: string;
            errorBody?: unknown;
            uetr?: string;
        };
        error.status = response.status;
        error.statusReasonCode = errorBody?.statusReasonCode || errorBody?.detail?.statusReasonCode;
        error.detail = errorBody?.message || errorBody?.detail?.errors?.[0] || JSON.stringify(errorBody?.detail);
        error.errorBody = errorBody;
        error.uetr = errorBody?.detail?.uetr || params.uetr;
        throw error;
    }

    return response.json();
}

// FX Rates API
export async function getRates(corridor?: string) {
    if (MOCK_ENABLED) return { rates: mock.mockFXRates };
    const url = corridor ? `/v1/rates?corridor=${corridor}` : "/v1/rates";
    return fetchJSON<{ rates: import("../types").FXRate[] }>(url);
}

export async function submitRate(rateData: {
    sourceCurrency: string;
    destinationCurrency: string;
    rate: number;
    spreadBps: number;
}) {
    return fetchJSON<import("../types").FXRate>("/v1/rates", {
        method: "POST",
        body: JSON.stringify(rateData),
    });
}

// Liquidity API
export async function getLiquidityBalances() {
    if (MOCK_ENABLED) return { balances: mock.mockLiquidityBalances };
    return fetchJSON<{ balances: import("../types").LiquidityBalance[] }>(
        "/v1/liquidity/balances"
    );
}

export async function getReservations() {
    return fetchJSON<{ reservations: import("../types").Reservation[] }>(
        "/v1/liquidity/reservations"
    );
}

// Health check
export async function checkHealth() {
    if (MOCK_ENABLED) return { status: "healthy", timestamp: new Date().toISOString() };
    return fetchJSON<{ status: string; timestamp: string }>("/health");
}

// QR Code APIs
export interface QRParseResult {
    formatIndicator: string;
    initiationType: string;
    merchantAccountInfo: {
        scheme: string;
        proxyType: string | null;
        proxyValue: string | null;
        editable: boolean;
    };
    transactionCurrency: string | null;
    transactionAmount: string | null;
    merchantName: string | null;
    merchantCity: string | null;
    crc: string;
    crcValid: boolean;
}

export async function parseQRCode(qrData: string) {
    return fetchJSON<QRParseResult>("/v1/qr/parse", {
        method: "POST",
        body: JSON.stringify({ qrData }),
    });
}

export async function generateQRCode(params: {
    scheme: string;
    proxyType: string;
    proxyValue: string;
    amount?: number;
    merchantName?: string;
    merchantCity?: string;
    reference?: string;
    editable?: boolean;
}) {
    return fetchJSON<{ qrData: string; scheme: string }>("/v1/qr/generate", {
        method: "POST",
        body: JSON.stringify(params),
    });
}

export async function validateQRCode(qrData: string) {
    return fetchJSON<{ valid: boolean; crcValid: boolean; formatValid: boolean; errors: string[] }>(
        "/v1/qr/validate",
        {
            method: "POST",
            body: JSON.stringify({ qrData }),
        }
    );
}

// UPI APIs (NPCI India - BharatQR)
export interface UPIData {
    pa: string;  // VPA
    pn?: string; // Payee Name
    am?: string; // Amount
    cu: string;  // Currency
    tr?: string; // Transaction Reference
    tn?: string; // Transaction Note
    mc?: string; // Merchant Category Code
}

export async function parseUPI(upiUri: string) {
    return fetchJSON<{ valid: boolean; data?: UPIData; error?: string }>("/v1/qr/upi/parse", {
        method: "POST",
        body: JSON.stringify({ upiUri }),
    });
}

export async function upiToEMVCo(upiUri: string, merchantCity?: string) {
    return fetchJSON<{ emvcoData: string; scheme: string }>("/v1/qr/upi/to-emvco", {
        method: "POST",
        body: JSON.stringify({ upiUri, merchantCity }),
    });
}

export async function emvcoToUPI(emvcoData: string) {
    return fetchJSON<{ upiUri: string; scheme: string }>("/v1/qr/emvco/to-upi", {
        method: "POST",
        body: JSON.stringify({ emvcoData }),
    });
}

// Payments Explorer
export async function listPayments(status?: string) {
    if (MOCK_ENABLED) return { payments: mock.mockPayments };
    const url = status ? `/v1/payments?status=${status}` : "/v1/payments";
    return fetchJSON<{ payments: import("../types").Payment[] }>(url);
}

export async function getPaymentEvents(uetr: string) {
    return fetchJSON<{ uetr: string; events: import("../types").PaymentEvent[] }>(`/v1/payments/${uetr}/events`);
}


/**
 * Step 13: Request Intermediary Agents (SAP details)
 * Retrieves the settlement routing accounts for a selected FX quote.
 */
export async function getIntermediaryAgents(quoteId: string): Promise<import("../types").IntermediaryAgentsResponse> {
    if (MOCK_ENABLED) {
        return {
            quoteId,
            sourceSap: { bic: "DBSSSGSG", name: "DBS Settlement", country: "SG" },
            destinationSap: { bic: "BBLTHBK", name: "Bangkok Bank Settlement", country: "TH" },
            routingPath: ["S-PSP", "S-IPS", "Nexus", "FXP", "SAP", "D-IPS", "D-PSP"]
        } as any;
    }
    return fetchJSON(`/v1/quotes/${quoteId}/intermediary-agents`);
}

// =============================================================================
// Actor APIs - PSP, IPS, PDO, FXP, SAP
// =============================================================================

// PSP (Payment Service Provider) APIs
export interface PSP {
    psp_id: string;
    bic: string;
    name: string;
    country_code: string;
    fee_percent: number;
}

export async function getPSPs(countryCode?: string) {
    if (MOCK_ENABLED) {
        const filtered = countryCode ? mock.mockPSPs.filter(p => p.country_code === countryCode) : mock.mockPSPs;
        return { psps: filtered, total: filtered.length };
    }
    const url = countryCode ? `/v1/psps?country_code=${countryCode}` : "/v1/psps";
    return fetchJSON<{ psps: PSP[]; total: number }>(url);
}

export async function getPSP(bic: string) {
    return fetchJSON<PSP>(`/v1/psps/${bic}`);
}

// IPS (Instant Payment System) APIs
export interface IPSOperator {
    ips_id: string;
    name: string;
    country_code: string;
    clearing_system_id: string;
    max_amount: number;
    currency_code: string;
}

export async function getIPSOperators(countryCode?: string) {
    if (MOCK_ENABLED) {
        const filtered = countryCode ? mock.mockIPSOperators.filter(p => p.country_code === countryCode) : mock.mockIPSOperators;
        return { operators: filtered, total: filtered.length };
    }
    const url = countryCode ? `/v1/ips?country_code=${countryCode}` : "/v1/ips";
    return fetchJSON<{ operators: IPSOperator[]; total: number }>(url);
}

export async function getIPSMembers(clearingSystemId: string) {
    return fetchJSON<{ clearing_system_id: string; members: { bic: string; name: string }[]; total: number }>(
        `/v1/ips/${clearingSystemId}/members`
    );
}

// PDO (Proxy Directory Operator) APIs
export interface PDO {
    pdo_id: string;
    name: string;
    country_code: string;
    supported_proxy_types: string[];
}

export interface ProxyRegistration {
    proxy_type: string;
    proxy_value: string;
    creditor_name_masked: string;
    bank_bic: string;
    bank_name: string;
}

export async function getPDOs(countryCode?: string) {
    if (MOCK_ENABLED) {
        const filtered = countryCode ? mock.mockPDOs.filter(p => p.country_code === countryCode) : mock.mockPDOs;
        return { pdos: filtered, total: filtered.length };
    }
    const url = countryCode ? `/v1/pdos?country_code=${countryCode}` : "/v1/pdos";
    return fetchJSON<{ pdos: PDO[]; total: number }>(url);
}

export async function getPDORegistrations(countryCode: string, proxyType?: string) {
    const url = proxyType
        ? `/v1/pdos/country/${countryCode}/registrations?proxy_type=${proxyType}`
        : `/v1/pdos/country/${countryCode}/registrations`;
    return fetchJSON<{ pdo_name: string; registrations: ProxyRegistration[]; total: number }>(url);
}

export async function getPDOStats(countryCode: string) {
    return fetchJSON<{ pdo_name: string; total_registrations: number; registrations_by_type: Record<string, number> }>(
        `/v1/pdos/country/${countryCode}/stats`
    );
}

// FXP (Foreign Exchange Provider) APIs - Uses existing rates
export interface FXP {
    fxp_id: string;
    fxp_code: string;
    name: string;
    base_spread_bps: number;
}

// SAP (Settlement Access Provider) APIs
export interface SAP {
    sap_id: string;
    bic: string;
    name: string;
    country_code: string;
    currency_code: string;
}

// Demo Data Management APIs
export interface DemoDataStats {
    totalPayments: number;
    paymentsByStatus: Record<string, number>;
    totalQuotes: number;
    totalEvents: number;
    oldestPayment: string | null;
    newestPayment: string | null;
}

export interface PurgeResult {
    dryRun: boolean;
    deleted?: Record<string, number>;
    wouldDelete?: Record<string, number>;
    ageHours: number;
    message: string;
}

export async function getDemoDataStats(): Promise<DemoDataStats> {
    return fetchJSON<DemoDataStats>("/v1/demo-data/stats");
}

export async function purgeDemoData(
    options: { ageHours?: number; includeQuotes?: boolean; dryRun?: boolean } = {}
): Promise<PurgeResult> {
    const params = new URLSearchParams();
    if (options.ageHours !== undefined) params.set("age_hours", options.ageHours.toString());
    if (options.includeQuotes !== undefined) params.set("includeQuotes", options.includeQuotes.toString());
    if (options.dryRun !== undefined) params.set("dryRun", options.dryRun.toString());

    return fetchJSON<PurgeResult>(`/v1/demo-data?${params.toString()}`, {
        method: "DELETE",
    });
}
