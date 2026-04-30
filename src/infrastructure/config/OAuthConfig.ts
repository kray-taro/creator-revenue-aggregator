import { z } from 'zod';
import type { PlatformName } from '@domain/entities';
import type { OAuthPlatformConfig } from '@domain/ports';

const oauthEnvSchema = z.object({
  YOUTUBE_CLIENT_ID:     z.string().min(1, 'YOUTUBE_CLIENT_ID is required.'),
  YOUTUBE_CLIENT_SECRET: z.string().min(1, 'YOUTUBE_CLIENT_SECRET is required.'),
  PATREON_CLIENT_ID:     z.string().min(1, 'PATREON_CLIENT_ID is required.'),
  PATREON_CLIENT_SECRET: z.string().min(1, 'PATREON_CLIENT_SECRET is required.'),
  STRIPE_CLIENT_ID:      z.string().min(1, 'STRIPE_CLIENT_ID is required.'),
  STRIPE_CLIENT_SECRET:  z.string().min(1, 'STRIPE_CLIENT_SECRET is required.'),
  SHOPIFY_CLIENT_ID:     z.string().min(1, 'SHOPIFY_CLIENT_ID is required.'),
  SHOPIFY_CLIENT_SECRET: z.string().min(1, 'SHOPIFY_CLIENT_SECRET is required.'),
  GUMROAD_CLIENT_ID:     z.string().min(1, 'GUMROAD_CLIENT_ID is required.'),
  GUMROAD_CLIENT_SECRET: z.string().min(1, 'GUMROAD_CLIENT_SECRET is required.'),
  SUBSTACK_CLIENT_ID:    z.string().min(1, 'SUBSTACK_CLIENT_ID is required.'),
  SUBSTACK_CLIENT_SECRET:z.string().min(1, 'SUBSTACK_CLIENT_SECRET is required.'),
  QB_CLIENT_ID:          z.string().min(1, 'QB_CLIENT_ID is required.'),
  QB_CLIENT_SECRET:      z.string().min(1, 'QB_CLIENT_SECRET is required.'),
  OAUTH_REDIRECT_BASE_URL: z.string().url('OAUTH_REDIRECT_BASE_URL must be a valid URL.'),
  OAUTH_STATE_TTL_MS: z.coerce.number().int().positive().default(600_000),
});

type OAuthEnv = z.infer<typeof oauthEnvSchema>;

const buildPlatformConfig = (
  env: OAuthEnv,
  platform: PlatformName,
  clientId: string,
  clientSecret: string,
  authorizationUrl: string,
  tokenUrl: string,
  scopes: readonly string[]
): OAuthPlatformConfig => ({
  platform,
  clientId,
  clientSecret,
  scopes,
  authorizationUrl,
  tokenUrl,
  redirectUri: `${env.OAUTH_REDIRECT_BASE_URL}/oauth/callback/${platform}`,
});

/**
 * Fail-fast OAuth configuration loader.
 * Throws on startup if any platform credentials are missing or malformed.
 * Returns a Map keyed by PlatformName for O(1) lookup in OAuthStrategyFactory.
 */
export const loadOAuthConfig = (): Map<PlatformName, OAuthPlatformConfig> => {
  const parsed = oauthEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(i => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid OAuth configuration. ${issues}`);
  }

  const env = parsed.data;

  const configs: Map<PlatformName, OAuthPlatformConfig> = new Map([
    ['youtube', buildPlatformConfig(
      env, 'youtube', env.YOUTUBE_CLIENT_ID, env.YOUTUBE_CLIENT_SECRET,
      'https://accounts.google.com/o/oauth2/v2/auth',
      'https://oauth2.googleapis.com/token',
      ['https://www.googleapis.com/auth/yt-analytics-monetary.readonly']
    )],
    ['patreon', buildPlatformConfig(
      env, 'patreon', env.PATREON_CLIENT_ID, env.PATREON_CLIENT_SECRET,
      'https://www.patreon.com/oauth2/authorize',
      'https://www.patreon.com/api/oauth2/token',
      ['identity', 'campaigns', 'campaigns.members']
    )],
    ['stripe', buildPlatformConfig(
      env, 'stripe', env.STRIPE_CLIENT_ID, env.STRIPE_CLIENT_SECRET,
      'https://connect.stripe.com/oauth/authorize',
      'https://connect.stripe.com/oauth/token',
      ['read_only']
    )],
    ['shopify', buildPlatformConfig(
      env, 'shopify', env.SHOPIFY_CLIENT_ID, env.SHOPIFY_CLIENT_SECRET,
      'https://shopify.com/admin/oauth/authorize', // placeholder; overridden per-store
      'https://shopify.com/admin/oauth/access_token',
      ['read_orders', 'read_products', 'read_inventory']
    )],
    ['gumroad', buildPlatformConfig(
      env, 'gumroad', env.GUMROAD_CLIENT_ID, env.GUMROAD_CLIENT_SECRET,
      'https://gumroad.com/oauth/authorize',
      'https://api.gumroad.com/oauth/token',
      ['view_sales', 'view_profile']
    )],
    ['substack', buildPlatformConfig(
      env, 'substack', env.SUBSTACK_CLIENT_ID, env.SUBSTACK_CLIENT_SECRET,
      'https://substack.com/oauth/authorize',
      'https://substack.com/api/v1/oauth/token',
      ['read_financials', 'read_subscribers']
    )],
    ['quickbooks', buildPlatformConfig(
      env, 'quickbooks', env.QB_CLIENT_ID, env.QB_CLIENT_SECRET,
      'https://appcenter.intuit.com/connect/oauth2',
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      ['com.intuit.quickbooks.accounting']
    )],
  ]);

  return configs;
};

export type { OAuthPlatformConfig };
export const OAUTH_STATE_TTL_MS = (): number => {
  const parsed = oauthEnvSchema.safeParse(process.env);
  return parsed.success ? parsed.data.OAUTH_STATE_TTL_MS : 600_000;
};
