import type { IPlatformAdapter, FetchPlatformDataInput, PlatformAdapterError } from '@domain/ports';
import type { ITransaction } from '@domain/entities/ITransaction';
import { failure, type Result } from '@domain/shared/Result';

export class UnknownPlatformAdapter implements IPlatformAdapter {
  readonly platform = 'unknown' as const;

  constructor(private readonly requestedPlatform: string) {}

  async fetchData(_: FetchPlatformDataInput): Promise<Result<ITransaction[], PlatformAdapterError>> {
    return failure({
      code: 'UNKNOWN',
      message: `Unknown platform: ${this.requestedPlatform}`,
      retryable: false,
      details: { requestedPlatform: this.requestedPlatform },
    });
  }
}
