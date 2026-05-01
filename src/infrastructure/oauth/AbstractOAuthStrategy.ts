import { failure, success } from '@domain/shared';
import type { OAuthCallbackParams, OAuthError, OAuthTokenSet } from '@domain/ports';
import type { Result } from '@domain/shared';
import type { PlatformName } from '@domain/entities';

/**
 * Template Method base class for OAuth 2.0 Authorization Code flow.
 *
 * Shared steps (implemented here): PKCE-free code exchange HTTP POST, shared error mapping,
 * expiry calculation helpers.
 *
 * Platform-specific hooks (abstract): buildTokenPayload, buildRefreshPayload,
 * parseTokenResponse, scopes, authorizationUrl, tokenUrl.
 *
 * OCP: adding a new platform = new subclass only, zero changes to orchestrator.
 * LSP: all strategies are interchangeable behind IOAuthService.
 */
export abstract class AbstractOAuthStrategy {
  constructor(
    protected readonly clientId: string,
    protected readonly clientSecret: string,
    protected readonly redirectUri: string
  ) {}

  abstract readonly platform: PlatformName;
  abstract readonly authorizationUrl: string;
  abstract readonly tokenUrl: string;
  abstract readonly scopes: readonly string[];

  /**
   * Builds the platform-specific authorization URL for the user to visit.
   */
  buildAuthorizationUrl(state: string): Result<{ url: string; state: string }, OAuthError> {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        redirect_uri: this.redirectUri,
        response_type: 'code',
        scope: this.scopes.join(' '),
        state,
        ...this.extraAuthorizationParams(),
      });
      return success({ url: `${this.authorizationUrl}?${params.toString()}`, state });
    } catch (error) {
      return failure({
        code: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to build authorization URL.',
        retryable: false,
      });
    }
  }

  /**
   * Template method: exchanges an authorization code for tokens.
   * Shared: HTTP POST, error handling. Hooks: payload construction + response parsing.
   */
  async exchangeCodeForTokens(params: OAuthCallbackParams): Promise<Result<OAuthTokenSet, OAuthError>> {
    if (params.error) {
      return failure({
        code: 'PROVIDER_ERROR',
        message: params.errorDescription ?? params.error,
        retryable: false,
        details: { providerError: params.error },
      });
    }

    const payload = this.buildTokenPayload(params.code);
    return this.executeTokenExchange(payload, 'TOKEN_EXCHANGE_FAILED');
  }

  /**
   * Template method: refreshes an access token using a stored refresh token.
   */
  async refreshAccessToken(refreshToken: string): Promise<Result<OAuthTokenSet, OAuthError>> {
    const payload = this.buildRefreshPayload(refreshToken);
    return this.executeTokenExchange(payload, 'REFRESH_FAILED');
  }

  /**
   * Hook: constructs the token exchange POST body from the authorization code.
   */
  protected abstract buildTokenPayload(code: string): Record<string, string>;

  /**
   * Hook: constructs the token refresh POST body.
   */
  protected abstract buildRefreshPayload(refreshToken: string): Record<string, string>;

  /**
   * Hook: parses the raw platform token response into a normalized OAuthTokenSet.
   */
  protected abstract parseTokenResponse(raw: Record<string, unknown>): OAuthTokenSet;

  /**
   * Optional hook: extra query params added to the authorization URL.
   */
  protected extraAuthorizationParams(): Record<string, string> {
    return {};
  }

  /**
   * Calculates an ISO-8601 expiry timestamp from a seconds-from-now value.
   */
  protected calculateExpiresAt(expiresInSeconds: number): string {
    return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  }

  /**
   * Shared HTTP execution + error normalization.
   */
  private async executeTokenExchange(
    payload: Record<string, string>,
    failureCode: OAuthError['code']
  ): Promise<Result<OAuthTokenSet, OAuthError>> {
    try {
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams(payload).toString(),
      });

      const raw = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        const providerMessage = typeof raw['error_description'] === 'string'
          ? raw['error_description']
          : typeof raw['error'] === 'string'
            ? raw['error']
            : `HTTP ${response.status}`;

        return failure({
          code: failureCode,
          message: providerMessage,
          retryable: response.status >= 500,
          details: { httpStatus: response.status, providerResponse: raw },
        });
      }

      return success(this.parseTokenResponse(raw));
    } catch (error) {
      return failure({
        code: failureCode,
        message: error instanceof Error ? error.message : 'Network error during token exchange.',
        retryable: true,
      });
    }
  }
}
