import { S3RawResponseArchivalService } from './S3RawResponseArchivalService';

jest.mock('@aws-sdk/client-s3', () => {
  const mockSend = jest.fn();
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
    PutObjectCommand: jest.fn().mockImplementation(args => ({ ...args, _type: 'PutObject' })),
    GetObjectCommand: jest.fn().mockImplementation(args => ({ ...args, _type: 'GetObject' })),
    __mockSend: mockSend,
  };
});

const { __mockSend: mockSend } = jest.requireMock('@aws-sdk/client-s3') as { __mockSend: jest.Mock };

const BUCKET = 'test-raw-responses';
const REGION = 'us-east-1';

const testMetadata = {
  clientId: 'client-s3-001',
  platformName: 'youtube' as const,
  timestamp: '2026-03-15T10:00:00.000Z',
  fromDate: '2026-03-01',
  toDate: '2026-03-31',
  recordCount: 42,
  requestId: 'req-001',
};

describe('S3RawResponseArchivalService', () => {
  let service: S3RawResponseArchivalService;

  beforeEach(() => {
    mockSend.mockReset();
    service = new S3RawResponseArchivalService(BUCKET, REGION);
  });

  describe('archiveRawResponse', () => {
    it('uploads a gzipped JSON object and returns the S3 key and size', async () => {
      mockSend.mockResolvedValueOnce({});
      const payload = { rows: [['2026-03-15', 1000]], totalItems: 1 };
      const result = await service.archiveRawResponse(payload, testMetadata);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.s3Bucket).toBe(BUCKET);
      expect(result.value.s3Key).toContain('client-s3-001/youtube/2026-03-01/');
      expect(result.value.s3Key).toMatch(/\.json\.gz$/);
      expect(result.value.sizeBytes).toBeGreaterThan(0);
    });

    it('builds the S3 key using fromDate (not toDate)', async () => {
      mockSend.mockResolvedValueOnce({});
      const result = await service.archiveRawResponse({}, testMetadata);
      if (!result.ok) return;
      expect(result.value.s3Key).toContain('2026-03-01');
      expect(result.value.s3Key).not.toContain('2026-03-31');
    });

    it('returns UPLOAD_FAILED when S3 send throws', async () => {
      mockSend.mockRejectedValueOnce(new Error('S3 unavailable'));
      const result = await service.archiveRawResponse({ data: 'x' }, testMetadata);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UPLOAD_FAILED');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('sends compressed data (smaller than uncompressed for repetitive JSON)', async () => {
      let capturedBody: Buffer | undefined;
      mockSend.mockImplementationOnce((cmd: { Body?: Buffer }) => {
        capturedBody = cmd.Body;
        return Promise.resolve({});
      });

      const largePayload = { rows: Array(100).fill(['2026-03-15', 1000.00]) };
      await service.archiveRawResponse(largePayload, testMetadata);

      const uncompressed = JSON.stringify({ metadata: testMetadata, response: largePayload, archivedAt: '' }).length;
      expect(capturedBody).toBeDefined();
      if (capturedBody) expect(capturedBody.length).toBeLessThan(uncompressed);
    });
  });

  describe('retrieveRawResponse', () => {
    it('round-trips: retrieves and decompresses what was archived', async () => {
      const zlib = await import('zlib');
      const { promisify } = await import('util');
      const gzip = promisify(zlib.gzip);

      const originalPayload = { rows: [['2026-03-20', 750]] };
      const stored = JSON.stringify({ metadata: testMetadata, response: originalPayload, archivedAt: '2026-03-20T00:00:00Z' });
      const compressed = await gzip(stored);

      async function* makeStream() { yield compressed; }

      mockSend.mockResolvedValueOnce({ Body: makeStream() });

      const result = await service.retrieveRawResponse<typeof originalPayload>('client-s3-001/youtube/2026-03-01/test.json.gz');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(originalPayload);
      }
    });

    it('returns S3_UNAVAILABLE when get throws', async () => {
      mockSend.mockRejectedValueOnce(new Error('NoSuchKey'));
      const result = await service.retrieveRawResponse('missing-key.json.gz');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('S3_UNAVAILABLE');
    });
  });
});
