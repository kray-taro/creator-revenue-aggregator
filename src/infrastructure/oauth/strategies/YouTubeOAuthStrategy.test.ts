import { YouTubeOAuthStrategy } from './YouTubeOAuthStrategy';

describe('YouTubeOAuthStrategy', () => {
  let strategy: YouTubeOAuthStrategy;

  beforeEach(() => {
    strategy = new YouTubeOAuthStrategy('yt-client-id', 'yt-client-secret', 'https://app.example.com/oauth/callback/youtube');
  });

  describe('buildAuthorizationUrl', () => {
    it('should build a valid Google OAuth2 authorization URL', () => {
      const result = strategy.buildAuthorizationUrl('csrf-state-token');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toContain('accounts.google.com/o/oauth2/v2/auth');
        expect(result.value.url).toContain('client_id=yt-client-id');
        expect(result.value.url).toContain('response_type=code');
        expect(result.value.url).toContain('state=csrf-state-token');
        expect(result.value.state).toBe('csrf-state-token');
      }
    });

    it('should include access_type=offline for refresh token support', () => {
      const result = strategy.buildAuthorizationUrl('state');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toContain('access_type=offline');
        expect(result.value.url).toContain('prompt=consent');
      }
    });

    it('should include the yt-analytics-monetary scope', () => {
      const result = strategy.buildAuthorizationUrl('state');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toContain('yt-analytics-monetary.readonly');
      }
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('should return PROVIDER_ERROR when callback includes error param', async () => {
      const result = await strategy.exchangeCodeForTokens({
        code: '',
        state: 'state',
        error: 'access_denied',
        errorDescription: 'User denied access',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROVIDER_ERROR');
        expect(result.error.message).toBe('User denied access');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should return TOKEN_EXCHANGE_FAILED on non-ok HTTP response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'invalid_grant', error_description: 'Bad code' }),
      }) as jest.MockedFunction<typeof fetch>;

      const result = await strategy.exchangeCodeForTokens({ code: 'bad-code', state: 'state' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TOKEN_EXCHANGE_FAILED');
        expect(result.error.message).toBe('Bad code');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should parse Google token response into normalized OAuthTokenSet', async () => {
      const mockRaw = {
        access_token: 'ya29.access',
        refresh_token: '1//refresh',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',
        token_type: 'Bearer',
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockRaw,
      }) as jest.MockedFunction<typeof fetch>;

      const result = await strategy.exchangeCodeForTokens({ code: 'auth-code', state: 'state' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.accessToken).toBe('ya29.access');
        expect(result.value.refreshToken).toBe('1//refresh');
        expect(result.value.scopes).toContain('https://www.googleapis.com/auth/yt-analytics-monetary.readonly');
        // expiresAt should be ~1 hour from now
        const expiresAt = new Date(result.value.expiresAt).getTime();
        expect(expiresAt).toBeGreaterThan(Date.now() + 3500 * 1000);
        expect(expiresAt).toBeLessThan(Date.now() + 3700 * 1000);
      }
    });

    it('should return TOKEN_EXCHANGE_FAILED (retryable) on network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network timeout')) as jest.MockedFunction<typeof fetch>;

      const result = await strategy.exchangeCodeForTokens({ code: 'code', state: 'state' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TOKEN_EXCHANGE_FAILED');
        expect(result.error.retryable).toBe(true);
      }
    });
  });

  describe('refreshAccessToken', () => {
    it('should call token endpoint with refresh_token grant type', async () => {
      const mockRaw = {
        access_token: 'new-access-token',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',
        token_type: 'Bearer',
      };

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockRaw,
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = fetchMock;

      const result = await strategy.refreshAccessToken('stored-refresh-token');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.accessToken).toBe('new-access-token');
      }

      const callBody = new URLSearchParams(fetchMock.mock.calls[0]?.[1]?.body as string);
      expect(callBody.get('grant_type')).toBe('refresh_token');
      expect(callBody.get('refresh_token')).toBe('stored-refresh-token');
    });
  });
});
