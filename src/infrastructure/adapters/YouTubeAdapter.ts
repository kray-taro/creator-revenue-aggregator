import * as crypto from 'crypto';
import type { FetchPlatformDataInput } from '@domain/ports';
import type { ITransaction, PlatformName } from '@domain/entities';
import { AbstractPlatformAdapter } from './AbstractPlatformAdapter';

interface YouTubeAnalyticsRow {
  dimensions: string[];
  metrics: number[];
}

interface YouTubeAnalyticsResponse {
  columnHeaders?: Array<{ name: string }>;
  rows?: YouTubeAnalyticsRow[];
}

/**
 * YouTube Analytics API v2 adapter.
 *
 * API: youtubeanalytics.googleapis.com/v2/reports
 * Metrics: estimatedRevenue (gross), then calculated 45% fee, 55% net.
 * YouTube pays creators approximately 55% of ad revenue (45% platform share).
 *
 * Date range strategy: results are daily aggregates, no pagination needed
 * (API returns all days in range in one response). We chunk by ≤31-day windows
 * if the input range is wider.
 *
 * Rate limit: quotaExceeded in 403 response body.
 */
export class YouTubeAdapter extends AbstractPlatformAdapter {
  readonly platform: PlatformName = 'youtube';

  private static readonly PLATFORM_FEE_RATIO = 0.45;
  private static readonly BASE_API_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';

  protected buildRequestUrl(input: FetchPlatformDataInput, _cursor: string | null): string {
    const params = new URLSearchParams({
      ids: 'channel==MINE',
      startDate: input.fromDate,
      endDate: input.toDate,
      metrics: 'estimatedRevenue',
      dimensions: 'day',
      sort: 'day',
    });
    return `${YouTubeAdapter.BASE_API_URL}?${params.toString()}`;
  }

  protected buildRequestHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    };
  }

  protected transformPage(raw: Record<string, unknown>, input: FetchPlatformDataInput): ITransaction[] {
    const response = raw as YouTubeAnalyticsResponse;
    const rows = response.rows ?? [];
    const now = new Date().toISOString();

    return rows
      .filter(row => Array.isArray(row) && row.length >= 2)
      .map(row => {
        const rowArr = row as unknown as [string, number];
        const date = rowArr[0];
        const grossRevenue = Math.max(0, Number(rowArr[1]) || 0);
        const platformFee = Math.round(grossRevenue * YouTubeAdapter.PLATFORM_FEE_RATIO * 100) / 100;
        const netPayout = Math.round((grossRevenue - platformFee) * 100) / 100;

        const platformTransactionId = this.makeTransactionId('YT', input.clientId.slice(0, 8), date);

        return {
          id: crypto.randomUUID(),
          clientId: input.clientId,
          platform: 'youtube' as const,
          platformTransactionId,
          platformId: undefined,
          transactionDate: date,
          createdAt: now,
          updatedAt: now,
          grossRevenue,
          platformFee,
          netPayout,
          description: `YouTube AdSense payout — ${date}`,
          sourceHierarchy: 'primary' as const,
          status: 'pending_review' as const,
        } satisfies ITransaction;
      });
  }

  protected extractNextCursor(_raw: Record<string, unknown>): string | null {
    return null;
  }

  protected override isQuotaExceeded(body: Record<string, unknown>): boolean {
    const errors = body['error'] as Record<string, unknown> | undefined;
    if (!errors) return false;
    const errorList = errors['errors'] as Array<Record<string, string>> | undefined;
    return Array.isArray(errorList) && errorList.some(e => e['reason'] === 'quotaExceeded');
  }
}
