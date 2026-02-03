// API Service for Nexus Gateway

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
        const error = new Error(`API Error: ${response.status} ${response.statusText}`) as any;
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
    return fetchJSON<{ countries: import("../types").Country[] }>("/v1/countries");
}

// Quotes API
export async function getQuotes(
    sourceCountry: string,
    destCountry: string,
    amount: number,
    amountType: "SOURCE" | "DESTINATION" = "SOURCE"
) {
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
    return fetchJSON<import("../types").FeeBreakdown>(
        `/v1/pre-transaction-disclosure?quote_id=${quoteId}`
    );
}

// Address types and inputs API (Combined)
export async function getAddressTypes(countryCode: string) {
    return fetchJSON<{ countryCode: string; addressTypes: any[] }>(
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

// Submit payment (pacs.008)
export async function submitPayment(paymentData: {
    quoteId: string;
    sourceAmount: number;
    recipientAccount: string;
    recipientName: string;
}) {
    return fetchJSON<import("../types").PaymentStatus>("/v1/iso20022/pacs008", {
        method: "POST",
        body: JSON.stringify(paymentData),
    });
}

// FX Rates API
export async function getRates(corridor?: string) {
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
    const url = status ? `/v1/payments?status=${status}` : "/v1/payments";
    return fetchJSON<{ payments: any[] }>(url);
}

export async function getPaymentEvents(uetr: string) {
    return fetchJSON<{ uetr: string; events: any[] }>(`/v1/payments/${uetr}/events`);
}


/**
 * Step 13: Request Intermediary Agents (SAP details)
 * Retrieves the settlement routing accounts for a selected FX quote.
 */
export async function getIntermediaryAgents(quoteId: string): Promise<any> {
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
