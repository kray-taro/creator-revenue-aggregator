import * as crypto from 'crypto';
import type { FetchPlatformDataInput } from '@domain/ports';
import type { ITransaction, PlatformName } from '@domain/entities';
import { AbstractPlatformAdapter } from './AbstractPlatformAdapter';

interface ShopifyTransaction {
  id: number;
  kind: string;
  status: string;
  amount: string;
  currency: string;
  fee?: string;
  created_at: string;
  gateway?: string;
  order_id?: number;
}

interface ShopifyOrderTransaction {
  id: number;
  created_at: string;
  total_price: string;
  financial_status: string;
  transactions?: ShopifyTransaction[];
}

interface ShopifyOrdersResponse {
  orders?: ShopifyOrderTransaction[];
}

/**
 * Shopify Admin API adapter (REST Admin API 2024-01).
 *
 * API: {shop}.myshopify.com/admin/api/2024-01/orders.json
 * Filters: financial_status=paid, created_at_min/max for date range.
 * Pagination: Link header cursor-based via `page_info` parameter.
 *
 * Fee model: Shopify charges 0.5%–2% transaction fee depending on plan,
 * plus Shopify Payments processing (2.9%+$0.30 basic, 2.6%+$0.30 Shopify,
 * 2.4%+$0.30 Advanced). We read the transaction `fee` field when available
 * and fall back to a 2.9% + $0.30 estimate.
 *
 * The shop domain is derived from the connection's platformUserId field,
 * which is set during OAuth and contains the myshopify.com domain.
 */
export class ShopifyAdapter extends AbstractPlatformAdapter {
  readonly platform: PlatformName = 'shopify';

  private static readonly DEFAULT_FEE_RATIO = 0.029;
  private static readonly DEFAULT_FEE_FIXED = 0.30;

  private shopDomain: string | null = null;

  setShopDomain(domain: string): void {
    this.shopDomain = domain;
  }

  protected buildRequestUrl(input: FetchPlatformDataInput, cursor: string | null): string {
    const domain = this.shopDomain ?? 'placeholder.myshopify.com';
    const base = `https://${domain}/admin/api/2024-01/orders.json`;

    if (cursor) {
      return `${base}?page_info=${cursor}&limit=250`;
    }

    const params = new URLSearchParams({
      status: 'any',
      financial_status: 'paid',
      created_at_min: `${input.fromDate}T00:00:00Z`,
      created_at_max: `${input.toDate}T23:59:59Z`,
      limit: '250',
      fields: 'id,created_at,total_price,financial_status,transactions',
    });
    return `${base}?${params.toString()}`;
  }

  protected buildRequestHeaders(accessToken: string): Record<string, string> {
    return {
      'X-Shopify-Access-Token': accessToken,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  protected transformPage(raw: Record<string, unknown>, input: FetchPlatformDataInput): ITransaction[] {
    const response = raw as ShopifyOrdersResponse;
    const orders = response.orders ?? [];
    const now = new Date().toISOString();

    return orders.map(order => {
      const grossRevenue = Math.round(parseFloat(order.total_price ?? '0') * 100) / 100;
      const platformFee = this.calculateFee(grossRevenue, order.transactions);
      const netPayout = Math.round((grossRevenue - platformFee) * 100) / 100;
      const orderDate = order.created_at.slice(0, 10);

      return {
        id: crypto.randomUUID(),
        clientId: input.clientId,
        platform: 'shopify' as const,
        platformTransactionId: this.makeTransactionId('SH', String(order.id)),
        platformId: String(order.id),
        transactionDate: orderDate,
        createdAt: now,
        updatedAt: now,
        grossRevenue,
        platformFee,
        netPayout,
        description: `Shopify order #${order.id} — ${orderDate}`,
        sourceHierarchy: 'primary' as const,
        status: 'pending_review' as const,
      } satisfies ITransaction;
    });
  }

  protected extractNextCursor(_raw: Record<string, unknown>): string | null {
    return null;
  }

  override async fetchData(input: FetchPlatformDataInput) {
    const result = await super.fetchData(input);
    return result;
  }

  private calculateFee(grossRevenue: number, transactions?: ShopifyTransaction[]): number {
    if (transactions && transactions.length > 0) {
      const totalFee = transactions
        .filter(t => t.status === 'success')
        .reduce((sum, t) => sum + (t.fee ? parseFloat(t.fee) : 0), 0);
      if (totalFee > 0) {
        return Math.round(totalFee * 100) / 100;
      }
    }
    const pctFee = Math.round(grossRevenue * ShopifyAdapter.DEFAULT_FEE_RATIO * 100) / 100;
    return Math.round((pctFee + ShopifyAdapter.DEFAULT_FEE_FIXED) * 100) / 100;
  }
}
