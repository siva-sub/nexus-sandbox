# Assumption 11: pacs.008 Return Payments in Release 1

**Assumption ID**: A30 - A33  
**Category**: Post-Settlement Returns  
**Specification Reference**: NotebookLM Query 2026-02-03 (Nexus Book)  

---

## Summary

In Nexus Release 1, return payments are processed using a **new pacs.008 message** sent in the reverse direction, rather than the traditional `pacs.004` PaymentReturn message. The original UETR is referenced via the `NexusOrgnlUETR:` prefix in the remittance information field.

## Assumptions

### A30: pacs.004 is NOT Supported in Release 1

**Description**: The ISO 20022 `pacs.004` (PaymentReturn) message type is not supported in Nexus Release 1.

**Source**: NotebookLM 2026-02-03 - *"pacs.004 is not yet supported. Returns use new pacs.008."*

**Sandbox Implementation**:
- `POST /v1/iso20022/pacs004` returns `501 Not Implemented`
- Response includes guidance to use `pacs.008` with `NexusOrgnlUETR:` prefix
- `X-Nexus-Feature-Status: FUTURE` header indicates planned Release 2 support

---

### A31: camt.056 is NOT Supported in Release 1

**Description**: The ISO 20022 `camt.056` (Payment Cancellation Request) message type is not supported in Nexus Release 1. Recall requests use a manual workflow via the Nexus Service Desk.

**Source**: NotebookLM 2026-02-03 - *"camt.056 is not implemented in Nexus Release 1. Recalls are handled via manual Service Desk workflow."*

**Sandbox Implementation**:
- `POST /v1/iso20022/camt056` returns `501 Not Implemented`
- Response includes guidance to use the Service Desk portal
- Mock Service Desk UI available at `/service-desk`

---

### A32: Return Payments Use NexusOrgnlUETR Prefix

**Description**: When initiating a return payment in Release 1, the Destination PSP sends a new `pacs.008` message in the reverse direction. The original transaction is referenced by including the original UETR in the remittance information with the `NexusOrgnlUETR:` prefix.

**Source**: NotebookLM 2026-02-03 - *"Include original UETR prefixed with NexusOrgnlUETR:"*

**Message Format**:
```xml
<CdtTrfTxInf>
  <RmtInf>
    <AddtlRmtInf>NexusOrgnlUETR:91398cbd-0838-453f-b2c7-536e829f2b8e</AddtlRmtInf>
  </RmtInf>
</CdtTrfTxInf>
```

**Sandbox Implementation**:
- Gateway parses `NexusOrgnlUETR:` from `AddtlRmtInf` or `Ustrd` elements
- Regex pattern: `NexusOrgnlUETR:([a-f0-9\-]{36})`
- When detected, `RETURN_LINKED` event is emitted to Message Observatory
- Original and return UETRs are associated for reconciliation

---

### A33: FX Risk Allocation for Returns

**Description**: The allocation of FX risk on return payments depends on which party caused the error or delay.

**Source**: NotebookLM 2026-02-03 - Dispute Resolution section

| Fault Party | FX Risk Bearer | Amount to Return |
|-------------|---------------|------------------|
| Source PSP (sender error, mistaken payment) | Source PSP | Exact Destination Currency credited |
| Destination PSP (late reject, processing error) | Destination PSP | Exact Source Currency originally sent |

**Sandbox Implementation**:
- Service Desk mock portal includes FX risk allocation guidance
- Workflow tab documents the risk allocation table

---

## Verification

| Test Case | Expected Behavior | Verified |
|-----------|-------------------|----------|
| Submit pacs.008 with NexusOrgnlUETR in remittance info | RETURN_LINKED event emitted | ✅ |
| Query payment events for original UETR | Shows linked return payment | ✅ |
| Call POST /v1/iso20022/pacs004 | 501 Not Implemented | ✅ |
| Call POST /v1/iso20022/camt056 | 501 Not Implemented | ✅ |
| Access /service-desk portal | Disputes and Recalls tabs visible | ✅ |

---

## Related Files

- `services/nexus-gateway/src/api/iso20022.py` - NexusOrgnlUETR parsing
- `services/nexus-gateway/src/api/returns.py` - 501 responses for pacs.004/camt.056
- `services/demo-dashboard/src/pages/ServiceDesk.tsx` - Mock portal UI
- `docs/UNHAPPY_FLOWS.md` - Implementation status table
- `docs/INTEGRATION_GUIDE.md` - Actor testing guide
