export type { IAuditLogger, AuditLoggerError } from './IAuditLogger';
export type { IConfig } from './IConfig';
export type {
  IConfidenceScoringService,
  ConfidenceCategory,
  ConfidenceReason,
  ConfidenceScoringResult,
  BatchConfidenceScoringResult,
  ConfidenceScoringError
} from './IConfidenceScoringService';
export type {
  IDeduplicationService,
  DeduplicationResult,
  BatchDeduplicationResult,
  DeduplicationError
} from './IDeduplicationService';
export type { IDistributedLockService, DistributedLockError } from './IDistributedLockService';
export type { IEncryptionService } from './IEncryptionService';
export type { IIngestionJobQueue, IngestionJobRequest, IngestionQueueError } from './IIngestionJobQueue';
export type { IPlatformAdapter, PlatformAdapterErrorCode, FetchPlatformDataInput, PlatformAdapterError } from './IPlatformAdapter';
export type {
  IPlatformConnectionRepository,
  PlatformConnection,
  PlatformConnectionRepositoryError,
  PlatformTokenBundle
} from './IPlatformConnectionRepository';
export type {
  IPlatformStatusRepository,
  PlatformHealthStatus,
  PlatformStatusRecord,
  PlatformStatusRepositoryError
} from './IPlatformStatusRepository';
export type {
  IRawResponseArchivalService,
  RawResponseMetadata,
  ArchivalResult,
  RawResponseArchivalError
} from './IRawResponseArchivalService';
export type { ITransactionRepository, RepositoryError } from './ITransactionRepository';
