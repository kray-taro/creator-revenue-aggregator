import { z } from 'zod';

const authEnvSchema = z.object({
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters.'),
  JWT_ACCESS_EXPIRY_SECONDS: z.coerce.number().int().positive().default(900),       // 15 min
  JWT_REFRESH_EXPIRY_SECONDS: z.coerce.number().int().positive().default(604_800),  // 7 days
});

export interface AuthConfig {
  readonly jwtSecret: string;
  readonly jwtAccessExpiry: number;
  readonly jwtRefreshExpiry: number;
}

/**
 * Fail-fast authentication configuration loader.
 * JWT_SECRET is validated as min 32 chars to prevent weak key attacks.
 */
export const loadAuthConfig = (): AuthConfig => {
  const parsed = authEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(i => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid auth configuration. ${issues}`);
  }

  return Object.freeze({
    jwtSecret: parsed.data.JWT_SECRET,
    jwtAccessExpiry: parsed.data.JWT_ACCESS_EXPIRY_SECONDS,
    jwtRefreshExpiry: parsed.data.JWT_REFRESH_EXPIRY_SECONDS,
  });
};
