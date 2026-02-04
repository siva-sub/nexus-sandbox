# ADR-014: Protocol Parity for Interactive Demo

## Status
**Accepted** - February 4, 2026

## Context

The Interactive Demo previously used client-side UUID generation and simplified data structures that did not match the actual Nexus protocol. This created a disconnect between what users experienced in the demo and what the production Nexus system actually requires.

Key issues:
1. Demo used `crypto.randomUUID()` locally instead of server-generated UETRs
2. JSON payloads were used instead of proper ISO 20022 XML
3. No database persistence meant payments vanished after page refresh
4. Payment Explorer could not display demo-created transactions

## Decision

We will enforce **Protocol Parity** for the Interactive Demo, meaning:

1. **Real ISO 20022 XML Submission**: The demo constructs valid pacs.008.001.08 XML and submits to the backend API using `Content-Type: application/xml`.

2. **Full Message Lifecycle Storage**: All 11 ISO 20022 message types are stored in dedicated database columns for forensic inspection:
   - Release 1: pacs.008, pacs.002, acmt.023, acmt.024, camt.054
   - Optional: camt.103, pain.001
   - Future: pacs.004, pacs.028, camt.056, camt.029

3. **Database Persistence**: Every demo payment is stored in PostgreSQL with proper event sourcing, enabling Payment Explorer lookups.

4. **Unhappy Flow Fidelity**: All 9+ rejection scenarios (AB04, TM01, DUPL, AM04, AM02, BE23, AC04, RR04, etc.) trigger real backend validation logic.

## Implementation Highlights

### ISO 20022 Message Storage Schema

```sql
-- Migration 002_add_message_storage.sql
ALTER TABLE payment_events 
ADD COLUMN IF NOT EXISTS pacs008_message TEXT,
ADD COLUMN IF NOT EXISTS pacs002_message TEXT,
ADD COLUMN IF NOT EXISTS acmt023_message TEXT,
ADD COLUMN IF NOT EXISTS acmt024_message TEXT,
ADD COLUMN IF NOT EXISTS camt054_message TEXT,
ADD COLUMN IF NOT EXISTS camt103_message TEXT,
ADD COLUMN IF NOT EXISTS pain001_message TEXT,
ADD COLUMN IF NOT EXISTS pacs004_message TEXT,
ADD COLUMN IF NOT EXISTS pacs028_message TEXT,
ADD COLUMN IF NOT EXISTS camt056_message TEXT,
ADD COLUMN IF NOT EXISTS camt029_message TEXT;
```

### Addressing Flow (acmt.023/024)

```python
# addressing.py - stores XML in dedicated columns
await store_addressing_event(
    db=db,
    event_type="ADDRESSING_REQUESTED",
    actor="SOURCE_PSP",
    correlation_id=correlation_id,
    data={...},
    acmt023_xml=acmt023_xml  # Dedicated column
)
```

## Consequences

### Positive
- Demo behavior matches production Nexus exactly
- Full forensic traceability via Payment Explorer's Message Observatory
- Backend validation logic is exercised with every demo flow
- All 11 message types are viewable in ISO Explorer

### Negative  
- Requires database connectivity (no offline demo mode)
- Generates test data requiring periodic cleanup

### Neutral
- Demo complexity increased but now reflects real system behavior

## Verification

1. Run Interactive Demo through all 4 steps
2. Search UETR in Payment Explorer - should find payment
3. View Messages tab - should display pacs.008, pacs.002, acmt.023/024 XML
4. Trigger unhappy flow (e.g., rate-expired quote) - should see rejection with reason code

## References

- ADR-013: E2E Demo Integration
- ADR-012: Quote Snapshot Architecture
- Migration: `migrations/002_add_message_storage.sql`
- Implementation: `services/nexus-gateway/src/api/addressing.py`
