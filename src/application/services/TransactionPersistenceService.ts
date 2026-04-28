import type { ITransactionRepository, RepositoryError } from '@domain/ports';
import type { ITransaction } from '@domain/entities';
import type { Result } from '@domain/shared';

/**
 * Handles transaction persistence logic
 */
export class TransactionPersistenceService {
  constructor(private readonly transactionRepository: ITransactionRepository) {}

  async saveTransaction(
    transaction: ITransaction
  ): Promise<Result<ITransaction, RepositoryError>> {
    return this.transactionRepository.save(transaction);
  }

  async saveTransactionsBulk(
    transactions: ITransaction[]
  ): Promise<Result<ITransaction[], RepositoryError>> {
    return this.transactionRepository.saveBulk(transactions);
  }
}


