import * as zlib from 'zlib';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { failure, success } from '@domain/shared';
import type { Result } from '@domain/shared';
import type {
  IRawResponseArchivalService,
  RawResponseMetadata,
  ArchivalResult,
  RawResponseArchivalError,
} from '@domain/ports';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * S3 Raw Response Archival Service — implements IRawResponseArchivalService (US-102).
 *
 * Key format: {clientId}/{platformName}/{YYYY-MM-DD}/{timestamp}-{requestId}.json.gz
 * Compression: gzip (typically 70-90% reduction on JSON API responses).
 * Retrieval: gunzip + JSON.parse round-trip.
 *
 * Archival failures MUST NOT block ingestion — callers catch failures independently.
 */
export class S3RawResponseArchivalService implements IRawResponseArchivalService {
  private readonly s3: S3Client;

  constructor(
    private readonly bucket: string,
    region: string
  ) {
    this.s3 = new S3Client({ region });
  }

  async archiveRawResponse<T = unknown>(
    response: T,
    metadata: RawResponseMetadata
  ): Promise<Result<ArchivalResult, RawResponseArchivalError>> {
    let serialized: string;
    try {
      serialized = JSON.stringify({
        metadata,
        response,
        archivedAt: new Date().toISOString(),
      });
    } catch (err) {
      return failure({
        code: 'SERIALIZATION_FAILED',
        message: err instanceof Error ? err.message : 'Failed to serialize response.',
        retryable: false,
      });
    }

    let compressed: Buffer;
    try {
      compressed = await gzip(serialized);
    } catch (err) {
      return failure({
        code: 'SERIALIZATION_FAILED',
        message: err instanceof Error ? err.message : 'Failed to compress response.',
        retryable: false,
      });
    }

    const s3Key = this.buildKey(metadata);
    const archivedAt = new Date().toISOString();

    try {
      await this.s3.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: compressed,
        ContentType: 'application/json',
        ContentEncoding: 'gzip',
        Metadata: {
          clientId: metadata.clientId,
          platformName: metadata.platformName,
          fromDate: metadata.fromDate,
          toDate: metadata.toDate,
          recordCount: String(metadata.recordCount),
          ...(metadata.requestId ? { requestId: metadata.requestId } : {}),
        },
      }));
    } catch (err) {
      return failure({
        code: 'UPLOAD_FAILED',
        message: err instanceof Error ? err.message : 'S3 upload failed.',
        retryable: true,
      });
    }

    return success({
      s3Key,
      s3Bucket: this.bucket,
      archivedAt,
      sizeBytes: compressed.length,
    });
  }

  async retrieveRawResponse<T = unknown>(
    s3Key: string
  ): Promise<Result<T, RawResponseArchivalError>> {
    let body: Buffer;
    try {
      const output = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: s3Key }));
      if (!output.Body) {
        return failure({ code: 'UNKNOWN', message: 'Empty response body from S3.', retryable: false });
      }
      const chunks: Buffer[] = [];
      for await (const chunk of output.Body as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks);
    } catch (err) {
      return failure({
        code: 'S3_UNAVAILABLE',
        message: err instanceof Error ? err.message : 'Failed to retrieve from S3.',
        retryable: true,
      });
    }

    let decompressed: Buffer;
    try {
      decompressed = await gunzip(body);
    } catch (err) {
      return failure({ code: 'SERIALIZATION_FAILED', message: 'Failed to decompress S3 object.', retryable: false });
    }

    try {
      const parsed = JSON.parse(decompressed.toString('utf8')) as { response: T };
      return success(parsed.response);
    } catch (err) {
      return failure({ code: 'SERIALIZATION_FAILED', message: 'Failed to parse decompressed JSON.', retryable: false });
    }
  }

  private buildKey(metadata: RawResponseMetadata): string {
    const date = metadata.fromDate.slice(0, 10);
    const timestamp = metadata.timestamp.replace(/[:.]/g, '-');
    const requestId = metadata.requestId ?? crypto.randomUUID().slice(0, 8);
    return `${metadata.clientId}/${metadata.platformName}/${date}/${timestamp}-${requestId}.json.gz`;
  }
}
