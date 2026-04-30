import { failure, success } from '@domain/shared';
import type { Result } from '@domain/shared';
import type {
  IQuickBooksAdapter,
  QBJournalEntryInput,
  QBJournalEntryResult,
  QBSyncError,
} from '@domain/ports';
import type { IPlatformConnectionRepository, IEncryptionService } from '@domain/ports';

const QB_API_BASE = 'https://quickbooks.api.intuit.com/v3/company';
const QB_SANDBOX_BASE = 'https://sandbox-quickbooks.api.intuit.com/v3/company';
const QB_BATCH_LIMIT = 30;

interface QBJournalEntryResponse {
  JournalEntry?: {
    Id?: string;
    PrivateNote?: string;
    TxnDate?: string;
  };
  Fault?: {
    Error?: Array<{ Message?: string; code?: string }>;
  };
}

interface QBBatchItemResponse {
  bId: string;
  JournalEntry?: { Id?: string; PrivateNote?: string };
  Fault?: { Error?: Array<{ Message?: string }> };
}

interface QBBatchResponse {
  BatchItemResponse?: QBBatchItemResponse[];
  Fault?: { Error?: Array<{ Message?: string }> };
}

/**
 * QuickBooks Online adapter — implements IQuickBooksAdapter.
 *
 * Journal entry creation follows the append-only pattern:
 * 1. POST /v3/company/{realmId}/journalentry to create.
 * 2. GET the created entry to verify PrivateNote contains the external_id.
 * 3. Never update or delete existing entries (audit integrity).
 *
 * Batch create uses QB's /batch endpoint (max 30 operations per call).
 * Tokens are decrypted from PlatformConnectionRepository at call time.
 */
export class QuickBooksAdapter implements IQuickBooksAdapter {
  constructor(
    private readonly connectionRepo: IPlatformConnectionRepository,
    private readonly encryptionService: IEncryptionService,
    private readonly connectionId: string,
    private readonly useSandbox: boolean = false
  ) {}

  private get apiBase(): string {
    return this.useSandbox ? QB_SANDBOX_BASE : QB_API_BASE;
  }

  async createJournalEntry(
    entry: QBJournalEntryInput,
    realmId: string
  ): Promise<Result<QBJournalEntryResult, QBSyncError>> {
    const tokenResult = await this.getAccessToken();
    if (!tokenResult.ok) return failure(tokenResult.error);

    const payload = this.buildJournalEntryPayload(entry);

    let response: Response;
    try {
      response = await fetch(`${this.apiBase}/${realmId}/journalentry`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenResult.value}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      return failure({ code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : 'Network error', retryable: true });
    }

    if (response.status === 401) {
      return failure({ code: 'TOKEN_EXPIRED', message: 'QB access token expired. Refresh required.', retryable: false });
    }

    const raw = await response.json().catch(() => ({})) as QBJournalEntryResponse;

    if (!response.ok || raw.Fault) {
      const msg = raw.Fault?.Error?.[0]?.Message ?? `QB API error ${response.status}`;
      const code = raw.Fault?.Error?.[0]?.code;
      return failure({
        code: code === '6240' ? 'DUPLICATE_ENTRY' : 'INVALID_ENTRY',
        message: msg,
        retryable: response.status >= 500,
        details: { httpStatus: response.status },
      });
    }

    const qbEntry = raw.JournalEntry;
    if (!qbEntry?.Id) {
      return failure({ code: 'UNKNOWN', message: 'QB response missing JournalEntry.Id', retryable: false });
    }

    const verifyResult = await this.verifyEntry(qbEntry.Id, entry.externalId, realmId);
    if (!verifyResult.ok) return failure(verifyResult.error);
    if (!verifyResult.value) {
      return failure({ code: 'VERIFICATION_FAILED', message: `QB entry ${qbEntry.Id} PrivateNote did not contain external_id=${entry.externalId}`, retryable: false });
    }

    return success({ qbEntryId: qbEntry.Id, externalId: entry.externalId, syncedAt: new Date().toISOString() });
  }

  async batchCreateJournalEntries(
    entries: ReadonlyArray<QBJournalEntryInput>,
    realmId: string
  ): Promise<Result<QBJournalEntryResult[], QBSyncError>> {
    const tokenResult = await this.getAccessToken();
    if (!tokenResult.ok) return failure(tokenResult.error);

    const results: QBJournalEntryResult[] = [];

    for (let i = 0; i < entries.length; i += QB_BATCH_LIMIT) {
      const chunk = entries.slice(i, i + QB_BATCH_LIMIT);

      const batchPayload = {
        BatchItemRequest: chunk.map((entry, idx) => ({
          bId: `batch-${i + idx}`,
          operation: 'create',
          JournalEntry: this.buildJournalEntryPayload(entry),
        })),
      };

      let response: Response;
      try {
        response = await fetch(`${this.apiBase}/${realmId}/batch`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenResult.value}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batchPayload),
        });
      } catch (err) {
        return failure({ code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : 'Network error', retryable: true });
      }

      if (response.status === 401) {
        return failure({ code: 'TOKEN_EXPIRED', message: 'QB access token expired.', retryable: false });
      }

      const raw = await response.json().catch(() => ({})) as QBBatchResponse;

      if (!response.ok || raw.Fault) {
        const msg = raw.Fault?.Error?.[0]?.Message ?? `QB batch error ${response.status}`;
        return failure({ code: 'INVALID_ENTRY', message: msg, retryable: response.status >= 500 });
      }

      for (const itemResponse of raw.BatchItemResponse ?? []) {
        if (itemResponse.Fault || !itemResponse.JournalEntry?.Id) {
          const msg = itemResponse.Fault?.Error?.[0]?.Message ?? 'Batch item failed';
          return failure({ code: 'INVALID_ENTRY', message: msg, retryable: false });
        }

        const bIdx = parseInt(itemResponse.bId.replace('batch-', ''), 10);
        const entry = entries[bIdx];
        if (!entry) continue;

        results.push({
          qbEntryId: itemResponse.JournalEntry.Id,
          externalId: entry.externalId,
          syncedAt: new Date().toISOString(),
        });
      }
    }

    return success(results);
  }

  async verifyEntry(
    qbEntryId: string,
    externalId: string,
    realmId: string
  ): Promise<Result<boolean, QBSyncError>> {
    const tokenResult = await this.getAccessToken();
    if (!tokenResult.ok) return failure(tokenResult.error);

    let response: Response;
    try {
      response = await fetch(`${this.apiBase}/${realmId}/journalentry/${qbEntryId}`, {
        headers: {
          Authorization: `Bearer ${tokenResult.value}`,
          Accept: 'application/json',
        },
      });
    } catch (err) {
      return failure({ code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : 'Network error', retryable: true });
    }

    if (!response.ok) {
      return failure({ code: 'NETWORK_ERROR', message: `QB verify error ${response.status}`, retryable: response.status >= 500 });
    }

    const raw = await response.json().catch(() => ({})) as QBJournalEntryResponse;
    const privateNote = raw.JournalEntry?.PrivateNote ?? '';
    return success(privateNote.includes(`external_id:${externalId}`));
  }

  private buildJournalEntryPayload(entry: QBJournalEntryInput): Record<string, unknown> {
    return {
      TxnDate: entry.txnDate,
      PrivateNote: `external_id:${entry.externalId}${entry.privateNote ? ` | ${entry.privateNote}` : ''}`,
      Line: entry.lines.map(line => ({
        Amount: line.amount,
        Description: line.description,
        DetailType: 'JournalEntryLineDetail',
        JournalEntryLineDetail: {
          PostingType: line.postingType,
          AccountRef: { value: line.accountId },
        },
      })),
      ...(entry.currencyRef ? { CurrencyRef: { value: entry.currencyRef } } : {}),
    };
  }

  private async getAccessToken(): Promise<Result<string, QBSyncError>> {
    const tokenBundle = await this.connectionRepo.getTokens(this.connectionId);
    if (!tokenBundle.ok) {
      return failure({ code: 'UNAUTHORIZED', message: tokenBundle.error.message, retryable: tokenBundle.error.retryable });
    }
    try {
      const decrypted = this.encryptionService.decrypt(tokenBundle.value.accessToken);
      return success(decrypted);
    } catch {
      return failure({ code: 'UNAUTHORIZED', message: 'Failed to decrypt QB access token.', retryable: false });
    }
  }
}
