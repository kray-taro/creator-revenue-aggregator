import type { OAuthTokenSet } from '@domain/ports';
import type { PlatformName } from '@domain/entities';
import { AbstractOAuthStrategy } from '../AbstractOAuthStrategy';

/**
 * Patreon API v2 OAuth strategy.
 * Scopes: campaigns, members, identity
 * Patreon refresh tokens are long-lived (~1 year). Access tokens expire after 30 days.
 * Patreon returns token_type, access_token, refresh_token, expires_in, scope in a flat JSON body.
 */
export class PatreonOAuthStrategy extends AbstractOAuthStrategy {
  readonly platform: PlatformName = 'patreon';
  readonly authorizationUrl = 'https://www.patreon.com/oauth2/authorize';
  readonly tokenUrl = 'https://www.patreon.com/api/oauth2/token';
  readonly scopes = ['identity', 'campaigns', 'campaigns.members', 'w:campaigns.webhook'] as const;

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
    // Patreon returns expires_in in seconds; typically 2592000 (30 days)
    const expiresIn = typeof raw['expires_in'] === 'number' ? raw['expires_in'] : 2592000;
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
