# Payments Explorer - Full Message Flow Display Fixes

## Problem Statement

The PaymentsExplorer at `http://localhost:8080/explorer` was not displaying the complete ISO 20022 message flows including:
1. All 11 message types
2. Back-and-forth message flows between actors
3. Proxy resolution messages (acmt.023/acmt.024)

## Root Causes Identified

### 1. Missing Message Types in Frontend
The `MessageInspector.tsx` component was missing 3 message types:
- `camt.029` - Resolution of Investigation
- `pacs.028` - Payment Status Request  
- `pain.001` - Customer Credit Transfer Initiation

### 2. Proxy Resolution Events Not Linked to Payments
Per the official Nexus documentation:
> "Note: There is no link or shared ID between the proxy resolution or the account verification and the following payment instruction."

Proxy resolution (acmt.023/acmt.024) uses a **correlation_id**, while payments use a **UETR**. The PaymentsExplorer was only searching by UETR, so addressing events were not found.

### 3. Missing correlation_id API Support
The backend API did not support searching for events/messages by correlation_id.

## Fixes Applied

### 1. Updated MessageInspector.tsx (All 11 Message Types)

**Before:** 9 message types
**After:** 11 message types (added camt.029, pacs.028, pain.001; removed incorrect camt.104)

```typescript
const MESSAGE_METADATA: Record<string, {
    displayName: string;
    step: number;
    color: string;
    description: string;
}> = {
    "pacs.008": { displayName: "FI to FI Customer Credit Transfer", step: 15, color: "blue", ... },
    "pacs.002": { displayName: "Payment Status Report", step: 17, color: "green", ... },
    "acmt.023": { displayName: "Identification Verification Request", step: 7, color: "violet", ... },
    "acmt.024": { displayName: "Identification Verification Report", step: 8, color: "grape", ... },
    "camt.054": { displayName: "Bank to Customer Notification", step: 17, color: "cyan", ... },
    "camt.103": { displayName: "Create Reservation", step: 10, color: "teal", ... },
    "camt.056": { displayName: "FI to FI Payment Cancellation Request", step: 0, color: "orange", ... },
    "camt.029": { displayName: "Resolution of Investigation", step: 0, color: "pink", ... },
    "pacs.004": { displayName: "Payment Return", step: 0, color: "red", ... },
    "pacs.028": { displayName: "Payment Status Request", step: 0, color: "indigo", ... },
    "pain.001": { displayName: "Customer Credit Transfer Initiation", step: 0, color: "lime", ... },
};
```

### 2. Updated payments_explorer.py (Backend API)

Added `correlation_id` query parameter to both endpoints:

#### GET /v1/payments/{uetr}/events
- Now accepts optional `correlation_id` parameter
- Returns addressing events (acmt.023/acmt.024) when correlation_id is provided
- Events marked with `is_addressing_event: true` flag

#### GET /v1/payments/{uetr}/messages
- Now accepts optional `correlation_id` parameter
- Returns addressing messages (acmt.023/acmt.024) when correlation_id is provided
- All messages sorted by timestamp for proper chronological display

### 3. Updated api.ts (Frontend API Client)

```typescript
// Added optional correlationId parameter
export async function getPaymentMessages(uetr: string, correlationId?: string) {
    const url = correlationId 
        ? `/v1/payments/${uetr}/messages?correlation_id=${correlationId}`
        : `/v1/payments/${uetr}/messages`;
    return fetchJSON<...>(url);
}

export async function getPaymentEvents(uetr: string, correlationId?: string) {
    const url = correlationId
        ? `/v1/payments/${uetr}/events?correlation_id=${correlationId}`
        : `/v1/payments/${uetr}/events`;
    return fetchJSON<...>(url);
}
```

### 4. Updated PaymentsExplorer.tsx (UI)

- Added correlation_id state management
- Added correlation_id input field (optional)
- Passes correlation_id to API calls when provided
- URL query param support: `?uetr=XXX&correlation_id=YYY`

## Complete Message Flow Display

The PaymentsExplorer now displays all message flows per the official Nexus specification:

### Phase 1: Proxy Resolution (Pre-payment)
| Step | Actor | Message | Direction |
|------|-------|---------|-----------|
| 8 | Source PSP → Nexus | acmt.023 | outbound |
| 8 | Nexus → Source PSP | acmt.024 | inbound |

### Phase 2: Payment Initiation
| Step | Actor | Message | Direction |
|------|-------|---------|-----------|
| 14 | Source PSP → S-SAP | camt.103 | outbound |
| 15 | Source PSP → Nexus | pacs.008 | outbound |
| 15 | Nexus → Dest PSP (transformed) | pacs.008 | outbound |
| 16 | D-SAP | camt.103 | outbound |

### Phase 3: Settlement Confirmation
| Step | Actor | Message | Direction |
|------|-------|---------|-----------|
| 17 | Dest PSP → Nexus | pacs.002 | inbound |
| 17 | Nexus → Source PSP | pacs.002 | inbound |
| 17 | SAPs | camt.054 | inbound |

### Future/Roadmap Messages
| Message | Purpose |
|---------|---------|
| pacs.004 | Payment Return |
| pacs.028 | Payment Status Request/Enquiry |
| camt.056 | Payment Cancellation Request (Recall) |
| camt.029 | Resolution of Investigation |
| pain.001 | Customer Credit Transfer Initiation |

## Usage Instructions

### Basic Search (Payment Only)
1. Enter UETR in search field
2. Click "Search"
3. See payment events and messages

### Full Flow Search (Including Proxy Resolution)
1. Enter UETR in search field
2. Enter Correlation ID from proxy resolution (optional)
3. Click "Search"
4. See complete flow including acmt.023/acmt.024

### Direct URL Linking
```
http://localhost:8080/explorer?uetr=f47ac10b-58cc-4372-a567-0e02b2c3d479&correlation_id=abc123
```

## Reference

Per [Nexus Official Documentation](https://docs.nexusglobalpayments.org):

> "Note: There is no link or shared ID between the proxy resolution or the account verification and the following payment instruction."

This is by design in the Nexus specification. Proxy resolution and payment are intentionally separate processes that can be linked by the PSP for audit purposes, but are not linked by the protocol itself.

## Files Modified

1. `services/demo-dashboard/src/components/MessageInspector.tsx` - Added missing message types
2. `services/nexus-gateway/src/api/payments_explorer.py` - Added correlation_id support
3. `services/demo-dashboard/src/services/api.ts` - Updated API client
4. `services/demo-dashboard/src/pages/PaymentsExplorer.tsx` - Added UI for correlation_id

## Testing Checklist

- [ ] Search by UETR only shows payment messages
- [ ] Search by UETR + correlation_id shows all messages including addressing
- [ ] All 11 message types display correctly
- [ ] XML content is properly formatted and syntax highlighted
- [ ] Messages are sorted chronologically
- [ ] Actor timeline shows all events
