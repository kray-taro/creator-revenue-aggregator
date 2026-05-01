import { Logger, type LogLevel } from './Logger';

describe('Logger', () => {
  const collectSink = () => {
    const records: Array<{ level: LogLevel; record: Record<string, unknown> }> = [];
    return {
      records,
      sink: (level: LogLevel, record: Record<string, unknown>) => records.push({ level, record }),
    };
  };

  it('emits JSON-shaped records with base fields and context', () => {
    const { records, sink } = collectSink();
    const logger = new Logger({ level: 'debug', service: 'svc', env: 'test', sink });

    logger.info('hello', { foo: 'bar' });

    expect(records).toHaveLength(1);
    expect(records[0]!.level).toBe('info');
    expect(records[0]!.record).toEqual(
      expect.objectContaining({
        level: 'info',
        message: 'hello',
        service: 'svc',
        env: 'test',
        context: { foo: 'bar' },
      })
    );
    expect(typeof records[0]!.record.time).toBe('string');
  });

  it('filters records below configured level', () => {
    const { records, sink } = collectSink();
    const logger = new Logger({ level: 'warn', sink });

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(records.map((r) => r.level)).toEqual(['warn', 'error']);
  });

  it('omits the context field when context is empty or missing', () => {
    const { records, sink } = collectSink();
    const logger = new Logger({ level: 'info', sink });

    logger.info('no-ctx');
    logger.info('empty-ctx', {});

    expect(records[0]!.record).not.toHaveProperty('context');
    expect(records[1]!.record).not.toHaveProperty('context');
  });

  it('child() merges bindings with parent base', () => {
    const { records, sink } = collectSink();
    const parent = new Logger({ level: 'info', service: 'svc', sink });
    const child = parent.child({ requestId: 'req-1' });

    child.info('hit');

    expect(records[0]!.record).toEqual(
      expect.objectContaining({ service: 'svc', requestId: 'req-1', message: 'hit' })
    );
  });
});
