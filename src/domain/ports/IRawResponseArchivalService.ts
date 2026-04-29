import type { Result } from '../shared/Result';
import type { PlatformName } from '../entities/ITransaction';

/**
 * Raw API Response Archival Metadata
 * Captures context about the archived response for compliance and debugging
 */
export interface RawResponseMetadata {
  readonly clientId: string;
  readonly platformName: PlatformName;
  readonly timestamp: string; // ISO 8601 timestamp
  readonly fromDate: string;  // ISO 8601 date (YYYY-MM-DD)
  readonly toDate: string;    // ISO 8601 date (YYYY-MM-DD)
  readonly recordCount: number;
  readonly requestId?: string; // Optional correlation ID
}

/**
 * Archival Result
 * Contains S3 location and metadata for the archived response
 */
export interface ArchivalResult {
  readonly s3Key: string;      // S3 object key
  readonly s3Bucket: string;   // S3 bucket name
  readonly archivedAt: string; // ISO 8601 timestamp
  readonly sizeBytes: number;  // Size of archived data
}

export interface RawResponseArchivalError {
  readonly code: 'S3_UNAVAILABLE' | 'SERIALIZATION_FAILED' | 'UPLOAD_FAILED' | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * Raw Response Archival Service Interface
 * 
 * Purpose: Archive raw API responses from platform adapters to S3 for:
 * - Compliance: Immutable audit trail of source data
 * - Debugging: Replay failed ingestions with original data
 * - Reconciliation: Prove what platform returned vs what was processed
 * 
 * Implementation Notes:
 * - Sprint 3 deliverable (US-102: Raw API response archival)
 * - Should compress responses before upload (gzip recommended)
 * - Should use client-side encryption for sensitive data
 * - Should implement lifecycle policies (e.g., archive to Glacier after 90 days)
 * - Should generate S3 keys with structure: {clientId}/{platformName}/{date}/{timestamp}.json.gz
 * 
 * @see docs/SPRINT_1_CODE_REVIEW.md P1-7
 * @see docs/PRODUCT REQUIREMENTS DOCUMENT (PRD).md US-102
 */
export interface IRawResponseArchivalService {
  /**
   * Archives raw API response to S3
   * 
   * @param response - Raw response data from platform adapter (will be JSON serialized)
   * @param metadata - Context about the response for indexing and retrieval
   * @returns Result with S3 location or error
   */
  archiveRawResponse<T = unknown>(
    response: T,
    metadata: RawResponseMetadata
  ): Promise<Result<ArchivalResult, RawResponseArchivalError>>;

  /**
   * Retrieves archived raw response from S3
   * 
   * @param s3Key - S3 object key from previous archival
   * @returns Result with deserialized response or error
   */
  retrieveRawResponse<T = unknown>(
    s3Key: string
  ): Promise<Result<T, RawResponseArchivalError>>;
}

// Made with Bob
