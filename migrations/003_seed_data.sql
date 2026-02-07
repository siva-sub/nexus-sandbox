-- Nexus Global Payments Sandbox - Seed Data
-- Reference: https://docs.nexusglobalpayments.org/apis/countries
-- Migration: 003 (Renamed from 002_seed_data.sql to fix ordering conflict)

-- =============================================================================
-- CURRENCIES
-- =============================================================================

INSERT INTO currencies (currency_code, name, decimal_places) VALUES
    ('SGD', 'Singapore Dollar', 2),
    ('THB', 'Thai Baht', 2),
    ('MYR', 'Malaysian Ringgit', 2),
    ('PHP', 'Philippine Peso', 2),
    ('IDR', 'Indonesian Rupiah', 0),
    ('INR', 'Indian Rupee', 2),
    ('USD', 'US Dollar', 2),
    ('EUR', 'Euro', 2);

-- =============================================================================
-- COUNTRIES
-- Reference: https://docs.nexusglobalpayments.org/ - Founding countries
-- =============================================================================

INSERT INTO countries (country_id, country_code, name) VALUES
    (702, 'SG', 'Singapore'),
    (764, 'TH', 'Thailand'),
    (458, 'MY', 'Malaysia'),
    (608, 'PH', 'Philippines'),
    (360, 'ID', 'Indonesia'),
    (356, 'IN', 'India');

-- =============================================================================
-- COUNTRY CURRENCIES WITH MAX AMOUNTS
-- Reference: https://docs.nexusglobalpayments.org/fx-provision/maximum-value-of-a-nexus-payment
-- =============================================================================

INSERT INTO country_currencies (country_code, currency_code, max_amount) VALUES
    -- Singapore: 200,000 SGD max
    ('SG', 'SGD', 200000.00),
    -- Thailand: 5,000,000 THB max (~150,000 USD)
    ('TH', 'THB', 5000000.00),
    -- Malaysia: 10,000,000 MYR max (~2,300,000 USD)
    ('MY', 'MYR', 10000000.00),
    -- Philippines: 10,000,000 PHP max (~180,000 USD)
    ('PH', 'PHP', 10000000.00),
    -- Indonesia: 1,000,000,000 IDR max (~66,000 USD)
    ('ID', 'IDR', 1000000000.00),
    -- India: 10,000,000 INR max (~120,000 USD)
    ('IN', 'INR', 10000000.00);

-- =============================================================================
-- REQUIRED MESSAGE ELEMENTS
-- Reference: GET /countries response structure
-- =============================================================================

INSERT INTO country_required_elements (country_code, message_type, element_name) VALUES
    -- Singapore requires purpose code
    ('SG', 'pacs008', 'purposeCode'),
    -- Thailand requires purpose and category
    ('TH', 'pacs008', 'purposeCode'),
    ('TH', 'pacs008', 'categoryPurposeCode'),
    -- Malaysia requires purpose
    ('MY', 'pacs008', 'purposeCode'),
    -- Philippines requires purpose
    ('PH', 'pacs008', 'purposeCode'),
    -- Indonesia requires purpose
    ('ID', 'pacs008', 'purposeCode');

-- =============================================================================
-- IPS OPERATORS
-- Reference: https://docs.nexusglobalpayments.org/payment-processing/role-and-responsibilities-of-the-instant-payment-system-operator-ipso
-- =============================================================================

INSERT INTO ips_operators (name, country_code, clearing_system_id, max_amount, currency_code) VALUES
    ('FAST (Fast And Secure Transfers)', 'SG', 'SGFASG22', 200000.00, 'SGD'),
    ('PromptPay', 'TH', 'THBAHTBK', 5000000.00, 'THB'),
    ('DuitNow', 'MY', 'MYDUITMYK', 10000000.00, 'MYR'),
    ('InstaPay', 'PH', 'PHINSTPH', 10000000.00, 'PHP'),
    ('BI-FAST', 'ID', 'IDFASTID', 1000000000.00, 'IDR'),
    ('UPI (NPCI)', 'IN', 'INUPINPC', 10000000.00, 'INR');

-- =============================================================================
-- PAYMENT SERVICE PROVIDERS (PSPs)
-- Reference: https://docs.nexusglobalpayments.org/apis/financial-institutions
-- =============================================================================

INSERT INTO psps (bic, name, country_code, fee_percent) VALUES
    -- Singapore PSPs
    ('DBSSSGSG', 'DBS Bank Singapore', 'SG', 0.005),
    ('OCBCSGSG', 'OCBC Bank Singapore', 'SG', 0.005),
    ('UABORKKL', 'UOB Singapore', 'SG', 0.005),
    
    -- Thailand PSPs
    ('KASITHBK', 'Kasikornbank', 'TH', 0.003),
    ('BABORKKL', 'Bangkok Bank', 'TH', 0.003),
    ('SICOTHBK', 'Siam Commercial Bank', 'TH', 0.003),
    
    -- Malaysia PSPs
    ('MABORKKL', 'Maybank', 'MY', 0.004),
    ('CIABORMY', 'CIMB Bank', 'MY', 0.004),
    ('PUBLMYKL', 'Public Bank', 'MY', 0.004),
    
    -- Philippines PSPs
    ('BABORPMM', 'BDO Unibank', 'PH', 0.005),
    ('MABORPMM', 'Metrobank', 'PH', 0.005),
    
    -- Indonesia PSPs
    ('BMRIIDJA', 'Bank Mandiri', 'ID', 0.003),
    ('BCAIIDJA', 'Bank Central Asia', 'ID', 0.003),

    -- India PSPs
    ('SBININBB', 'State Bank of India', 'IN', 0.003),
    ('HDFCINBB', 'HDFC Bank', 'IN', 0.003),
    ('ICICINBB', 'ICICI Bank', 'IN', 0.003);

-- =============================================================================
-- FOREIGN EXCHANGE PROVIDERS (FXPs)
-- Reference: https://docs.nexusglobalpayments.org/fx-provision/role-of-the-fx-provider
-- =============================================================================

INSERT INTO fxps (fxp_code, name, base_spread_bps, tier_improvements, psp_improvements) VALUES
    ('FXP-ABC', 'ABC Currency Exchange', 50, 
     '[{"minAmount": 1000, "improvementBps": 5}, {"minAmount": 10000, "improvementBps": 10}, {"minAmount": 50000, "improvementBps": 15}]'::jsonb,
     '{"DBSSSGSG": 5, "KASITHBK": 3}'::jsonb),
    
    ('FXP-XYZ', 'XYZ Forex Services', 45,
     '[{"minAmount": 2000, "improvementBps": 3}, {"minAmount": 20000, "improvementBps": 8}]'::jsonb,
     '{}'::jsonb),
    
    ('FXP-GLOBAL', 'Global Exchange Partners', 55,
     '[{"minAmount": 5000, "improvementBps": 7}, {"minAmount": 25000, "improvementBps": 12}]'::jsonb,
     '{"MABORKKL": 4}'::jsonb);

-- =============================================================================
-- SETTLEMENT ACCESS PROVIDERS (SAPs)
-- Reference: https://docs.nexusglobalpayments.org/settlement-access-provision/role-of-the-settlement-access-provider-sap
-- =============================================================================

INSERT INTO saps (bic, name, country_code, currency_code) VALUES
    -- Singapore SAPs
    ('DBSSSGSG', 'DBS Bank Singapore (SAP)', 'SG', 'SGD'),
    ('OCBCSGSG', 'OCBC Bank Singapore (SAP)', 'SG', 'SGD'),
    
    -- Thailand SAPs
    ('KASITHBK', 'Kasikornbank (SAP)', 'TH', 'THB'),
    
    -- Malaysia SAPs
    ('MABORKKL', 'Maybank (SAP)', 'MY', 'MYR'),
    
    -- Philippines SAPs
    ('BABORPMM', 'BDO Unibank (SAP)', 'PH', 'PHP'),
    
    -- Indonesia SAPs
    ('BMRIIDJA', 'Bank Mandiri (SAP)', 'ID', 'IDR'),
    
    -- India SAPs  
    ('SBININBB', 'State Bank of India (SAP)', 'IN', 'INR');

-- =============================================================================
-- FXP ACCOUNTS AT SAPs (Intermediary Agents)
-- Reference: https://docs.nexusglobalpayments.org/payment-setup/step-13-16-set-up-and-send-the-payment-instruction
-- =============================================================================

INSERT INTO fxp_sap_accounts (fxp_id, sap_id, account_number, currency_code, balance)
SELECT 
    f.fxp_id,
    s.sap_id,
    'FXPACC' || LPAD(ROW_NUMBER() OVER ()::text, 6, '0'),
    s.currency_code,
    1000000.00
FROM fxps f
CROSS JOIN saps s;

-- =============================================================================
-- PROXY DIRECTORY OPERATORS (PDOs)
-- Reference: https://docs.nexusglobalpayments.org/addressing-and-proxy-resolution/role-of-the-proxy-directory-operator-pdo
-- =============================================================================

INSERT INTO pdos (name, country_code, supported_proxy_types) VALUES
    ('PayNow Directory', 'SG', '["MOBI", "NRIC", "UEN"]'::jsonb),
    ('PromptPay Directory', 'TH', '["MOBI", "NIDN", "EWAL"]'::jsonb),
    ('DuitNow Directory', 'MY', '["MOBI", "NRIC", "BIZN", "PASS"]'::jsonb),
    ('InstaPay Directory', 'PH', '["MOBI"]'::jsonb),
    ('BI-FAST Directory', 'ID', '["MOBI", "NIK"]'::jsonb),
    ('UPI Directory', 'IN', '["MOBI", "VPA"]'::jsonb);

-- =============================================================================
-- ADDRESS TYPES
-- Reference: https://docs.nexusglobalpayments.org/addressing-and-proxy-resolution/address-types-and-inputs/address-types
-- =============================================================================

INSERT INTO address_types (country_code, code, display_name, requires_proxy_resolution, clearing_system_id) VALUES
    -- Singapore
    ('SG', 'MOBI', 'Mobile Number (PayNow)', true, 'SGFASG22'),
    ('SG', 'NRIC', 'NRIC/FIN (PayNow)', true, 'SGFASG22'),
    ('SG', 'UEN', 'Business UEN (PayNow)', true, 'SGFASG22'),
    ('SG', 'ACCT', 'Bank Account Number', false, 'SGFASG22'),
    
    -- Thailand
    ('TH', 'MOBI', 'Mobile Number (PromptPay)', true, 'THBAHTBK'),
    ('TH', 'NIDN', 'National ID (PromptPay)', true, 'THBAHTBK'),
    ('TH', 'EWAL', 'e-Wallet ID (PromptPay)', true, 'THBAHTBK'),
    ('TH', 'ACCT', 'Bank Account Number', false, 'THBAHTBK'),
    
    -- Malaysia
    ('MY', 'MOBI', 'Mobile Number (DuitNow)', true, 'MYDUITMYK'),
    ('MY', 'NRIC', 'MyKad Number (DuitNow)', true, 'MYDUITMYK'),
    ('MY', 'BIZN', 'Business Registration (DuitNow)', true, 'MYDUITMYK'),
    ('MY', 'PASS', 'Passport Number (DuitNow)', true, 'MYDUITMYK'),
    ('MY', 'ACCT', 'Bank Account Number', false, 'MYDUITMYK'),
    
    -- Indonesia (BI-FAST)
    ('ID', 'MBNO', 'Mobile Number (BI-FAST)', true, 'IDFASTID'),
    ('ID', 'EMAL', 'Email Address (BI-FAST)', true, 'IDFASTID'),
    ('ID', 'NIK', 'National ID (NIK)', true, 'IDFASTID'),
    ('ID', 'ACCT', 'Bank Account Number', false, 'IDFASTID'),
    
    -- India (UPI)
    ('IN', 'MBNO', 'Mobile Number (UPI)', true, 'INUPINPC'),
    ('IN', 'VPA', 'Virtual Payment Address (VPA)', true, 'INUPINPC'),
    ('IN', 'ACCT', 'Bank Account Number', false, 'INUPINPC');

-- =============================================================================
-- FX RATES (Sample rates)
-- Reference: https://docs.nexusglobalpayments.org/fx-provision/rates-from-third-party-fx-providers
-- =============================================================================

-- SGD rates
INSERT INTO fx_rates (fxp_id, source_currency, destination_currency, base_rate, valid_from, valid_until)
SELECT fxp_id, 'SGD', 'THB', 25.85, NOW(), NOW() + INTERVAL '100 years' FROM fxps WHERE fxp_code = 'FXP-ABC'
UNION ALL
SELECT fxp_id, 'SGD', 'MYR', 3.50, NOW(), NOW() + INTERVAL '100 years' FROM fxps WHERE fxp_code = 'FXP-ABC'
UNION ALL
SELECT fxp_id, 'SGD', 'PHP', 42.50, NOW(), NOW() + INTERVAL '100 years' FROM fxps WHERE fxp_code = 'FXP-ABC'
UNION ALL
SELECT fxp_id, 'SGD', 'IDR', 11500.00, NOW(), NOW() + INTERVAL '100 years' FROM fxps WHERE fxp_code = 'FXP-ABC'
UNION ALL
SELECT fxp_id, 'SGD', 'INR', 62.50, NOW(), NOW() + INTERVAL '100 years' FROM fxps WHERE fxp_code = 'FXP-ABC';

-- THB rates (reverse)
INSERT INTO fx_rates (fxp_id, source_currency, destination_currency, base_rate, valid_from, valid_until)
SELECT fxp_id, 'THB', 'SGD', 0.0387, NOW(), NOW() + INTERVAL '100 years' FROM fxps WHERE fxp_code = 'FXP-ABC'
UNION ALL
SELECT fxp_id, 'THB', 'MYR', 0.135, NOW(), NOW() + INTERVAL '100 years' FROM fxps WHERE fxp_code = 'FXP-ABC';

-- MYR rates
INSERT INTO fx_rates (fxp_id, source_currency, destination_currency, base_rate, valid_from, valid_until)
SELECT fxp_id, 'MYR', 'SGD', 0.286, NOW(), NOW() + INTERVAL '100 years' FROM fxps WHERE fxp_code = 'FXP-ABC'
UNION ALL
SELECT fxp_id, 'MYR', 'THB', 7.39, NOW(), NOW() + INTERVAL '100 years' FROM fxps WHERE fxp_code = 'FXP-ABC';

-- Additional FXP rates with different spreads
INSERT INTO fx_rates (fxp_id, source_currency, destination_currency, base_rate, valid_from, valid_until)
SELECT fxp_id, 'SGD', 'THB', 25.80, NOW(), NOW() + INTERVAL '100 years' FROM fxps WHERE fxp_code = 'FXP-XYZ'
UNION ALL
SELECT fxp_id, 'SGD', 'MYR', 3.48, NOW(), NOW() + INTERVAL '100 years' FROM fxps WHERE fxp_code = 'FXP-XYZ';

-- FXP-GLOBAL rates (previously unused)
INSERT INTO fx_rates (fxp_id, source_currency, destination_currency, base_rate, valid_from, valid_until)
SELECT fxp_id, 'SGD', 'THB', 25.82, NOW(), NOW() + INTERVAL '100 years' FROM fxps WHERE fxp_code = 'FXP-GLOBAL'
UNION ALL
SELECT fxp_id, 'SGD', 'MYR', 3.51, NOW(), NOW() + INTERVAL '100 years' FROM fxps WHERE fxp_code = 'FXP-GLOBAL'
UNION ALL
SELECT fxp_id, 'SGD', 'PHP', 42.55, NOW(), NOW() + INTERVAL '100 years' FROM fxps WHERE fxp_code = 'FXP-GLOBAL'
UNION ALL
SELECT fxp_id, 'SGD', 'IDR', 11520.00, NOW(), NOW() + INTERVAL '100 years' FROM fxps WHERE fxp_code = 'FXP-GLOBAL'
UNION ALL
SELECT fxp_id, 'SGD', 'INR', 62.60, NOW(), NOW() + INTERVAL '100 years' FROM fxps WHERE fxp_code = 'FXP-GLOBAL';

-- Missing reverse rates (PHP, IDR, INR to SGD)
INSERT INTO fx_rates (fxp_id, source_currency, destination_currency, base_rate, valid_from, valid_until)
SELECT fxp_id, 'PHP', 'SGD', 0.0235, NOW(), NOW() + INTERVAL '100 years' FROM fxps WHERE fxp_code = 'FXP-ABC'
UNION ALL
SELECT fxp_id, 'IDR', 'SGD', 0.000087, NOW(), NOW() + INTERVAL '100 years' FROM fxps WHERE fxp_code = 'FXP-ABC'
UNION ALL
SELECT fxp_id, 'INR', 'SGD', 0.016, NOW(), NOW() + INTERVAL '100 years' FROM fxps WHERE fxp_code = 'FXP-ABC';

-- =============================================================================
-- PROXY REGISTRATIONS (Demo data for PDO)
-- Reference: https://docs.nexusglobalpayments.org/addressing-and-proxy-resolution/proxy-and-account-resolution-process
-- =============================================================================

INSERT INTO proxy_registrations (country_code, proxy_type, proxy_value, creditor_name, creditor_name_masked, account_number, bank_bic, bank_name) VALUES
    -- Singapore test mobiles
    ('SG', 'MOBI', '+6591234567', 'John Tan Wei Ming', 'Jo** T*n W*i M*ng', '1234567890', 'DBSSSGSG', 'DBS Bank'),
    ('SG', 'MOBI', '+6598765432', 'Mary Lim Siew Hwa', 'Ma** L*m S*ew H*a', '0987654321', 'OCBCSGSG', 'OCBC Bank'),
    ('SG', 'NRIC', 'S1234567A', 'Alice Wong Mei Ling', 'Al*ce W*ng M*i L*ng', '5555666677', 'DBSSSGSG', 'DBS Bank'),
    ('SG', 'UEN', '123456789C', 'Tech Innovations Pte Ltd', 'Te**h In******ns P*e L*d', '88889999001', 'UABORKKL', 'UOB Singapore'),

    -- Thailand test mobiles
    ('TH', 'MOBI', '+66812345678', 'Somchai Jaidee', 'So***ai Ja***e', 'TH123456789', 'KASITHBK', 'Kasikornbank'),
    ('TH', 'MOBI', '+66898765432', 'Siriwan Suksan', 'Si***an Su***n', 'TH987654321', 'BABORKKL', 'Bangkok Bank'),
    ('TH', 'NIDN', '1234567890123', 'Prasit Thongchai', 'Pr***t Th***ai', 'TH111222333', 'SICOTHBK', 'Siam Commercial Bank'),
    ('TH', 'EWAL', 'truemoney@wallet', 'Nattaya Wong', 'Na***a Wo***', 'TH999888777', 'KASITHBK', 'Kasikornbank'),

    -- Malaysia test mobiles
    ('MY', 'MOBI', '+60123456789', 'Ahmad bin Abdullah', 'Ah*** b*n Ab****ah', 'MY12345678901234', 'MABORKKL', 'Maybank'),
    ('MY', 'MOBI', '+60198765432', 'Siti Aminah binti Hassan', 'Si** Am***h b***i Ha***n', 'MY98765432109876', 'CIABORMY', 'CIMB Bank'),

    -- Philippines test mobiles
    ('PH', 'MOBI', '+639123456789', 'Juan dela Cruz', 'Ju** de** Cr**', 'PH1234567890', 'BABORPMM', 'BDO Unibank'),

    -- Indonesia test mobiles (BI-FAST)
    ('ID', 'MBNO', '+6281234567890', 'Budi Santoso', 'Bu** Sa***so', 'ID1234567890123456', 'BMRIIDJA', 'Bank Mandiri'),
    ('ID', 'MBNO', '+6289876543210', 'Siti Nurhaliza', 'Si** Nu***za', 'ID9876543210987654', 'BCAIIDJA', 'Bank Central Asia'),
    ('ID', 'EMAL', 'budi@example.co.id', 'Budi Hartono', 'Bu** Ha***no', 'ID5555666677778888', 'BMRIIDJA', 'Bank Mandiri'),

    -- India test mobiles (UPI)
    ('IN', 'MBNO', '+919123456789', 'Rajesh Kumar', 'Ra***h Ku***r', 'IN12345678901234', 'SBININBB', 'State Bank of India'),
    ('IN', 'MBNO', '+919876543210', 'Priya Sharma', 'Pr*** Sh***a', 'IN98765432109876', 'HDFCINBB', 'HDFC Bank'),
    ('IN', 'VPA', 'rajesh@upi', 'Rajesh Kumar', 'Ra***h Ku***r', 'IN12345678901234', 'SBININBB', 'State Bank of India'),
    ('IN', 'VPA', 'priya@hdfc', 'Priya Sharma', 'Pr*** Sh***a', 'IN98765432109876', 'HDFCINBB', 'HDFC Bank'),
    ('IN', 'VPA', 'amit@icici', 'Amit Patel', 'Am** Pa***l', 'IN55554444333322', 'ICICINBB', 'ICICI Bank'),
    ('IN', 'VPA', 'neha@sbi', 'Neha Gupta', 'Ne**h Gu***a', 'IN77776666555544', 'SBININBB', 'State Bank of India');

-- =============================================================================
-- API CLIENTS (for OAuth)
-- =============================================================================

INSERT INTO api_clients (client_id, client_secret_hash, participant_type, participant_id, allowed_scopes)
SELECT 
    'psp-' || LOWER(bic),
    -- SHA-256 of 'sandbox-secret-' || bic (in production would use proper bcrypt)
    encode(sha256(('sandbox-secret-' || bic)::bytea), 'hex'),
    'PSP',
    psp_id,
    ARRAY['quotes:read', 'payments:submit', 'proxy:resolve']
FROM psps;

INSERT INTO api_clients (client_id, client_secret_hash, participant_type, participant_id, allowed_scopes)
SELECT 
    'fxp-' || LOWER(fxp_code),
    encode(sha256(('sandbox-secret-' || fxp_code)::bytea), 'hex'),
    'FXP',
    fxp_id,
    ARRAY['rates:write', 'rates:read']
FROM fxps;

-- Admin client for testing
INSERT INTO api_clients (client_id, client_secret_hash, participant_type, participant_id, allowed_scopes)
VALUES (
    'nexus-admin',
    encode(sha256('sandbox-admin-secret'::bytea), 'hex'),
    'ADMIN',
    uuid_generate_v4(),
    ARRAY['admin:all']
);

-- =============================================================================
-- SAMPLE PAYMENTS WITH FULL EVENT HISTORY
-- These enable immediate exploration of the Payment Explorer on first startup
-- =============================================================================

-- Sample Payment 1: SG→TH Successful Payment (ACCC) - Happy Flow
INSERT INTO payments (uetr, quote_id, source_psp_bic, destination_psp_bic, debtor_name, debtor_account, creditor_name, creditor_account, source_currency, destination_currency, interbank_settlement_amount, exchange_rate, status, initiated_at, updated_at)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    (SELECT quote_id FROM quotes LIMIT 1),
    'DBSSSGSG', 'KASITHBK',
    'John Tan', 'SG1234567890',
    'Somchai Jaidee', 'TH123456789',
    'SGD', 'THB',
    1000.00, 25.50,
    'ACSC',
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '1 hour 55 minutes'
);

-- Event history for Payment 1
INSERT INTO payment_events (uetr, event_type, version, actor, data, occurred_at)
VALUES
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'PAYMENT_INITIATED', 1, 'DBSSSGSG', '{"amount": 1000.00, "currency": "SGD"}'::jsonb, NOW() - INTERVAL '2 hours'),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'QUOTE_SELECTED', 2, 'NEXUS', '{"quoteId": "quote-001", "rate": 25.50}'::jsonb, NOW() - INTERVAL '1 hour 59 minutes'),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'PROXY_RESOLVED', 3, 'THPDO', '{"proxy": "+66812345678", "name": "Somchai Jaidee"}'::jsonb, NOW() - INTERVAL '1 hour 58 minutes'),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'SANCTIONS_PASSED', 4, 'NEXUS', '{"screening": "clear"}'::jsonb, NOW() - INTERVAL '1 hour 57 minutes'),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'PAYMENT_ACCEPTED', 5, 'NEXUS', '{"status": "ACCC"}'::jsonb, NOW() - INTERVAL '1 hour 56 minutes'),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'SETTLEMENT_COMPLETED', 6, 'THIPSOPS', '{"settledAmount": 25500.00}'::jsonb, NOW() - INTERVAL '1 hour 55 minutes');

-- Sample Payment 2: SG→MY Successful Payment (ACCC) - Happy Flow
INSERT INTO payments (uetr, quote_id, source_psp_bic, destination_psp_bic, debtor_name, debtor_account, creditor_name, creditor_account, source_currency, destination_currency, interbank_settlement_amount, exchange_rate, status, initiated_at, updated_at)
VALUES (
    'b2c3d4e5-f6a7-8901-bcde-f23456789012',
    (SELECT quote_id FROM quotes LIMIT 1),
    'DBSSSGSG', 'MABORKKL',
    'Mary Lim', 'SG0987654321',
    'Ahmad Abdullah', 'MY12345678901234',
    'SGD', 'MYR',
    500.00, 3.45,
    'ACSC',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '23 hours 55 minutes'
);

-- Event history for Payment 2
INSERT INTO payment_events (uetr, event_type, version, actor, data, occurred_at)
VALUES
    ('b2c3d4e5-f6a7-8901-bcde-f23456789012', 'PAYMENT_INITIATED', 1, 'DBSSSGSG', '{"amount": 500.00, "currency": "SGD"}'::jsonb, NOW() - INTERVAL '1 day'),
    ('b2c3d4e5-f6a7-8901-bcde-f23456789012', 'QUOTE_SELECTED', 2, 'NEXUS', '{"quoteId": "quote-002", "rate": 3.45}'::jsonb, NOW() - INTERVAL '23 hours 59 minutes'),
    ('b2c3d4e5-f6a7-8901-bcde-f23456789012', 'PAYMENT_ACCEPTED', 3, 'NEXUS', '{"status": "ACCC"}'::jsonb, NOW() - INTERVAL '23 hours 56 minutes'),
    ('b2c3d4e5-f6a7-8901-bcde-f23456789012', 'SETTLEMENT_COMPLETED', 4, 'MYIPSOPS', '{"settledAmount": 1725.00}'::jsonb, NOW() - INTERVAL '23 hours 55 minutes');

-- Sample Payment 3: SG→IN Successful Payment (ACCC) - Happy Flow
INSERT INTO payments (uetr, quote_id, source_psp_bic, destination_psp_bic, debtor_name, debtor_account, creditor_name, creditor_account, source_currency, destination_currency, interbank_settlement_amount, exchange_rate, status, initiated_at, updated_at)
VALUES (
    'c3d4e5f6-a7b8-9012-cdef-345678901234',
    (SELECT quote_id FROM quotes LIMIT 1),
    'OCBCSGSG', 'SBININBB',
    'Alice Wong', 'SG5555666677',
    'Rajesh Kumar', 'IN12345678901234',
    'SGD', 'INR',
    2000.00, 61.80,
    'ACSC',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '2 days 23 hours 55 minutes'
);

-- Event history for Payment 3
INSERT INTO payment_events (uetr, event_type, version, actor, data, occurred_at)
VALUES
    ('c3d4e5f6-a7b8-9012-cdef-345678901234', 'PAYMENT_INITIATED', 1, 'OCBCSGSG', '{"amount": 2000.00, "currency": "SGD"}'::jsonb, NOW() - INTERVAL '3 days'),
    ('c3d4e5f6-a7b8-9012-cdef-345678901234', 'QUOTE_SELECTED', 2, 'NEXUS', '{"quoteId": "quote-003", "rate": 61.80}'::jsonb, NOW() - INTERVAL '2 days 23 hours 59 minutes'),
    ('c3d4e5f6-a7b8-9012-cdef-345678901234', 'PROXY_RESOLVED', 3, 'INPDO', '{"proxy": "rajesh@upi", "name": "Rajesh Kumar"}'::jsonb, NOW() - INTERVAL '2 days 23 hours 58 minutes'),
    ('c3d4e5f6-a7b8-9012-cdef-345678901234', 'PAYMENT_ACCEPTED', 4, 'NEXUS', '{"status": "ACCC"}'::jsonb, NOW() - INTERVAL '2 days 23 hours 56 minutes'),
    ('c3d4e5f6-a7b8-9012-cdef-345678901234', 'SETTLEMENT_COMPLETED', 5, 'INIPSOPS', '{"settledAmount": 123600.00}'::jsonb, NOW() - INTERVAL '2 days 23 hours 55 minutes');

-- Sample Payment 4: RJCT - Insufficient Funds (AM04) - Unhappy Flow
INSERT INTO payments (uetr, quote_id, source_psp_bic, destination_psp_bic, debtor_name, debtor_account, creditor_name, creditor_account, source_currency, destination_currency, interbank_settlement_amount, exchange_rate, status, status_reason, initiated_at, updated_at)
VALUES (
    'd4e5f6a7-b8c9-0123-defa-456789012345',
    (SELECT quote_id FROM quotes LIMIT 1),
    'DBSSSGSG', 'KASITHBK',
    'Test Sender', 'SG9999999999',
    'Test Recipient', 'TH999999999',
    'SGD', 'THB',
    50000.00, 25.50,
    'RJCT', 'AM04',
    NOW() - INTERVAL '5 hours',
    NOW() - INTERVAL '4 hours 59 minutes'
);

-- Event history for Payment 4 (Rejected)
INSERT INTO payment_events (uetr, event_type, version, actor, data, occurred_at)
VALUES
    ('d4e5f6a7-b8c9-0123-defa-456789012345', 'PAYMENT_INITIATED', 1, 'DBSSSGSG', '{"amount": 50000.00, "currency": "SGD"}'::jsonb, NOW() - INTERVAL '5 hours'),
    ('d4e5f6a7-b8c9-0123-defa-456789012345', 'QUOTE_SELECTED', 2, 'NEXUS', '{"quoteId": "quote-004"}'::jsonb, NOW() - INTERVAL '4 hours 59 minutes'),
    ('d4e5f6a7-b8c9-0123-defa-456789012345', 'PAYMENT_REJECTED', 3, 'DBSSSGSG', '{"reason": "AM04", "description": "Insufficient funds in debtor account"}'::jsonb, NOW() - INTERVAL '4 hours 59 minutes');

-- Sample Payment 5: RJCT - Account Closed (AC04) - Unhappy Flow
INSERT INTO payments (uetr, quote_id, source_psp_bic, destination_psp_bic, debtor_name, debtor_account, creditor_name, creditor_account, source_currency, destination_currency, interbank_settlement_amount, exchange_rate, status, status_reason, initiated_at, updated_at)
VALUES (
    'e5f6a7b8-c9d0-1234-efab-567890123456',
    (SELECT quote_id FROM quotes LIMIT 1),
    'DBSSSGSG', 'KASITHBK',
    'Test Sender 2', 'SG8888888888',
    'Closed Account', 'TH888888888',
    'SGD', 'THB',
    100.00, 25.50,
    'RJCT', 'AC04',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '23 hours 59 minutes'
);

-- Event history for Payment 5 (Rejected)
INSERT INTO payment_events (uetr, event_type, version, actor, data, occurred_at)
VALUES
    ('e5f6a7b8-c9d0-1234-efab-567890123456', 'PAYMENT_INITIATED', 1, 'DBSSSGSG', '{"amount": 100.00}'::jsonb, NOW() - INTERVAL '1 day'),
    ('e5f6a7b8-c9d0-1234-efab-567890123456', 'PAYMENT_REJECTED', 2, 'NEXUS', '{"reason": "AC04", "description": "Recipient account has been closed"}'::jsonb, NOW() - INTERVAL '23 hours 59 minutes');

-- Sample Payment 6: RJCT - Quote Expired (AB04) - Unhappy Flow
INSERT INTO payments (uetr, quote_id, source_psp_bic, destination_psp_bic, debtor_name, debtor_account, creditor_name, creditor_account, source_currency, destination_currency, interbank_settlement_amount, exchange_rate, status, status_reason, initiated_at, updated_at)
VALUES (
    'f6a7b8c9-d0e1-2345-fabc-678901234567',
    (SELECT quote_id FROM quotes LIMIT 1),
    'DBSSSGSG', 'MABORKKL',
    'Test Sender 3', 'SG7777777777',
    'Test Recipient 3', 'MY77777777777777',
    'SGD', 'MYR',
    750.00, 3.45,
    'RJCT', 'AB04',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '1 day 23 hours 59 minutes'
);

-- Event history for Payment 6 (Rejected - Quote Expired)
INSERT INTO payment_events (uetr, event_type, version, actor, data, occurred_at)
VALUES
    ('f6a7b8c9-d0e1-2345-fabc-678901234567', 'PAYMENT_INITIATED', 1, 'DBSSSGSG', '{"amount": 750.00}'::jsonb, NOW() - INTERVAL '2 days'),
    ('f6a7b8c9-d0e1-2345-fabc-678901234567', 'PAYMENT_REJECTED', 2, 'NEXUS', '{"reason": "AB04", "description": "Quote expired - exchange rate guarantee lapsed"}'::jsonb, NOW() - INTERVAL '1 day 23 hours 59 minutes');

-- Sample Payment 7: RJCT - Invalid Proxy (BE23) - Unhappy Flow
INSERT INTO payments (uetr, quote_id, source_psp_bic, destination_psp_bic, debtor_name, debtor_account, creditor_name, creditor_account, source_currency, destination_currency, interbank_settlement_amount, exchange_rate, status, status_reason, initiated_at, updated_at)
VALUES (
    'a7b8c9d0-e1f2-3456-abcd-789012345678',
    (SELECT quote_id FROM quotes LIMIT 1),
    'DBSSSGSG', 'BABORPMM',
    'Test Sender 4', 'SG6666666666',
    'Invalid Proxy', 'PH6666666666',
    'SGD', 'PHP',
    300.00, 42.00,
    'RJCT', 'BE23',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '2 days 23 hours 58 minutes'
);

-- Event history for Payment 7 (Rejected - Invalid Proxy)
INSERT INTO payment_events (uetr, event_type, version, actor, data, occurred_at)
VALUES
    ('a7b8c9d0-e1f2-3456-abcd-789012345678', 'PAYMENT_INITIATED', 1, 'DBSSSGSG', '{"amount": 300.00}'::jsonb, NOW() - INTERVAL '3 days'),
    ('a7b8c9d0-e1f2-3456-abcd-789012345678', 'PROXY_RESOLUTION_FAILED', 2, 'PHPDO', '{"proxy": "+639999999999", "error": "Proxy not found"}'::jsonb, NOW() - INTERVAL '2 days 23 hours 59 minutes'),
    ('a7b8c9d0-e1f2-3456-abcd-789012345678', 'PAYMENT_REJECTED', 3, 'NEXUS', '{"reason": "BE23", "description": "Account/Proxy invalid - not registered in PDO"}'::jsonb, NOW() - INTERVAL '2 days 23 hours 58 minutes');

-- Note: ISO 20022 messages are stored in the iso20022_messages table with different schema
-- Sample payments created successfully
