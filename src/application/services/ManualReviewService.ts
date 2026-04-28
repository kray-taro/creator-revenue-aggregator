import type { ITransaction } from '../../domain/entities/ITransaction';
import { validateTransaction, type ValidationError } from '../../domain/services/TransactionValidator';
import type { Result } from '../../domain/shared/Result';

/**
 * Applies the same domain validation rules during manual review edits.
 */
export class ManualReviewService {
  validate(transaction: Partial<ITransaction>): Result<boolean, ValidationError> {
    return validateTransaction(transaction);
  }
}
