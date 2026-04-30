import * as crypto from 'crypto';
import type { FetchPlatformDataInput } from '@domain/ports';
import type { ITransaction, PlatformName } from '@domain/entities';
import { AbstractPlatformAdapter } from './AbstractPlatformAdapter';

interface StripeBalanceTransaction {
  id: string;
  type: string;
  amount: number;
  fee: number;
  net: number;
  currency: string;
  created: number;
  description?: string;
  status: string;
}

interface StripeBalanceTransactionsResponse {
  object?: string;
  data?: StripeBalanceTransaction[];
  has_more?: boolean;
  url?: string;
}

/**
 * Stripe API adapter — balance_transactions endpoint.
 *
 * API: api.stripe.com/v1/balance_transactions
 * Filters: type=payout, created date range.
 * Pagination: cursor-based via `starting_after` (last object id).
 *
 * Fee model: Stripe returns `fee` and `net` directly in the response.
 * `amount` = gross (in cents), `fee` = Stripe fee (in cents),
 * `net` = amount - fee (in cents). All converted to dollars.
 *
 * Source hierarchy: 'processor' — Stripe is a payment processor,
 * not a primary revenue platform. Deduplication gives primary sources precedence.
 */
export class StripeAdapter extends AbstractPlatformAdapter {
  readonly platform: PlatformName = 'stripe';

  private static readonly BASE_URL = 'https://api.stripe.com/v1/balance_transactions';

  protected buildRequestUrl(input: FetchPlatformDataInput, cursor: string | null): string {
    const fromTimestamp = Math.floor(new Date(`${input.fromDate}T00:00:00Z`).getTime() / 1000);
    const toTimestamp = Math.floor(new Date(`${input.toDate}T23:59:59Z`).getTime() / 1000);

    const params = new URLSearchParams({
      type: 'payout',
      'created[gte]': String(fromTimestamp),
      'created[lte]': String(toTimestamp),
      limit: '100',
    });

    if (cursor) {
      params.set('starting_after', cursor);
    }

    return `${StripeAdapter.BASE_URL}?${params.toString()}`;
  }

  protected buildRequestHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Stripe-Version': '2024-06-20',
    };
  }

  protected transformPage(raw: Record<string, unknown>, input: FetchPlatformDataInput): ITransaction[] {
    const response = raw as StripeBalanceTransactionsResponse;
    const items = response.data ?? [];
    const now = new Date().toISOString();

    return items
      .filter(item => item.status === 'available' || item.status === 'pending')
      .map(item => {
        const grossRevenue = Math.round(item.amount / 100 * 100) / 100;
        const platformFee = Math.round(item.fee / 100 * 100) / 100;
        const netPayout = Math.round(item.net / 100 * 100) / 100;
        const txnDate = this.toIsoDate(item.created);

        return {
          id: crypto.randomUUID(),
          clientId: input.clientId,
          platform: 'stripe' as const,
          platformTransactionId: this.makeTransactionId('ST', item.id),
          platformId: item.id,
          transactionDate: txnDate,
          createdAt: now,
          updatedAt: now,
          grossRevenue,
          platformFee,
          netPayout,
          description: item.description
            ? `Stripe payout — ${item.description}`
            : `Stripe payout — ${txnDate}`,
          sourceHierarchy: 'processor' as const,
          status: 'pending_review' as const,
        } satisfies ITransaction;
      });
  }

  protected extractNextCursor(raw: Record<string, unknown>): string | null {
    const response = raw as StripeBalanceTransactionsResponse;
    if (!response.has_more) return null;
    const items = response.data ?? [];
    const last = items[items.length - 1];
    return last ? last.id : null;
  }
}
