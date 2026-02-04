# Nexus Sandbox: Unhappy Flow Scenarios

> Reference: Nexus Scheme Rulebook, ISO 20022 Message Guidelines

This document catalogs all exception scenarios, error codes, and handling requirements for the Nexus Sandbox implementation.

---

## 1. pacs.002 Status Codes

The `pacs.002` Payment Status Report indicates transaction outcome:

| Code | Name | Description |
|------|------|-------------|
| `ACCC` | Accepted Settlement Completed | Payment successful, recipient credited |
| `RJCT` | Rejected | Payment failed, funds reversed |
| `BLCK` | Blocked/Pending | Non-time-critical payment held for manual review |

---

## 2. Rejection Reason Codes

When status is `RJCT`, a reason code from `ExternalStatusReason1Code` is required:

### Timeout and System Errors

| Code | Name | Description | Used By |
|------|------|-------------|---------|
| `AB01` | AbortedClearingTimeout | Clearing process timed out | IPS |
| `AB03` | AbortedSettlementTimeout | Settlement timed out (generic) | IPS, SAP |
| `AB04` | AbortedSettlementFatalError | FX rate mismatch with Quote ID | **Nexus Gateway** |
| `AB05` | TimeoutCreditorAgent | Timeout at Destination PSP | IPS |
| `AB06` | TimeoutInstructedAgent | Timeout at Destination SAP | IPS |
| `TM01` | InvalidCutOffTime | AcceptanceDateTime too old | IPS |

### Account and Addressing Errors

| Code | Name | Description | Used By |
|------|------|-------------|---------|
| `AC01` | IncorrectAccountNumber | Account not found | Destination PSP |
| `AC04` | ClosedAccountNumber | Account closed | Destination PSP |
| `AC06` | BlockedAccount | Account frozen/blocked | Destination PSP |
| `BE23` | AccountProxyInvalid | Proxy not registered | PDO |
| `AGNT` | IncorrectAgent | PSP not onboarded to Nexus | Nexus Gateway |
| `AB08` | OfflineCreditorAgent | Destination PSP offline | PDO |

### Validation and Reference Data Errors

| Code | Name | Description | Used By |
|------|------|-------------|---------|
| `RC11` | InvalidIntermediaryAgent | SAP doesn't match FXP quote | **Nexus Gateway** |
| `DUPL` | DuplicatePayment | UETR already processed | Nexus Gateway, IPS |
| `CH21` | RequiredCompulsoryElementMissing | Mandatory element missing | Nexus Gateway |
| `FF01` | FileFormatError | XML validation failure | Nexus Gateway |

### Liquidity and Regulatory Errors

| Code | Name | Description | Used By |
|------|------|-------------|---------|
| `AM02` | NotAllowedAmount | Exceeds transaction limit | IPS, PSP |
| `AM04` | InsufficientFunds | FXP lacks SAP balance | Destination SAP |
| `RR04` | RegulatoryReason | Sanctions/AML block | SAP, PSP |
| `FRAD` | FraudulentOrigin | Suspected fraud | PSP |

---

## 3. Exception Categories

### A. Rejects (Immediate Failure)

**Trigger Points:**
- Source SAP: Insufficient Source PSP funds
- Nexus Gateway: Quote expired (AB04), validation failure
- Destination SAP: FXP insufficient funds (AM04)
- Destination PSP: Account closed (AC04), sanctions hit (RR04)

**Handling Flow:**
```
Rejection occurs → pacs.002 RJCT flows backward
→ Source IPS reverses/cancels settlement
→ Source PSP refunds Sender
```

### B. Returns (Post-Settlement Reversal)

**When ACCC confirmed but funds need returning:**

- Recipient refuses funds
- Payment sent in error
- Incorrect beneficiary

**Current Process (pacs.004 not yet supported):**
1. Destination PSP initiates **new pacs.008** in reverse direction
2. Reference original UETR in `RemittanceInformation`:
   ```xml
   <AddtlRmtInf>NexusOrgnlUETR:91398cbd-0838-453f-b2c7-536e829f2b8e</AddtlRmtInf>
   ```

**FX Risk Allocation:**

| Scenario | Who Takes FX Risk | Amount to Return |
|----------|-------------------|------------------|
| Source PSP fault (sender error) | Source PSP | Exact Destination Currency received |
| Destination PSP fault (late reject) | Destination PSP | Exact Source Currency sent |

### C. Recall Requests

**Current Process (Manual):**
1. Source PSP logs "Payment Recall Request" in Nexus Service Desk
2. Destination PSP reviews within SLA
3. If accepted → triggers Return flow
4. If rejected → provides reason code

**Future (Automated):**
- `camt.056` FI to FI Payment Cancellation Request
- `camt.029` Resolution of Investigation
- `pacs.004` Payment Return

### D. Disputes

**Escalation Path:**
1. Bilateral resolution via Service Desk
2. Nexus Dispute Resolution Committee
3. External arbitration

### E. Timeouts

| Priority | Behavior |
|----------|----------|
| `NORM` (Normal) | Nexus waits for Destination IPS; IPS sends AB01/AB03 on local timeout |
| `HIGH` (POS/QR) | Nexus timer; proactively rejects with negative pacs.002 if SLA breached |

**High Priority Settlement Certainty:**
- Destination IPS must reverse settlement even if PSP credited locally
- Ideally: settlement conditional on Nexus confirmation

### F. Investigations (Missing Status)

**If no pacs.002 received:**

1. Source PSP resends original pacs.008 (same Message ID, same UETR)
2. Response:
   - If result cached → resend stored pacs.002
   - If never received → reject with `TM01` (too old)

**Future:** `pacs.028` Status Request

---

## 4. Sandbox Implementation Status

| Category | Status | Implementation |
|----------|--------|----------------|
| RJCT with reason codes | ✅ Implemented | Gateway validation (iso20022.py) |
| BE23 (Proxy not found) | ✅ Implemented | PDO simulator returns BE23 code |
| AB04 (Quote expired) | ✅ Implemented | Quote expiry check in gateway |
| AM02 (Amount limit) | ✅ Implemented | Amounts > 50K trigger AM02 |
| AM04 (Insufficient funds) | ✅ Implemented | Amounts ending in 99999 trigger |
| AC04 (Closed account) | ✅ Implemented | Trigger value: +60999999999 |
| RR04 (Regulatory block) | ✅ Implemented | Trigger value: +62999999999 |
| RC11 (Invalid SAP) | ✅ Implemented | SAP mismatch in validation |
| DUPL (Duplicate) | ✅ Implemented | Duplicate UETR check |
| Returns via pacs.008 | ✅ Implemented | `NexusOrgnlUETR:` prefix parsing in iso20022.py |
| Recall via Service Desk | ✅ Implemented | Mock portal at `/service-desk` |
| Disputes Portal | ✅ Implemented | Mock portal at `/service-desk` |
| camt.056 automation | 🔮 Release 2 | Returns 501 with guidance (per Nexus Release 1 spec) |
| pacs.004 returns | 🔮 Release 2 | Returns 501 with guidance (per Nexus Release 1 spec) |

## 5. Test Trigger Values

Use these values in the sandbox to trigger specific error scenarios:

| Scenario | Trigger | Expected Code | Where |
|----------|---------|---------------|-------|
| Proxy not found | `+66999999999` | BE23 | Phone number |
| Account closed | `+60999999999` | AC04 | Phone number |
| Regulatory block | `+62999999999` | RR04 | Phone number |
| Amount limit | Amount > 50,000 | AM02 | Amount field |
| Insufficient funds | Amount ending in 99999 | AM04 | Amount field |
| Quote expired | Wait 10+ minutes | AB04 | Time-based |
| Duplicate payment | Resubmit same UETR | DUPL | Re-submit |

## 6. Demo Page

Navigate to `/demo` in the dashboard to access the **Demo Scenarios** page with:
- Pre-configured test buttons for each error type
- Complete trigger values reference table
- Direct links to payment flow

---

## References

- [Nexus pacs.002 Specification](https://docs.nexusglobalpayments.org/messaging-and-translation/message-pacs.002-payment-status-report)
- [ISO 20022 External Code Set](https://www.iso20022.org/catalogue-messages)
- [ADR-011 Developer Observability](../adr/ADR-011-developer-observability.md)

---

Created by [Siva Subramanian](https://linkedin.com/in/sivasub987)

