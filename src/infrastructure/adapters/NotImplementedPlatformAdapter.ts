import type { IPlatformAdapter, FetchPlatformDataInput, PlatformAdapterError } from '../../domain/ports/IPlatformAdapter';
import type { ITransaction, PlatformName } from '../../domain/entities/ITransaction';
import { failure, type Result } from '../../domain/shared/Result';

export class NotImplementedPlatformAdapter implements IPlatformAdapter {
  constructor(readonly platform: PlatformName) {}

  async fetchData(_: FetchPlatformDataInput): Promise<Result<ITransaction[], PlatformAdapterError>> {
    return failure({
      code: 'UNKNOWN',
      message: `${this.platform} adapter is not implemented yet.`,
      retryable: false,
    });
  }
}
