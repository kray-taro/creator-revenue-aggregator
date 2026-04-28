# Sprint 1 Status — Foundation, Project Skeleton, Architecture Guardrails

_Source of truth: `PLANS.md` Sprint 1 (Week 1)._

## 1) Deliverable Checklist (Sprint 1)

### 1. Monorepo/app structure for backend, frontend, workers
- [IN_PROGRESS] Backend/domain/application/infrastructure scaffolding exists under `src/`.  
  Files/services mapped:
  - `src/domain/**`
  - `src/application/**`
  - `src/infrastructure/**`
- [TODO] Frontend Next.js app scaffold not started.
- [TODO] True monorepo tooling (`package.json` workspaces / turbo / nx) not started.

### 2. Core domain modules and interface contracts
- [DONE] Domain entities/contracts established:
  - `src/domain/entities/ITransaction.ts`
  - `src/domain/entities/IClient.ts`
- [DONE] Result pattern established:
  - `src/domain/shared/Result.ts`
- [DONE] Domain service for CRS validation:
  - `src/domain/services/TransactionValidator.ts`
- [DONE] Ports/interfaces established:
  - `src/domain/ports/IPlatformAdapter.ts`
  - `src/domain/ports/ITransactionRepository.ts`
  - `src/domain/ports/IPlatformConnectionRepository.ts`
  - `src/domain/ports/IPlatformStatusRepository.ts`
  - `src/domain/ports/IIngestionJobQueue.ts`
  - `src/domain/ports/IAuditLogger.ts`

### 3. Environment/config management + secret boundaries
- [DONE] Centralized config module present:
  - `src/infrastructure/config/AppConfig.ts`
- [DONE] Environment schema validation present (zod-based fail-fast).
- [IN_PROGRESS] Secrets boundary abstraction is partial:
  - `src/domain/ports/IConfig.ts` + config loader are present,
  - external secret manager boundary (AWS Secrets Manager/Vault adapter) still [TODO].

### 4. Initial PostgreSQL migration framework and base tables (`clients`, `platform_connections`, `transactions`, `coa_mappings`)
- [DONE] SQL table scripts present:
  - `src/infrastructure/database/sql/clients.sql`
  - `src/infrastructure/database/sql/platform_connections.sql`
  - `src/infrastructure/database/sql/transactions.sql`
  - `src/infrastructure/database/sql/platform_statuses.sql`
  - `src/infrastructure/database/sql/coa_mappings.sql`
- [DONE] Repository implementations present:
  - `src/infrastructure/database/PgTransactionRepository.ts`
  - `src/infrastructure/database/PgPlatformConnectionRepository.ts`
  - `src/infrastructure/database/PgPlatformStatusRepository.ts`
- [DONE] Migration runner scaffold present:
  - `src/infrastructure/database/migrations/runner.ts`
  - `src/infrastructure/database/migrations/0001_sprint1_foundation.sql`

### 5. BullMQ queue bootstrap and worker scaffolding
- [DONE] Queue abstraction and BullMQ wrapper:
  - `src/domain/ports/IIngestionJobQueue.ts`
  - `src/infrastructure/workers/bullmq/BullMQIngestionJobQueue.ts`
- [DONE] Worker scaffold:
  - `src/infrastructure/workers/bullmq/IngestionWorker.ts`
- [IN_PROGRESS] Queue bootstrap wiring (actual Worker/Queue initialization entrypoint + Redis connection lifecycle) not yet added.

### 6. ADRs for append-only sync and source-of-truth policy (QuickBooks)
- [DONE] ADR created:
  - `docs/adr/ADR-001-source-of-truth-and-append-only-accounting.md`


## Sprint 1 Completion Snapshot
- **Estimated completion:** **75%**
- **Calculation basis (Sprint 1 deliverables only):**
  - 3/6 deliverables marked [DONE]
  - 3/6 deliverables marked [IN_PROGRESS]
  - 0/6 deliverables marked [TODO]
- **Single biggest risk before Sprint 2 OAuth:**
  - **Environment/config + secret boundary hardening is still [TODO].**
  - Without a production-ready secret management boundary and validated runtime bootstrap path, OAuth token encryption/rotation work in Sprint 2 can be implemented inconsistently across services.

---

## 2) Service/Module Map to Sprint 1 SOLID/GRASP Patterns

### Dependency Inversion Principle (DIP)
- [DONE] Application depends on ports/interfaces, not DB/queue implementations:
  - `src/application/services/IngestionOrchestrator.ts`
  - `src/application/services/SyncOrchestrator.ts`
- [DONE] Ports backing DIP:
  - `src/domain/ports/IPlatformAdapter.ts`
  - `src/domain/ports/ITransactionRepository.ts`
  - `src/domain/ports/IPlatformConnectionRepository.ts`
  - `src/domain/ports/IPlatformStatusRepository.ts`
  - `src/domain/ports/IIngestionJobQueue.ts`
  - `src/domain/ports/IAuditLogger.ts`

### Interface Segregation Principle (ISP)
- [DONE] Focused, separate interfaces for each boundary concern:
  - Adapter: `IPlatformAdapter`
  - Persistence: `ITransactionRepository`, `IPlatformConnectionRepository`, `IPlatformStatusRepository`
  - Queue: `IIngestionJobQueue`
  - Audit: `IAuditLogger`

### Factory Pattern
- [DONE] Adapter factory in:
  - `src/application/factories/PlatformAdapterFactory.ts`

### Hexagonal (Ports & Adapters)
- [DONE] Domain layer has no infrastructure implementation imports.
- [DONE] Infrastructure adapters/repositories implement domain ports:
  - Adapters: `src/infrastructure/adapters/*.ts`
  - Repositories: `src/infrastructure/database/*.ts`
  - Worker queue adapter: `src/infrastructure/workers/bullmq/BullMQIngestionJobQueue.ts`
  - Audit adapter: `src/infrastructure/logging/ConsoleAuditLogger.ts`

### Controller + Service + Repository (GRASP)
- [DONE] Controller/worker layer:
  - `src/infrastructure/workers/bullmq/IngestionWorker.ts`
- [DONE] Service/orchestration layer:
  - `src/application/services/IngestionOrchestrator.ts`
  - `src/application/services/SyncOrchestrator.ts`
  - `src/application/services/IngestionService.ts`
  - `src/application/services/ManualReviewService.ts`
- [DONE] Repository layer:
  - `src/infrastructure/database/PgTransactionRepository.ts`
  - `src/infrastructure/database/PgPlatformConnectionRepository.ts`
  - `src/infrastructure/database/PgPlatformStatusRepository.ts`

---

## 3) Orphan Deliverables / Gaps (Not Started or Partial)

1. [TODO] Frontend Next.js scaffold (Sprint 1 target includes app structure).
2. [IN_PROGRESS] Environment/config is in place; external secrets manager boundary remains TODO.
3. [IN_PROGRESS] Migration framework is scaffolded (Umzug), but execution wiring in app bootstrap/CI is not yet in place.
4. [DONE] Base Sprint 1 tables (`clients`, `users`, `platform_connections`, `transactions`, `platform_statuses`, `coa_mappings`) are now added with corresponding SQL files.
5. [DONE] ADR documentation added for append-only QB and source-of-truth policy.
6. [TODO] S3-related worker/service scaffolding (not a strict Sprint 1 bullet, but mentioned as an expected boundary area for upcoming ingestion/audit pipeline work).

---

## 4) Step Summary Rule

When you request a **"Step Summary"** in future turns, response must begin with:
1. The **updated checklist from this file** (Section 1), and then
2. The incremental change summary for that step.
