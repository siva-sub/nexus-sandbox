# ADR-012: Quote Snapshot Architecture for Fee Calculations

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-02-04 |
| **Authors** | Sivasubramanian Ramanathan |
| **Reviewers** | - |
| **Supersedes** | - |

## Context

The pre-transaction disclosure (PTD) was producing contradictory values because:

1. **Multiple calculation paths**: Quote creation and PTD endpoint calculated fees independently
2. **Timing drift**: Fee formulas could change between quote time and PTD time
3. **Unit confusion**: Exchange rates were displayed without explicit direction labels
4. **Invariant violations**: No runtime checks to catch mathematical inconsistencies

### Problem Evidence

Screenshot analysis showed:
- Effective rate displayed as "0.0000872" when market rate was "11500" (inverted units)
- Sender total didn't reconcile with principal + fees
- Destination fee was sometimes missing from calculations

## Decision

Implement the **"One Canonical Quote Snapshot"** architecture per Nexus specification:

### 1. Quote as Single Source of Truth

The quote record stores ALL calculated values at creation time:

```sql
ALTER TABLE quotes ADD COLUMN creditor_account_amount DECIMAL(18,2);
ALTER TABLE quotes ADD COLUMN destination_psp_fee DECIMAL(18,2);
```

### 2. Fee Calculation at Quote Time

All fees are calculated once, when the quote is generated:

```python
# In quotes.py - calculated at quote creation
dest_psp_fee = _calculate_destination_psp_fee(amount, currency)
source_psp_fee = _calculate_source_psp_fee(principal)
scheme_fee = _calculate_scheme_fee(principal)
```

### 3. PTD Reads from Quote (No Recalculation)

```python
# In fee_formulas.py - read, don't calculate
if quote.destination_psp_fee is not None:
    dest_fee = Decimal(str(quote.destination_psp_fee))
else:
    dest_fee = _calculate_destination_fee(...)  # Fallback only
```

### 4. Strict Invariants with Runtime Assertion

```python
def _assert_invariants(...):
    # Invariant 1: Payout reconciles
    assert abs(payout_gross - (recipient_net + dest_fee)) < tolerance
    
    # Invariant 2: Sender reconciles
    assert abs(sender_total - (principal + source_fee + scheme_fee)) < tolerance
    
    # Invariant 3: Effective rate is consistent
    assert abs(effective_rate - (recipient_net / sender_total)) < tolerance
    
    # Invariant 4: Spread reduces rate
    assert customer_rate <= market_rate
    
    # Invariant 5: All amounts positive
    assert all(x > 0 for x in [recipient_net, payout_gross, principal, total])
```

### 5. Rate Direction Convention

All rates expressed as **destination per source** (e.g., IDR per 1 SGD):

| Rate | Formula | Example |
|------|---------|---------|
| Market Rate | Mid-market from FXP | 11,500 IDR/SGD |
| Customer Rate | Market × (1 - spread/10000) | 11,459.75 IDR/SGD |
| Effective Rate | recipient_net / sender_total | 10,646 IDR/SGD |

## Consequences

### Positive

1. **No contradictions possible**: Same numbers flow from quote → PTD → pacs.008
2. **Invariant violations caught early**: Assertions fail fast if math is wrong
3. **Nexus spec compliant**: Quote includes `creditorAccountAmount` per spec
4. **Backward compatible**: Fallback calculation for old quotes without stored fees

### Negative

1. **Larger quote records**: Additional fee columns stored
2. **Fee formula changes don't affect locked quotes**: By design, but could confuse users
3. **Fallback logic adds complexity**: Needed for migration period

## Implementation

### Quote Response (New Fields)

```json
{
  "quoteId": "a98ed2f9-...",
  "exchangeRate": "11459.75000000",
  "sourceInterbankAmount": "8.78",
  "destinationInterbankAmount": "100600.00",
  "creditorAccountAmount": "100000.00",
  "destinationPspFee": "600.00"
}
```

### PTD Response (Unchanged Schema, Consistent Values)

```json
{
  "recipientNetAmount": "100000.00",
  "payoutGrossAmount": "100600.00",
  "destinationPspFee": "600.00",
  "senderPrincipal": "8.78",
  "sourcePspFee": "0.51",
  "schemeFee": "0.10",
  "senderTotal": "9.39",
  "effectiveRate": "10646.0332"
}
```

### Fee Formulas

| Fee | Formula | Bounds |
|-----|---------|--------|
| **D-PSP Fee** | fixed + amount × percent | Per-country min/max |
| **Source PSP Fee** | 0.50 + principal × 0.1% | 0.50 - 10.00 SGD |
| **Scheme Fee** | 0.10 + principal × 0.05% | 0.10 - 5.00 SGD |

### Validation Approach

Validated against Nexus documentation via NotebookLM queries:
1. Confirmed D-PSP fee is calculated by Nexus and included in quote
2. Confirmed `creditorAccountAmount` is a required quote response field
3. Confirmed rate direction is source-to-destination per spec
4. Confirmed effective rate = Amount Credited / Amount Debited

## Related Decisions

- **ADR-005**: API Design Principles (consistency requirements)
- **ADR-003**: ISO 20022 Message Handling (rate fields in pacs.008)

## References

- [Nexus Scheme Rulebook - Quotes](https://docs.nexusglobalpayments.org/fx-provision/quotes)
- [Nexus Fee Model](https://docs.nexusglobalpayments.org/fees-and-pricing)
- [NotebookLM Validation: Fee Model Compliance Report](file:///home/siva/.gemini/antigravity/brain/e5107e63-6503-43d9-86a4-927b4d134478/fee_model_compliance_report.md)
