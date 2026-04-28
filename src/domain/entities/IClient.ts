/**
 * Client aggregate contract for practice-level bookkeeping configuration.
 */
export interface IClient {
  readonly id: string;
  readonly name: string;
  readonly email: string;

  readonly accountingMode: AccountingMode;
  readonly qbCompanyId?: string;

  readonly createdAt: string; // ISO-8601 datetime
  readonly updatedAt: string; // ISO-8601 datetime
}

export type AccountingMode = 'accrual' | 'cash';
