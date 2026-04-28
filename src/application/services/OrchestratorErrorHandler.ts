import { failure, type Result } from '@domain/shared';
import type { IAuditLogger } from '@domain/ports';

export interface OrchestratorError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface ErrorTransformOptions {
  readonly defaultCode: string;
  readonly codeMapping?: Record<string, string>;
}

/**
 * Shared error handling service for orchestrators.
 * Extracts common error transformation and audit logging patterns.
 */
export class OrchestratorErrorHandler {
  constructor(private readonly auditLogger: IAuditLogger) {}

  /**
   * Transforms a generic error into a structured orchestrator error.
   * Supports custom code mapping for specific error types.
   */
  transformError<T extends OrchestratorError>(
    error: { code: string; message: string },
    options: ErrorTransformOptions,
    additionalFields?: Partial<T>
  ): Result<never, T> {
    const mappedCode = options.codeMapping?.[error.code] || options.defaultCode;
    
    return failure({
      code: mappedCode,
      message: error.message,
      retryable: true,
      ...additionalFields,
    } as T);
  }

  /**
   * Logs an error phase to the audit logger with standardized structure.
   */
  async logErrorPhase(
    clientId: string,
    operation: string,
    errorDetails: {
      errorCode: string;
      errorMessage: string;
      startedAt?: string;
      endedAt?: string;
      additionalContext?: Record<string, unknown>;
    }
  ): Promise<void> {
    await this.auditLogger.log(clientId, operation, 'failure', {
      phase: 'end',
      errorCode: errorDetails.errorCode,
      errorMessage: errorDetails.errorMessage,
      startedAt: errorDetails.startedAt,
      endedAt: errorDetails.endedAt || new Date().toISOString(),
      ...errorDetails.additionalContext,
    });
  }

  /**
   * Handles lock acquisition errors with standardized transformation.
   */
  handleLockError<T extends OrchestratorError>(
    error: { code: string; message: string },
    additionalFields?: Partial<T>
  ): Result<never, T> {
    if (error.code === 'LOCK_NOT_ACQUIRED') {
      return failure({
        code: 'LOCK_NOT_ACQUIRED',
        message: error.message,
        retryable: true,
        ...additionalFields,
      } as T);
    }

    // Check if the error is a wrapped lookup/adapter error
    if (error.message.includes('PlatformLookupError') || error.message.includes('LookupError')) {
      return failure({
        code: 'PLATFORM_LOOKUP_FAILED',
        message: error.message.replace(/^.*(?:Platform)?LookupError:\s*/, ''),
        retryable: true,
        ...additionalFields,
      } as T);
    }

    return failure({
      code: 'UNEXPECTED',
      message: error.message,
      retryable: true,
      ...additionalFields,
    } as T);
  }
}


