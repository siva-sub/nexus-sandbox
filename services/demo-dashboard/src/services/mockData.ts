// Mock Data for GitHub Pages Static Demo
// This file provides static data when the app runs without a backend

export const MOCK_ENABLED = import.meta.env.VITE_MOCK_DATA === "true" || import.meta.env.VITE_GITHUB_PAGES === "true";

// Track confirmed quotes for Step 12 validation
const confirmedQuotes = new Set<string>();

// ============================================================================
// CURRENCY-AWARE FX RATES
// ============================================================================

const FX_RATES: Record<string, number> = {
    // SGD base rates
    "SGD_THB": 25.85,
    "SGD_IDR": 11423.50,
    "SGD_MYR": 3.45,
    "SGD_PHP": 42.15,
    "SGD_INR": 62.50,
    // THB base rates
    "THB_SGD": 0.0387,
    "THB_IDR": 441.80,
    "THB_MYR": 0.1334,
    // MYR base rates  
    "MYR_SGD": 0.290,
    "MYR_THB": 7.49,
    "MYR_IDR": 3310.00,
    // IDR base rates
    "IDR_SGD": 0.0000875,
    "IDR_THB": 0.00226,
    "IDR_MYR": 0.000302,
    // PHP base rates
    "PHP_SGD": 0.0237,
    // INR base rates
    "INR_SGD": 0.016,
};

// Country to currency mapping
const COUNTRY_CURRENCY: Record<string, string> = {
    "SG": "SGD",
    "TH": "THB",
    "MY": "MYR",
    "ID": "IDR",
    "PH": "PHP",
    "IN": "INR",
};

// ============================================================================
// MOCK PAYMENT STORE (Session-based state for GitHub Pages)
// ============================================================================

interface MockPayment {
    uetr: string;
    quoteId: string;
    sourcePspBic: string;
    destinationPspBic: string;
    debtorName: string;
    debtorAccount: string;
    creditorName: string;
    creditorAccount: string;
    sourceCurrency: string;
    destinationCurrency: string;
    sourceAmount: number;
    destinationAmount: number;
    exchangeRate: string;
    status: string;
    statusReasonCode?: string;
    createdAt: string;
    initiated_at: string; // Alias for createdAt for type compatibility
    completedAt?: string;
    messages: MockMessage[];
    events: MockEvent[];
}

interface MockMessage {
    messageType: string;
    direction: "inbound" | "outbound";
    xml: string;
    timestamp: string;
    description?: string;
}

interface MockEvent {
    eventId: string;
    uetr: string; // Required for PaymentEvent compatibility
    eventType: string;
    event_type?: string; // Alias for backend sync compatibility
    timestamp: string;
    actor: string;
    data: Record<string, unknown>; // Required for PaymentEvent compatibility
    details: Record<string, unknown>;
}

class MockPaymentStore {
    private payments: Map<string, MockPayment> = new Map();

    createPayment(params: {
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
        scenarioCode?: string;
    }): MockPayment {
        const now = new Date().toISOString();

        // Determine status based on scenario
        let status = "ACCC";
        let statusReasonCode: string | undefined;

        if (params.scenarioCode && params.scenarioCode !== "happy") {
            status = "RJCT";
            statusReasonCode = params.scenarioCode.toUpperCase();
        }

        // Generate pacs.008 XML
        const pacs008Xml = this.generatePacs008Xml(params, now);
        const pacs002Xml = this.generatePacs002Xml(params, status, statusReasonCode, now);

        const payment: MockPayment = {
            uetr: params.uetr,
            quoteId: params.quoteId,
            sourcePspBic: params.debtorAgentBic,
            destinationPspBic: params.creditorAgentBic,
            debtorName: params.debtorName,
            debtorAccount: params.debtorAccount,
            creditorName: params.creditorName,
            creditorAccount: params.creditorAccount,
            sourceCurrency: params.sourceCurrency,
            destinationCurrency: params.destinationCurrency,
            sourceAmount: params.sourceAmount,
            destinationAmount: params.destinationAmount,
            exchangeRate: params.exchangeRate.toString(),
            status,
            statusReasonCode,
            createdAt: now,
            initiated_at: now, // Alias for type compatibility
            completedAt: status === "ACCC" ? now : undefined,
            messages: [
                {
                    messageType: "camt.103.001.02",
                    direction: "outbound",
                    xml: `<!-- camt.103 CreateReservation → Source SAP (${params.sourceCurrency}) -->\n<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.103.001.02">\n  <CreateRsvatn>\n    <MsgId>${params.uetr}-SSAP-RES</MsgId>\n    <RsvatnId><Id>${params.uetr}-SSAP</Id></RsvatnId>\n    <Amt Ccy="${params.sourceCurrency}">${params.sourceAmount}</Amt>\n    <AcctOwnr><FinInstnId><BICFI>${params.debtorAgentBic}</BICFI></FinInstnId></AcctOwnr>\n    <StsRsn>Source SAP funds reservation for Nexus settlement</StsRsn>\n  </CreateRsvatn>\n</Document>`,
                    timestamp: now,
                    description: "camt.103 → Source SAP: Lock source-currency funds on FXP nostro"
                },
                {
                    messageType: "camt.103.001.02",
                    direction: "outbound",
                    xml: `<!-- camt.103 CreateReservation → Dest SAP (${params.destinationCurrency}) -->\n<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.103.001.02">\n  <CreateRsvatn>\n    <MsgId>${params.uetr}-DSAP-RES</MsgId>\n    <RsvatnId><Id>${params.uetr}-DSAP</Id></RsvatnId>\n    <Amt Ccy="${params.destinationCurrency}">${params.destinationAmount}</Amt>\n    <AcctOwnr><FinInstnId><BICFI>${params.creditorAgentBic}</BICFI></FinInstnId></AcctOwnr>\n    <StsRsn>Dest SAP funds reservation for Nexus settlement</StsRsn>\n  </CreateRsvatn>\n</Document>`,
                    timestamp: now,
                    description: "camt.103 → Dest SAP: Lock dest-currency funds on FXP nostro"
                },
                {
                    messageType: "pacs.008.001.13",
                    direction: "outbound",
                    xml: pacs008Xml,
                    timestamp: now,
                    description: "pacs.008 → IPS: FI to FI Customer Credit Transfer"
                },
                {
                    messageType: "pacs.002.001.15",
                    direction: "inbound",
                    xml: pacs002Xml,
                    timestamp: now,
                    description: `pacs.002 ← IPS: Payment Status Report (${status})`
                }
            ],
            events: [
                // Step 1: Payment initiated by Source PSP
                { eventId: `evt-${Date.now()}-01`, uetr: params.uetr, eventType: "PAYMENT_INITIATED", event_type: "PAYMENT_INITIATED", timestamp: now, actor: params.debtorAgentBic, data: { message: "Source PSP initiates cross-border payment" }, details: {} },
                // Step 2: Nexus validates the locked quote
                { eventId: `evt-${Date.now()}-02`, uetr: params.uetr, eventType: "QUOTE_VALIDATED", event_type: "QUOTE_VALIDATED", timestamp: now, actor: "NEXUSGWS", data: { quoteId: params.quoteId, message: "Quote validated and rate locked" }, details: { quoteId: params.quoteId } },
                // Step 3: camt.103 → Source SAP reserves source-currency funds
                { eventId: `evt-${Date.now()}-03`, uetr: params.uetr, eventType: "RESERVATION_CREATED", event_type: "RESERVATION_CREATED", timestamp: now, actor: "S-SAP", data: { leg: "SOURCE", currency: params.sourceCurrency, amount: String(params.sourceAmount), isoMessage: "camt.103", message: `camt.103 CreateReservation sent to Source SAP — ${params.sourceCurrency} ${params.sourceAmount} locked on FXP nostro` }, details: { leg: "SOURCE" } },
                // Step 4: camt.103 → Dest SAP reserves dest-currency funds
                { eventId: `evt-${Date.now()}-04`, uetr: params.uetr, eventType: "RESERVATION_CREATED", event_type: "RESERVATION_CREATED", timestamp: now, actor: "D-SAP", data: { leg: "DESTINATION", currency: params.destinationCurrency, amount: String(params.destinationAmount), isoMessage: "camt.103", message: `camt.103 CreateReservation sent to Dest SAP — ${params.destinationCurrency} ${params.destinationAmount} locked on FXP nostro` }, details: { leg: "DESTINATION" } },
                // Step 5: pacs.008 submitted to IPS for clearing
                { eventId: `evt-${Date.now()}-05`, uetr: params.uetr, eventType: "PACS008_SUBMITTED", event_type: "PACS008_SUBMITTED", timestamp: now, actor: "NEXUSGWS", data: { isoMessage: "pacs.008", message: "pacs.008 FI-to-FI Credit Transfer submitted to IPS" }, details: {} },
                // Step 6: pacs.002 received from IPS with payment outcome
                { eventId: `evt-${Date.now()}-06`, uetr: params.uetr, eventType: "PACS002_RECEIVED", event_type: "PACS002_RECEIVED", timestamp: now, actor: "NEXUSGWS", data: { isoMessage: "pacs.002", status, statusReasonCode, message: `pacs.002 Payment Status Report received — ${status}${statusReasonCode ? ` (${statusReasonCode})` : ''}` }, details: { status, statusReasonCode } },
                // Step 7-8: Reservation outcome driven by pacs.002 status
                ...(status === "ACCC" ? [
                    // ACCC → UTILIZED: SAPs finalize debit, settlement complete
                    { eventId: `evt-${Date.now()}-07`, uetr: params.uetr, eventType: "RESERVATION_UTILIZED", event_type: "RESERVATION_UTILIZED", timestamp: now, actor: "S-SAP", data: { leg: "SOURCE", currency: params.sourceCurrency, amount: String(params.sourceAmount), trigger: "pacs.002 ACCC", message: `Source SAP reservation UTILIZED — ${params.sourceCurrency} ${params.sourceAmount} debited from FXP nostro (settlement finalized)` }, details: { leg: "SOURCE" } },
                    { eventId: `evt-${Date.now()}-08`, uetr: params.uetr, eventType: "RESERVATION_UTILIZED", event_type: "RESERVATION_UTILIZED", timestamp: now, actor: "D-SAP", data: { leg: "DESTINATION", currency: params.destinationCurrency, amount: String(params.destinationAmount), trigger: "pacs.002 ACCC", message: `Dest SAP reservation UTILIZED — ${params.destinationCurrency} ${params.destinationAmount} debited from FXP nostro (settlement finalized)` }, details: { leg: "DESTINATION" } },
                    { eventId: `evt-${Date.now()}-09`, uetr: params.uetr, eventType: "SETTLEMENT_COMPLETE", event_type: "SETTLEMENT_COMPLETE", timestamp: now, actor: "NEXUSGWS", data: { status: "ACCC", message: "Settlement complete — recipient credited" }, details: { status: "ACCC" } },
                ] : [
                    // RJCT → CANCELLED: SAPs release reservations, funds unlocked
                    { eventId: `evt-${Date.now()}-07`, uetr: params.uetr, eventType: "RESERVATION_CANCELLED", event_type: "RESERVATION_CANCELLED", timestamp: now, actor: "S-SAP", data: { leg: "SOURCE", currency: params.sourceCurrency, amount: String(params.sourceAmount), trigger: `pacs.002 RJCT (${statusReasonCode})`, message: `Source SAP reservation CANCELLED — ${params.sourceCurrency} ${params.sourceAmount} released back to FXP nostro` }, details: { leg: "SOURCE" } },
                    { eventId: `evt-${Date.now()}-08`, uetr: params.uetr, eventType: "RESERVATION_CANCELLED", event_type: "RESERVATION_CANCELLED", timestamp: now, actor: "D-SAP", data: { leg: "DESTINATION", currency: params.destinationCurrency, amount: String(params.destinationAmount), trigger: `pacs.002 RJCT (${statusReasonCode})`, message: `Dest SAP reservation CANCELLED — ${params.destinationCurrency} ${params.destinationAmount} released back to FXP nostro` }, details: { leg: "DESTINATION" } },
                    { eventId: `evt-${Date.now()}-09`, uetr: params.uetr, eventType: "PAYMENT_REJECTED", event_type: "PAYMENT_REJECTED", timestamp: now, actor: "NEXUSGWS", data: { status: "RJCT", statusReasonCode, message: `Payment rejected (${statusReasonCode}) — reservations cancelled, funds released` }, details: { status: "RJCT", statusReasonCode } },
                ]),
            ]
        };

        this.payments.set(params.uetr, payment);
        return payment;
    }

    get(uetr: string): MockPayment | undefined {
        return this.payments.get(uetr);
    }

    getStatus(uetr: string): { uetr: string; status: string; statusReasonCode?: string; reasonDescription?: string; sourcePsp: string; destinationPsp: string; amount: number; currency: string; initiatedAt: string; completedAt?: string } | { status: "NOT_FOUND"; uetr: string } {
        const payment = this.payments.get(uetr);
        if (!payment) {
            return { status: "NOT_FOUND", uetr };
        }
        return {
            uetr: payment.uetr,
            status: payment.status,
            statusReasonCode: payment.statusReasonCode,
            reasonDescription: this.getReasonDescription(payment.statusReasonCode),
            sourcePsp: payment.sourcePspBic,
            destinationPsp: payment.destinationPspBic,
            amount: payment.sourceAmount,
            currency: payment.sourceCurrency,
            initiatedAt: payment.createdAt,
            completedAt: payment.completedAt,
        };
    }

    getMessages(uetr: string): { messages: MockMessage[] } {
        const payment = this.payments.get(uetr);
        return { messages: payment?.messages || [] };
    }

    getEvents(uetr: string): { uetr: string; events: MockEvent[] } {
        const payment = this.payments.get(uetr);
        return { uetr, events: payment?.events || [] };
    }

    list(): MockPayment[] {
        return Array.from(this.payments.values());
    }

    private getReasonDescription(code?: string): string | undefined {
        const descriptions: Record<string, string> = {
            "AB04": "Quote Expired - Exchange rate no longer valid",
            "TM01": "Timeout - Processing time limit exceeded",
            "DUPL": "Duplicate Payment - Transaction already exists",
            "AM04": "Insufficient Funds - Sender balance insufficient",
            "AM02": "Amount Limit Exceeded - Above max transfer limit",
            "BE23": "Invalid Proxy - Recipient identifier not found",
            "AC04": "Closed Account - Recipient account is closed",
            "RR04": "Regulatory Block - Transaction blocked by compliance",
        };
        return code ? descriptions[code] : undefined;
    }

    private generatePacs008Xml(params: { uetr: string; quoteId: string; exchangeRate: number; sourceAmount: number; sourceCurrency: string; destinationAmount: number; destinationCurrency: string; debtorName: string; debtorAccount: string; debtorAgentBic: string; creditorName: string; creditorAccount: string; creditorAgentBic: string }, timestamp: string): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.13">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>NEXUS-${Date.now()}</MsgId>
      <CreDtTm>${timestamp}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf><SttlmMtd>CLRG</SttlmMtd></SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>INSTR-${Date.now()}</InstrId>
        <EndToEndId>E2E-${Date.now()}</EndToEndId>
        <UETR>${params.uetr}</UETR>
      </PmtId>
      <IntrBkSttlmAmt Ccy="${params.sourceCurrency}">${params.sourceAmount.toFixed(2)}</IntrBkSttlmAmt>
      <IntrBkSttlmDt>${timestamp.split('T')[0]}</IntrBkSttlmDt>
      <XchgRate>${params.exchangeRate}</XchgRate>
      <InstdAmt Ccy="${params.destinationCurrency}">${params.destinationAmount.toFixed(2)}</InstdAmt>
      <ChrgBr>SHAR</ChrgBr>
      <Dbtr><Nm>${params.debtorName}</Nm></Dbtr>
      <DbtrAcct><Id><Othr><Id>${params.debtorAccount}</Id></Othr></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BICFI>${params.debtorAgentBic}</BICFI></FinInstnId></DbtrAgt>
      <CdtrAgt><FinInstnId><BICFI>${params.creditorAgentBic}</BICFI></FinInstnId></CdtrAgt>
      <Cdtr><Nm>${params.creditorName}</Nm></Cdtr>
      <CdtrAcct><Id><Othr><Id>${params.creditorAccount}</Id></Othr></Id></CdtrAcct>
      <SplmtryData><Envlp><NxsQtId>${params.quoteId}</NxsQtId></Envlp></SplmtryData>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;
    }

    private generatePacs002Xml(params: { uetr: string; debtorAgentBic: string; creditorAgentBic: string }, status: string, reasonCode: string | undefined, timestamp: string): string {
        const statusInfo = status === "ACCC"
            ? `<TxSts>ACCC</TxSts>`
            : `<TxSts>RJCT</TxSts>
        <StsRsnInf><Rsn><Cd>${reasonCode || "NARR"}</Cd></Rsn></StsRsnInf>`;

        return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.002.001.12">
  <FIToFIPmtStsRpt>
    <GrpHdr>
      <MsgId>PACS002-${Date.now()}</MsgId>
      <CreDtTm>${timestamp}</CreDtTm>
    </GrpHdr>
    <TxInfAndSts>
      <OrgnlEndToEndId>E2E-${Date.now()}</OrgnlEndToEndId>
      <OrgnlUETR>${params.uetr}</OrgnlUETR>
      ${statusInfo}
      <InstgAgt><FinInstnId><BICFI>${params.debtorAgentBic}</BICFI></FinInstnId></InstgAgt>
      <InstdAgt><FinInstnId><BICFI>${params.creditorAgentBic}</BICFI></FinInstnId></InstdAgt>
    </TxInfAndSts>
  </FIToFIPmtStsRpt>
</Document>`;
    }
}

export const mockPaymentStore = new MockPaymentStore();

// ============================================================================
// DYNAMIC QUOTE GENERATION
// ============================================================================

export interface MockQuote {
    quoteId: string;
    fxpId: string;
    fxpName: string;
    sourceCurrency: string;
    destinationCurrency: string;
    exchangeRate: string;
    spreadBps: number;
    sourceInterbankAmount: string;
    destinationInterbankAmount: string;
    creditorAccountAmount: string;
    cappedToMaxAmount: boolean;
    expiresAt: string;
    fees: MockFeeBreakdown;
}

export interface MockFeeBreakdown {
    quoteId: string;
    marketRate: string;
    customerRate: string;
    appliedSpreadBps: string;
    recipientNetAmount: string;
    payoutGrossAmount: string;
    destinationPspFee: string;
    destinationCurrency: string;
    senderPrincipal: string;
    sourcePspFee: string;
    sourcePspFeeType: string;
    schemeFee: string;
    senderTotal: string;
    sourceCurrency: string;
    effectiveRate: string;
    totalCostPercent: string;
    quoteValidUntil: string;
}

export function generateMockQuotes(
    sourceCountry: string,
    destCountry: string,
    amount: number,
    amountType: "SOURCE" | "DESTINATION"
): MockQuote[] {
    const sourceCurrency = COUNTRY_CURRENCY[sourceCountry] || "SGD";
    const destCurrency = COUNTRY_CURRENCY[destCountry] || "IDR";

    const rateKey = `${sourceCurrency}_${destCurrency}`;
    const baseRate = FX_RATES[rateKey] || 1.0;

    // Generate 2-3 quotes from different FXPs with varying spreads
    // Using FXP codes matching seed data (FXP-ABC, FXP-XYZ)
    const fxps = [
        { id: "FXP-ABC", name: "ABC Currency Exchange", spreadBps: 50 },
        { id: "FXP-XYZ", name: "XYZ Forex Ltd", spreadBps: 65 },
    ];

    return fxps.map((fxp, idx) => {
        const spreadRate = baseRate * (1 + fxp.spreadBps / 10000);

        let sourceAmount: number;
        let destAmount: number;

        if (amountType === "SOURCE") {
            sourceAmount = amount;
            destAmount = amount * spreadRate;
        } else {
            destAmount = amount;
            sourceAmount = amount / spreadRate;
        }

        // Calculate fees
        const sourcePspFee = sourceAmount * 0.005; // 0.5%
        const schemeFee = sourceAmount * 0.001; // 0.1%
        const destPspFee = destAmount * 0.0001; // Small destination fee
        const senderTotal = sourceAmount + sourcePspFee + schemeFee;
        const recipientNet = destAmount - destPspFee;
        const effectiveRate = recipientNet / senderTotal;
        const totalCostPercent = ((spreadRate - baseRate) / baseRate * 100) + 0.6; // spread + fees

        const quoteId = `quote-mock-${Date.now()}-${idx}`;
        const expiresAt = new Date(Date.now() + 600000).toISOString();

        return {
            quoteId,
            fxpId: fxp.id,
            fxpName: fxp.name,
            sourceCurrency,
            destinationCurrency: destCurrency,
            exchangeRate: spreadRate.toFixed(4),
            spreadBps: fxp.spreadBps,
            sourceInterbankAmount: sourceAmount.toFixed(2),
            destinationInterbankAmount: destAmount.toFixed(2),
            creditorAccountAmount: recipientNet.toFixed(2),
            cappedToMaxAmount: false,
            expiresAt,
            fees: {
                quoteId,
                marketRate: baseRate.toFixed(4),
                customerRate: spreadRate.toFixed(4),
                appliedSpreadBps: fxp.spreadBps.toString(),
                recipientNetAmount: recipientNet.toFixed(2),
                payoutGrossAmount: destAmount.toFixed(2),
                destinationPspFee: destPspFee.toFixed(2),
                destinationCurrency: destCurrency,
                senderPrincipal: sourceAmount.toFixed(2),
                sourcePspFee: sourcePspFee.toFixed(2),
                sourcePspFeeType: "DEDUCTED",
                schemeFee: schemeFee.toFixed(2),
                senderTotal: senderTotal.toFixed(2),
                sourceCurrency,
                effectiveRate: effectiveRate.toFixed(4),
                totalCostPercent: totalCostPercent.toFixed(2),
                quoteValidUntil: expiresAt
            }
        };
    });
}

export function getMockFeeBreakdown(quoteId: string, sourceFeeType: "INVOICED" | "DEDUCTED" = "INVOICED"): MockFeeBreakdown | null {
    // Check if this is a dynamically generated quote
    const cachedQuote = mockQuotesCache.get(quoteId);
    if (cachedQuote) {
        // Adjust fees based on sourceFeeType
        const fees = { ...cachedQuote.fees };
        const principal = parseFloat(fees.senderPrincipal);
        const pspFee = parseFloat(fees.sourcePspFee);

        if (sourceFeeType === "DEDUCTED") {
            // When DEDUCTED, fee is taken from principal
            // Sender pays exactly principal, recipient gets principal - fee converted
            fees.senderTotal = principal.toFixed(2);
        } else {
            // When INVOICED (default), fee is added on top
            // Sender pays principal + fee
            fees.senderTotal = (principal + pspFee).toFixed(2);
        }
        fees.sourcePspFeeType = sourceFeeType;
        return fees;
    }

    // Fallback to static quotes only if exact match exists
    // Do NOT fall back to mockQuotes[0] as it's hardcoded for THB
    const staticQuote = mockQuotes.find(q => q.quoteId === quoteId);
    if (staticQuote) {
        const fees = { ...staticQuote.fees };
        const principal = parseFloat(fees.senderPrincipal);
        const pspFee = parseFloat(fees.sourcePspFee);

        if (sourceFeeType === "DEDUCTED") {
            fees.senderTotal = principal.toFixed(2);
        } else {
            fees.senderTotal = (principal + pspFee).toFixed(2);
        }
        fees.sourcePspFeeType = sourceFeeType;
        return fees;
    }
    return null;
}

// Cache for dynamically generated quotes (keyed by quoteId)
const mockQuotesCache = new Map<string, MockQuote>();

export function cacheMockQuote(quote: MockQuote): void {
    mockQuotesCache.set(quote.quoteId, quote);
}

// ============================================================================
// STATIC MOCK DATA (Fallback/Reference)
// ============================================================================

// Countries - matching production data
export const mockCountries = [
    {
        countryId: 1,
        countryCode: "SG",
        name: "Singapore",
        currencies: [
            { currencyCode: "SGD", maxAmount: "200000" }
        ],
        requiredMessageElements: { pacs008: [] }
    },
    {
        countryId: 2,
        countryCode: "TH",
        name: "Thailand",
        currencies: [
            { currencyCode: "THB", maxAmount: "5000000" }
        ],
        requiredMessageElements: { pacs008: [] }
    },
    {
        countryId: 3,
        countryCode: "MY",
        name: "Malaysia",
        currencies: [
            { currencyCode: "MYR", maxAmount: "10000000" }
        ],
        requiredMessageElements: { pacs008: [] }
    },
    {
        countryId: 4,
        countryCode: "ID",
        name: "Indonesia",
        currencies: [
            { currencyCode: "IDR", maxAmount: "1000000000" }
        ],
        requiredMessageElements: { pacs008: [] }
    },
    {
        countryId: 5,
        countryCode: "PH",
        name: "Philippines",
        currencies: [
            { currencyCode: "PHP", maxAmount: "10000000" }
        ],
        requiredMessageElements: { pacs008: [] }
    },
    {
        countryId: 6,
        countryCode: "IN",
        name: "India",
        currencies: [
            { currencyCode: "INR", maxAmount: "10000000" }
        ],
        requiredMessageElements: { pacs008: [] }
    }
];

// Pre-seeded PSPs
export const mockPSPs = [
    { psp_id: "psp-dbs-sg", bic: "DBSSSGSG", name: "DBS Bank Singapore", country_code: "SG", fee_percent: 0.5 },
    { psp_id: "psp-uob-sg", bic: "UOVBSGSG", name: "UOB Singapore", country_code: "SG", fee_percent: 0.45 },
    { psp_id: "psp-bkk-th", bic: "KASITHBK", name: "Kasikorn Bank Thailand", country_code: "TH", fee_percent: 0.3 },
    { psp_id: "psp-kbank-th", bic: "KASITHBK", name: "Kasikornbank", country_code: "TH", fee_percent: 0.35 },
    { psp_id: "psp-mayb-my", bic: "MABORKKL", name: "Maybank Malaysia", country_code: "MY", fee_percent: 0.4 },
    { psp_id: "psp-mandiri-id", bic: "BMRIIDJA", name: "Bank Mandiri", country_code: "ID", fee_percent: 0.4 },
];

// Pre-seeded IPS - Using correct clearing system IDs matching seed data
export const mockIPSOperators = [
    { ips_id: "ips-fast", name: "Singapore FAST", country_code: "SG", clearing_system_id: "FAST", max_amount: 200000, currency_code: "SGD" },
    { ips_id: "ips-promptpay", name: "Thailand PromptPay", country_code: "TH", clearing_system_id: "PromptPay", max_amount: 5000000, currency_code: "THB" },
    { ips_id: "ips-duitnow", name: "Malaysia DuitNow", country_code: "MY", clearing_system_id: "DuitNow", max_amount: 10000000, currency_code: "MYR" },
    { ips_id: "ips-bi-fast", name: "Indonesia BI-FAST", country_code: "ID", clearing_system_id: "BI-FAST", max_amount: 1000000000, currency_code: "IDR" },
    { ips_id: "ips-instapay", name: "Philippines InstaPay", country_code: "PH", clearing_system_id: "InstaPay", max_amount: 10000000, currency_code: "PHP" },
];

// Pre-seeded PDOs
export const mockPDOs = [
    { pdo_id: "pdo-sg", name: "PayNow Directory (SG)", country_code: "SG", supported_proxy_types: ["MBNO", "NRIC", "UEN"] },
    { pdo_id: "pdo-th", name: "PromptPay Directory (TH)", country_code: "TH", supported_proxy_types: ["MBNO", "IDNO", "TXID"] },
    { pdo_id: "pdo-my", name: "DuitNow Directory (MY)", country_code: "MY", supported_proxy_types: ["MBNO", "NRIC", "PSPT"] },
    { pdo_id: "pdo-id", name: "QRIS Directory (ID)", country_code: "ID", supported_proxy_types: ["MBNO", "NIK", "QRIS"] },
];

// Sample FX Rates (static reference) - Using correct FXP names
export const mockFXRates = [
    { rateId: "rate-1", sourceCurrency: "SGD", destinationCurrency: "THB", rate: 25.85, spreadBps: 50, fxpName: "ABC Currency Exchange", validUntil: new Date(Date.now() + 600000).toISOString(), status: "ACTIVE" },
    { rateId: "rate-2", sourceCurrency: "SGD", destinationCurrency: "MYR", rate: 3.45, spreadBps: 45, fxpName: "ABC Currency Exchange", validUntil: new Date(Date.now() + 600000).toISOString(), status: "ACTIVE" },
    { rateId: "rate-3", sourceCurrency: "SGD", destinationCurrency: "IDR", rate: 11423.50, spreadBps: 50, fxpName: "ABC Currency Exchange", validUntil: new Date(Date.now() + 600000).toISOString(), status: "ACTIVE" },
] as any[];

// Sample Payments (static reference - for initial Explorer data)
export const mockPayments = [
    {
        uetr: "91398cbd-0838-453f-b2c7-536e829f2b8e",
        quoteId: "quote-demo-1",
        sourcePspBic: "DBSSSGSG",
        destinationPspBic: "BMRIIDJA",
        debtorName: "John Tan",
        debtorAccount: "12345678",
        creditorName: "Budi Santoso",
        creditorAccount: "87654321",
        sourceCurrency: "SGD",
        destinationCurrency: "IDR",
        sourceAmount: 8.75,
        exchangeRate: "11423.50",
        status: "ACCC",
        createdAt: "2026-02-04T10:30:00Z",
        initiated_at: "2026-02-04T10:30:00Z"
    }
];

// Sample Liquidity Balances - matching backend FxpBalance schema
export const mockLiquidityBalances = [
    { fxp_id: "FXP-ABC", currency: "SGD", balance: 5000000, reserved: 125000, available: 4875000 },
    { fxp_id: "FXP-ABC", currency: "THB", balance: 150000000, reserved: 3500000, available: 146500000 },
    { fxp_id: "FXP-ABC", currency: "MYR", balance: 15000000, reserved: 450000, available: 14550000 },
    { fxp_id: "FXP-ABC", currency: "IDR", balance: 50000000000, reserved: 1000000000, available: 49000000000 },
    { fxp_id: "FXP-XYZ", currency: "SGD", balance: 3000000, reserved: 75000, available: 2925000 },
];

// Static quotes (fallback)
export const mockQuotes = [
    {
        quoteId: "quote-demo-1",
        fxpId: "FXP-ABC",
        fxpName: "ABC Currency Exchange",
        sourceCurrency: "SGD",
        destinationCurrency: "THB",
        exchangeRate: "25.85",
        spreadBps: 50,
        sourceInterbankAmount: "1000.00",
        destinationInterbankAmount: "25850.00",
        creditorAccountAmount: "25850.00",
        cappedToMaxAmount: false,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        fees: {
            quoteId: "quote-demo-1",
            marketRate: "25.80",
            customerRate: "25.85",
            appliedSpreadBps: "50",
            recipientNetAmount: "25850.00",
            payoutGrossAmount: "25851.50",
            destinationPspFee: "1.50",
            destinationCurrency: "THB",
            senderPrincipal: "1000.00",
            sourcePspFee: "0.50",
            sourcePspFeeType: "DEDUCTED",
            schemeFee: "0.10",
            senderTotal: "1000.60",
            sourceCurrency: "SGD",
            effectiveRate: "25.83",
            totalCostPercent: "0.4",
            quoteValidUntil: new Date(Date.now() + 600000).toISOString()
        }
    },
];

// Mock Actors for Mesh page - Using correct BIC codes
export const mockActors = [
    { bic: "DBSSSGSG", name: "DBS Bank Singapore", actorType: "PSP" as const, countryCode: "SG", status: "ACTIVE" },
    { bic: "UOVBSGSG", name: "UOB Singapore", actorType: "PSP" as const, countryCode: "SG", status: "ACTIVE" },
    { bic: "KASITHBK", name: "Kasikorn Bank Thailand", actorType: "PSP" as const, countryCode: "TH", status: "ACTIVE" },
    { bic: "BMRIIDJA", name: "Bank Mandiri", actorType: "PSP" as const, countryCode: "ID", status: "ACTIVE" },
    { bic: "MABORKKL", name: "Maybank Malaysia", actorType: "PSP" as const, countryCode: "MY", status: "ACTIVE" },
    { bic: "CHASSGSG", name: "JPMorgan Chase Singapore", actorType: "PSP" as const, countryCode: "SG", status: "ACTIVE" },
    // IPS Operators - using descriptive codes (not BICs)
    { bic: "FAST", name: "Singapore FAST", actorType: "IPS" as const, countryCode: "SG", status: "ACTIVE" },
    { bic: "PromptPay", name: "Thailand PromptPay", actorType: "IPS" as const, countryCode: "TH", status: "ACTIVE" },
    { bic: "DuitNow", name: "Malaysia DuitNow", actorType: "IPS" as const, countryCode: "MY", status: "ACTIVE" },
    { bic: "BI-FAST", name: "Indonesia BI-FAST", actorType: "IPS" as const, countryCode: "ID", status: "ACTIVE" },
    { bic: "InstaPay", name: "Philippines InstaPay", actorType: "IPS" as const, countryCode: "PH", status: "ACTIVE" },
    // FXPs - using correct FXP codes
    { bic: "FXP-ABC", name: "ABC Currency Exchange", actorType: "FXP" as const, countryCode: "SG", status: "ACTIVE" },
    { bic: "FXP-XYZ", name: "XYZ Forex Ltd", actorType: "FXP" as const, countryCode: "SG", status: "ACTIVE" },
    // SAPs
    { bic: "DBSSSGSG", name: "DBS Settlement Access", actorType: "SAP" as const, countryCode: "SG", status: "ACTIVE" },
    { bic: "KASITHBK", name: "Kasikorn Settlement Access", actorType: "SAP" as const, countryCode: "TH", status: "ACTIVE" },
    // PDOs
    { bic: "PayNow", name: "PayNow Directory", actorType: "PDO" as const, countryCode: "SG", status: "ACTIVE" },
    { bic: "PromptPay-PDO", name: "PromptPay Directory", actorType: "PDO" as const, countryCode: "TH", status: "ACTIVE" },
    { bic: "QRIS", name: "QRIS Directory", actorType: "PDO" as const, countryCode: "ID", status: "ACTIVE" },
    { bic: "DuitNow-PDO", name: "DuitNow Directory", actorType: "PDO" as const, countryCode: "MY", status: "ACTIVE" },
];

/**
 * Add a new actor to the mock registry
 */
export function addMockActor(actor: typeof mockActors[0]): void {
    // Check for duplicates
    if (mockActors.some(a => a.bic === actor.bic)) {
        throw new Error(`Actor with BIC ${actor.bic} already exists`);
    }
    mockActors.push(actor);
}

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

// ============================================================================
// QUOTE CONFIRMATION & EXPIRY VALIDATION (Step 12 Parity)
// ============================================================================

// Track confirmed quotes for Step 12 validation
// (Uses confirmedQuotes Set declared at top of file)

/**
 * Validate if a quote exists and is not expired
 * Returns validation result with details
 */
export function validateQuoteForConfirmation(quoteId: string): {
    valid: boolean;
    expired: boolean;
    exists: boolean;
    message: string;
} {
    // Check if quote exists in cache
    const cachedQuote = mockQuotesCache.get(quoteId);
    if (!cachedQuote) {
        // Also check static quotes
        const staticQuote = mockQuotes.find(q => q.quoteId === quoteId);
        if (!staticQuote) {
            return {
                valid: false,
                expired: false,
                exists: false,
                message: "Quote not found. Please search for new quotes."
            };
        }
        // Check if static quote is expired
        const expiryTime = new Date(staticQuote.expiresAt).getTime();
        const now = Date.now();
        if (now > expiryTime) {
            return {
                valid: false,
                expired: true,
                exists: true,
                message: "Quote has expired. Please search for new quotes."
            };
        }
    } else {
        // Check if cached quote is expired
        const expiryTime = new Date(cachedQuote.expiresAt).getTime();
        const now = Date.now();
        if (now > expiryTime) {
            return {
                valid: false,
                expired: true,
                exists: true,
                message: "Quote has expired. Please search for new quotes."
            };
        }
    }

    // Quote exists and is not expired
    return {
        valid: true,
        expired: false,
        exists: true,
        message: "Quote is valid"
    };
}

/**
 * Record sender confirmation for a quote (Step 12)
 * Returns confirmation response matching backend format
 */
export function recordSenderConfirmation(quoteId: string): {
    quoteId: string;
    confirmationStatus: string;
    confirmationTimestamp: string;
    proceedToExecution: boolean;
    message: string;
} {
    const validation = validateQuoteForConfirmation(quoteId);

    if (!validation.exists) {
        return {
            quoteId,
            confirmationStatus: "REJECTED",
            confirmationTimestamp: new Date().toISOString(),
            proceedToExecution: false,
            message: validation.message
        };
    }

    if (validation.expired) {
        return {
            quoteId,
            confirmationStatus: "REJECTED",
            confirmationTimestamp: new Date().toISOString(),
            proceedToExecution: false,
            message: validation.message
        };
    }

    // Record confirmation
    confirmedQuotes.add(quoteId);

    return {
        quoteId,
        confirmationStatus: "CONFIRMED",
        confirmationTimestamp: new Date().toISOString(),
        proceedToExecution: true,
        message: "Sender confirmation recorded successfully"
    };
}

/**
 * Check if a quote has been confirmed by sender
 */
export function isQuoteConfirmed(quoteId: string): boolean {
    return confirmedQuotes.has(quoteId);
}

// ============================================================================
// MOCK DEMO DATA MANAGEMENT APIs
// ============================================================================

export interface MockDemoDataStats {
    totalPayments: number;
    paymentsByStatus: Record<string, number>;
    totalQuotes: number;
    totalEvents: number;
    oldestPayment: string | null;
    newestPayment: string | null;
}

export function getMockDemoDataStats(): MockDemoDataStats {
    const payments = mockPaymentStore.list();
    const paymentCounts: Record<string, number> = {};

    payments.forEach(p => {
        paymentCounts[p.status] = (paymentCounts[p.status] || 0) + 1;
    });

    const sortedByDate = payments.sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    return {
        totalPayments: payments.length,
        paymentsByStatus: paymentCounts,
        totalQuotes: mockQuotesCache.size + mockQuotes.length,
        totalEvents: payments.reduce((sum, p) => sum + p.events.length, 0),
        oldestPayment: sortedByDate[0]?.createdAt || null,
        newestPayment: sortedByDate[sortedByDate.length - 1]?.createdAt || null
    };
}

export interface MockPurgeResult {
    dryRun: boolean;
    deleted?: Record<string, number>;
    wouldDelete?: Record<string, number>;
    ageHours: number;
    message: string;
}

export function purgeMockDemoData(
    options: { ageHours?: number; includeQuotes?: boolean; dryRun?: boolean } = {}
): MockPurgeResult {
    const { ageHours = 24, includeQuotes = false, dryRun = false } = options;
    const cutoffTime = Date.now() - (ageHours * 60 * 60 * 1000);

    const payments = mockPaymentStore.list();
    let deletedPayments = 0;

    payments.forEach(p => {
        const paymentTime = new Date(p.createdAt).getTime();
        if (paymentTime < cutoffTime) {
            deletedPayments++;
        }
    });

    let deletedQuotes = 0;
    if (includeQuotes) {
        mockQuotesCache.forEach((quote, id) => {
            const quoteTime = new Date(quote.expiresAt).getTime();
            if (quoteTime < cutoffTime) {
                if (!dryRun) {
                    mockQuotesCache.delete(id);
                }
                deletedQuotes++;
            }
        });
    }

    const result: MockPurgeResult = {
        dryRun,
        ageHours,
        message: dryRun
            ? `Would delete ${deletedPayments} payments and ${deletedQuotes} quotes older than ${ageHours} hours`
            : `Deleted ${deletedPayments} payments and ${deletedQuotes} quotes older than ${ageHours} hours`
    };

    if (dryRun) {
        result.wouldDelete = {
            payments: deletedPayments,
            quotes: deletedQuotes,
            events: payments
                .filter(p => new Date(p.createdAt).getTime() < cutoffTime)
                .reduce((sum, p) => sum + p.events.length, 0)
        };
    } else {
        result.deleted = {
            payments: deletedPayments,
            quotes: deletedQuotes,
            events: payments
                .filter(p => new Date(p.createdAt).getTime() < cutoffTime)
                .reduce((sum, p) => sum + p.events.length, 0)
        };
    }

    return result;
}

// ============================================================================
// ISO 20022 TEMPLATES (Mock)
// ============================================================================

export const mockIsoTemplates: Record<string, { name: string; description: string; xml: string }> = {
    "pacs.008.001.13": {
        name: "FI to FI Customer Credit Transfer",
        description: "Customer credit transfer between financial institutions",
        xml: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<Document xmlns=\"urn:iso:std:iso:20022:tech:xsd:pacs.008.001.13\">\n  <FIToFICstmrCdtTrf>\n    <GrpHdr>\n      <MsgId>MSG-EXAMPLE</MsgId>\n      <CreDtTm>2026-01-01T00:00:00Z</CreDtTm>\n      <NbOfTxs>1</NbOfTxs>\n    </GrpHdr>\n  </FIToFICstmrCdtTrf>\n</Document>"
    },
    "pacs.002.001.12": {
        name: "Payment Status Report",
        description: "Status report for payment instructions",
        xml: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<Document xmlns=\"urn:iso:std:iso:20022:tech:xsd:pacs.002.001.12\">\n  <FIToFIPmtStsRpt>\n    <GrpHdr>\n      <MsgId>STATUS-EXAMPLE</MsgId>\n      <CreDtTm>2026-01-01T00:00:00Z</CreDtTm>\n    </GrpHdr>\n  </FIToFIPmtStsRpt>\n</Document>"
    },
    "camt.054.001.11": {
        name: "Bank to Customer Debit/Credit Notification",
        description: "Reconciliation report for IPS operators",
        xml: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<Document xmlns=\"urn:iso:std:iso:20022:tech:xsd:camt.054.001.11\">\n  <BkToCstmrDbtCdtNtfctn>\n    <GrpHdr>\n      <MsgId>CAMT054-EXAMPLE</MsgId>\n      <CreDtTm>2026-01-01T00:00:00Z</CreDtTm>\n    </GrpHdr>\n  </BkToCstmrDbtCdtNtfctn>\n</Document>"
    }
};

// ============================================================================
// QR CODE MOCK APIs
// ============================================================================

export interface MockQRParseResult {
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

export function mockParseQRCode(qrData: string): MockQRParseResult {
    const isValidFormat = qrData.startsWith("0002") || qrData.startsWith("SG");

    return {
        formatIndicator: "01",
        initiationType: "11",
        merchantAccountInfo: {
            scheme: qrData.includes("PAYNOW") ? "PAYNOW" : "PROMPTPAY",
            proxyType: "MBNO",
            proxyValue: qrData.includes("+65") ? "+6591234567" : "+66812345678",
            editable: true
        },
        transactionCurrency: qrData.includes("SGD") ? "702" : "764",
        transactionAmount: qrData.includes("100") ? "100.00" : null,
        merchantName: "Mock Merchant",
        merchantCity: "SINGAPORE",
        crc: "1234",
        crcValid: isValidFormat
    };
}

export function mockGenerateQRCode(params: {
    scheme: string;
    proxyType: string;
    proxyValue: string;
    amount?: number;
    merchantName?: string;
    merchantCity?: string;
    reference?: string;
    editable?: boolean;
}): { qrData: string; scheme: string } {
    const qrData = `000201010211${params.scheme === "PAYNOW" ? "2730" : "2930"}${params.proxyValue}5802${params.scheme === "PAYNOW" ? "SG" : "TH"}${params.amount ? `5408${params.amount.toFixed(2)}` : ""}5802${params.scheme === "PAYNOW" ? "702" : "764"}5910${params.merchantName || "MERCHANT"}6009${params.merchantCity || "CITY"}6304ABCD`;

    return { qrData, scheme: params.scheme };
}

export function mockValidateQRCode(qrData: string): { valid: boolean; crcValid: boolean; formatValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!qrData || qrData.length < 10) {
        errors.push("QR data too short");
    }

    if (!qrData.startsWith("00")) {
        errors.push("Invalid format indicator");
    }

    const crcValid = qrData.length > 4;
    const formatValid = errors.length === 0;

    return {
        valid: crcValid && formatValid,
        crcValid,
        formatValid,
        errors
    };
}

// ============================================================================
// UPI MOCK APIs
// ============================================================================

export interface MockUPIData {
    pa: string;
    pn?: string;
    am?: string;
    cu: string;
    tr?: string;
    tn?: string;
    mc?: string;
}

export function mockParseUPI(upiUri: string): { valid: boolean; data?: MockUPIData; error?: string } {
    if (!upiUri.startsWith("upi://")) {
        return { valid: false, error: "Invalid UPI URI format" };
    }

    try {
        const url = new URL(upiUri);
        const params = url.searchParams;

        return {
            valid: true,
            data: {
                pa: params.get("pa") || "test@upi",
                pn: params.get("pn") || "Test Payee",
                am: params.get("am") || undefined,
                cu: params.get("cu") || "INR",
                tr: params.get("tr") || undefined,
                tn: params.get("tn") || undefined,
                mc: params.get("mc") || undefined
            }
        };
    } catch {
        return { valid: false, error: "Failed to parse UPI URI" };
    }
}

export function mockUpiToEMVCo(_upiUri: string, merchantCity?: string): { emvcoData: string; scheme: string } {
    const emvcoData = mockGenerateQRCode({
        scheme: "UPI",
        proxyType: "UPIID",
        proxyValue: "test@upi",
        merchantCity: merchantCity || "MUMBAI"
    }).qrData;

    return { emvcoData, scheme: "emvco" };
}

export function mockEmvcoToUPI(_emvcoData: string): { upiUri: string; scheme: string } {
    const upiUri = `upi://pay?pa=test@upi&pn=Test%20Payee&cu=INR`;
    return { upiUri, scheme: "upi" };
}
