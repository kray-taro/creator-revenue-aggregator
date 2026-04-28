import type { IPlatformAdapter, FetchPlatformDataInput, PlatformAdapterError } from '../../domain/ports/IPlatformAdapter';
import type { ITransaction } from '../../domain/entities/ITransaction';
import { success, type Result } from '../../domain/shared/Result';

export class MockAdapter implements IPlatformAdapter {
  readonly platform = 'youtube' as const;

  async fetchData(_: FetchPlatformDataInput): Promise<Result<ITransaction[], PlatformAdapterError>> {
    return success([
      {
        id: 'txn_mock_001',
        clientId: 'client_mock_001',
        platform: 'youtube',
        platformTransactionId: 'YT-MOCK-2026-03-15-001',
        platformId: 'YT-MOCK-001',
        transactionDate: '2026-03-15',
        createdAt: '2026-03-16T02:00:00.000Z',
        updatedAt: '2026-03-16T02:00:00.000Z',
        grossRevenue: 1000.0,
        platformFee: 450.0,
        netPayout: 550.0,
        description: 'Mock YouTube AdSense payout',
        sourceHierarchy: 'primary',
        status: 'pending_review',
      },
    ]);
  }
}
