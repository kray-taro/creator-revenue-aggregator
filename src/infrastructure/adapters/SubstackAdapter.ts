import * as crypto from 'crypto';
import type { FetchPlatformDataInput, IPlatformAdapter, PlatformAdapterError } from '@domain/ports';
import type { ITransaction, PlatformName } from '@domain/entities';
import { failure, success } from '@domain/shared';
import type { Result } from '@domain/shared';

interface SubstackCsvRow {
  date: string;
  amount: string;
  fee: string;
  net: string;
  type: string;
  subscriber_email?: string;
  description?: string;
  id: string;
}

/**
 * Substack CSV import adapter.
 *
 * Substack does not expose a financial API to third-party OAuth apps.
 * This adapter parses a CSV export from Substack's Payments dashboard
 * (Settings → Payments → Export CSV).
 *
 * Expected CSV columns (Substack export format):
 *   date, amount, fee, net, type, subscriber_email, description, id
 *
 * The CSV content must be provided via `csvContent` set before calling fetchData.
 * In the full system this adapter is invoked after a bookkeeper uploads the CSV
 * through the UI, which stores it temporarily and passes the connectionId as a
 * reference to the uploaded content.
 *
 * Fee model: Substack charges 10% on paid subscriptions + Stripe processing (~2.9%+$0.30).
 * We read `fee` from the CSV directly when available; otherwise apply 10% estimate.
 */
export class SubstackAdapter implements IPlatformAdapter {
  readonly platform: PlatformName = 'substack';

  private static readonly SUBSTACK_FEE_RATIO = 0.10;

  private csvContent: string | null = null;

  setCsvContent(content: string): void {
    this.csvContent = content;
  }

  async fetchData(input: FetchPlatformDataInput): Promise<Result<ITransaction[], PlatformAdapterError>> {
    if (!this.csvContent) {
      return failure({
        code: 'UNAUTHORIZED',
        message: 'Substack requires a CSV export. Please upload the Substack Payments CSV before running ingestion.',
        retryable: false,
      });
    }

    try {
      const transactions = this.parseCsv(this.csvContent, input);
      return success(transactions);
    } catch (err) {
      return failure({
        code: 'INVALID_SOURCE_PAYLOAD',
        message: err instanceof Error ? err.message : 'Failed to parse Substack CSV.',
        retryable: false,
      });
    }
  }

  private parseCsv(csv: string, input: FetchPlatformDataInput): ITransaction[] {
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return [];

    const headerLine = lines[0];
    if (!headerLine) return [];
    const headers = this.parseCsvLine(headerLine).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));

    const getCol = (row: string[], col: string): string => {
      const idx = headers.indexOf(col);
      return idx >= 0 ? (row[idx] ?? '').trim() : '';
    };

    const now = new Date().toISOString();
    const transactions: ITransaction[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim()) continue;

      const cols = this.parseCsvLine(line);
      const row: SubstackCsvRow = {
        date: getCol(cols, 'date'),
        amount: getCol(cols, 'amount'),
        fee: getCol(cols, 'fee'),
        net: getCol(cols, 'net'),
        type: getCol(cols, 'type'),
        subscriber_email: getCol(cols, 'subscriber_email'),
        description: getCol(cols, 'description'),
        id: getCol(cols, 'id'),
      };

      if (!row.date || !row.amount) continue;

      const rowDate = row.date.slice(0, 10);
      if (rowDate < input.fromDate || rowDate > input.toDate) continue;

      const grossRevenue = Math.round(parseFloat(row.amount) * 100) / 100;
      if (isNaN(grossRevenue) || grossRevenue <= 0) continue;

      const feeFromCsv = row.fee ? parseFloat(row.fee) : NaN;
      const platformFee = !isNaN(feeFromCsv) && feeFromCsv >= 0
        ? Math.round(feeFromCsv * 100) / 100
        : Math.round(grossRevenue * SubstackAdapter.SUBSTACK_FEE_RATIO * 100) / 100;
      const netPayout = Math.round((grossRevenue - platformFee) * 100) / 100;

      const txnId = row.id
        ? this.makeTransactionId('SS', row.id)
        : this.makeTransactionId('SS', input.clientId.slice(0, 8), rowDate, String(i));

      transactions.push({
        id: crypto.randomUUID(),
        clientId: input.clientId,
        platform: 'substack' as const,
        platformTransactionId: txnId,
        platformId: row.id || undefined,
        transactionDate: rowDate,
        createdAt: now,
        updatedAt: now,
        grossRevenue,
        platformFee,
        netPayout,
        description: row.description || row.type
          ? `Substack payment — ${row.description || row.type}`
          : `Substack payment — ${rowDate}`,
        sourceHierarchy: 'primary' as const,
        status: 'pending_review' as const,
      } satisfies ITransaction);
    }

    return transactions;
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  private makeTransactionId(prefix: string, ...parts: string[]): string {
    return `${prefix}-${parts.join('-')}`;
  }
}
