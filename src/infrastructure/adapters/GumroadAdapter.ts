import * as crypto from 'crypto';
import type { FetchPlatformDataInput } from '@domain/ports';
import type { ITransaction, PlatformName } from '@domain/entities';
import { AbstractPlatformAdapter } from './AbstractPlatformAdapter';

interface GumroadSale {
  id: string;
  created_at: string;
  price: number;
  gumroad_fee: number;
  product_name?: string;
  full_name?: string;
  currency_symbol?: string;
}

interface GumroadSalesResponse {
  success?: boolean;
  sales?: GumroadSale[];
  next_page_url?: string;
}

/**
 * Gumroad API adapter.
 *
 * API: api.gumroad.com/v2/sales — page-based pagination.
 * Fee model: Gumroad returns `gumroad_fee` in the same currency as `price`,
 * so we use those fields directly for exact fee amounts.
 * `price` is in cents for USD; we convert to dollars.
 *
 * Pagination: `next_page_url` field in response (null when last page).
 */
export class GumroadAdapter extends AbstractPlatformAdapter {
  readonly platform: PlatformName = 'gumroad';

  private static readonly BASE_URL = 'https://api.gumroad.com/v2/sales';

  protected buildRequestUrl(input: FetchPlatformDataInput, cursor: string | null): string {
    if (cursor) {
      return cursor;
    }

    const params = new URLSearchParams({
      after: input.fromDate,
      before: input.toDate,
    });
    return `${GumroadAdapter.BASE_URL}?${params.toString()}`;
  }

  protected buildRequestHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    };
  }

  protected transformPage(raw: Record<string, unknown>, input: FetchPlatformDataInput): ITransaction[] {
    const response = raw as GumroadSalesResponse;
    const sales = response.sales ?? [];
    const now = new Date().toISOString();

    return sales.map(sale => {
      const grossRevenue = Math.round((sale.price ?? 0) / 100 * 100) / 100;
      const platformFee = Math.round((sale.gumroad_fee ?? 0) / 100 * 100) / 100;
      const netPayout = Math.round((grossRevenue - platformFee) * 100) / 100;
      const saleDate = sale.created_at.slice(0, 10);

      return {
        id: crypto.randomUUID(),
        clientId: input.clientId,
        platform: 'gumroad' as const,
        platformTransactionId: this.makeTransactionId('GR', sale.id),
        platformId: sale.id,
        transactionDate: saleDate,
        createdAt: now,
        updatedAt: now,
        grossRevenue,
        platformFee,
        netPayout,
        description: sale.product_name
          ? `Gumroad sale — ${sale.product_name}`
          : `Gumroad sale — ${saleDate}`,
        sourceHierarchy: 'primary' as const,
        status: 'pending_review' as const,
      } satisfies ITransaction;
    });
  }

  protected extractNextCursor(raw: Record<string, unknown>): string | null {
    const response = raw as GumroadSalesResponse;
    return response.next_page_url ?? null;
  }
}
