import { Logger } from './Logger';
import { ShutdownManager } from './ShutdownManager';

const silentLogger = () => new Logger({ level: 'error', sink: () => {} });

describe('ShutdownManager', () => {
  it('runs hooks in ascending order', async () => {
    const callOrder: string[] = [];
    const exit = jest.fn();
    const mgr = new ShutdownManager({
      timeoutMs: 5_000,
      logger: silentLogger(),
      exit,
      bindSignals: false,
    });

    mgr.register({ name: 'pool',      order: 60, close: async () => { callOrder.push('pool'); } });
    mgr.register({ name: 'redis',     order: 50, close: async () => { callOrder.push('redis'); } });
    mgr.register({ name: 'scheduler', order: 10, close: async () => { callOrder.push('scheduler'); } });
    mgr.register({ name: 'queue',     order: 20, close: async () => { callOrder.push('queue'); } });

    await mgr.shutdown('test', 0);

    expect(callOrder).toEqual(['scheduler', 'queue', 'redis', 'pool']);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('continues remaining hooks even when one fails', async () => {
    const callOrder: string[] = [];
    const exit = jest.fn();
    const mgr = new ShutdownManager({
      timeoutMs: 5_000,
      logger: silentLogger(),
      exit,
      bindSignals: false,
    });

    mgr.register({ name: 'a', order: 10, close: async () => { callOrder.push('a'); } });
    mgr.register({ name: 'b', order: 20, close: async () => { throw new Error('boom'); } });
    mgr.register({ name: 'c', order: 30, close: async () => { callOrder.push('c'); } });

    await mgr.shutdown('test', 0);

    expect(callOrder).toEqual(['a', 'c']);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('enforces per-hook timeout and continues', async () => {
    const callOrder: string[] = [];
    const exit = jest.fn();
    const mgr = new ShutdownManager({
      timeoutMs: 200, // 2 hooks → 100ms each
      logger: silentLogger(),
      exit,
      bindSignals: false,
    });

    mgr.register({
      name: 'hang',
      order: 10,
      close: () => new Promise<void>(() => { /* never resolves */ }),
    });
    mgr.register({ name: 'ok', order: 20, close: async () => { callOrder.push('ok'); } });

    await mgr.shutdown('test', 0);

    expect(callOrder).toEqual(['ok']);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('double-invocation forces exit with code 1', async () => {
    const exit = jest.fn();
    const mgr = new ShutdownManager({
      timeoutMs: 5_000,
      logger: silentLogger(),
      exit,
      bindSignals: false,
    });

    // A hook that never resolves so the first shutdown stays pending.
    mgr.register({
      name: 'slow',
      order: 10,
      close: () => new Promise<void>((resolve) => setTimeout(resolve, 10)),
    });

    const first = mgr.shutdown('sig1', 0);
    await mgr.shutdown('sig2', 0);
    await first;

    expect(exit).toHaveBeenCalledWith(1);
  });
});
