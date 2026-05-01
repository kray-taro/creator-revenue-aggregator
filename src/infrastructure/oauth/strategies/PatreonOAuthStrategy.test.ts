import { PatreonOAuthStrategy } from './PatreonOAuthStrategy';

describe('PatreonOAuthStrategy', () => {
  let strategy: PatreonOAuthStrategy;

  beforeEach(() => {
    strategy = new PatreonOAuthStrategy('pt-client-id', 'pt-client-secret', 'https://app.example.com/oauth/callback/patreon');
  });

  describe('buildAuthorizationUrl', () => {
    it('should build Patreon authorization URL with correct scopes', () => {
      const result = strategy.buildAuthorizationUrl('csrf-state');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toContain('www.patreon.com/oauth2/authorize');
        expect(result.value.url).toContain('client_id=pt-client-id');
        expect(result.value.url).toContain('campaigns');
        expect(result.value.url).toContain('campaigns.members');
      }
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('should parse Patreon v2 token response with 30-day expiry', async () => {
      const mockRaw = {
        access_token: 'pt-access-token',
        refresh_token: 'pt-refresh-token',
        expires_in: 2592000, // 30 days
        scope: 'identity campaigns campaigns.members',
        token_type: 'Bearer',
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockRaw,
      }) as jest.MockedFunction<typeof fetch>;

      const result = await strategy.exchangeCodeForTokens({ code: 'pt-code', state: 'state' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.accessToken).toBe('pt-access-token');
        expect(result.value.refreshToken).toBe('pt-refresh-token');
        expect(result.value.scopes).toContain('campaigns');
        expect(result.value.scopes).toContain('identity');
        // Should expire approximately 30 days from now
        const expiresAt = new Date(result.value.expiresAt).getTime();
        const thirtyDaysMs = 2592000 * 1000;
        expect(expiresAt).toBeGreaterThan(Date.now() + thirtyDaysMs - 5000);
        expect(expiresAt).toBeLessThan(Date.now() + thirtyDaysMs + 5000);
      }
    });

    it('should use default 30-day expiry when expires_in is missing from response', async () => {
      const mockRaw = {
        access_token: 'pt-access-token',
        refresh_token: 'pt-refresh-token',
        // expires_in omitted
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockRaw,
      }) as jest.MockedFunction<typeof fetch>;

      const result = await strategy.exchangeCodeForTokens({ code: 'code', state: 'state' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const expiresAt = new Date(result.value.expiresAt).getTime();
        // Default is 2592000s (30 days)
        expect(expiresAt).toBeGreaterThan(Date.now() + 2580000 * 1000);
      }
    });

    it('should return PROVIDER_ERROR when Patreon returns access_denied', async () => {
      const result = await strategy.exchangeCodeForTokens({
        code: '',
        state: 'state',
        error: 'access_denied',
        errorDescription: 'Creator denied authorization',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROVIDER_ERROR');
        expect(result.error.message).toBe('Creator denied authorization');
      }
    });
  });

  describe('refreshAccessToken', () => {
    it('should include refresh_token grant in request body', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'new-pt-access',
          refresh_token: 'new-pt-refresh',
          expires_in: 2592000,
        }),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = fetchMock;

      await strategy.refreshAccessToken('old-refresh');

      const body = new URLSearchParams(fetchMock.mock.calls[0]?.[1]?.body as string);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('old-refresh');
      expect(body.get('client_id')).toBe('pt-client-id');
    });
  });
});
