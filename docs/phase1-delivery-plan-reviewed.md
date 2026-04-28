# Creator Revenue Aggregator — Phase 1 Delivery Plan (Reviewed & Corrected)

## 1) Current sprint status vs PRD (as of 2026-04-28)

### Implemented (partial)
- **Sprint 1 foundation (partial):** domain ports/entities, migration runner, initial schema, repository skeletons, queue/worker scaffolding, basic orchestration.  
- **Sprint 3/4 fragments (partial):** ingestion orchestration, validator, and adapter factory contracts exist, but platform adapters are mostly placeholders.

### Not yet implemented (PRD-critical)
- OAuth onboarding and token lifecycle (US-101, US-901)
- Real platform adapters for YouTube/Patreon/Gumroad/Substack/Shopify/Stripe (US-102/103)
- Receipt snapshot generation + S3 retention/access logs (US-201)
- Review Queue Green/Yellow/Red UI and full workflows (US-301..304)
- Multi-client dashboard and bulk actions (US-401..403)
- Accrual engine and bank matching (US-501..502)
- QuickBooks OAuth, append-only sync, attachable docs, read-back/void detection (US-202, US-503, US-504)
- Dedup hierarchy tables/rules + overrides (US-601)

---

## 2) Discrepancies, violations, and race/concurrency risks found in `src/`

## A. PRD deviations
1. **Adapters are not implemented for in-scope platforms.** Factory routes supported platforms to `NotImplementedPlatformAdapter`, which always fails.  
2. **Ingestion date window is incorrect.** Orchestrator fetches only `today` (`fromDate=toDate=today`) rather than nightly prior-month full pull + daily incremental logic in PRD.  
3. **No S3 raw-response archival in ingestion path.** PRD requires compliance logging of raw API responses.  
4. **No deduplication engine integration in ingestion pipeline.** PRD requires hash + source hierarchy logic before staging.  
5. **No confidence scoring engine or Green/Yellow/Red categorization routing beyond validation fallback.**

## B. Data-model/schema risks
6. **Migration references `users(id)` but no `users` table exists in scope**, causing migration/runtime risk.  
7. **Uniqueness for platform transaction id is missing `client_id`.** Current unique key (`platform_transaction_id`, `source_platform`) can incorrectly collide across different clients.  
8. **No explicit DB-level checks for key invariants** (`gross >= 0`, `platform_fee >= 0`, `gross-fee≈net`, status domain constraints), despite financial integrity requirements.

## C. Concurrency/race conditions
9. **Global lock scope is too coarse (`nightly-sync-lock`)** and shared across all clients; this serializes unrelated client syncs and can cause avoidable backlog/starvation.  
10. **Lock TTL is fixed (120s) without extension/heartbeat.** Long dispatch loops risk lock expiry while still processing, allowing concurrent overlapping runs.  
11. **No idempotency keying at queue/job dispatch level** for duplicate scheduler triggers (same client/platform can enqueue multiple jobs concurrently).

## D. Engineering-principle assessment
12. **DRY violation:** `IngestionService` and `ManualReviewService` are duplicated thin wrappers over the same validator with no differentiating behavior.  
13. **KISS concern:** heavy abstraction/interfaces are present while core business behavior is still missing; complexity is front-loaded ahead of value delivery.  
14. **YAGNI concern:** some scaffolding for broad architecture exists before implementing PRD-critical flows (OAuth, adapters, QB sync).  
15. **SOLID/GRASP mixed:** boundaries are generally clean (ports/orchestrators/repositories), but incorrect placement/pathing (`src/domain/services/src/...`) indicates cohesion/packaging drift.

---

## 3) Corrected sprint plan (remaining 90-day execution)

## Sprint 1 (Recovery sprint, immediate): Fix correctness blockers first
**Goal:** Make foundation production-safe before adding feature breadth.

### Must deliver
- Fix migration integrity issues:
  - add/create `users` table or remove FK until user model exists
  - change transaction uniqueness to `(client_id, source_platform, platform_transaction_id)`
  - add check constraints for non-negative amounts and status/accounting-mode enums
- Normalize module layout (move `RedlockService` to consistent infrastructure path and fix imports)
- Introduce per-client lock namespace (`nightly-sync-lock:{clientId}`) and lock extension strategy
- Add queue dedup key per `(clientId, platform, dateRange)`

### Exit criteria
- Fresh DB bootstrap succeeds in CI
- Duplicate enqueue for same client/platform/dateRange is ignored
- Parallel sync for different clients works without contention

## Sprint 2: OAuth + token lifecycle (US-101, US-901 baseline)
- Client invite flow, platform connection statuses, encrypted token storage
- Refresh + expiry metadata and first token-health job
- 30/14/7-day reminder scheduling hooks

## Sprint 3: Real ingestion for Big 5 + Stripe (US-102)
- Implement actual adapters (YouTube, Patreon, Gumroad, Substack, Shopify, Stripe)
- Enforce nightly schedules: prior-month full pull on the 1st, daily incremental pulls
- Persist raw responses to S3 with trace metadata

## Sprint 4: CRS normalization + validation gates (US-103, US-602)
- Complete per-platform transform logic
- Validation gate framework + Red tab payload schema
- Unit tests for adapter edge cases (target >=50 per critical adapter)

## Sprint 5: Dedup intelligence (US-601)
- `platform_hierarchy` and `deduplication_overrides`
- SHA-256 fingerprinting + exclusion logic + override workflow model

## Sprint 6: Receipt snapshot pipeline (US-201)
- HTML→PDF render service
- S3 encrypted storage layout + lifecycle policy + access logging hooks

## Sprint 7: Review Queue core (US-301/302)
- Rule-based confidence scoring
- Green tab grouping + bulk approve + audit log + undo window

## Sprint 8: Yellow/Red workflows (US-303/304)
- First-time mapping, duplicate adjudication, variance notes
- OAuth/API/validation resolution workflows and escalation paths

## Sprint 9: Multi-client dashboard + bulk operations (US-401/402/403)
- Practice dashboard aggregates and filters
- Cross-client bulk approvals, progress APIs, combined CSV exports
- Unified search with indexed query path

## Sprint 10: Accrual engine + bank matching (US-501/502)
- Accrual/cash mode branching
- Payout schedule model + expected-date calculator
- CSV bank import + fuzzy match and ambiguity handling

## Sprint 11: QuickBooks append-only sync + receipt attachment (US-202/503)
- QB OAuth, idempotent create flow, post-sync read-back
- Attachable integration + fallback memo link

## Sprint 12: Void-and-replace + OAuth automation hardening (US-504, US-901)
- Daily void detection and correction loop
- Backfill after token renewal
- Operational alerts/runbooks

## Sprint 13: Hardening + beta readiness
- End-to-end regression (ingestion→review→sync)
- Performance/security targets, observability, launch checklist
- KPI go/no-go gate against PRD metrics

---

## 4) Principle guardrails (updated)
- **DRY:** eliminate duplicate wrapper services unless behavior diverges by policy.
- **KISS:** prioritize direct delivery of PRD-critical workflows over speculative abstractions.
- **SOLID/GRASP:** keep ports/adapters, but enforce cohesive module boundaries and clear ownership.
- **YAGNI:** defer Phase 2/3 and optional abstractions until measurable need appears.
- **Reliability-first:** idempotency + lock scoping + append-only QB invariants are mandatory non-negotiables.
