# Creator Revenue Aggregator — Phase 1 (90-Day) Delivery Plan

## Planning assumptions
- Timeline: **13 one-week sprints** (~90 days)
- Scope locked to **Phase 1 PRD only** (no Phase 2/3 features)
- Architecture: Node.js (Express + TypeScript), Next.js SPA, PostgreSQL (CRS schema), Redis/BullMQ, S3
- Quality principles: **SOLID, GRASP, DRY, KISS, YAGNI, append-only QuickBooks sync**

---

## Sprint 1 (Week 1): Foundation, project skeleton, and architecture guardrails
**Primary stories:** Platform setup groundwork for US-101/102/103, US-503

### Deliverables
- Monorepo/app structure for backend, frontend, workers
- Core domain modules and interface contracts
- Environment/config management + secret boundaries
- Initial PostgreSQL migration framework and base tables (`clients`, `platform_connections`, `transactions`, `coa_mappings`)
- BullMQ queue bootstrap and worker scaffolding
- ADRs for append-only sync and source-of-truth policy (QuickBooks)

### SOLID/GRASP patterns used
- **Dependency Inversion Principle (DIP):** define `IPlatformAdapter`, `ISyncProvider`, `IReceiptStore`, `ITokenStore` interfaces before implementations
- **Interface Segregation Principle (ISP):** split large services into focused ports (`IOAuthService`, `IIngestionScheduler`, `IValidationService`)
- **Factory Pattern:** adapter factory for platform-specific ingestion clients
- **Hexagonal (Ports & Adapters):** domain logic isolated from APIs/DB/S3/QB
- **Controller + Service + Repository (GRASP):** clear responsibility boundaries

---

## Sprint 2 (Week 2): OAuth onboarding + token lifecycle baseline
**Primary stories:** US-101, parts of US-304/US-901

### Deliverables
- OAuth connection flow for YouTube, Patreon, Stripe, Shopify, Gumroad, Substack (as available)
- Client invite + platform authorization workflow
- Encrypted token storage (AES-256 at app layer + DB storage)
- Token refresh plumbing and expiration metadata tracking
- UI indicators for connected vs pending platforms

### SOLID/GRASP patterns used
- **Strategy Pattern:** per-platform OAuth strategy while preserving uniform auth contract
- **Open/Closed Principle (OCP):** add platforms by adding strategy classes, no change to orchestrator
- **Single Responsibility Principle (SRP):** separate token encryption, OAuth callback handling, and persistence
- **Template Method Pattern:** shared OAuth flow with platform-specific hooks (scope, token endpoint)

---

## Sprint 3 (Week 3): Nightly ingestion pipeline + job orchestration
**Primary stories:** US-102

### Deliverables
- 2 AM UTC scheduler for full + incremental pulls
- BullMQ ingestion jobs per client/platform with retries + exponential backoff
- Rate-limit handling and throttling policy
- Raw API response archival to S3 for compliance/debugging
- Idempotent ingest guard via `platform_transaction_id`

### SOLID/GRASP patterns used
- **Command Pattern:** each ingestion run represented as a queue job command
- **Chain of Responsibility:** ingest stages (fetch → normalize → validate → persist) as composable handlers
- **SRP:** separate scheduler, worker executor, and retry policy modules
- **Polymorphism:** adapter polymorphism for platform fetch behavior

---

## Sprint 4 (Week 4): CRS adapters + validation gates
**Primary stories:** US-103, US-602

### Deliverables
- Implement adapters for YouTube, Patreon, Stripe, Gumroad, Shopify, Substack to CRS fields
- Validation gates for CRS invariants (`gross - fee ≈ net`, non-negative values, date constraints)
- Red-tab-ready validation error payload model
- Precision/tolerance handling for financial math
- Unit tests for adapter edge cases (refunds, partial payouts, tax stripping)

### SOLID/GRASP patterns used
- **Adapter Pattern (explicit):** platform payloads transformed into CRS canonical model
- **Specification Pattern:** reusable validation rules (`GrossNonNegativeSpec`, `NetEquationSpec`)
- **Liskov Substitution Principle (LSP):** all adapters interchangeable behind `IPlatformAdapter`
- **Pure Domain Service (GRASP High Cohesion):** transformation/validation separated from transport concerns

---

## Sprint 5 (Week 5): Deduplication intelligence + source hierarchy
**Primary stories:** US-601

### Deliverables
- SHA-256 deduplication fingerprint generation service
- `platform_hierarchy` + `deduplication_overrides` schema and repository
- Duplicate detection flow (primary vs processor exclusion)
- Yellow-tab flags for potential duplicates and reviewer decision capture
- “Show Excluded Duplicates” support model

### SOLID/GRASP patterns used
- **Policy/Strategy Pattern:** dedup decision policy (global hierarchy + client override)
- **Repository Pattern:** dedup rules and hierarchy retrieved independent of DB specifics
- **OCP:** add new hierarchy rules without changing dedup orchestrator
- **Information Expert (GRASP):** dedup domain service owns matching and precedence logic

---

## Sprint 6 (Week 6): Receipt snapshot service + audit document pipeline
**Primary stories:** US-201

### Deliverables
- HTML template to PDF generation workflow (Puppeteer)
- Snapshot generation triggered post-ingestion normalization
- S3 storage pathing standard and retention metadata
- Access logging hooks and audit metadata model
- “View Source” data contract for UI and sync integration

### SOLID/GRASP patterns used
- **Builder Pattern:** construct receipt document model incrementally from CRS + metadata
- **Facade Pattern:** single `ReceiptSnapshotService` over template engine, renderer, and S3 API
- **DIP:** storage port abstraction to avoid hard coupling to S3 SDK in domain logic
- **SRP:** isolate rendering, storage, and audit logging concerns

---

## Sprint 7 (Week 7): Review Queue backend + confidence engine + Green tab UX
**Primary stories:** US-301, US-302 (Green path)

### Deliverables
- Confidence scoring engine (rule-based only for Phase 1)
- Transaction state machine (`pending_review` → `approved` → `synced`)
- Green-tab API + grouped transaction summaries
- Bulk-approve endpoint with atomic transactional update + audit log
- 5-minute undo window before sync dispatch

### SOLID/GRASP patterns used
- **State Pattern:** review workflow state transitions with explicit guards
- **Rule Object Pattern:** confidence rules encapsulated and independently testable
- **Command Pattern:** bulk-approve operation as transactional command
- **SRP + ISP:** separate scoring, review actions, and audit logging services

---

## Sprint 8 (Week 8): Yellow/Red tab workflows + manual controls
**Primary stories:** US-303, US-304

### Deliverables
- Yellow-tab APIs for first-time mapping, duplicate adjudication, variance notes
- Red-tab APIs for OAuth errors, API failures, validation exceptions
- Override-and-approve flow with mandatory audit metadata
- Renewal trigger actions and error-specific resolution paths
- Frontend interaction models for review/edit/reject decisions

### SOLID/GRASP patterns used
- **Mediator Pattern:** coordinate review actions among mapping, dedup, validation, and status services
- **Template Method:** shared review action pipeline with specialized behaviors by flag type
- **OCP:** add new review flag category without changing existing handlers
- **Controller (GRASP):** thin endpoints delegating to use-case services

---

## Sprint 9 (Week 9): Multi-client dashboard + cross-client bulk actions
**Primary stories:** US-401, US-402

### Deliverables
- Practice-level dashboard aggregates (pending count, OAuth health, sync status)
- Multi-client sorting/filtering + drill-down routing
- Cross-client bulk approve orchestration via BullMQ
- Combined CSV export pipeline to S3 + signed download URL
- Progress tracking API for long-running bulk jobs

### SOLID/GRASP patterns used
- **CQRS-lite read model:** optimized aggregate queries for dashboard without polluting write model
- **Observer/Event Pattern:** job status events for progress updates
- **Facade Pattern:** bulk action orchestrator over approval + queue + reporting services
- **SRP:** separate read aggregation service from transaction write workflows

---

## Sprint 10 (Week 10): Accrual engine + payout calendars + bank matching
**Primary stories:** US-501, US-502

### Deliverables
- Per-client accounting mode (`accrual` vs `cash`) with workflow branching
- Payout schedule table and expected deposit date calculator
- Bank CSV ingestion + fuzzy matching (`amount ± $1`, `date ± 5 days`)
- Yellow-flag generation for ambiguous/unmatched deposits
- Proposed journal-entry models for A/R creation and clearance

### SOLID/GRASP patterns used
- **Strategy Pattern:** accrual vs cash posting strategies
- **Domain Service Pattern:** payout expectation calculator and matching engine
- **Specification Pattern:** matching criteria specifications (amount/date/platform)
- **LSP:** interchangeable accounting strategies for consistent orchestration contract

---

## Sprint 11 (Week 11): QuickBooks append-only sync + attachment integration
**Primary stories:** US-202, US-503

### Deliverables
- QuickBooks OAuth integration and per-client company linkage
- Append-only sync worker with idempotency pre-checks (`external_id`/fingerprint)
- JournalEntry payload generation mapped from CRS + COA rules
- Post-sync read-back verification and persistence of `qb_entry_id`
- Attachable endpoint integration for receipt snapshots + fallback memo link

### SOLID/GRASP patterns used
- **Anti-Corruption Layer (ACL):** isolate QuickBooks API specifics from core domain
- **Idempotency Key Pattern:** deterministic transaction fingerprinting
- **Template Method:** shared sync flow (validate → create → verify → attach)
- **DIP:** `IAccountingProvider` interface for future-proofing while implementing QB only in Phase 1

---

## Sprint 12 (Week 12): Void detection, correction loop, OAuth health automation
**Primary stories:** US-504, US-901-related monitoring

### Deliverables
- Daily QB read-back job to detect voided entries
- Red-tab correction workflow (voided status → edited → re-sync as new entry)
- OAuth health monitoring job + 30/14/7/day reminder scheduler
- Auth renewal links and backfill trigger flow for expired windows
- Operational alerting and runbook drafts

### SOLID/GRASP patterns used
- **Saga/Process Manager Pattern:** long-running correction and renewal workflows across services
- **Observer Pattern:** state-change events trigger notifications and backfill jobs
- **SRP:** separate detectors (void monitor/token monitor) from remediators
- **Protected Variations (GRASP):** shield domain from external API volatility through gateways

---

## Sprint 13 (Week 13): Hardening, performance, security, beta readiness
**Primary stories:** NFR completion, beta launch readiness

### Deliverables
- Performance tuning for dashboard/read queries and sync throughput
- Security pass (RBAC checks, token rotation behavior, secrets handling, audit coverage)
- End-to-end regression suite for ingestion → review → sync critical paths
- Beta operations toolkit (support playbooks, observability dashboards, incident SOPs)
- Launch checklist and go/no-go review against Phase 1 KPIs

### SOLID/GRASP patterns used
- **Decorator Pattern:** non-invasive observability wrappers (metrics/logging/tracing) around core services
- **Proxy Pattern:** signed URL access and guarded resource access patterns
- **Fail-Fast + Guard Clauses (KISS):** explicit validation and invariant checks at module boundaries
- **GRASP Low Coupling/High Cohesion:** refactor hotspots to keep modules independently deployable/testable

---

## Cross-sprint engineering standards
- **Append-only QuickBooks policy:** never delete synced entries; corrections use void-and-replace only
- **Idempotency everywhere:** ingestion, approvals, and sync jobs must safely retry
- **Auditability by design:** approvals, overrides, sync attempts, and receipt access logged
- **Queue-first reliability:** all ingestion/sync/bulk workflows dispatched through BullMQ
- **YAGNI enforcement:** no ML categorization, no Xero integration, no webhook-only real-time mode in Phase 1

## Milestone mapping
- **Month 1 (Sprints 1–4):** Foundation + OAuth + ingestion + CRS normalization
- **Month 2 (Sprints 5–8):** Dedup + receipt snapshots + review queue
- **Month 3 (Sprints 9–13):** Multi-client operations + accrual/sync + hardening + beta prep
