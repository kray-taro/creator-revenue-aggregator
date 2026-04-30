export type ProcessRole = 'api' | 'worker' | 'scheduler' | 'all';

export interface IConfig {
  readonly dbUrl: string;
  readonly redisUrl: string;
  readonly appSecret: string;
  readonly encryptionKey: string;
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly oauthRedirectBaseUrl: string;
  readonly oauthStateTtlMs: number;
  readonly jwtAccessExpiry: number;
  readonly jwtRefreshExpiry: number;
  readonly awsRegion: string;
  readonly s3RawResponseBucket: string;

  // --- Runtime/process topology (Sprint 2 integration slice) ---
  readonly processRole: ProcessRole;

  // --- Database pool ---
  readonly dbPoolMax: number;
  readonly dbPoolIdleMs: number;
  readonly dbSsl: boolean;

  // --- Worker + queue ---
  readonly workerConcurrency: number;
  readonly ingestionQueueName: string;
  readonly maintenanceQueueName: string;

  // --- Scheduler ---
  readonly schedulerEnabled: boolean;
  readonly nightlyIngestionCron: string;
  readonly tokenHealthCron: string;

  // --- Shutdown ---
  readonly shutdownTimeoutMs: number;

  // --- API (placeholder health endpoint) ---
  readonly apiPort: number;
}
