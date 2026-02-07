-- Nexus Global Payments Sandbox - Initial Schema
-- Reference: https://docs.nexusglobalpayments.org/

-- =============================================================================
-- EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy text search (sanctions screening)

-- =============================================================================
-- REFERENCE DATA TABLES
-- Reference: https://docs.nexusglobalpayments.org/apis/countries
-- =============================================================================

-- Countries table
-- Reference: GET /countries response structure
CREATE TABLE countries (
    country_id INT PRIMARY KEY,
    country_code CHAR(2) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE countries IS 'Nexus-enabled countries. Reference: https://docs.nexusglobalpayments.org/apis/countries';

-- Currencies table
CREATE TABLE currencies (
    currency_code CHAR(3) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    decimal_places INT NOT NULL DEFAULT 2,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE currencies IS 'ISO 4217 currency codes';

-- Country-Currency mapping with max amounts
-- Reference: https://docs.nexusglobalpayments.org/fx-provision/maximum-value-of-a-nexus-payment
CREATE TABLE country_currencies (
    country_code CHAR(2) NOT NULL REFERENCES countries(country_code),
    currency_code CHAR(3) NOT NULL REFERENCES currencies(currency_code),
    max_amount DECIMAL(18, 2) NOT NULL,
    PRIMARY KEY (country_code, currency_code)
);

COMMENT ON TABLE country_currencies IS 'Country currency mappings with transaction limits. Reference: https://docs.nexusglobalpayments.org/fx-provision/maximum-value-of-a-nexus-payment';

-- Required message elements per country
-- Reference: GET /countries response includes requiredMessageElements
CREATE TABLE country_required_elements (
    country_code CHAR(2) NOT NULL REFERENCES countries(country_code),
    message_type VARCHAR(20) NOT NULL,  -- 'pacs008', 'pacs002', etc.
    element_name VARCHAR(50) NOT NULL,  -- 'purposeCode', 'categoryPurposeCode'
    PRIMARY KEY (country_code, message_type, element_name)
);

COMMENT ON TABLE country_required_elements IS 'Required ISO 20022 elements per country. Reference: https://docs.nexusglobalpayments.org/messaging-and-translation/purpose-codes';

-- =============================================================================
-- PARTICIPANT TABLES
-- Reference: https://docs.nexusglobalpayments.org/introduction/terminology
-- =============================================================================

-- Payment Service Providers (PSPs)
-- Reference: https://docs.nexusglobalpayments.org/apis/financial-institutions
CREATE TABLE psps (
    psp_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bic VARCHAR(11) NOT NULL UNIQUE,
    name VARCHAR(140) NOT NULL,
    country_code CHAR(2) NOT NULL REFERENCES countries(country_code),
    participant_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    fee_percent DECIMAL(5, 4) DEFAULT 0,
    onboarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE psps IS 'Payment Service Providers. Reference: https://docs.nexusglobalpayments.org/payment-processing/key-points';

CREATE INDEX idx_psps_country ON psps(country_code);
CREATE INDEX idx_psps_bic ON psps(bic);

-- Instant Payment Systems (IPS)
-- Reference: https://docs.nexusglobalpayments.org/payment-processing/role-and-responsibilities-of-the-instant-payment-system-operator-ipso
CREATE TABLE ips_operators (
    ips_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    country_code CHAR(2) NOT NULL REFERENCES countries(country_code),
    clearing_system_id VARCHAR(20) NOT NULL UNIQUE,
    max_amount DECIMAL(18, 2) NOT NULL,
    currency_code CHAR(3) NOT NULL REFERENCES currencies(currency_code),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ips_operators IS 'Instant Payment System Operators. Reference: https://docs.nexusglobalpayments.org/payment-processing/role-and-responsibilities-of-the-instant-payment-system-operator-ipso';

-- Foreign Exchange Providers (FXPs)
-- Reference: https://docs.nexusglobalpayments.org/fx-provision/role-of-the-fx-provider
CREATE TABLE fxps (
    fxp_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fxp_code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(140) NOT NULL,
    participant_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    base_spread_bps INT NOT NULL DEFAULT 50,
    tier_improvements JSONB,  -- Array of {minAmount, improvementBps}
    psp_improvements JSONB,   -- Map of {pspBic: improvementBps}
    onboarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE fxps IS 'Foreign Exchange Providers. Reference: https://docs.nexusglobalpayments.org/fx-provision/role-of-the-fx-provider';

-- Settlement Access Providers (SAPs)
-- Reference: https://docs.nexusglobalpayments.org/settlement-access-provision/role-of-the-settlement-access-provider-sap
CREATE TABLE saps (
    sap_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bic VARCHAR(11) NOT NULL,
    name VARCHAR(140) NOT NULL,
    country_code CHAR(2) NOT NULL REFERENCES countries(country_code),
    currency_code CHAR(3) NOT NULL REFERENCES currencies(currency_code),
    participant_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (bic, country_code, currency_code)
);

COMMENT ON TABLE saps IS 'Settlement Access Providers. Reference: https://docs.nexusglobalpayments.org/settlement-access-provision/role-of-the-settlement-access-provider-sap';

-- FXP accounts at SAPs (for intermediary agents)
-- Reference: https://docs.nexusglobalpayments.org/payment-setup/step-13-16-set-up-and-send-the-payment-instruction
CREATE TABLE fxp_sap_accounts (
    account_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fxp_id UUID NOT NULL REFERENCES fxps(fxp_id),
    sap_id UUID NOT NULL REFERENCES saps(sap_id),
    account_number VARCHAR(34) NOT NULL,
    currency_code CHAR(3) NOT NULL REFERENCES currencies(currency_code),
    balance DECIMAL(18, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (fxp_id, sap_id, currency_code)
);

COMMENT ON TABLE fxp_sap_accounts IS 'FXP accounts at SAPs for settlement. Reference: https://docs.nexusglobalpayments.org/settlement-access-provision/payment-process-for-the-source-sap';

-- Proxy Directory Operators (PDOs)
-- Reference: https://docs.nexusglobalpayments.org/addressing-and-proxy-resolution/role-of-the-proxy-directory-operator-pdo
CREATE TABLE pdos (
    pdo_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(140) NOT NULL,
    country_code CHAR(2) NOT NULL REFERENCES countries(country_code),
    supported_proxy_types JSONB NOT NULL,  -- Array of proxy type codes
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE pdos IS 'Proxy Directory Operators. Reference: https://docs.nexusglobalpayments.org/addressing-and-proxy-resolution/role-of-the-proxy-directory-operator-pdo';

-- =============================================================================
-- ADDRESS TYPES
-- Reference: https://docs.nexusglobalpayments.org/addressing-and-proxy-resolution/address-types-and-inputs/address-types
-- =============================================================================

CREATE TABLE address_types (
    address_type_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country_code CHAR(2) NOT NULL REFERENCES countries(country_code),
    code VARCHAR(10) NOT NULL,  -- MOBI, ACCT, IBAN, etc.
    display_name VARCHAR(100) NOT NULL,
    requires_proxy_resolution BOOLEAN NOT NULL DEFAULT false,
    clearing_system_id VARCHAR(20),
    iso20022_path VARCHAR(255),  -- XPath in pacs.008 for this address type
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (country_code, code)
);

COMMENT ON TABLE address_types IS 'Payment address types per country. Reference: https://docs.nexusglobalpayments.org/addressing-and-proxy-resolution/address-types-and-inputs/address-types';

-- Address input fields
-- Reference: https://docs.nexusglobalpayments.org/apis/address-types-and-inputs
CREATE TABLE address_type_inputs (
    input_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    address_type_id UUID NOT NULL REFERENCES address_types(address_type_id),
    field_name VARCHAR(50) NOT NULL,
    display_label VARCHAR(100) NOT NULL,
    input_type VARCHAR(20) NOT NULL,  -- TEXT, TEL, SELECT, etc.
    pattern VARCHAR(255),
    max_length INT,
    required BOOLEAN NOT NULL DEFAULT true,
    options JSONB,  -- For SELECT type
    display_order INT NOT NULL DEFAULT 0
);

COMMENT ON TABLE address_type_inputs IS 'Input field definitions for address types. Reference: https://docs.nexusglobalpayments.org/apis/address-types-and-inputs';

-- =============================================================================
-- FX RATES
-- Reference: https://docs.nexusglobalpayments.org/fx-provision/rates-from-third-party-fx-providers
-- =============================================================================

CREATE TABLE fx_rates (
    rate_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fxp_id UUID NOT NULL REFERENCES fxps(fxp_id),
    source_currency CHAR(3) NOT NULL REFERENCES currencies(currency_code),
    destination_currency CHAR(3) NOT NULL REFERENCES currencies(currency_code),
    base_rate DECIMAL(18, 8) NOT NULL,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE fx_rates IS 'FX base rates from providers. Reference: https://docs.nexusglobalpayments.org/fx-provision/rates-from-third-party-fx-providers';

CREATE INDEX idx_fx_rates_lookup ON fx_rates(fxp_id, source_currency, destination_currency, status);
CREATE INDEX idx_fx_rates_validity ON fx_rates(valid_from, valid_until);

-- =============================================================================
-- QUOTES
-- Reference: https://docs.nexusglobalpayments.org/fx-provision/quotes
-- =============================================================================

CREATE TABLE quotes (
    quote_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requesting_psp_bic VARCHAR(11) NOT NULL,
    source_country CHAR(2) NOT NULL REFERENCES countries(country_code),
    destination_country CHAR(2) NOT NULL REFERENCES countries(country_code),
    source_currency CHAR(3) NOT NULL REFERENCES currencies(currency_code),
    destination_currency CHAR(3) NOT NULL REFERENCES currencies(currency_code),
    amount_type VARCHAR(11) NOT NULL,  -- SOURCE or DESTINATION
    requested_amount DECIMAL(18, 2) NOT NULL,
    
    -- Quote details
    fxp_id UUID NOT NULL REFERENCES fxps(fxp_id),
    base_rate DECIMAL(18, 8) NOT NULL,
    final_rate DECIMAL(18, 8) NOT NULL,
    tier_improvement_bps INT DEFAULT 0,
    psp_improvement_bps INT DEFAULT 0,
    
    -- Calculated amounts
    source_interbank_amount DECIMAL(18, 2) NOT NULL,
    destination_interbank_amount DECIMAL(18, 2) NOT NULL,
    creditor_account_amount DECIMAL(18, 2),
    destination_psp_fee DECIMAL(18, 2) DEFAULT 0,
    
    -- Capping (Reference: https://docs.nexusglobalpayments.org/fx-provision/maximum-value-of-a-nexus-payment)
    capped_to_max_amount BOOLEAN NOT NULL DEFAULT false,
    
    -- Validity
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);

COMMENT ON TABLE quotes IS 'FX quotes for payments. Reference: https://docs.nexusglobalpayments.org/fx-provision/quotes';

CREATE INDEX idx_quotes_psp ON quotes(requesting_psp_bic);
CREATE INDEX idx_quotes_expires ON quotes(expires_at);
CREATE INDEX idx_quotes_status ON quotes(status);

-- =============================================================================
-- PAYMENTS
-- Reference: https://docs.nexusglobalpayments.org/payment-processing/key-points
-- =============================================================================

CREATE TABLE payments (
    uetr UUID NOT NULL,  -- Unique End-to-end Transaction Reference
    -- Note: PRIMARY KEY must include partition column for partitioned tables
    quote_id UUID REFERENCES quotes(quote_id),
    
    -- Parties (Reference: https://docs.nexusglobalpayments.org/messaging-and-translation/specific-message-elements)
    source_psp_bic VARCHAR(11) NOT NULL,
    destination_psp_bic VARCHAR(11) NOT NULL,
    fxp_id UUID REFERENCES fxps(fxp_id),
    source_sap_bic VARCHAR(11),
    destination_sap_bic VARCHAR(11),
    
    -- Debtor (Sender) - FATF R16
    debtor_name VARCHAR(140) NOT NULL,
    debtor_account VARCHAR(34) NOT NULL,
    debtor_country CHAR(2),
    
    -- Creditor (Recipient) - FATF R16
    creditor_name VARCHAR(140) NOT NULL,
    creditor_account VARCHAR(34) NOT NULL,
    creditor_country CHAR(2),
    
    -- Amounts
    source_currency CHAR(3) NOT NULL REFERENCES currencies(currency_code),
    destination_currency CHAR(3) NOT NULL REFERENCES currencies(currency_code),
    interbank_settlement_amount DECIMAL(18, 2) NOT NULL,
    creditor_amount DECIMAL(18, 2),
    exchange_rate DECIMAL(18, 8),
    
    -- Priority (Reference: https://docs.nexusglobalpayments.org/fx-provision/high-priority-vs-normal-priority-payments)
    instruction_priority VARCHAR(4) NOT NULL DEFAULT 'NORM',  -- NORM or HIGH
    
    -- Purpose
    purpose_code VARCHAR(4),
    category_purpose_code VARCHAR(4),
    remittance_info TEXT,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'INITIATED',
    status_reason VARCHAR(50),
    
    -- Timestamps
    initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    forwarded_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Metadata
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Primary key must include partition column
    PRIMARY KEY (uetr, initiated_at)
) PARTITION BY RANGE (initiated_at);

COMMENT ON TABLE payments IS 'Payment records with UETR as primary key. Reference: https://docs.nexusglobalpayments.org/payment-processing/key-points';

-- Monthly partitions (2026)
CREATE TABLE payments_2026_02 PARTITION OF payments
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE payments_2026_03 PARTITION OF payments
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE payments_2026_04 PARTITION OF payments
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE payments_2026_05 PARTITION OF payments
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE payments_2026_06 PARTITION OF payments
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE payments_2026_q3 PARTITION OF payments
    FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
CREATE TABLE payments_2026_q4 PARTITION OF payments
    FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');
-- Safety: catch-all for dates outside defined ranges
CREATE TABLE payments_default PARTITION OF payments DEFAULT;

-- Indexes
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_source_psp ON payments(source_psp_bic);
CREATE INDEX idx_payments_dest_psp ON payments(destination_psp_bic);
CREATE INDEX idx_payments_initiated ON payments(initiated_at);

-- =============================================================================
-- EVENT STORE
-- Reference: ADR-004 Event Sourcing Strategy
-- =============================================================================

CREATE TABLE payment_events (
    event_id UUID NOT NULL DEFAULT uuid_generate_v4(),
    event_type VARCHAR(50) NOT NULL,
    uetr UUID NOT NULL,
    version INT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor VARCHAR(20) NOT NULL,  -- BIC or 'NEXUS'
    correlation_id UUID,
    data JSONB NOT NULL,
    
    -- Primary key must include partition column for partitioned tables
    PRIMARY KEY (event_id, occurred_at),
    -- Ensure ordering within aggregate (must include partition column)
    CONSTRAINT unique_aggregate_version UNIQUE (uetr, version, occurred_at)
) PARTITION BY RANGE (occurred_at);

COMMENT ON TABLE payment_events IS 'Event store for payment lifecycle events';

-- Monthly partitions (2026)
CREATE TABLE payment_events_2026_02 PARTITION OF payment_events
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE payment_events_2026_03 PARTITION OF payment_events
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE payment_events_2026_04 PARTITION OF payment_events
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE payment_events_2026_05 PARTITION OF payment_events
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE payment_events_2026_06 PARTITION OF payment_events
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE payment_events_2026_q3 PARTITION OF payment_events
    FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
CREATE TABLE payment_events_2026_q4 PARTITION OF payment_events
    FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');
-- Safety: catch-all for dates outside defined ranges
CREATE TABLE payment_events_default PARTITION OF payment_events DEFAULT;

-- Indexes
CREATE INDEX idx_events_uetr ON payment_events(uetr);
CREATE INDEX idx_events_type ON payment_events(event_type);
CREATE INDEX idx_events_occurred ON payment_events(occurred_at);
CREATE INDEX idx_events_actor ON payment_events(actor);

-- Snapshots for aggregate loading optimization
CREATE TABLE payment_snapshots (
    uetr UUID PRIMARY KEY,
    version INT NOT NULL,
    state JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- ISO 20022 MESSAGE STORAGE
-- Reference: https://docs.nexusglobalpayments.org/messaging-and-translation/key-points
-- =============================================================================

CREATE TABLE iso20022_messages (
    message_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_type VARCHAR(20) NOT NULL,  -- pacs.008, pacs.002, acmt.023, etc.
    uetr UUID,
    direction VARCHAR(10) NOT NULL,  -- INBOUND, OUTBOUND
    raw_xml TEXT NOT NULL,
    parsed_data JSONB NOT NULL,
    sender_bic VARCHAR(11),
    receiver_bic VARCHAR(11),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
    error_details JSONB
);

COMMENT ON TABLE iso20022_messages IS 'Raw ISO 20022 message storage. Reference: https://docs.nexusglobalpayments.org/messaging-and-translation/message-guidelines-excel';

CREATE INDEX idx_messages_uetr ON iso20022_messages(uetr);
CREATE INDEX idx_messages_type ON iso20022_messages(message_type);
CREATE INDEX idx_messages_received ON iso20022_messages(received_at);

-- =============================================================================
-- PROXY REGISTRATIONS (for PDO simulator)
-- Reference: https://docs.nexusglobalpayments.org/addressing-and-proxy-resolution/addressing-via-proxies-aliases
-- =============================================================================

CREATE TABLE proxy_registrations (
    registration_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country_code CHAR(2) NOT NULL REFERENCES countries(country_code),
    proxy_type VARCHAR(10) NOT NULL,  -- MOBI, NRIC, UEN, etc.
    proxy_value VARCHAR(100) NOT NULL,
    
    -- Account details returned on resolution
    creditor_name VARCHAR(140) NOT NULL,
    creditor_name_masked VARCHAR(140),  -- Masked version for display
    account_number VARCHAR(34) NOT NULL,
    bank_bic VARCHAR(11) NOT NULL,
    bank_name VARCHAR(140),
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE (country_code, proxy_type, proxy_value)
);

COMMENT ON TABLE proxy_registrations IS 'Proxy to account mappings for PDO. Reference: https://docs.nexusglobalpayments.org/addressing-and-proxy-resolution/proxy-and-account-resolution-process';

CREATE INDEX idx_proxy_lookup ON proxy_registrations(country_code, proxy_type, proxy_value);

-- =============================================================================
-- API CLIENTS (OAuth)
-- Reference: ADR-006 Security Model
-- =============================================================================

CREATE TABLE api_clients (
    client_id VARCHAR(50) PRIMARY KEY,
    client_secret_hash VARCHAR(255) NOT NULL,
    participant_type VARCHAR(20) NOT NULL,  -- PSP, FXP, SAP, IPSO
    participant_id UUID NOT NULL,
    allowed_scopes TEXT[] NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE api_clients IS 'OAuth 2.0 client credentials';

-- =============================================================================
-- AUDIT LOG
-- =============================================================================

CREATE TABLE audit_log (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type VARCHAR(50) NOT NULL,
    actor VARCHAR(50),
    resource VARCHAR(100),
    action VARCHAR(20),
    outcome VARCHAR(20),
    details JSONB,
    source_ip INET,
    trace_id UUID
);

CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_actor ON audit_log(actor);
CREATE INDEX idx_audit_event_type ON audit_log(event_type);
