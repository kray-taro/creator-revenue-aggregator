export type { IAuditLogger, AuditLoggerError } from './IAuditLogger';
export type { IAuthService, AuthTokenPair, AccessTokenClaims, AuthError, AuthErrorCode } from './IAuthService';
export type { IBookkeeperRepository, CreateBookkeeperInput, BookkeeperRepositoryError } from './IBookkeeperRepository';
export type { IClientRepository, CreateClientInput, UpdateClientInput, ClientRepositoryError } from './IClientRepository';
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
export type {
  INotificationService,
  NotificationServiceError,
  TokenExpiryBucket,
  TokenExpiryNotification,
} from './INotificationService';
export type {
  IOAuthService,
  OAuthPlatformConfig,
  OAuthTokenSet,
  OAuthCallbackParams,
  OAuthError,
  OAuthErrorCode
} from './IOAuthService';
export type { IOAuthStateStore, OAuthStateMetadata, OAuthStateError } from './IOAuthStateStore';
export type { IPlatformAdapter, PlatformAdapterErrorCode, FetchPlatformDataInput, PlatformAdapterError } from './IPlatformAdapter';
export type {
  IPlatformConnectionRepository,
  PlatformConnection,
  PlatformConnectionRepositoryError,
  PlatformTokenBundle,
  CreateConnectionInput
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
export type {
  IQuickBooksAdapter,
  QBJournalEntryInput,
  QBJournalEntryLine,
  QBJournalEntryResult,
  QBSyncError,
} from './IQuickBooksAdapter';
