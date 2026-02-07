-- Migration: FXP and SAP API Tables
-- Description: Add tables for FXP rate management and SAP liquidity operations
-- Date: 2026-02-07
-- Migration: 004 (Renamed from 003_fxp_sap_tables.sql to fix ordering conflict)

-- =============================================================================
-- FXP Rate Management
-- =============================================================================

-- FXP Rates table (for rate submission/withdrawal tracking)
CREATE TABLE IF NOT EXISTS fxp_rates (
    rate_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fxp_id UUID NOT NULL REFERENCES fxps(fxp_id),
    source_currency CHAR(3) NOT NULL REFERENCES currencies(currency_code),
    destination_currency CHAR(3) NOT NULL REFERENCES currencies(currency_code),
    base_rate DECIMAL(18, 8) NOT NULL,
    spread_bps INT NOT NULL DEFAULT 50,
    effective_rate DECIMAL(18, 8) NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, WITHDRAWN, EXPIRED
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    withdrawn_at TIMESTAMPTZ
);

CREATE INDEX idx_fxp_rates_fxp ON fxp_rates(fxp_id);
CREATE INDEX idx_fxp_rates_corridor ON fxp_rates(source_currency, destination_currency);
CREATE INDEX idx_fxp_rates_status ON fxp_rates(status) WHERE status = 'ACTIVE';
CREATE INDEX idx_fxp_rates_valid ON fxp_rates(valid_until) WHERE status = 'ACTIVE';

-- FXP-PSP Relationships table (for tier-based rate improvements)
CREATE TABLE IF NOT EXISTS fxp_psp_relationships (
    relationship_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fxp_id UUID NOT NULL REFERENCES fxps(fxp_id),
    psp_id UUID NOT NULL REFERENCES psps(psp_id),
    tier VARCHAR(20) NOT NULL DEFAULT 'STANDARD',  -- STANDARD, VOLUME, PREMIUM
    improvement_bps INT NOT NULL DEFAULT 0,  -- Rate improvement in basis points
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(fxp_id, psp_id)
);

CREATE INDEX idx_fxp_psp_fxp ON fxp_psp_relationships(fxp_id);
CREATE INDEX idx_fxp_psp_psp ON fxp_psp_relationships(psp_id);

-- =============================================================================
-- SAP Liquidity Management
-- =============================================================================

-- SAP Reservations table (for liquidity reservations)
CREATE TABLE IF NOT EXISTS sap_reservations (
    reservation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES fxp_sap_accounts(account_id),
    amount DECIMAL(18, 2) NOT NULL,
    uetr UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, UTILIZED, EXPIRED, CANCELLED
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    utilized_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ
);

CREATE INDEX idx_sap_reservations_account ON sap_reservations(account_id);
CREATE INDEX idx_sap_reservations_status ON sap_reservations(status) WHERE status = 'ACTIVE';
CREATE INDEX idx_sap_reservations_expires ON sap_reservations(expires_at) WHERE status = 'ACTIVE';
CREATE INDEX idx_sap_reservations_uetr ON sap_reservations(uetr);

-- SAP Transactions table (for settlement transaction logging)
CREATE TABLE IF NOT EXISTS sap_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES fxp_sap_accounts(account_id),
    amount DECIMAL(18, 2) NOT NULL,
    type VARCHAR(10) NOT NULL,  -- DEBIT, CREDIT
    reference VARCHAR(140) NOT NULL,
    uetr UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING, COMPLETED, FAILED
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_sap_transactions_account ON sap_transactions(account_id);
CREATE INDEX idx_sap_transactions_uetr ON sap_transactions(uetr);
CREATE INDEX idx_sap_transactions_created ON sap_transactions(created_at);

-- =============================================================================
-- Trade Notifications Log
-- =============================================================================

-- Trade notifications sent to FXPs when their rates are selected
CREATE TABLE IF NOT EXISTS trade_notifications (
    notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fxp_id UUID NOT NULL REFERENCES fxps(fxp_id),
    quote_id UUID NOT NULL REFERENCES quotes(quote_id),
    uetr UUID NOT NULL,
    source_currency CHAR(3) NOT NULL,
    destination_currency CHAR(3) NOT NULL,
    amount DECIMAL(18, 2) NOT NULL,
    rate DECIMAL(18, 8) NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivery_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING, DELIVERED, FAILED
    retry_count INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_trade_notifications_fxp ON trade_notifications(fxp_id);
CREATE INDEX idx_trade_notifications_quote ON trade_notifications(quote_id);
CREATE INDEX idx_trade_notifications_status ON trade_notifications(delivery_status) WHERE delivery_status != 'DELIVERED';

-- =============================================================================
-- Actor Registry (migrated from in-memory to PostgreSQL)
-- =============================================================================

-- Actors table with per-actor callback secrets
CREATE TABLE IF NOT EXISTS actors (
    actor_id VARCHAR(32) PRIMARY KEY,
    bic VARCHAR(11) UNIQUE NOT NULL,
    actor_type VARCHAR(4) NOT NULL CHECK (actor_type IN ('FXP', 'IPSO', 'PSP', 'SAP', 'PDO')),
    name VARCHAR(255) NOT NULL,
    country_code VARCHAR(2) NOT NULL,
    callback_url VARCHAR(500),
    callback_secret VARCHAR(255),  -- Per-actor HMAC secret (auto-generated or custom)
    supported_currencies TEXT[],   -- PostgreSQL array of supported currency codes
    status VARCHAR(20) DEFAULT 'ACTIVE',
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_actors_bic ON actors(bic);
CREATE INDEX idx_actors_type ON actors(actor_type);
CREATE INDEX idx_actors_country ON actors(country_code);
CREATE INDEX idx_actors_status ON actors(status) WHERE status = 'ACTIVE';

-- Callback delivery logs for retry tracking and audit
CREATE TABLE IF NOT EXISTS callback_delivery_logs (
    log_id SERIAL PRIMARY KEY,
    actor_bic VARCHAR(11) NOT NULL REFERENCES actors(bic),
    event_type VARCHAR(50) NOT NULL,  -- PACS002, TRADE_NOTIFICATION, PING, etc.
    uetr VARCHAR(36),
    payload JSONB,
    status VARCHAR(20) NOT NULL,  -- PENDING, DELIVERED, FAILED, RETRYING
    attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMP,
    response_status_code INTEGER,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_callback_logs_actor ON callback_delivery_logs(actor_bic);
CREATE INDEX idx_callback_logs_status ON callback_delivery_logs(status) WHERE status IN ('PENDING', 'RETRYING');
CREATE INDEX idx_callback_logs_uetr ON callback_delivery_logs(uetr);
CREATE INDEX idx_callback_logs_created ON callback_delivery_logs(created_at);

-- =============================================================================
-- Migrate Pre-Seeded Actors from In-Memory to Database
-- =============================================================================

-- Insert pre-seeded actors (IPS changed to IPSO per Nexus spec)
INSERT INTO actors (actor_id, bic, actor_type, name, country_code, callback_url, status, registered_at) VALUES
('actor-dbs-sg', 'DBSSSGSG', 'PSP', 'DBS Bank Singapore', 'SG', NULL, 'ACTIVE', '2026-01-01T00:00:00Z'),
('actor-kasikorn-bank', 'KASITHBK', 'PSP', 'Kasikorn Bank Thailand', 'TH', NULL, 'ACTIVE', '2026-01-01T00:00:00Z'),
('actor-maybank-my', 'MABORKKL', 'PSP', 'Maybank Malaysia', 'MY', NULL, 'ACTIVE', '2026-01-01T00:00:00Z'),
('actor-fxp-alpha', 'FXP-ABC', 'FXP', 'ABC Currency Exchange', 'SG', NULL, 'ACTIVE', '2026-01-01T00:00:00Z'),
('actor-sg-ips', 'SGIPSOPS', 'IPSO', 'Singapore FAST IPS', 'SG', NULL, 'ACTIVE', '2026-01-01T00:00:00Z'),
('actor-th-ips', 'THIPSOPS', 'IPSO', 'Thailand PromptPay IPS', 'TH', NULL, 'ACTIVE', '2026-01-01T00:00:00Z')
ON CONFLICT (bic) DO UPDATE SET
    actor_type = EXCLUDED.actor_type,
    name = EXCLUDED.name,
    updated_at = CURRENT_TIMESTAMP;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE fxp_rates IS 'FXP rate submissions for corridors';
COMMENT ON TABLE fxp_psp_relationships IS 'Relationships between FXPs and PSPs for tier-based improvements';
COMMENT ON TABLE sap_reservations IS 'Liquidity reservations for payments';
COMMENT ON TABLE sap_transactions IS 'Settlement transactions on FXP accounts';
COMMENT ON TABLE trade_notifications IS 'Notifications sent to FXPs when their rates are selected';
COMMENT ON TABLE actors IS 'Actor registry for sandbox participants (FXP, IPSO, PSP, SAP, PDO)';
COMMENT ON TABLE callback_delivery_logs IS 'Audit log for callback delivery attempts with retry tracking';
