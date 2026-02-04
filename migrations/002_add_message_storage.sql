-- Migration: Add ISO 20022 Message Storage Columns
-- Date: 2026-02-04
-- Purpose: Store raw ISO 20022 XML for all message types used in Nexus

-- Add columns for Release 1 messages
ALTER TABLE payment_events 
ADD COLUMN IF NOT EXISTS pacs008_message TEXT,
ADD COLUMN IF NOT EXISTS pacs002_message TEXT,
ADD COLUMN IF NOT EXISTS acmt023_message TEXT,
ADD COLUMN IF NOT EXISTS acmt024_message TEXT,
ADD COLUMN IF NOT EXISTS camt054_message TEXT;

-- Add columns for Optional SAP Integration messages
ALTER TABLE payment_events
ADD COLUMN IF NOT EXISTS camt103_message TEXT,
ADD COLUMN IF NOT EXISTS pain001_message TEXT;

-- Add columns for Future/Roadmap messages
ALTER TABLE payment_events
ADD COLUMN IF NOT EXISTS pacs004_message TEXT,
ADD COLUMN IF NOT EXISTS pacs028_message TEXT,
ADD COLUMN IF NOT EXISTS camt056_message TEXT,
ADD COLUMN IF NOT EXISTS camt029_message TEXT;

COMMENT ON COLUMN payment_events.pacs008_message IS 'Raw pacs.008 FI to FI Customer Credit Transfer XML';
COMMENT ON COLUMN payment_events.pacs002_message IS 'Raw pacs.002 Payment Status Report XML';
COMMENT ON COLUMN payment_events.acmt023_message IS 'Raw acmt.023 Identification Verification Request XML (Proxy Resolution)';
COMMENT ON COLUMN payment_events.acmt024_message IS 'Raw acmt.024 Identification Verification Report XML';
COMMENT ON COLUMN payment_events.camt054_message IS 'Raw camt.054 Bank to Customer Debit Credit Notification XML (Reconciliation)';
COMMENT ON COLUMN payment_events.camt103_message IS 'Raw camt.103 Create Reservation XML (SAP Integration Method 2a)';
COMMENT ON COLUMN payment_events.pain001_message IS 'Raw pain.001 Customer Credit Transfer Initiation XML (SAP Integration Method 3)';
COMMENT ON COLUMN payment_events.pacs004_message IS 'Raw pacs.004 Payment Return XML (Future - Release 2)';
COMMENT ON COLUMN payment_events.pacs028_message IS 'Raw pacs.028 FI to FI Payment Status Request XML (Future - Release 2)';
COMMENT ON COLUMN payment_events.camt056_message IS 'Raw camt.056 FI to FI Payment Cancellation Request XML (Recall - Future)';
COMMENT ON COLUMN payment_events.camt029_message IS 'Raw camt.029 Resolution of Investigation XML (Recall Response - Future)';

-- Create index for efficient message retrieval
CREATE INDEX IF NOT EXISTS idx_payment_events_messages 
ON payment_events(uetr) 
WHERE pacs008_message IS NOT NULL 
   OR pacs002_message IS NOT NULL 
   OR acmt023_message IS NOT NULL
   OR acmt024_message IS NOT NULL
   OR pacs004_message IS NOT NULL
   OR camt056_message IS NOT NULL;
