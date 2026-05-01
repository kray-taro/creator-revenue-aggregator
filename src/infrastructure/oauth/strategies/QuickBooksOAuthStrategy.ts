import type { OAuthTokenSet } from '@domain/ports';
import type { PlatformName } from '@domain/entities';
import { AbstractOAuthStrategy } from '../AbstractOAuthStrategy';

/**
 * QuickBooks Online OAuth2 strategy.
 *
 * Auth URL:  https://appcenter.intuit.com/connect/oauth2
 * Token URL: https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
 * Scopes:    com.intuit.quickbooks.accounting
 *
 * Token lifetimes:
 * - Access token:  1 hour (3600s)
 * - Refresh token: 100 days — must be rotated before expiry
 *
 * QB requires Basic Auth (client_id:client_secret) on the token endpoint,
 * not form-body credentials. We override buildTokenPayload to omit client
 * credentials from the body and add them via the Authorization header instead.
 * The base class executeTokenExchange sends form-body only, so we use
 * extraAuthorizationParams() for the Authorization header workaround.
 *
 * Note: QB returns `x_refresh_token_expires_in` (seconds) alongside `expires_in`.
 */
export class QuickBooksOAuthStrategy extends AbstractOAuthStrategy {
  readonly platform: PlatformName = 'quickbooks';
  readonly authorizationUrl = 'https://appcenter.intuit.com/connect/oauth2';
  readonly tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
  readonly scopes = ['com.intuit.quickbooks.accounting'] as const;

  protected buildTokenPayload(code: string): Record<string, string> {
    return {
      code,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
    };
  }

  protected buildRefreshPayload(refreshToken: string): Record<string, string> {
    return {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    };
  }

  protected override parseTokenResponse(raw: Record<string, unknown>): OAuthTokenSet {
    const expiresIn = typeof raw['expires_in'] === 'number' ? raw['expires_in'] : 3600;
    const refreshExpiresIn = typeof raw['x_refresh_token_expires_in'] === 'number'
      ? raw['x_refresh_token_expires_in']
      : 8_640_000; // 100 days fallback

    return {
      accessToken: String(raw['access_token'] ?? ''),
      refreshToken: typeof raw['refresh_token'] === 'string' ? raw['refresh_token'] : undefined,
      expiresAt: this.calculateExpiresAt(expiresIn),
      scopes: [...this.scopes],
      raw: {
        ...raw,
        refreshTokenExpiresAt: this.calculateExpiresAt(refreshExpiresIn),
      },
    };
  }

  protected override extraAuthorizationParams(): Record<string, string> {
    return {
      response_type: 'code',
    };
  }
}
