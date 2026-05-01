import { failure, success } from '@domain/shared';
import type { Result } from '@domain/shared';
import type { IPlatformAdapter, FetchPlatformDataInput, PlatformAdapterError } from '@domain/ports';
import type { IRawResponseArchivalService } from '@domain/ports';
import type { IPlatformConnectionRepository, IEncryptionService } from '@domain/ports';
import type { ITransaction, PlatformName } from '@domain/entities';
import { getPlatformConfig } from '@infrastructure/config/PlatformConfig';

export interface HttpResponse<T = unknown> {
  readonly ok: boolean;
  readonly status: number;
  readonly data: T;
  readonly headers: Record<string, string>;
}

/**
 * Template Method base class for platform data ingestion adapters.
 *
 * Shared concerns handled here:
 * - OAuth token decryption from the connection repository
 * - HTTP fetch with exponential backoff (up to maxRetries from PlatformConfig)
 * - Rate-limit detection and retry-after parsing (HTTP 429)
 * - Pagination loop (cursor-based or page-based — determined by subclass)
 * - Raw response archival (fire-and-forget, does not block ingestion)
 * - Error normalization to PlatformAdapterError
 *
 * Subclass responsibilities:
 * - buildRequestUrl(input, cursor) → API endpoint for each page
 * - buildRequestHeaders(accessToken) → platform-specific auth headers
 * - transformPage(raw) → ITransaction[] from one page of API response
 * - extractNextCursor(raw) → next page cursor, or null when done
 */
export abstract class AbstractPlatformAdapter implements IPlatformAdapter {
  abstract readonly platform: PlatformName;

  constructor(
    protected readonly connectionRepo: IPlatformConnectionRepository,
    protected readonly encryptionService: IEncryptionService,
    protected readonly archivalService: IRawResponseArchivalService | null = null
  ) {}

  async fetchData(input: FetchPlatformDataInput): Promise<Result<ITransaction[], PlatformAdapterError>> {
    const tokenResult = await this.connectionRepo.getTokens(input.connectionId);
    if (!tokenResult.ok) {
      return failure({
        code: 'UNAUTHORIZED',
        message: `Failed to retrieve tokens for connection ${input.connectionId}: ${tokenResult.error.message}`,
        retryable: tokenResult.error.retryable,
      });
    }

    let accessToken: string;
    try {
      accessToken = this.encryptionService.decrypt(tokenResult.value.accessToken);
    } catch (err) {
      return failure({
        code: 'UNAUTHORIZED',
        message: 'Failed to decrypt access token.',
        retryable: false,
      });
    }

    const allTransactions: ITransaction[] = [];
    let cursor: string | null = null;
    let pageIndex = 0;
    const MAX_PAGES = 100;

    do {
      const url = this.buildRequestUrl(input, cursor);
      const headers = this.buildRequestHeaders(accessToken);

      const pageResult = await this.fetchWithRetry(url, headers);
      if (!pageResult.ok) {
        return pageResult as Result<never, PlatformAdapterError>;
      }

      const { data: rawPage } = pageResult.value;

      if (this.archivalService && pageIndex === 0) {
        this.archivalService
          .archiveRawResponse(rawPage, {
            clientId: input.clientId,
            platformName: this.platform,
            timestamp: new Date().toISOString(),
            fromDate: input.fromDate,
            toDate: input.toDate,
            recordCount: allTransactions.length,
            requestId: `${input.connectionId}-page${pageIndex}`,
          })
          .catch(() => {
            // Archival failures never block ingestion
          });
      }

      let pageTransactions: ITransaction[];
      try {
        pageTransactions = this.transformPage(rawPage as Record<string, unknown>, input);
      } catch (err) {
        return failure({
          code: 'INVALID_SOURCE_PAYLOAD',
          message: err instanceof Error ? err.message : 'Failed to transform platform response.',
          retryable: false,
        });
      }

      allTransactions.push(...pageTransactions);
      cursor = this.extractNextCursor(rawPage as Record<string, unknown>, pageResult.value.headers);
      pageIndex++;
    } while (cursor !== null && pageIndex < MAX_PAGES);

    return success(allTransactions);
  }

  protected abstract buildRequestUrl(input: FetchPlatformDataInput, cursor: string | null): string;
  protected abstract buildRequestHeaders(accessToken: string): Record<string, string>;
  protected abstract transformPage(raw: Record<string, unknown>, input: FetchPlatformDataInput): ITransaction[];
  protected abstract extractNextCursor(raw: Record<string, unknown>, headers?: Record<string, string>): string | null;

  protected makeTransactionId(prefix: string, ...parts: string[]): string {
    return `${prefix}-${parts.join('-')}`;
  }

  protected toIsoDate(dateInput: string | number): string {
    const d = new Date(typeof dateInput === 'number' ? dateInput * 1000 : dateInput);
    return d.toISOString().slice(0, 10);
  }

  private async fetchWithRetry(
    url: string,
    headers: Record<string, string>
  ): Promise<Result<HttpResponse, PlatformAdapterError>> {
    const config = getPlatformConfig(this.platform);
    let lastError: PlatformAdapterError | null = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      if (attempt > 0) {
        const backoffMs = this.calculateBackoff(attempt);
        await this.delay(backoffMs);
      }

      let response: Response;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
        response = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timeoutId);
      } catch (err) {
        lastError = {
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Network error during platform API call.',
          retryable: true,
        };
        continue;
      }

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : this.calculateBackoff(attempt + 1);
        await this.delay(retryAfterMs);
        lastError = {
          code: 'RATE_LIMITED',
          message: `Rate limited by ${this.platform}. Retry after ${retryAfterMs}ms.`,
          retryable: true,
        };
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        const isQuotaError = this.isQuotaExceeded(body);
        return failure({
          code: isQuotaError ? 'RATE_LIMITED' : 'UNAUTHORIZED',
          message: isQuotaError ? `Quota exceeded on ${this.platform}` : `Unauthorized: ${this.platform} rejected the access token`,
          retryable: isQuotaError,
          details: { httpStatus: response.status },
        });
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        lastError = {
          code: 'NETWORK_ERROR',
          message: `${this.platform} API error ${response.status}`,
          retryable: response.status >= 500,
          details: { httpStatus: response.status, body: String(JSON.stringify(body)).slice(0, 200) },
        };
        if (!lastError.retryable) {
          return failure(lastError);
        }
        continue;
      }

      const data = await response.json().catch(() => ({}));
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => { responseHeaders[key] = value; });

      return success({
        ok: true,
        status: response.status,
        data,
        headers: responseHeaders,
      });
    }

    return failure(lastError ?? {
      code: 'NETWORK_ERROR',
      message: `${this.platform} API request failed after ${config.maxRetries} retries.`,
      retryable: true,
    });
  }

  protected isQuotaExceeded(_body: Record<string, unknown>): boolean {
    return false;
  }

  private calculateBackoff(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt - 1), 30_000);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
