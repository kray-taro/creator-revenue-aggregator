import type { IClient, AccountingMode } from '../entities/IClient';
import type { Result } from '../shared/Result';

export interface CreateClientInput {
  readonly id: string;
  readonly bookkeeperId: string;
  readonly name: string;
  readonly email: string;
  readonly accountingMode: AccountingMode;
  readonly qbCompanyId?: string;
}

export interface UpdateClientInput {
  readonly name?: string;
  readonly email?: string;
  readonly accountingMode?: AccountingMode;
  readonly qbCompanyId?: string;
}

export interface ClientRepositoryError {
  readonly code: 'NOT_FOUND' | 'DUPLICATE_EMAIL' | 'DB_ERROR' | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * CRUD port for the clients table.
 * Application layer depends on this port; PostgreSQL implementation lives in infrastructure (DIP).
 */
export interface IClientRepository {
  findById(id: string): Promise<Result<IClient, ClientRepositoryError>>;
  findByBookkeeperId(bookkeeperId: string): Promise<Result<IClient[], ClientRepositoryError>>;
  create(input: CreateClientInput): Promise<Result<IClient, ClientRepositoryError>>;
  update(id: string, input: UpdateClientInput): Promise<Result<IClient, ClientRepositoryError>>;
}
