# ADR-001: Source of Truth and Append-Only Accounting

- **Status:** Accepted
- **Date:** 2026-04-28
- **Owner:** Engineering

## Context
The Creator Revenue Aggregator syncs normalized CRS transactions from PostgreSQL into QuickBooks Online.

Financial workflows require a tamper-evident, auditable lifecycle for every posting event. If we allow destructive writes (updates/deletes) in downstream accounting records, we risk:
- broken reconciliation trails,
- loss of historical context,
- opaque corrections that are hard to defend during audit,
- accidental data drift between internal records and external ledgers.

## Decision
1. **CRS (PostgreSQL) is the immutable Source of Truth** for ingestion, validation, approvals, and sync state.
2. **QuickBooks synchronization is idempotent and append-only**:
   - no update-in-place of previously synced accounting entries,
   - no deletion of previously synced accounting entries.
3. Corrections follow a **reverse-and-reissue** model:
   - create a reversing entry for the prior posted amount,
   - create a new corrected entry,
   - preserve linkage metadata for both records in CRS/audit logs.

## Consequences
### Positive
- Preserves complete, chronological audit trail across CRS and QuickBooks.
- Supports reconciliation integrity (historical entries remain inspectable).
- Improves operational safety by preventing destructive sync behavior.
- Enables deterministic idempotency checks for retries/replays.

### Trade-offs
- More records over time due to reversal + replacement entries.
- Correction workflows require explicit UX and operational handling.
- Reporting layers must account for reversal semantics.

## Implementation Notes (Phase 1)
- Enforce idempotency keys for outbound QuickBooks sync operations.
- Persist sync status and external references in CRS tables.
- Never issue destructive QuickBooks operations as part of normal sync.
- For changed transactions, emit reversing + new entries rather than editing prior records.

## Compliance Rationale
Append-only accounting behavior aligns with auditability requirements and reduces risk during financial reviews, month-end close, and external audits.
