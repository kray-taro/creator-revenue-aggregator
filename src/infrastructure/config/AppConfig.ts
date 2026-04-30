import { z } from 'zod';
import type { IConfig } from '../../domain/ports/IConfig';

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
