import type { ITransaction } from '../../domain/entities/ITransaction';
import { validateTransaction, type ValidationError } from '../../domain/services/TransactionValidator';
import type { Result } from '../../domain/shared/Result';

/**
 * Orchestrates ingestion-specific transaction validation.
 * Persistence and adapter wiring are intentionally out of scope for this sprint.
 */
export class IngestionService {
  validate(transaction: Partial<ITransaction>): Result<boolean, ValidationError> {
    return validateTransaction(transaction);
  }
}
