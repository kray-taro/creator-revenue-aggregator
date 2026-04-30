import * as crypto from 'crypto';
import type { FetchPlatformDataInput } from '@domain/ports';
import type { ITransaction, PlatformName } from '@domain/entities';
import { AbstractPlatformAdapter } from './AbstractPlatformAdapter';

interface PatreonMember {
  id: string;
  attributes: {
    last_charge_date?: string;
    last_charge_status?: string;
    currently_entitled_amount_cents?: number;
    patron_status?: string;
  };
}

interface PatreonMembersResponse {
  data?: PatreonMember[];
  meta?: {
    pagination?: {
      cursors?: { next?: string };
      total?: number;
    };
  };
}

/**
 * Patreon API v2 adapter.
 *
 * API: patreon.com/api/oauth2/v2/campaigns/{campaignId}/members
 * Pagination: cursor-based via meta.pagination.cursors.next
 *
 * Fee model: Patreon charges 5-12% creator fee + ~2.9%+$0.30 payment processing.
 * We use an 8% blended rate as the platform fee when exact charge data is unavailable.
 * When `currently_entitled_amount_cents` is present, we treat that as gross and apply
 * the blended fee.
 *
 * Only members with `last_charge_status = Paid` and a charge date within the
 * requested date range are included.
 */
export class PatreonAdapter extends AbstractPlatformAdapter {
  readonly platform: PlatformName = 'patreon';

  private static readonly BLENDED_FEE_RATIO = 0.08;
  private static readonly CAMPAIGNS_URL = 'https://www.patreon.com/api/oauth2/v2/campaigns';

  private campaignId: string | null = null;

  protected buildRequestUrl(input: FetchPlatformDataInput, cursor: string | null): string {
    const campaignId = this.campaignId ?? 'me';
    const fields = [
      'last_charge_date',
      'last_charge_status',
      'currently_entitled_amount_cents',
      'patron_status',
    ].join(',');

    const params = new URLSearchParams({
      'fields[member]': fields,
      'page[count]': '100',
    });

    if (cursor) {
      params.set('page[cursor]', cursor);
    }

    return `${PatreonAdapter.CAMPAIGNS_URL}/${campaignId}/members?${params.toString()}`;
  }

  protected buildRequestHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    };
  }

  protected transformPage(raw: Record<string, unknown>, input: FetchPlatformDataInput): ITransaction[] {
    const response = raw as PatreonMembersResponse;
    const members = response.data ?? [];
    const now = new Date().toISOString();
    const transactions: ITransaction[] = [];

    for (const member of members) {
      const attrs = member.attributes;

      if (attrs.last_charge_status !== 'Paid') continue;
      if (!attrs.last_charge_date) continue;

      const chargeDate = attrs.last_charge_date.slice(0, 10);
      if (chargeDate < input.fromDate || chargeDate > input.toDate) continue;

      const grossRevenue = Math.round((attrs.currently_entitled_amount_cents ?? 0) / 100 * 100) / 100;
      if (grossRevenue <= 0) continue;

      const platformFee = Math.round(grossRevenue * PatreonAdapter.BLENDED_FEE_RATIO * 100) / 100;
      const netPayout = Math.round((grossRevenue - platformFee) * 100) / 100;

      transactions.push({
        id: crypto.randomUUID(),
        clientId: input.clientId,
        platform: 'patreon' as const,
        platformTransactionId: this.makeTransactionId('PAT', member.id, chargeDate),
        platformId: member.id,
        transactionDate: chargeDate,
        createdAt: now,
        updatedAt: now,
        grossRevenue,
        platformFee,
        netPayout,
        description: `Patreon pledge charge — ${chargeDate}`,
        sourceHierarchy: 'primary' as const,
        status: 'pending_review' as const,
      } satisfies ITransaction);
    }

    return transactions;
  }

  protected extractNextCursor(raw: Record<string, unknown>): string | null {
    const response = raw as PatreonMembersResponse;
    return response.meta?.pagination?.cursors?.next ?? null;
  }
}
