import type { ITransaction } from '../entities/ITransaction';
import { failure, success, type Result } from '../shared/Result';

export interface ValidationError {
  readonly code:
    | 'MISSING_FIELD'
    | 'INVALID_AMOUNT'
    | 'CRS_INVARIANT_FAILED'
    | 'NEGATIVE_GROSS_REVENUE'
    | 'FUTURE_TRANSACTION_DATE'
    | 'YOUTUBE_FEE_OUT_OF_RANGE';
  readonly message: string;
  readonly field?: 'grossRevenue' | 'platformFee' | 'netPayout' | 'transactionDate';
}

const ROUNDING_TOLERANCE = 0.01;
const YOUTUBE_FEE_TARGET = 0.45;
const YOUTUBE_FEE_TOLERANCE = 0.01;

/**
 * Helper to validate required fields and return typed failure if missing.
 */
const requireField = <K extends keyof Pick<ITransaction, 'grossRevenue' | 'platformFee' | 'netPayout' | 'transactionDate'>>(
  transaction: Partial<ITransaction>,
  field: K
): Result<ITransaction[K], ValidationError> => {
  const value = transaction[field];
  if (value === undefined || value === null || value === '') {
    return failure({
      code: 'MISSING_FIELD',
      message: `${field} is required for validation.`,
      field: field as ValidationError['field'],
    });
  }
  return success(value);
};

/**
 * Helper to validate all required fields in one pass.
 */
const validateRequiredFields = (
  transaction: Partial<ITransaction>,
  fields: Array<'grossRevenue' | 'platformFee' | 'netPayout' | 'transactionDate'>
): Result<Pick<ITransaction, 'grossRevenue' | 'platformFee' | 'netPayout' | 'transactionDate'>, ValidationError> => {
  for (const field of fields) {
    const result = requireField(transaction, field);
    if (!result.ok) return result as Result<never, ValidationError>;
  }
  return success(transaction as Pick<ITransaction, 'grossRevenue' | 'platformFee' | 'netPayout' | 'transactionDate'>);
};

/**
 * Validates that all numeric amounts are finite numbers.
 */
const validateFiniteNumbers = (
  grossRevenue: number,
  platformFee: number,
  netPayout: number
): Result<boolean, ValidationError> => {
  if (!Number.isFinite(grossRevenue) || !Number.isFinite(platformFee) || !Number.isFinite(netPayout)) {
    return failure({
      code: 'INVALID_AMOUNT',
      message: 'Amounts must be valid finite numbers.',
    });
  }
  return success(true);
};

/**
 * Gets today's date at midnight UTC.
 */
const getTodayUtc = (): Date => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
};

/**
 * Validates the CRS invariant: grossRevenue - platformFee = netPayout (within tolerance).
 */
const validateCRSInvariant = (
  grossRevenue: number,
  platformFee: number,
  netPayout: number
): Result<boolean, ValidationError> => {
  const calculatedNet = grossRevenue - platformFee;
  const difference = Math.abs(calculatedNet - netPayout);

  if (difference > ROUNDING_TOLERANCE) {
    return failure({
      code: 'CRS_INVARIANT_FAILED',
      message: 'CRS invariant failed: grossRevenue - platformFee must equal netPayout within $0.01.',
    });
  }
  return success(true);
};

/**
 * Validates YouTube platform fee ratio (45% ± 1%).
 */
const validateYouTubeFeeRatio = (
  grossRevenue: number,
  platformFee: number
): Result<boolean, ValidationError> => {
  if (grossRevenue === 0) return success(true);

  const feeRatio = platformFee / grossRevenue;
  const minAllowed = YOUTUBE_FEE_TARGET - YOUTUBE_FEE_TOLERANCE;
  const maxAllowed = YOUTUBE_FEE_TARGET + YOUTUBE_FEE_TOLERANCE;

  if (feeRatio < minAllowed || feeRatio > maxAllowed) {
    return failure({
      code: 'YOUTUBE_FEE_OUT_OF_RANGE',
      message: `YouTube fee ratio out of range: expected 45% ± 1%, received ${(feeRatio * 100).toFixed(2)}%.`,
      field: 'platformFee',
    });
  }

  return success(true);
};

/**
 * Information Expert domain service:
 * only validates transaction data, independent from source or transport.
 */
export const validateTransaction = (
  transaction: Partial<ITransaction>
): Result<boolean, ValidationError> => {
  // 1. Validate required fields
  const fieldsResult = validateRequiredFields(transaction, [
    'grossRevenue',
    'platformFee',
    'netPayout',
    'transactionDate'
  ]);
  if (!fieldsResult.ok) return fieldsResult;

  const { grossRevenue, platformFee, netPayout, transactionDate } = fieldsResult.value;

  // 2. Validate numeric values are finite
  const numericResult = validateFiniteNumbers(grossRevenue, platformFee, netPayout);
  if (!numericResult.ok) return numericResult;

  // 3. Validate business rules
  if (grossRevenue < 0) {
    return failure({
      code: 'NEGATIVE_GROSS_REVENUE',
      message: 'grossRevenue must be >= 0.',
      field: 'grossRevenue',
    });
  }

  // 4. Validate transaction date is not in the future
  const txDate = new Date(transactionDate);
  const todayUtc = getTodayUtc();

  if (txDate.getTime() > todayUtc.getTime()) {
    return failure({
      code: 'FUTURE_TRANSACTION_DATE',
      message: 'transactionDate cannot be in the future.',
      field: 'transactionDate',
    });
  }

  // 5. Validate CRS invariant
  const crsResult = validateCRSInvariant(grossRevenue, platformFee, netPayout);
  if (!crsResult.ok) return crsResult;

  // 6. Platform-specific validation
  if ((transaction.platform ?? '').toLowerCase() === 'youtube' && grossRevenue > 0) {
    const youtubeResult = validateYouTubeFeeRatio(grossRevenue, platformFee);
    if (!youtubeResult.ok) return youtubeResult;
  }

  return success(true);
};
