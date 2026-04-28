import { z } from 'zod';
import type { IConfig } from '../../domain/ports/IConfig';

const envSchema = z.object({
  DB_URL: z.string().url('DB_URL must be a valid URL.'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL.'),
  APP_SECRET: z.string().min(16, 'APP_SECRET must be at least 16 characters long.'),
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters long.'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
    dbUrl: parsed.data.DB_URL,
    redisUrl: parsed.data.REDIS_URL,
    appSecret: parsed.data.APP_SECRET,
    encryptionKey: parsed.data.ENCRYPTION_KEY,
    nodeEnv: parsed.data.NODE_ENV,
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
