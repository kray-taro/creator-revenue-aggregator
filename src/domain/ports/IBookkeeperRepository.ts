import type { IBookkeeper } from '../entities/IBookkeeper';
import type { Result } from '../shared/Result';

export interface CreateBookkeeperInput {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string;
}

export interface BookkeeperRepositoryError {
  readonly code: 'NOT_FOUND' | 'DUPLICATE_EMAIL' | 'DB_ERROR' | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * CRUD port for the bookkeepers table.
 * Password hash is stored here — the repository never deals with plaintext passwords.
 */
export interface IBookkeeperRepository {
  findById(id: string): Promise<Result<IBookkeeper, BookkeeperRepositoryError>>;
  findByEmail(email: string): Promise<Result<IBookkeeper | null, BookkeeperRepositoryError>>;
  create(input: CreateBookkeeperInput): Promise<Result<IBookkeeper, BookkeeperRepositoryError>>;
  /**
   * Persists a new password_hash for an existing bookkeeper.
   * Callers must pre-hash via PasswordService before calling this.
   */
  updatePasswordHash(id: string, passwordHash: string): Promise<Result<boolean, BookkeeperRepositoryError>>;
}
