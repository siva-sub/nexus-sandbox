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

// Quotes API - uses dynamic generation for mock mode
// Quotes API - Uses path parameters per Nexus Spec
export async function getQuotes(
    sourceCountry: string,
    sourceCurrency: string,
    destCountry: string,
    destCurrency: string,
    amount: number,
    amountType: "SOURCE" | "DESTINATION" = "SOURCE"
) {
    // Determine amount currency based on type
    const amountCurrency = amountType === "SOURCE" ? sourceCurrency : destCurrency;

    if (MOCK_ENABLED) {
        const quotes = mock.generateMockQuotes(sourceCountry, destCountry, amount, amountType);
        // Cache quotes for later fee lookup
        quotes.forEach(q => mock.cacheMockQuote(q));
        return { quotes };
    }

    // Path: /quotes/{sourceCountry}/{sourceCurrency}/{destCountry}/{destCurrency}/{amountCurrency}/{amount}
    // Backend derives amountType from comparing amountCurrency with source/dest currencies
    return fetchJSON<{ quotes: import("../types").Quote[] }>(
        `/v1/quotes/${sourceCountry}/${sourceCurrency}/${destCountry}/${destCurrency}/${amountCurrency}/${amount}`
    );
}

// Fee disclosure API - uses cached mock quote for dynamic fees
// Supports INVOICED/DEDUCTED fee types per Nexus specification Phase 2
export async function getPreTransactionDisclosure(quoteId: string, sourceFeeType: "INVOICED" | "DEDUCTED" = "INVOICED") {
    if (MOCK_ENABLED) {
        const fees = mock.getMockFeeBreakdown(quoteId, sourceFeeType);
        if (!fees) {
            throw new Error(`Quote ${quoteId} not found or expired. Please search for new quotes.`);
        }
        return fees as any;
    }
    const queryParams = new URLSearchParams();
    queryParams.set("quoteId", quoteId);
    queryParams.set("sourceFeeType", sourceFeeType);
    return fetchJSON<import("../types").FeeBreakdown>(
        `/v1/fees-and-amounts?${queryParams.toString()}`
    );
}

// Step 12: Confirm Sender Approval (Gate for pacs.008)
// Mock mode now validates quote expiry like the real backend
export async function confirmSenderApproval(quoteId: string): Promise<import("../types").SenderConfirmationResponse> {
    if (MOCK_ENABLED) {
        // Use proper quote validation (checks expiry)
        return mock.recordSenderConfirmation(quoteId);
    }
    return fetchJSON<import("../types").SenderConfirmationResponse>(
        "/v1/fees/sender-confirmation",
        {
            method: "POST",
            body: JSON.stringify({ quoteId })
        }
    );
}

// Address types and inputs API (Combined)
export async function getAddressTypes(countryCode: string) {
    if (MOCK_ENABLED) {
        const DISPLAY_NAMES: Record<string, string> = {
            MOBI: "Mobile Number", MBNO: "Mobile Number",
            NRIC: "National ID / NRIC", NIDN: "National ID",
            UEN: "Business UEN", EWAL: "e-Wallet ID",
            EMAL: "Email Address", VPA: "UPI Address (VPA)",
            NIK: "National ID (NIK)", BIZN: "Business Registration",
            PASS: "Passport Number", ACCT: "Bank Account",
        };
        const pdo = mock.mockPDOs.find(p => p.country_code === countryCode);
        return {
            countryCode,
            addressTypes: (pdo?.supported_proxy_types || []).map(type => ({
                addressTypeId: type,
                addressTypeName: DISPLAY_NAMES[type] || type,
                inputs: [{
                    fieldName: "value",
                    displayLabel: DISPLAY_NAMES[type] || "Value",
                    dataType: "text",
                    attributes: { name: "accountOrProxyId", required: true, type: "text", placeholder: "" }
                }]
            }))
        };
    }
    // Transform backend format to frontend format
    // Backend returns nested structure (label.code, attributes.type)
    // Frontend expects flat structure (fieldName, dataType)
    const response = await fetchJSON<{ countryCode: string; addressTypes: any[] }>(
        `/v1/countries/${countryCode}/address-types-and-inputs`
    );

    return {
        countryCode: response.countryCode,
        addressTypes: response.addressTypes.map(type => ({
            addressTypeId: type.addressTypeId,
            addressTypeName: type.addressTypeName,
            inputs: (type.inputs || []).map((input: any) => ({
                fieldName: input.attributes?.name || input.fieldName || 'value',
                displayLabel: input.label?.title?.en || input.label?.code || input.displayLabel || 'Value',
                dataType: input.attributes?.type || input.dataType || 'text',
                attributes: input.attributes || {}
            }))
        }))
    };
}

// Proxy search (autocomplete suggestions from registered contacts)
export async function searchProxies(params: {
    countryCode?: string;
    proxyType?: string;
    q?: string;
}): Promise<{ results: Array<{ proxyType: string; proxyValue: string; displayName: string; bankName: string }>; total: number }> {
    const { countryCode = "", proxyType = "", q = "" } = params;
    if (MOCK_ENABLED) {
        // Return mock proxy registrations filtered by search
        const allProxies = [
            { proxyType: "MBNO", proxyValue: "+6281234567890", displayName: "B*** Santoso", bankName: "Bank Mandiri", country: "ID" },
            { proxyType: "MBNO", proxyValue: "+6287654321000", displayName: "S*** Wulandari", bankName: "Bank BCA", country: "ID" },
            { proxyType: "EMAL", proxyValue: "budi@example.co.id", displayName: "B*** Santoso", bankName: "Bank Mandiri", country: "ID" },
            { proxyType: "MOBI", proxyValue: "+6591234567", displayName: "T*** Lim", bankName: "DBS Bank", country: "SG" },
            { proxyType: "MOBI", proxyValue: "+6598765432", displayName: "J*** Tan", bankName: "OCBC Bank", country: "SG" },
            { proxyType: "MOBI", proxyValue: "+66891234567", displayName: "S*** Chaiyaphum", bankName: "Kasikorn Bank", country: "TH" },
            { proxyType: "MBNO", proxyValue: "+919123456789", displayName: "R*** Kumar", bankName: "State Bank of India", country: "IN" },
            { proxyType: "VPA", proxyValue: "rajesh@upi", displayName: "R*** Kumar", bankName: "State Bank of India", country: "IN" },
        ];
        const filtered = allProxies.filter(p =>
            (!countryCode || p.country === countryCode) &&
            (!proxyType || p.proxyType === proxyType) &&
            (!q || p.proxyValue.includes(q) || p.displayName.toLowerCase().includes(q.toLowerCase()))
        );
        return { results: filtered, total: filtered.length };
    }
    const qs = new URLSearchParams({ country_code: countryCode, proxy_type: proxyType, q }).toString();
    return fetchJSON(`/v1/addressing/search?${qs}`);
}

// Proxy resolution (acmt.023)
// Accepts object parameter to match hook call pattern
export async function resolveProxy(params: {
    sourceCountry?: string;
    destinationCountry: string;
    proxyType: string;
    proxyValue: string;
    structuredData?: Record<string, string>;
    scenarioCode?: string;
}): Promise<import("../types").ProxyResolutionResult> {
    const { sourceCountry, destinationCountry, proxyType, proxyValue, structuredData, scenarioCode } = params;
    if (MOCK_ENABLED) {
        // Handle unhappy flow scenarios in mock mode
        if (scenarioCode && scenarioCode.toLowerCase() !== 'happy') {
            const scenarioMap: Record<string, { status: string; statusReasonCode: string; displayName: string }> = {
                'be23': { status: 'RJCT', statusReasonCode: 'BE23', displayName: 'Invalid proxy identifier' },
                'ac04': { status: 'RJCT', statusReasonCode: 'AC04', displayName: 'Account closed' },
                'rr04': { status: 'RJCT', statusReasonCode: 'RR04', displayName: 'Regulatory reason' },
            };
            const scenario = scenarioMap[scenarioCode.toLowerCase()];
            if (scenario) {
                return {
                    status: scenario.status,
                    statusReasonCode: scenario.statusReasonCode,
                    displayName: scenario.displayName,
                } as any;
            }
        }
        return {
            status: "VALIDATED",
            resolutionId: "mock-res-123",
            accountNumber: "1234567890",
            accountType: "BBAN",
            agentBic: destinationCountry === "TH" ? "KASITHBK" : "MABORKKL",
            beneficiaryName: "Mock Beneficiary",
            displayName: "M. Beneficiary",
            verified: true,
            timestamp: new Date().toISOString()
        } as any;
    }
    const queryParams = new URLSearchParams();
    if (scenarioCode && scenarioCode !== 'happy') {
        queryParams.set('scenarioCode', scenarioCode);
    }
    const url = queryParams.toString()
        ? `/v1/addressing/resolve?${queryParams.toString()}`
        : '/v1/addressing/resolve';

    return fetchJSON<import("../types").ProxyResolutionResult>(
        url,
        {
            method: "POST",
            body: JSON.stringify({
                sourceCountry: sourceCountry || 'SG',
                destinationCountry,
                proxyType,
                proxyValue,
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
    // Mandatory fields per Nexus spec
    acceptanceDateTime?: string;  // AccptncDtTm - ISO 8601 timestamp
    instructionPriority?: "HIGH" | "NORM";  // InstrPrty - HIGH (25s) or NORM (4hr)
    clearingSystemCode?: string;  // ClrSys - e.g., "SGFAST", "THBRT"
    intermediaryAgent1Bic?: string;  // IntrmyAgt1 - Source SAP BIC
    intermediaryAgent2Bic?: string;  // IntrmyAgt2 - Destination SAP BIC
    paymentReference?: string;  // RmtInf/Strd/CdtrRefInf/Ref - Sender message
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

/**
 * Escapes XML special characters to prevent injection attacks
 * 
 * @param str - Raw string to escape
 * @returns XML-safe string with special characters properly escaped
 * 
 * Reference: https://www.w3.org/TR/xml/#syntax
 * Characters that must be escaped in XML:
 * - & (ampersand) -> &amp;
 * - < (less than) -> &lt;
 * - > (greater than) -> &gt;
 * - " (double quote) -> &quot;
 * - ' (apostrophe) -> &apos;
 */
function escapeXml(str: string): string {
    const s = String(str ?? '');
    return s
        .replace(/&/g, '&amp;')   // Must be first to avoid double-escaping
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Build ISO 20022 pacs.008.001.13 XML per Nexus specification
// Reference: XSD CreditTransferTransaction70 element order + Nexus docs for mandatory fields
// Missing fields added per EXTENSIVE_PARITY_REVIEW_REPORT.md:
// - AccptncDtTm (Acceptance Date Time) - MANDATORY in pacs.008.001.13
// - ClrSys (Clearing System) - Required for settlement
// - InstrPrty (Instruction Priority) - HIGH (25s) or NORM (4hr)
// - IntrmyAgt1/2 (Intermediary Agents) - Source/Destination SAPs
// - RmtInf/Strd/CdtrRefInf/Ref (Payment Reference) - Step 12 sender message
function buildPacs008Xml(params: Pacs008Params): string {
    const now = new Date().toISOString();
    const msgId = `MSG${Date.now()}`;
    const endToEndId = `E2E${Date.now()}`;

    // Use provided values or generate defaults
    const acceptanceDateTime = params.acceptanceDateTime || now;
    const instructionPriority = params.instructionPriority || "NORM";
    const clearingSystemCode = params.clearingSystemCode || "NGP";

    // Build intermediary agents XML if provided
    let intermediaryAgentsXml = "";
    if (params.intermediaryAgent1Bic) {
        intermediaryAgentsXml += `
      <IntrmyAgt1>
        <FinInstnId>
          <BICFI>${escapeXml(params.intermediaryAgent1Bic)}</BICFI>
        </FinInstnId>
      </IntrmyAgt1>`;
    }
    if (params.intermediaryAgent2Bic) {
        intermediaryAgentsXml += `
      <IntrmyAgt2>
        <FinInstnId>
          <BICFI>${escapeXml(params.intermediaryAgent2Bic)}</BICFI>
        </FinInstnId>
      </IntrmyAgt2>`;
    }

    // Build payment reference (remittance info) if provided
    let remittanceInfoXml = "";
    if (params.paymentReference) {
        remittanceInfoXml = `
      <RmtInf>
        <Strd>
          <CdtrRefInf>
            <Ref>${escapeXml(params.paymentReference.substring(0, 140))}</Ref>
          </CdtrRefInf>
        </Strd>
      </RmtInf>`;
    }

    // Element order follows XSD CreditTransferTransaction70:
    // PmtId → IntrBkSttlmAmt → IntrBkSttlmDt → InstdAmt → XchgRate → AgrdRate → ChrgBr 
    //   → Dbtr → DbtrAcct → DbtrAgt → IntrmyAgt1 → IntrmyAgt2 → CdtrAgt → Cdtr → CdtrAcct → RmtInf
    return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.13">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${now}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>${clearingSystemCode ? `
        <ClrSys>
          <Cd>${escapeXml(clearingSystemCode)}</Cd>
        </ClrSys>` : ""}
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>INSTR-${Date.now()}</InstrId>
        <EndToEndId>${endToEndId}</EndToEndId>
        <UETR>${escapeXml(params.uetr)}</UETR>
      </PmtId>
      <PmtTpInf>
        <InstrPrty>${instructionPriority}</InstrPrty>
      </PmtTpInf>
      <AccptncDtTm>${acceptanceDateTime}</AccptncDtTm>
      <IntrBkSttlmAmt Ccy="${escapeXml(params.sourceCurrency)}">${params.sourceAmount.toFixed(2)}</IntrBkSttlmAmt>
      <IntrBkSttlmDt>${now.split('T')[0]}</IntrBkSttlmDt>
      <InstdAmt Ccy="${escapeXml(params.destinationCurrency)}">${params.destinationAmount.toFixed(2)}</InstdAmt>
      <XchgRate>${params.exchangeRate}</XchgRate>
      <ChrgBr>SHAR</ChrgBr>
      <Dbtr>
        <Nm>${escapeXml(params.debtorName)}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>${escapeXml(params.debtorAccount)}</Id>
          </Othr>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>${escapeXml(params.debtorAgentBic)}</BICFI>
        </FinInstnId>
      </DbtrAgt>${intermediaryAgentsXml}
      <CdtrAgt>
        <FinInstnId>
          <BICFI>${escapeXml(params.creditorAgentBic)}</BICFI>
        </FinInstnId>
      </CdtrAgt>
      <Cdtr>
        <Nm>${escapeXml(params.creditorName)}</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>${escapeXml(params.creditorAccount)}</Id>
          </Othr>
        </Id>
      </CdtrAcct>${remittanceInfoXml}
      <RgltryRptg>
        <DbtCdtRptgInd>BOTH</DbtCdtRptgInd>
        <Authrty>
          <Nm>NEXUS</Nm>
        </Authrty>
        <Dtls>
          <Cd>NEXUS_QUOTE_ID</Cd>
          <Inf>${escapeXml(params.quoteId)}</Inf>
        </Dtls>
      </RgltryRptg>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;
}

// Submit payment (pacs.008) - Requires ISO 20022 XML per Nexus specification
// Reference: NotebookLM confirms JSON is NOT supported for pacs.008
export async function submitPacs008(params: Pacs008Params): Promise<Pacs008Response> {
    if (MOCK_ENABLED) {
        // Store payment in mock store for Explorer lookup
        const payment = mock.mockPaymentStore.createPayment({
            uetr: params.uetr,
            quoteId: params.quoteId,
            exchangeRate: params.exchangeRate,
            sourceAmount: params.sourceAmount,
            sourceCurrency: params.sourceCurrency,
            destinationAmount: params.destinationAmount,
            destinationCurrency: params.destinationCurrency,
            debtorName: params.debtorName,
            debtorAccount: params.debtorAccount,
            debtorAgentBic: params.debtorAgentBic,
            creditorName: params.creditorName,
            creditorAccount: params.creditorAccount,
            creditorAgentBic: params.creditorAgentBic,
            scenarioCode: params.scenarioCode,
        });

        // If scenario triggers rejection, throw error like real API
        if (payment.status === "RJCT") {
            const error = new Error(`Payment Rejected: ${payment.statusReasonCode}`) as Error & {
                status?: number;
                statusReasonCode?: string;
                detail?: string;
                uetr?: string;
            };
            error.status = 400;
            error.statusReasonCode = payment.statusReasonCode;
            const statusResult = mock.mockPaymentStore.getStatus(params.uetr);
            error.detail = ('reasonDescription' in statusResult ? statusResult.reasonDescription : undefined) || "Payment rejected";
            error.uetr = params.uetr;
            throw error;
        }

        return {
            uetr: params.uetr,
            status: payment.status,
            message: "Payment completed successfully (Mock)",
            callbackEndpoint: "https://mock-callback.example.com",
            processedAt: new Date().toISOString()
        };
    }
    const xml = buildPacs008Xml(params);
    const callbackUrl = `${window.location.origin}/api/callback/pacs002`;

    // Build query params - include scenarioCode for unhappy flow testing in backend mode
    const queryParams = new URLSearchParams();
    queryParams.set("pacs002Endpoint", callbackUrl);
    if (params.scenarioCode && params.scenarioCode !== "happy") {
        queryParams.set("scenarioCode", params.scenarioCode);
    }

    const response = await fetch(`${API_BASE}/v1/iso20022/pacs008?${queryParams.toString()}`, {
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
    // Backend returns list[FxpBalance] directly (flat array)
    const data = await fetchJSON<import("../types").LiquidityBalance[]>(
        "/v1/liquidity/balances"
    );
    return { balances: Array.isArray(data) ? data : [] };
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
    if (MOCK_ENABLED) {
        return mock.mockParseQRCode(qrData);
    }
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
    if (MOCK_ENABLED) {
        return mock.mockGenerateQRCode(params);
    }
    return fetchJSON<{ qrData: string; scheme: string }>("/v1/qr/generate", {
        method: "POST",
        body: JSON.stringify(params),
    });
}

export async function validateQRCode(qrData: string) {
    if (MOCK_ENABLED) {
        return mock.mockValidateQRCode(qrData);
    }
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
    if (MOCK_ENABLED) {
        return mock.mockParseUPI(upiUri);
    }
    return fetchJSON<{ valid: boolean; data?: UPIData; error?: string }>("/v1/qr/upi/parse", {
        method: "POST",
        body: JSON.stringify({ upiUri }),
    });
}

export async function upiToEMVCo(upiUri: string, merchantCity?: string) {
    if (MOCK_ENABLED) {
        return mock.mockUpiToEMVCo(upiUri, merchantCity);
    }
    return fetchJSON<{ emvcoData: string; scheme: string }>("/v1/qr/upi/to-emvco", {
        method: "POST",
        body: JSON.stringify({ upiUri, merchantCity }),
    });
}

export async function emvcoToUPI(emvcoData: string) {
    if (MOCK_ENABLED) {
        return mock.mockEmvcoToUPI(emvcoData);
    }
    return fetchJSON<{ upiUri: string; scheme: string }>("/v1/qr/emvco/to-upi", {
        method: "POST",
        body: JSON.stringify({ emvcoData }),
    });
}

// Payments Explorer
export async function listPayments(status?: string) {
    if (MOCK_ENABLED) {
        // Combine stored mock payments with static samples
        const storedPayments = mock.mockPaymentStore.list();
        const allPayments = [...storedPayments, ...mock.mockPayments];
        if (status) {
            return { payments: allPayments.filter(p => p.status === status) };
        }
        return { payments: allPayments };
    }
    const url = status ? `/v1/payments?status=${status}` : "/v1/payments";
    return fetchJSON<{ payments: import("../types").Payment[] }>(url);
}

// Payment Status API - with mock support for GitHub Pages
export async function getPaymentStatus(uetr: string) {
    if (MOCK_ENABLED) {
        return mock.mockPaymentStore.getStatus(uetr);
    }
    return fetchJSON<{ uetr: string; status: string; statusReasonCode?: string; reasonDescription?: string; sourcePsp: string; destinationPsp: string; amount: number; currency: string; initiatedAt: string; completedAt?: string }>(`/v1/payments/${uetr}/status`);
}

// Payment Messages API - with mock support for GitHub Pages
export async function getPaymentMessages(uetr: string) {
    if (MOCK_ENABLED) {
        return mock.mockPaymentStore.getMessages(uetr);
    }
    return fetchJSON<{ messages: { messageType: string; direction: string; xml: string; timestamp: string }[] }>(`/v1/payments/${uetr}/messages`);
}

// Payment Events API - with mock support for GitHub Pages
export async function getPaymentEvents(uetr: string) {
    if (MOCK_ENABLED) {
        return mock.mockPaymentStore.getEvents(uetr);
    }
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
    const url = countryCode ? `/v1/psps?countryCode=${countryCode}` : "/v1/psps";
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
    const url = countryCode ? `/v1/ips?countryCode=${countryCode}` : "/v1/ips";
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
    const url = countryCode ? `/v1/pdos?countryCode=${countryCode}` : "/v1/pdos";
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

// SAP API Functions - Connected to backend endpoints
export interface NostroAccount {
    accountId: string;
    sapId: string;
    sapName: string;
    sapBic: string;
    fxpId: string;
    fxpName: string;
    fxpBic: string;
    currency: string;
    balance: string;
    accountNumber: string;
    status: string;
    createdAt: string;
}

export interface SAPReservation {
    reservationId: string;
    accountId: string;
    sapBic: string;
    fxpBic: string;
    currency: string;
    amount: string;
    uetr: string;
    status: string;
    expiresAt: string;
    createdAt: string;
}

export interface SAPTransaction {
    transactionId: string;
    accountId: string;
    type: string;
    amount: string;
    currency: string;
    reference: string;
    createdAt: string;
}

export interface ReconciliationReport {
    date: string;
    sapId: string;
    sapName: string;
    currency: string;
    openingBalance: string;
    totalCredits: string;
    totalDebits: string;
    closingBalance: string;
    transactionCount: number;
}

export async function getSAPNostroAccounts(): Promise<NostroAccount[]> {
    if (MOCK_ENABLED) {
        return [
            { accountId: "mock-1", sapId: "s1", sapName: "DBS Bank", sapBic: "DBSSSGSG", fxpId: "f1", fxpName: "GlobalFX", fxpBic: "FXP-GLOBAL", currency: "SGD", balance: "500000.00", accountNumber: "NOSTRO-001", status: "ACTIVE", createdAt: new Date().toISOString() },
            { accountId: "mock-2", sapId: "s1", sapName: "DBS Bank", sapBic: "DBSSSGSG", fxpId: "f1", fxpName: "GlobalFX", fxpBic: "FXP-GLOBAL", currency: "THB", balance: "12500000.00", accountNumber: "NOSTRO-002", status: "ACTIVE", createdAt: new Date().toISOString() },
        ];
    }
    return fetchJSON<NostroAccount[]>("/v1/sap/nostro-accounts");
}

export async function getSAPReservations(): Promise<SAPReservation[]> {
    if (MOCK_ENABLED) {
        return [
            { reservationId: "res-1", accountId: "a1", sapBic: "DBSSSGSG", fxpBic: "FXP-GLOBAL", currency: "SGD", amount: "10000.00", uetr: "test-uetr", status: "ACTIVE", expiresAt: new Date(Date.now() + 600000).toISOString(), createdAt: new Date().toISOString() },
        ];
    }
    return fetchJSON<SAPReservation[]>("/v1/sap/reservations");
}

export async function getSAPTransactions(limit?: number): Promise<SAPTransaction[]> {
    if (MOCK_ENABLED) return [];
    const params = limit ? `?limit=${limit}` : "";
    return fetchJSON<SAPTransaction[]>(`/v1/sap/transactions${params}`);
}

export async function getSAPReconciliation(date?: string): Promise<ReconciliationReport[]> {
    if (MOCK_ENABLED) return [];
    const params = date ? `?date=${date}` : "";
    return fetchJSON<ReconciliationReport[]>(`/v1/sap/reconciliation${params}`);
}

// FXP API Functions - Connected to backend endpoints
export interface FXPRate {
    rateId: string;
    fxpId: string;
    sourceCurrency: string;
    destinationCurrency: string;
    baseRate: string;
    spreadBps: number;
    effectiveRate: string;
    validUntil: string;
    status: string;
}

export interface FXPTrade {
    tradeId: string;
    uetr: string;
    quoteId: string;
    fxpId: string;
    sourceCurrency: string;
    destinationCurrency: string;
    amount: string;
    rate: string;
    timestamp: string;
}

export interface FXPBalance {
    sapId: string;
    sapName: string;
    sapBic: string;
    currency: string;
    totalBalance: string;
    reservedBalance: string;
    availableBalance: string;
    status: string;
}

export interface PSPRelationship {
    pspBic: string;
    pspName: string;
    tier: string;
    improvementBps: number;
}

export async function getFXPRates(): Promise<FXPRate[]> {
    if (MOCK_ENABLED) {
        return [
            { rateId: "r-1", fxpId: "f1", sourceCurrency: "SGD", destinationCurrency: "THB", baseRate: "26.4521", spreadBps: 25, effectiveRate: "26.3860", validUntil: new Date(Date.now() + 60000).toISOString(), status: "ACTIVE" },
            { rateId: "r-2", fxpId: "f1", sourceCurrency: "SGD", destinationCurrency: "MYR", baseRate: "3.4123", spreadBps: 30, effectiveRate: "3.4021", validUntil: new Date(Date.now() + 45000).toISOString(), status: "ACTIVE" },
        ];
    }
    return fetchJSON<FXPRate[]>("/v1/fxp/rates");
}

export async function getFXPTrades(limit?: number): Promise<FXPTrade[]> {
    if (MOCK_ENABLED) return [];
    const params = limit ? `?limit=${limit}` : "";
    return fetchJSON<FXPTrade[]>(`/v1/fxp/trades${params}`);
}

export async function getFXPLiquidity(): Promise<FXPBalance[]> {
    if (MOCK_ENABLED) {
        return [
            { sapId: "s1", sapName: "DBS Bank", sapBic: "DBSSSGSG", currency: "SGD", totalBalance: "500000.00", reservedBalance: "50000.00", availableBalance: "450000.00", status: "ACTIVE" },
        ];
    }
    return fetchJSON<FXPBalance[]>("/v1/fxp/liquidity");
}

export async function getFXPPSPRelationships(): Promise<PSPRelationship[]> {
    if (MOCK_ENABLED) {
        return [
            { pspBic: "DBSSSGSG", pspName: "DBS Bank SG", tier: "PREMIUM", improvementBps: 5 },
            { pspBic: "BKKBTHBK", pspName: "Bangkok Bank TH", tier: "STANDARD", improvementBps: 0 },
        ];
    }
    return fetchJSON<PSPRelationship[]>("/v1/fxp/psp-relationships");
}

export async function getFXPRateHistory(corridor?: string, limit?: number): Promise<FXPRate[]> {
    if (MOCK_ENABLED) return [];
    const params = new URLSearchParams();
    if (corridor) params.set("corridor", corridor);
    if (limit) params.set("limit", limit.toString());
    const qs = params.toString() ? `?${params.toString()}` : "";
    return fetchJSON<FXPRate[]>(`/v1/fxp/rates/history${qs}`);
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
    if (MOCK_ENABLED) {
        return mock.getMockDemoDataStats();
    }
    return fetchJSON<DemoDataStats>("/v1/demo-data/stats");
}

export async function purgeDemoData(
    options: { ageHours?: number; includeQuotes?: boolean; dryRun?: boolean } = {}
): Promise<PurgeResult> {
    if (MOCK_ENABLED) {
        return mock.purgeMockDemoData(options);
    }
    const params = new URLSearchParams();
    if (options.ageHours !== undefined) params.set("age_hours", options.ageHours.toString());
    if (options.includeQuotes !== undefined) params.set("includeQuotes", options.includeQuotes.toString());
    if (options.dryRun !== undefined) params.set("dryRun", options.dryRun.toString());

    return fetchJSON<PurgeResult>(`/v1/demo-data?${params.toString()}`, {
        method: "DELETE",
    });
}

// Actors API (for Mesh page)
export interface Actor {
    bic: string;
    name: string;
    actorType: "PSP" | "IPS" | "FXP" | "SAP" | "PDO";
    countryCode?: string;
    status: string;
}

export async function getActors(): Promise<{ actors: Actor[]; total: number }> {
    if (MOCK_ENABLED) {
        return { actors: mock.mockActors, total: mock.mockActors.length };
    }
    return fetchJSON<{ actors: Actor[]; total: number }>("/v1/actors");
}

export async function registerActor(actor: import("../types").ActorRegistration): Promise<import("../types").Actor> {
    if (MOCK_ENABLED) {
        // Create full actor object
        const newActor: import("../types").Actor = {
            ...actor,
            actorId: `mock-${Date.now()}`,
            registeredAt: new Date().toISOString(),
            status: "ACTIVE",
            bic: actor.bic // Ensure BIC is passed
        };

        // Add to persistent mock store
        try {
            // Cast to any to bypass strict literal type check for mock data
            mock.addMockActor(newActor as any);
        } catch (e) {
            // Ignore duplicates for idempotency or re-throw if needed
            console.warn("Actor might already exist:", e);
        }

        return newActor;
    }
    return fetchJSON<import("../types").Actor>("/v1/actors/register", {
        method: "POST",
        body: JSON.stringify(actor),
    });
}

// ISO 20022 Templates API
export async function getIsoTemplates() {
    if (MOCK_ENABLED) {
        return mock.mockIsoTemplates;
    }
    return fetchJSON<Record<string, any>>("/v1/iso20022/templates");
}

