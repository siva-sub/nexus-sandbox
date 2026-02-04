# ADR-013: End-to-End Demo Integration

## Status
**Accepted** - February 4, 2026

## Context

The interactive demo previously simulated payment flows locally using `crypto.randomUUID()` to generate fake UETRs. This meant:

1. Payments were not persisted to the database
2. Payment Explorer could not find demo-created payments
3. The demo did not accurately represent real Nexus flows
4. There was no way to verify the backend validation logic

The user requested making the demo "end-to-end functional" with real API calls.

## Decision

We will update the interactive demo to submit **real ISO 20022 pacs.008 XML messages** to the backend API, following the Nexus specification exactly.

### Key Changes

1. **Frontend `api.ts`**: Added `submitPacs008()` function that:
   - Constructs valid pacs.008.001.08 XML via `buildPacs008Xml()`
   - Submits with `Content-Type: application/xml` (per Nexus spec - JSON is NOT supported for pacs.008)
   - Handles both success responses and rejection errors

2. **Frontend `InteractiveDemo.tsx`**: Updated `handleConfirmPayment()` to:
   - Build pacs.008 parameters from demo form data
   - Call real `submitPacs008()` API
   - Display actual UETR from backend response
   - Handle backend rejections with proper error codes

3. **Backend `demo_data.py`**: Added endpoints for test data management:
   - `DELETE /v1/demo-data` - Purge demo payments with age filter
   - `GET /v1/demo-data/stats` - Get demo data statistics

4. **Settings Page**: Added demo data statistics and purge controls

### Message Format Validation

Per NotebookLM query (Feb 4, 2026):
> "Nexus does not support JSON format for pacs.008 payment messages. You cannot submit a pacs.008 in JSON format; it must be submitted as ISO 20022 XML."

## Consequences

### Positive
- Demo payments are now persisted and findable in Payment Explorer
- Backend validation logic (quote expiry, rate matching, SAP verification) is exercised
- Unhappy flow scenarios trigger real backend rejections
- Demo accurately represents production Nexus flows
- Test data can be purged via Settings page
- Complete ISO 20022 schema library (100 XSDs) available for future message types

### Negative
- Demo requires backend connectivity (no offline mode)
- Generates real database records requiring cleanup
- Slightly increased complexity in frontend code

### Neutral
- Payment Explorer now shows demo-generated payments alongside any production-like flows

##  ISO 20022 Message Types in Nexus

Per NotebookLM research (Feb 4, 2026), Nexus uses the following ISO 20022 message types:

### Release 1 (Currently Implemented)

| Message | Purpose | Direction |
|---------|---------|-----------|
| **pacs.008** | FI to FI Customer Credit Transfer | Source PSP → Nexus → Dest PSP |
| **pacs.002** | Payment Status Report (ACCC/RJCT/BLCK) | Dest PSP → Nexus → Source PSP |
| **acmt.023** | Identification Verification Request (Proxy/Account Resolution) | Source PSP → PDO or Dest PSP |
| **acmt.024** | Identification Verification Report | PDO or Dest PSP → Source PSP |
| **camt.054** | Bank to Customer Debit Credit Notification (Reconciliation) | Nexus → IPS Operators |

### Optional (Destination SAP Integration)

| Message | Purpose | Integration Model |
|---------|---------|-------------------|
| **camt.103** | Create Reservation (Debit Authorization) | Method 2a: Dest IPS → D-SAP |
| **pain.001** | Customer Credit Transfer Initiation | Method 3: Dest IPS acts as corporate client to D-SAP |

### Future Roadmap (Not in Release 1)

| Message | Purpose | Planned Use |
|---------|---------|-------------|
| **pacs.004** | Payment Return | Dedicated return message (currently interim via pacs.008 with original UETR in RemittanceInformation) |
| **pacs.028** | FI to FI Payment Status Request | Query payment status if pacs.002 not received within timeout |
| **camt.056** | FI to FI Payment Cancellation Request | Recall funds after settlement (fraud/error cases) |
| **camt.029** | Resolution of Investigation | Response to camt.056 recall request |

### Complete Schema Library

The project now includes 100 ISO 20022 XSD schemas in `specs/iso20022/`:
- **pain.*** - Payment Initiation messages (customer-to-bank)
- **camt.*** - Cash Management messages (account statements, reconciliation, reservations)
- **acmt.*** - Account Management messages (verification, mandate management)
- **pacs.*** - Payment Clearing and Settlement messages (FI-to-FI transfers, returns, status)

This comprehensive library enables future implementation of additional Nexus message types and facilitates message validation against official ISO 20022 standards.

## Technical Implementation

```typescript
// api.ts - pacs.008 XML submission
export async function submitPacs008(params: Pacs008Params): Promise<Pacs008Response> {
    const xml = buildPacs008Xml(params);
    const response = await fetch(`${API_BASE}/v1/iso20022/pacs008?pacs002Endpoint=${callbackUrl}`, {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: xml,
    });
    // ... error handling
}
```

```xml
<!-- Generated pacs.008 structure -->
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
  <FIToFICstmrCdtTrf>
    <GrpHdr>...</GrpHdr>
    <CdtTrfTxInf>
      <PmtId><UETR>...</UETR></PmtId>
      <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
      <XchgRate>11234.56</XchgRate>
      <CtrctId>quote-id-here</CtrctId>
      ...
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>
```

## References

- NotebookLM: Nexus Global Payments Blueprint (Feb 4, 2026)
- ADR-012: Quote Snapshot Architecture
- Nexus Docs: https://docs.nexusglobalpayments.org/messaging-and-translation/message-pacs.008-fi-to-fi-customer-credit-transfer
