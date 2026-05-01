import { z } from 'zod';
import type { IConfig } from '../../domain/ports/IConfig';

const processRoleSchema = z.enum(['api', 'worker', 'scheduler', 'all']).default('all');

/**
 * Permissive boolean coercion: `z.coerce.boolean()` treats any non-empty
 * string as true, so "false" would parse to true. This custom coercion
 * accepts common truthy/falsy spellings only.
 */
const boolFromEnv = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined) return defaultValue;
      if (typeof v === 'boolean') return v;
      const normalized = v.trim().toLowerCase();
      if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
      if (['0', 'false', 'no', 'n', 'off', ''].includes(normalized)) return false;
      throw new Error(`Invalid boolean env value: "${v}"`);
    });

const envSchema = z.object({
  DB_URL:           z.string().url('DB_URL must be a valid URL.'),
  REDIS_URL:        z.string().url('REDIS_URL must be a valid URL.'),
  APP_SECRET:       z.string().min(16, 'APP_SECRET must be at least 16 characters long.'),
  ENCRYPTION_KEY:   z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters long.'),
  NODE_ENV:         z.enum(['development', 'test', 'production']).default('development'),
  OAUTH_REDIRECT_BASE_URL: z.string().url('OAUTH_REDIRECT_BASE_URL must be a valid URL.'),
  OAUTH_STATE_TTL_MS:      z.coerce.number().int().positive().default(600_000),
  JWT_ACCESS_EXPIRY_SECONDS:  z.coerce.number().int().positive().default(900),
  JWT_REFRESH_EXPIRY_SECONDS: z.coerce.number().int().positive().default(604_800),
  AWS_REGION:               z.string().default('us-east-1'),
  AWS_S3_RAW_RESPONSE_BUCKET: z.string().min(1, 'AWS_S3_RAW_RESPONSE_BUCKET is required.'),

  // --- Runtime/process topology ---
  PROCESS_ROLE:     processRoleSchema,

  // --- Database pool ---
  DB_POOL_MAX:      z.coerce.number().int().positive().default(10),
  DB_POOL_IDLE_MS:  z.coerce.number().int().nonnegative().default(30_000),
  DB_SSL:           boolFromEnv(false),

  // --- Worker + queue ---
  WORKER_CONCURRENCY:      z.coerce.number().int().positive().default(4),
  INGESTION_QUEUE_NAME:    z.string().min(1).default('ingestion'),
  MAINTENANCE_QUEUE_NAME:  z.string().min(1).default('maintenance'),

  // --- Scheduler ---
  SCHEDULER_ENABLED:       boolFromEnv(true),
  NIGHTLY_INGESTION_CRON:  z.string().min(1).default('0 2 * * *'),
  TOKEN_HEALTH_CRON:       z.string().min(1).default('0 6 * * *'),

  // --- Shutdown ---
  SHUTDOWN_TIMEOUT_MS:     z.coerce.number().int().positive().default(15_000),

  // --- API ---
  API_PORT:                z.coerce.number().int().positive().default(3000),
});

const parseEnv = (): IConfig => {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');

    throw new Error(`Invalid environment configuration. ${issues}`);
  }

  const config: IConfig = {
    dbUrl:              parsed.data.DB_URL,
    redisUrl:           parsed.data.REDIS_URL,
    appSecret:          parsed.data.APP_SECRET,
    encryptionKey:      parsed.data.ENCRYPTION_KEY,
    nodeEnv:            parsed.data.NODE_ENV,
    oauthRedirectBaseUrl: parsed.data.OAUTH_REDIRECT_BASE_URL,
    oauthStateTtlMs:    parsed.data.OAUTH_STATE_TTL_MS,
    jwtAccessExpiry:    parsed.data.JWT_ACCESS_EXPIRY_SECONDS,
    jwtRefreshExpiry:   parsed.data.JWT_REFRESH_EXPIRY_SECONDS,
    awsRegion:          parsed.data.AWS_REGION,
    s3RawResponseBucket: parsed.data.AWS_S3_RAW_RESPONSE_BUCKET,

    processRole:        parsed.data.PROCESS_ROLE,

    dbPoolMax:          parsed.data.DB_POOL_MAX,
    dbPoolIdleMs:       parsed.data.DB_POOL_IDLE_MS,
    dbSsl:              parsed.data.DB_SSL,

    workerConcurrency:  parsed.data.WORKER_CONCURRENCY,
    ingestionQueueName: parsed.data.INGESTION_QUEUE_NAME,
    maintenanceQueueName: parsed.data.MAINTENANCE_QUEUE_NAME,

    schedulerEnabled:   parsed.data.SCHEDULER_ENABLED,
    nightlyIngestionCron: parsed.data.NIGHTLY_INGESTION_CRON,
    tokenHealthCron:    parsed.data.TOKEN_HEALTH_CRON,

    shutdownTimeoutMs:  parsed.data.SHUTDOWN_TIMEOUT_MS,

    apiPort:            parsed.data.API_PORT,
  };

  return Object.freeze(config);
};

/**
 * Fail-fast configuration object.
 * Throws immediately during startup if required env vars are invalid/missing.
 */
export const appConfig: IConfig = parseEnv();

/**
 * Factory helper for tests/composition roots.
 */
export const loadConfig = (): IConfig => parseEnv();
