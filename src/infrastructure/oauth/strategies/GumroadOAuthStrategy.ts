import type { OAuthTokenSet } from '@domain/ports';
import type { PlatformName } from '@domain/entities';
import { AbstractOAuthStrategy } from '../AbstractOAuthStrategy';

/**
 * Gumroad OAuth2 strategy.
 * Gumroad uses standard OAuth2 Authorization Code flow.
 * Access tokens do not expire by default; Gumroad's API documentation states
 * tokens are valid until explicitly revoked, so we store a far-future sentinel.
 * Gumroad does not issue refresh tokens.
 */
export class GumroadOAuthStrategy extends AbstractOAuthStrategy {
  readonly platform: PlatformName = 'gumroad';
  readonly authorizationUrl = 'https://gumroad.com/oauth/authorize';
  readonly tokenUrl = 'https://api.gumroad.com/oauth/token';
  readonly scopes = ['view_sales', 'view_profile'] as const;

  private static readonly NON_EXPIRING_SECONDS = 365 * 24 * 3600 * 10; // 10 years

  protected buildTokenPayload(code: string): Record<string, string> {
    return {
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
    };
  }

  protected buildRefreshPayload(_refreshToken: string): Record<string, string> {
    // Gumroad does not support refresh tokens; callers should not invoke this
    return {};
  }

  protected parseTokenResponse(raw: Record<string, unknown>): OAuthTokenSet {
    return {
      accessToken: String(raw['access_token'] ?? ''),
      refreshToken: undefined,
      expiresAt: this.calculateExpiresAt(GumroadOAuthStrategy.NON_EXPIRING_SECONDS),
      scopes: [...this.scopes],
      raw,
    };
  }
}
