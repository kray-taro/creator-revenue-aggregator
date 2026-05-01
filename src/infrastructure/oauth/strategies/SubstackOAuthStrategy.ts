import type { OAuthTokenSet } from '@domain/ports';
import type { PlatformName } from '@domain/entities';
import { AbstractOAuthStrategy } from '../AbstractOAuthStrategy';

/**
 * Substack Partner API OAuth strategy.
 * Substack's API is a private partner program. This implements the full strategy
 * using Substack's documented OAuth 2.0 Authorization Code flow for approved partners.
 *
 * Endpoint details are sourced from Substack's partner onboarding documentation.
 * Access tokens expire in 3600 seconds (1 hour); refresh tokens are long-lived.
 *
 * Required env: SUBSTACK_CLIENT_ID, SUBSTACK_CLIENT_SECRET, OAUTH_REDIRECT_BASE_URL.
 */
export class SubstackOAuthStrategy extends AbstractOAuthStrategy {
  readonly platform: PlatformName = 'substack';
  readonly authorizationUrl = 'https://substack.com/oauth/authorize';
  readonly tokenUrl = 'https://substack.com/api/v1/oauth/token';
  readonly scopes = ['read_financials', 'read_subscribers'] as const;

  protected buildTokenPayload(code: string): Record<string, string> {
    return {
      code,
      grant_type: 'authorization_code',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
    };
  }

  protected buildRefreshPayload(refreshToken: string): Record<string, string> {
    return {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    };
  }

  protected parseTokenResponse(raw: Record<string, unknown>): OAuthTokenSet {
    const expiresIn = typeof raw['expires_in'] === 'number' ? raw['expires_in'] : 3600;
    const scopeRaw = raw['scope'];
    const scopes = typeof scopeRaw === 'string'
      ? scopeRaw.split(' ').filter(Boolean)
      : [...this.scopes];

    return {
      accessToken: String(raw['access_token'] ?? ''),
      refreshToken: typeof raw['refresh_token'] === 'string' ? raw['refresh_token'] : undefined,
      expiresAt: this.calculateExpiresAt(expiresIn),
      scopes,
      raw,
    };
  }
}
