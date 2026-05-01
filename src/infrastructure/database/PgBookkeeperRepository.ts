import type {
  IBookkeeperRepository,
  BookkeeperRepositoryError,
  CreateBookkeeperInput
} from '@domain/ports';
import type { IBookkeeper } from '@domain/entities';
import { failure, success, type Result } from '@domain/shared';
import type { IPgClient } from './PgTransactionRepository';

interface BookkeeperRow {
  id: string;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export class PgBookkeeperRepository implements IBookkeeperRepository {
  constructor(private readonly pgClient: IPgClient) {}

  async findById(id: string): Promise<Result<IBookkeeper, BookkeeperRepositoryError>> {
    const sql = `
      SELECT id, email, name, created_at, updated_at
      FROM bookkeepers
      WHERE id = $1
      LIMIT 1;
    `;

    try {
      const result = await this.pgClient.query<BookkeeperRow>(sql, [id]);
      const row = result.rows[0];
      if (!row) {
        return failure({ code: 'NOT_FOUND', message: `Bookkeeper not found: ${id}`, retryable: false });
      }
      return success(this.toEntity(row));
    } catch (error) {
      return failure(this.toError(error));
    }
  }

  async findByEmail(email: string): Promise<Result<IBookkeeper | null, BookkeeperRepositoryError>> {
    const sql = `
      SELECT id, email, name, created_at, updated_at
      FROM bookkeepers
      WHERE email = $1
      LIMIT 1;
    `;

    try {
      const result = await this.pgClient.query<BookkeeperRow>(sql, [email]);
      const row = result.rows[0];
      return success(row ? this.toEntity(row) : null);
    } catch (error) {
      return failure(this.toError(error));
    }
  }

  /**
   * Separate query to fetch password_hash for authentication.
   * The entity (IBookkeeper) intentionally excludes the hash for safety.
   */
  async findPasswordHash(id: string): Promise<Result<string, BookkeeperRepositoryError>> {
    const sql = `
      SELECT password_hash
      FROM bookkeepers
      WHERE id = $1
      LIMIT 1;
    `;

    try {
      const result = await this.pgClient.query<{ password_hash: string }>(sql, [id]);
      const row = result.rows[0];
      if (!row) {
        return failure({ code: 'NOT_FOUND', message: `Bookkeeper not found: ${id}`, retryable: false });
      }
      return success(row.password_hash);
    } catch (error) {
      return failure(this.toError(error));
    }
  }

  async create(input: CreateBookkeeperInput): Promise<Result<IBookkeeper, BookkeeperRepositoryError>> {
    const sql = `
      INSERT INTO bookkeepers (id, email, name, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING id, email, name, created_at, updated_at;
    `;

    try {
      const result = await this.pgClient.query<BookkeeperRow>(sql, [
        input.id,
        input.email,
        input.name,
        input.passwordHash,
      ]);
      const row = result.rows[0];
      if (!row) {
        return failure({ code: 'DB_ERROR', message: 'Insert returned no row.', retryable: false });
      }
      return success(this.toEntity(row));
    } catch (error) {
      if (this.isDuplicateEmailError(error)) {
        return failure({
          code: 'DUPLICATE_EMAIL',
          message: `A bookkeeper with email ${input.email} already exists.`,
          retryable: false,
        });
      }
      return failure(this.toError(error));
    }
  }

  async updatePasswordHash(
    id: string,
    passwordHash: string
  ): Promise<Result<boolean, BookkeeperRepositoryError>> {
    const sql = `
      UPDATE bookkeepers
      SET password_hash = $2, updated_at = NOW()
      WHERE id = $1;
    `;

    try {
      const result = await this.pgClient.query(sql, [id, passwordHash]);
      const rowCount = result.rowCount ?? 0;
      if (rowCount === 0) {
        return failure({ code: 'NOT_FOUND', message: `Bookkeeper not found: ${id}`, retryable: false });
      }
      return success(true);
    } catch (error) {
      return failure(this.toError(error));
    }
  }

  private toEntity(row: BookkeeperRow): IBookkeeper {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private isDuplicateEmailError(error: unknown): boolean {
    return error instanceof Error && error.message.includes('duplicate key') &&
      error.message.includes('email');
  }

  private toError(error: unknown): BookkeeperRepositoryError {
    if (error instanceof Error) {
      return { code: 'DB_ERROR', message: error.message, retryable: true };
    }
    return { code: 'UNKNOWN', message: 'Unknown bookkeeper repository error.', retryable: true };
  }
}
