// API Types for Nexus Gateway

export interface CurrencyInfo {
    currencyCode: string;
    maxAmount: string;
}

export interface RequiredMessageElements {
    pacs008?: string[];
}

export interface Country {
    countryId: number;
    countryCode: string;
    name: string;
    currencies: CurrencyInfo[];
    requiredMessageElements: RequiredMessageElements;
}

export interface AddressTypeInput {
    label: {
        code: string;
        title: { [key: string]: string };
    };
    attributes: {
        name: string;
        type: string;
        pattern?: string;
        placeholder?: string;
        required: boolean;
        hidden: boolean;
    };
    iso20022Path?: string;
}

export interface AddressType {
    addressTypeId: string;
    addressTypeName: string;
    countryCode: string;
    inputs: AddressTypeInput[];
}

export interface Quote {
    quoteId: string;
    fxpId: string;
    fxpName: string;
    sourceCurrency: string;
    destinationCurrency: string;
    exchangeRate: string;
    spreadBps: number;
    baseRate?: number;           // Base FX rate before improvements
    tierImprovementBps?: number; // Tier-based rate improvement
    pspImprovementBps?: number;  // PSP-specific rate improvement
    sourceInterbankAmount: string;
    destinationInterbankAmount: string;
    creditorAccountAmount?: string;
    destinationPspFee?: string;
    cappedToMaxAmount: boolean;
    expiresAt: string;
}

export interface FeeBreakdown {
    quoteId: string;

    // Rates (both in destination per source, e.g., IDR per SGD)
    marketRate: string;
    customerRate: string;
    appliedSpreadBps: string;

    // Destination side (recipient)
    recipientNetAmount: string;    // What recipient ACTUALLY receives (NET)
    payoutGrossAmount: string;     // Amount sent to dest PSP (before their fee)
    destinationPspFee: string;     // Fee deducted by dest PSP
    destinationCurrency: string;

    // Source side (sender)
    senderPrincipal: string;       // FX principal
    sourcePspFee: string;          // Source PSP fee
    sourcePspFeeType: "INVOICED" | "DEDUCTED";
    schemeFee: string;             // Nexus scheme fee
    senderTotal: string;           // Total amount debited from sender
    sourceCurrency: string;

    // Disclosure metrics
    effectiveRate: string;         // recipient_net / sender_total
    totalCostPercent: string;      // Cost vs mid-market benchmark

    quoteValidUntil: string;
}

export interface ProxyResolutionResult {
    status: string;
    resolutionId?: string;
    accountName?: string;
    beneficiaryName?: string;
    accountNumber?: string;
    accountType?: string;
    bankName?: string;
    agentBic?: string;
    displayName?: string;
    verified: boolean;
    error?: string;
    errorMessage?: string;
    statusReasonCode?: string;  // ISO 20022 status reason code (e.g., BE23, AC04)
    timestamp?: string;
}

export interface PaymentStatus {
    transactionId: string;
    status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "REJECTED";
    reasonCode?: string;
    reasonDescription?: string;
    timestamp: string;
}

export interface LifecycleStep {
    id: number;
    phase: number;
    name: string;
    apiCall: string;
    isoMessage?: string;
    status: "pending" | "active" | "completed" | "error";
    timestamp?: string;
    details?: string;
}

export interface FXRate {
    rateId: string;
    sourceCurrency: string;
    destinationCurrency: string;
    rate: number;
    spreadBps: number;
    fxpName: string;
    validUntil: string;
    status: "ACTIVE" | "EXPIRED" | "WITHDRAWN";
}

export interface LiquidityBalance {
    fxp_id: string;
    currency: string;
    balance: number;
    reserved: number;
    available: number;
}

export interface Reservation {
    reservationId: string;
    quoteId: string;
    amount: number;
    currency: string;
    expiresAt: string;
    status: "ACTIVE" | "RELEASED" | "CONSUMED";
}

export interface IntermediaryAgentAccount {
    agentRole: string;
    bic: string;          // BIC of the SAP (e.g., FASTSGS0)
    accountNumber: string; // FXP account at SAP
    name: string;         // SAP name
    fxpId?: string;       // FXP ID (for SAP accounts)
    fxpName?: string;     // FXP Name (for SAP accounts)
}

export interface IntermediaryAgentsResponse {
    quoteId: string;
    intermediaryAgent1: IntermediaryAgentAccount;
    intermediaryAgent2: IntermediaryAgentAccount;
}

export interface PaymentEvent {
    eventId: string;
    uetr: string;
    eventType: string;
    event_type?: string; // Backend sync
    actor: string;
    data: Record<string, unknown>;
    timestamp: string;
}

export interface Payment {
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
    exchangeRate: string;
    status: string;
    createdAt: string;
    initiated_at: string; // Backend sync
}

export interface AddressTypeInputLabel {
    code: string;
    title: { [lang: string]: string }; // e.g., { "en": "Mobile Number" }
}

export interface AddressTypeInputAttributes {
    name: string; // accountOrProxyId, finInstId, addressTypeCode
    type: string; // text, tel, number, email
    pattern?: string | null; // Regex for validation (null for email)
    placeholder?: string;
    required: boolean;
    hidden?: boolean; // True for addressTypeCode hidden fields
}

export interface AddressTypeInputDetails {
    label: AddressTypeInputLabel;
    attributes: AddressTypeInputAttributes;
    iso20022Path?: string; // XPath in acmt.023
}

export interface AddressTypeWithInputs {
    addressTypeId: string;
    addressTypeName: string;
    inputs: AddressTypeInputDetails[];
    // For Select compatibility
    value?: string;
    label?: string;
}

export interface ActorRegistration {
    name: string;
    actorType: string; // FXP, IPS, PSP, SAP, PDO
    countryCode: string;
    bic: string;
    callbackUrl?: string;
    supportedCurrencies?: string[];
}

export interface Actor {
    actorId: string;
    name: string;
    actorType: string;
    countryCode: string;
    bic: string;
    callbackUrl?: string;
    registeredAt: string;
    status: string;
    supportedCurrencies?: string[];
}

export interface SenderConfirmationRequest {
    quoteId: string;
    sourceCountry: string;
    destinationCountry: string;
    sourcePspBic: string;
}

export interface SenderConfirmationResponse {
    quoteId: string;
    confirmationStatus: string;
    confirmationTimestamp: string;
    proceedToExecution: boolean;
    message: string;
}
