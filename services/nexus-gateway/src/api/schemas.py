"""
Centralized Pydantic Schemas for Nexus Gateway API

This module provides a single source of truth for all API request and response 
models, ensuring consistency across discovery, transactional, and ISO 20022 endpoints.

Reference: ADR-005 - API Design Principles
"""

from pydantic import BaseModel, Field
from typing import Optional, Any
from uuid import UUID
from enum import Enum


# =============================================================================
# 1. Base & Common Models
# =============================================================================

class ErrorDetail(BaseModel):
    """Detailed error information as specified in ADR-005."""
    code: str           # Machine-readable error code
    message: str        # Human-readable message
    field: Optional[str] = None  # Field that caused the error
    reference: Optional[str] = None  # Link to documentation

class ErrorResponse(BaseModel):
    """Standard error response structure for all endpoints."""
    error: ErrorDetail
    trace_id: str = Field(alias="traceId")

    class Config:
        populate_by_name = True


# =============================================================================
# 2. Discovery APIs (Countries, Currencies, Institutions)
# =============================================================================

class CurrencyInfo(BaseModel):
    """Currency information for a country."""
    currency_code: str = Field(alias="currencyCode")
    max_amount: str = Field(alias="maxAmount")
    
    class Config:
        populate_by_name = True

class RequiredMessageElements(BaseModel):
    """Required ISO 20022 message elements per country."""
    pacs008: Optional[list[str]] = None

class CountryInfo(BaseModel):
    """Country information matching official schema."""
    country_id: int = Field(alias="countryId")
    country_code: str = Field(alias="countryCode")
    name: str
    currencies: list[CurrencyInfo]
    required_message_elements: RequiredMessageElements = Field(
        alias="requiredMessageElements"
    )
    
    class Config:
        populate_by_name = True

class CountriesResponse(BaseModel):
    """Response from GET /countries."""
    countries: list[CountryInfo]

class PspInfo(BaseModel):
    """PSP information for a country."""
    psp_id: str = Field(alias="pspId")
    bic: str
    name: str
    fee_percent: float = Field(alias="feePercent")
    
    class Config:
        populate_by_name = True

class FinancialInstitutionsResponse(BaseModel):
    """Response from GET /countries/{code}/psps."""
    psps: list[PspInfo]


# =============================================================================
# 3. Addressing APIs (Address Types & Inputs)
# =============================================================================

class AddressTypeInfo(BaseModel):
    """Address type summary information."""
    code: str
    display_name: str = Field(alias="displayName")
    requires_proxy_resolution: bool = Field(alias="requiresProxyResolution")
    
    class Config:
        populate_by_name = True

class AddressTypesResponse(BaseModel):
    """Response from GET /countries/{code}/address-types."""
    address_types: list[AddressTypeInfo] = Field(alias="addressTypes")
    
    class Config:
        populate_by_name = True

class InputLabel(BaseModel):
    """Address type label with code and localized title."""
    code: str
    title: dict[str, str]

class InputAttributes(BaseModel):
    """Input field attributes for form rendering."""
    name: str
    type: str
    pattern: Optional[str] = None
    placeholder: Optional[str] = None
    required: bool = True
    hidden: bool = False

class AddressTypeInput(BaseModel):
    """Complete input definition per Nexus spec."""
    label: InputLabel
    attributes: InputAttributes
    iso20022Path: Optional[str] = None

class AddressTypeInputsResponse(BaseModel):
    """Response for GET /address-types/{id}/inputs."""
    addressTypeId: str
    addressTypeName: str
    countryCode: str
    inputs: list[AddressTypeInput]

class CountryAddressTypesResponse(BaseModel):
    """Response for GET /countries/{cc}/address-types-and-inputs."""
    countryCode: str
    addressTypes: list[AddressTypeInputsResponse]


# =============================================================================
# 4. Quotes & Transactional APIs
# =============================================================================

class QuoteInfo(BaseModel):
    """Individual FX quote from an FXP."""
    quote_id: str = Field(alias="quoteId")
    fxp_id: str = Field(alias="fxpId")
    fxp_name: str = Field(alias="fxpName")
    exchange_rate: str = Field(alias="exchangeRate")
    source_interbank_amount: str = Field(alias="sourceInterbankAmount")
    destination_interbank_amount: str = Field(alias="destinationInterbankAmount")
    creditor_account_amount: Optional[str] = Field(alias="creditorAccountAmount", default=None)
    destination_psp_fee: Optional[str] = Field(alias="destinationPspFee", default=None)
    capped_to_max_amount: bool = Field(alias="cappedToMaxAmount")
    expires_at: str = Field(alias="expiresAt")
    
    class Config:
        populate_by_name = True

class QuotesResponse(BaseModel):
    """Response from GET /quotes."""
    quotes: list[QuoteInfo]

class IntermediaryAgentInfo(BaseModel):
    """SAP account details for payment routing."""
    agent_role: str = Field(alias="agentRole")
    bic: str
    account_number: str = Field(alias="accountNumber")
    name: str
    
    class Config:
        populate_by_name = True

class IntermediaryAgentAccount(BaseModel):
    """Detailed SAP account for intermediary agent."""
    agentRole: str
    sapId: str
    sapName: str
    sapBicfi: str
    accountId: str
    accountType: str
    currency: str

class IntermediaryAgentsResponse(BaseModel):
    """Response from GET /quotes/{quoteId}/intermediary-agents."""
    quoteId: str
    fxpId: Optional[str] = None
    fxpName: Optional[str] = None
    intermediaryAgent1: IntermediaryAgentAccount
    intermediaryAgent2: IntermediaryAgentAccount


# =============================================================================
# 5. Fees & Amounts APIs
# =============================================================================

class FeeBreakdown(BaseModel):
    """Detailed fee breakdown for a payment."""
    source_psp_fee: Optional[str] = Field(alias="sourcePspFee", default=None)
    destination_psp_fee: Optional[str] = Field(alias="destinationPspFee", default=None)
    fx_spread: Optional[str] = Field(alias="fxSpread", default=None)
    total_fees: str = Field(alias="totalFees")
    
    class Config:
        populate_by_name = True

class AmountCalculation(BaseModel):
    """Amount calculation including fees."""
    sender_amount: str = Field(alias="senderAmount")
    interbank_settlement_amount: str = Field(alias="interbankSettlementAmount")
    creditor_amount: str = Field(alias="creditorAmount")
    fees: FeeBreakdown
    
    class Config:
        populate_by_name = True

class FeesAndAmountsResponse(BaseModel):
    """Response from GET /fees-and-amounts."""
    source_currency: str = Field(alias="sourceCurrency")
    destination_currency: str = Field(alias="destinationCurrency")
    exchange_rate: str = Field(alias="exchangeRate")
    calculation: AmountCalculation
    
    class Config:
        populate_by_name = True

class PreTransactionDisclosure(BaseModel):
    """Pre-Transaction Disclosure response per ADR-012."""
    quote_id: str = Field(alias="quoteId")
    market_rate: str = Field(alias="marketRate")
    customer_rate: str = Field(alias="customerRate")
    applied_spread_bps: str = Field(alias="appliedSpreadBps")
    recipient_net_amount: str = Field(alias="recipientNetAmount")
    payout_gross_amount: str = Field(alias="payoutGrossAmount")
    destination_psp_fee: str = Field(alias="destinationPspFee")
    destination_currency: str = Field(alias="destinationCurrency")
    sender_principal: str = Field(alias="senderPrincipal")
    source_psp_fee: str = Field(alias="sourcePspFee")
    source_psp_fee_type: str = Field(alias="sourcePspFeeType", default="DEDUCTED")
    scheme_fee: str = Field(alias="schemeFee")
    sender_total: str = Field(alias="senderTotal")
    source_currency: str = Field(alias="sourceCurrency")
    effective_rate: str = Field(alias="effectiveRate")
    total_cost_percent: str = Field(alias="totalCostPercent")
    quote_valid_until: str = Field(alias="quoteValidUntil")
    
    class Config:
        populate_by_name = True

# Alias for backward compatibility (fees.py imports this name)
PreTransactionDisclosureResponse = PreTransactionDisclosure

class FeeFormulaResponse(BaseModel):
    """Fee formula definition."""
    feeType: str
    countryCode: str
    currencyCode: str
    fixedAmount: str
    percentageRate: str
    minimumFee: str
    maximumFee: str
    description: str

class CreditorAgentFeeResponse(BaseModel):
    """Response from GET /creditor-agent-fee."""
    fee_percent: float = Field(alias="feePercent")
    currency: str
    
    class Config:
        populate_by_name = True


# =============================================================================
# 6. ISO 20022 Modular Schemas
# =============================================================================

class PaymentValidationResult(BaseModel):
    """Result of internal pacs.008 validation."""
    valid: bool
    uetr: str
    quoteId: Optional[str] = None
    errors: list[str] = []
    statusCode: str = "ACCC"
    statusReasonCode: Optional[str] = None
    quote_data: Optional[dict] = None

class Pacs008Response(BaseModel):
    """Response after pacs.008 submission."""
    uetr: str
    status: str
    statusReasonCode: Optional[str] = None
    message: str
    callbackEndpoint: str
    processedAt: str

class Acmt023Response(BaseModel):
    """Response after acmt.023 proxy resolution request."""
    requestId: str
    status: str
    callbackEndpoint: str
    processedAt: str

class Acmt024Response(BaseModel):
    """Response after acmt.024 resolution report."""
    requestId: str
    status: str
    debtorNameMasked: Optional[str] = None
    processedAt: str

class Pacs028Response(BaseModel):
    """Response after pacs.028 status request."""
    requestId: str
    originalUetr: str
    currentStatus: str
    processedAt: str

class Pain001Response(BaseModel):
    """Response after pain.001 credit initiation."""
    requestId: str
    status: str
    message: str
    processedAt: str

class Camt103Response(BaseModel):
    """Response after camt.103 processing."""
    reservationId: str
    status: str
    message: str
    processedAt: str

class Pacs004Response(BaseModel):
    """Response after pacs.004 processing."""
    returnId: str
    originalUetr: str
    status: str
    message: str
    processedAt: str

class Camt029Response(BaseModel):
    """Response after camt.029 processing."""
    resolutionId: str
    recallId: str
    status: str
    resolution: str
    message: str
    processedAt: str

class Iso20022Template(BaseModel):
    """Sample ISO 20022 message template."""
    messageType: str
    name: str
    description: str
    sample_xml: str

class ValidationResponse(BaseModel):
    """Response from XSD schema validation endpoint."""
    valid: bool
    messageType: Optional[str] = None
    errors: list[str] = []
    warnings: list[str] = []


# =============================================================================
# 7. Sandbox Extensions
# =============================================================================

class DemoPaymentRequest(BaseModel):
    """Request to initiate a demo payment (sandbox only)."""
    sourceCountry: str
    destCountry: str
    amount: float
    amountType: str = "SOURCE"
    quoteId: Optional[str] = None
    scenarioCode: Optional[str] = None


# =============================================================================
# 8. Participant & Actor APIs
# =============================================================================

class ActorRegistration(BaseModel):
    """Request body for actor registration."""
    name: str = Field(..., description="Entity name")
    type: str = Field(..., description="Entity type (SOURCE_PSP, DESTINATION_PSP, FXP, SAP, IPS)")
    country_code: str = Field(..., description="ISO 3166-1 alpha-2 country code")
    bic: Optional[str] = Field(None, description="SWIFT/BIC for financial institutions")


class Actor(BaseModel):
    """Standardized representation of a Nexus actor."""
    id: UUID
    name: str
    type: str
    country_code: str
    bic: Optional[str] = None
    status: str = "ACTIVE"


class ActorsListResponse(BaseModel):
    """Response containing a list of actors."""
    actors: list[Actor]
    total: int


class PDOResponse(BaseModel):
    """PDO details."""
    pdo_id: Optional[UUID] = None
    name: str = Field(..., description="PDO operator name")
    country_code: str = Field(..., description="Country where PDO operates")
    supported_proxy_types: list[str] = Field(..., description="List of supported proxy types")


class PDOListResponse(BaseModel):
    """List of PDOs."""
    pdos: list[PDOResponse]
    total: int


class ProxyRegistrationResponse(BaseModel):
    """Proxy registration details."""
    proxy_type: str
    proxy_value: str
    creditor_name_masked: str
    bank_bic: str
    bank_name: str


class PDORegistrationsResponse(BaseModel):
    """List of proxy registrations for a PDO."""
    pdo_name: str
    country_code: str
    registrations: list[ProxyRegistrationResponse]
    total: int


class PDOStatsResponse(BaseModel):
    """Statistics for a PDO."""
    pdo_name: str
    total_registrations: int
    registrations_by_type: dict[str, int]
    resolution_success_rate: float = 0.95


class IPSOperatorResponse(BaseModel):
    """IPS Operator details."""
    ips_id: Optional[UUID] = None
    name: str = Field(..., description="IPS operator name")
    country_code: str = Field(..., description="Country where IPS operates")
    clearing_system_id: str = Field(..., description="ISO 20022 clearing system ID")
    max_amount: float = Field(..., description="Maximum transaction amount in local currency")
    currency_code: str = Field(..., description="Local currency code")


class IPSListResponse(BaseModel):
    """List of IPS operators."""
    operators: list[IPSOperatorResponse]
    total: int


class IPSMemberResponse(BaseModel):
    """PSP connected to an IPS."""
    bic: str
    name: str
    is_active: bool = True


class IPSMembersResponse(BaseModel):
    """List of PSPs connected to an IPS."""
    clearing_system_id: str
    members: list[IPSMemberResponse]
    total: int


class PSPResponse(BaseModel):
    """PSP details response."""
    bic: str = Field(..., description="Bank Identifier Code (SWIFT/BIC)")
    name: str = Field(..., description="Institution name")
    country_code: str = Field(..., description="ISO 3166-1 alpha-2 country code")
    fee_percent: float = Field(..., description="Fee percentage for transactions")
    psp_id: Optional[UUID] = None


class PSPListResponse(BaseModel):
    """List of PSPs response."""
    psps: list[PSPResponse]
    total: int


class PSPPaymentSummary(BaseModel):
    """Summary of payments for a PSP."""
    total_sent: int = 0
    total_received: int = 0
    total_amount_sent: float = 0.0
    total_amount_received: float = 0.0
    currency: str = "SGD"


# =============================================================================
# 9. Addressing & Proxy Resolution
# =============================================================================

class ProxyResolutionRequest(BaseModel):
    """Request to resolve a proxy to account details."""
    proxyType: str
    proxyValue: str
    sourceCountry: str
    destinationCountry: str


class ProxyResolutionResponse(BaseModel):
    """Response containing resolved account details."""
    creditorName: str
    creditorAccount: str
    creditorAgentBic: str
    creditorAgentName: str


# =============================================================================
# 10. QR Codes (EMVCo & UPI)
# =============================================================================

class QRParseRequest(BaseModel):
    """Request to parse an EMVCo QR code string."""
    qr_data: str = Field(..., alias="qrData")


class MerchantAccountInfo(BaseModel):
    """Merchant account information parsed from QR."""
    globally_unique_identifier: str = Field(..., alias="globallyUniqueIdentifier")
    payment_network_specific: dict[str, str] = Field(..., alias="paymentNetworkSpecific")


class QRParseResponse(BaseModel):
    """Parsed QR data response."""
    payload_format_indicator: str = Field(..., alias="payloadFormatIndicator")
    point_of_initiation_method: str = Field(..., alias="pointOfInitiationMethod")
    merchant_account_information: dict[str, MerchantAccountInfo] = Field(..., alias="merchantAccountInformation")
    merchant_category_code: str = Field(..., alias="merchantCategoryCode")
    transaction_currency: str = Field(..., alias="transactionCurrency")
    transaction_amount: Optional[str] = Field(None, alias="transactionAmount")
    country_code: str = Field(..., alias="countryCode")
    merchant_name: str = Field(..., alias="merchantName")
    merchant_city: str = Field(..., alias="merchantCity")


class QRGenerateRequest(BaseModel):
    """Request to generate an EMVCo QR code."""
    merchant_name: str = Field(..., alias="merchantName")
    merchant_city: str = Field(..., alias="merchantCity")
    country_code: str = Field(..., alias="countryCode")
    transaction_amount: float = Field(..., alias="transactionAmount")
    transaction_currency: str = Field(..., alias="transactionCurrency")
    proxy_type: str = Field(..., alias="proxyType")
    proxy_value: str = Field(..., alias="proxyValue")


class QRGenerateResponse(BaseModel):
    """Generated QR data response."""
    qr_data: str = Field(..., alias="qrData")


class QRValidateRequest(BaseModel):
    """Request to validate an EMVCo QR code."""
    qr_data: str = Field(..., alias="qrData")


class QRValidateResponse(BaseModel):
    """QR validation results."""
    is_valid: bool = Field(..., alias="isValid")
    checksum_valid: bool = Field(..., alias="checksumValid")
    errors: list[str] = []


class UPIQRData(BaseModel):
    """UPI specific QR data."""
    payee_vpa: str = Field(..., alias="payeeVpa")
    payee_name: str = Field(..., alias="payeeName")
    transaction_reference: Optional[str] = Field(None, alias="transactionReference")
    transaction_note: Optional[str] = Field(None, alias="transactionNote")
    amount: Optional[float] = None
    currency: str = "INR"


class UPIParseRequest(BaseModel):
    """Request to parse a UPI deep link or QR."""
    upi_string: str = Field(..., alias="upiString")


class UPIParseResponse(BaseModel):
    """Parsed UPI data."""
    success: bool
    data: Optional[UPIQRData] = None
    error: Optional[str] = None


class UPIToEMVCoRequest(BaseModel):
    """Request to convert UPI to EMVCo QR."""
    upi_data: UPIQRData = Field(..., alias="upiData")


class UPIToEMVCoResponse(BaseModel):
    """Response with EMVCo QR data."""
    emvco_data: str = Field(..., alias="emvcoData")


class EMVCoToUPIRequest(BaseModel):
    """Request to convert EMVCo to UPI."""
    emvco_data: str = Field(..., alias="emvcoData")


class EMVCoToUPIResponse(BaseModel):
    """Response with UPI data."""
    upi_data: UPIQRData = Field(..., alias="upiData")


# =============================================================================
# 11. Returns, Recalls & Status
# =============================================================================

class Pacs004Request(BaseModel):
    """Request for payment return (pacs.004)."""
    original_uetr: str = Field(..., alias="originalUetr")
    reason_code: str = Field(..., alias="reasonCode")
    additional_info: Optional[str] = Field(None, alias="additionalInfo")


class Pacs004Response(BaseModel):
    """Response for pacs.004 submission."""
    uetr: str
    status: str
    processedAt: str


class Camt056Request(BaseModel):
    """Request for payment cancellation/recall (camt.056)."""
    original_uetr: str = Field(..., alias="originalUetr")
    reason_code: str = Field(..., alias="reasonCode")


class Camt056Response(BaseModel):
    """Response for camt.056 submission."""
    recall_id: str = Field(..., alias="recallId")
    status: str
    processedAt: str


class RecallListResponse(BaseModel):
    """List of active recalls."""
    recalls: list[dict]
    total: int


class Camt029Request(BaseModel):
    """Response to a recall request (camt.029)."""
    recall_id: str = Field(..., alias="recallId")
    resolution: str = Field(..., description="ACCEPTED or REJECTED")
    reason_code: Optional[str] = Field(None, alias="reasonCode")


class Camt029Response(BaseModel):
    """Response for camt.029 submission."""
    status: str
    processedAt: str


class Pacs028Request(BaseModel):
    """Request for payment status (pacs.028)."""
    original_uetr: str = Field(..., alias="originalUetr")


class TransactionStatus(str, Enum):
    """ISO 20022 transaction status codes for pacs.002."""
    ACCC = "ACCC"  # Settlement Completed
    RJCT = "RJCT"  # Rejected
    BLCK = "BLCK"  # Blocked
    ACWP = "ACWP"  # Accepted Without Posting
    ACTC = "ACTC"  # Technical Validation
    ACSP = "ACSP"  # Settlement in Process

class StatusReasonCode(str, Enum):
    """ISO 20022 status reason codes."""
    AB03 = "AB03"  # Account blocked
    AB04 = "AB04"  # Account closed
    TM01 = "TM01"  # Timeout
    AC04 = "AC04"  # Account closed
    AC06 = "AC06"  # Account blocked
    AM04 = "AM04"  # Insufficient funds
    AM02 = "AM02"  # Amount not allowed
    RR04 = "RR04"  # Regulatory reason
    FR01 = "FR01"  # Fraud suspected
    RC11 = "RC11"  # Invalid creditor
    AGNT = "AGNT"  # Agent incorrect
    BE23 = "BE23"  # Beneficiary error
    DUPL = "DUPL"  # Duplicate reference

class StatusReasonDetail(BaseModel):
    """Status reason details per ISO 20022."""
    code: str
    description: str

class Pacs002Request(BaseModel):
    """External request for payment status report (pacs.002)."""
    uetr: str
    transactionStatus: TransactionStatus
    statusReasonCode: Optional[StatusReasonCode] = None
    statusReasonText: Optional[str] = None

class Pacs002Response(BaseModel):
    """Response for pacs.002 processed status."""
    uetr: str
    status: str
    processedAt: str
    originalPaymentStatus: Optional[str] = None
    message: Optional[str] = None

class PaymentStatusResponse(BaseModel):
    """Unified payment status response."""
    uetr: str
    status: TransactionStatus
    statusReasonCode: Optional[StatusReasonCode] = None
    statusReasonText: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    sourceAmount: Optional[str] = None
    destinationAmount: Optional[str] = None


# =============================================================================
# 12. Liquidity & FX Management
# =============================================================================

class FxpBalance(BaseModel):
    """FXP balance in a specific currency."""
    fxp_id: UUID
    currency: str
    balance: float
    reserved: float
    available: float


class LiquidityReservation(BaseModel):
    """ Liquidity reservation for a pending payment."""
    reservation_id: UUID
    uetr: str
    amount: float
    currency: str
    expires_at: str


class PaymentNotification(BaseModel):
    """Notification for interbank settlement."""
    uetr: str
    amount: float
    currency: str
    source_agent: str
    destination_agent: str


class InterbankSettlementCalc(BaseModel):
    """Calculation for interbank settlement."""
    uetr: str
    source_amount: float
    source_currency: str
    destination_amount: float
    destination_currency: str
    exchange_rate: float


# =============================================================================
# 13. Operational & Reference Data
# =============================================================================

class TransactionEntry(BaseModel):
    """Single entry in reconciliation report."""
    uetr: str
    amount: float
    currency: str
    direction: str = "CREDIT"
    processed_at: str


class TransactionSummary(BaseModel):
    """Summary of transactions for a period."""
    total_count: int
    total_amount: float
    currency: str


class Camt054Response(BaseModel):
    """Bank to customer notification (camt.054)."""
    notification_id: str
    account_number: str
    entries: list[TransactionEntry]
    summary: TransactionSummary


class TierDefinition(BaseModel):
    """FXP tier definition."""
    tier_id: int
    name: str
    min_volume: float
    max_volume: float
    spread_reduction_bps: int


class RelationshipDefinition(BaseModel):
    """FXP-PSP relationship details."""
    fxp_id: UUID
    psp_id: UUID
    tier_id: int
    status: str = "ACTIVE"


class TierListResponse(BaseModel):
    """List of all tier definitions."""
    tiers: list[TierDefinition]


class RelationshipListResponse(BaseModel):
    """List of all FXP relationships."""
    relationships: list[RelationshipDefinition]


class CurrencyResponse(BaseModel):
    """Detailed currency information."""
    code: str
    name: str
    fractional_digits: int = 2
    is_active: bool = True


class CurrenciesListResponse(BaseModel):
    """List of all supported currencies."""
    currencies: list[CurrencyResponse]


class RateSubmission(BaseModel):
    """FX rate submission from FXP."""
    source_currency: str
    destination_currency: str
    rate: float
    valid_from: str
    valid_until: str


class RateResponse(BaseModel):
    """FX rate details."""
    rate_id: UUID
    source_currency: str
    destination_currency: str
    rate: float
    provider_name: str
