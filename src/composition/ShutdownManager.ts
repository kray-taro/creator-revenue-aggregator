import type { Logger } from './Logger';

export interface ShutdownHook {
  readonly name: string;
  readonly order: number;
  readonly close: () => Promise<void>;
}

export interface ShutdownManagerOptions {
  readonly timeoutMs: number;
  readonly logger: Logger;
  /**
   * Override process.exit for tests. Defaults to `process.exit`.
   */
  readonly exit?: (code: number) => void;
  /**
   * Override signal registration for tests. Defaults to `process.on`.
   */
  readonly bindSignals?: boolean;
}

/**
 * Coordinated graceful shutdown.
 *
 * - Ordered hooks: lower `order` runs first. Recommended order:
 *     10  scheduler  (stop producing new jobs)
 *     20  queue      (flush/close BullMQ Queue)
 *     30  worker     (drain in-flight jobs)
 *     40  http       (close API listener)
 *     50  redis      (quit ioredis clients)
 *     60  pool       (pg.Pool.end())
 * - Per-hook timeout so one misbehaving hook can't hang shutdown.
 * - Double-signal forces exit immediately.
 * - Uncaught exception / unhandled rejection triggers shutdown with exit code 1.
 */
export class ShutdownManager {
  private readonly hooks: ShutdownHook[] = [];
  private readonly timeoutMs: number;
  private readonly logger: Logger;
  private readonly exit: (code: number) => void;
  private shuttingDown = false;
  private signalHandlersBound = false;

  constructor(options: ShutdownManagerOptions) {
    this.timeoutMs = options.timeoutMs;
    this.logger = options.logger;
    this.exit = options.exit ?? ((code: number) => process.exit(code));

    if (options.bindSignals !== false) {
      this.bindProcessSignals();
    }
  }

  register(hook: ShutdownHook): void {
    this.hooks.push(hook);
  }

  /**
   * Kicks off shutdown. Idempotent — second call is a no-op aside from
   * logging the force-exit escalation.
   */
  async shutdown(reason: string, exitCode = 0): Promise<void> {
    if (this.shuttingDown) {
      this.logger.warn('Shutdown already in progress; forcing exit.', { reason });
      this.exit(1);
      return;
    }
    this.shuttingDown = true;
    this.logger.info('Shutdown initiated.', { reason, hooks: this.hooks.length });

    // Sort ascending by order
    const ordered = [...this.hooks].sort((a, b) => a.order - b.order);

    const perHookTimeout = Math.max(
      500,
      Math.floor(this.timeoutMs / Math.max(1, ordered.length))
    );

    for (const hook of ordered) {
      const started = Date.now();
      try {
        await this.runWithTimeout(hook.close(), perHookTimeout, hook.name);
        this.logger.info('Shutdown hook completed.', {
          hook: hook.name,
          order: hook.order,
          durationMs: Date.now() - started,
        });
      } catch (err) {
        this.logger.error('Shutdown hook failed.', {
          hook: hook.name,
          order: hook.order,
          durationMs: Date.now() - started,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.logger.info('Shutdown complete.', { exitCode });
    this.exit(exitCode);
  }

  private async runWithTimeout<T>(
    p: Promise<T>,
    timeoutMs: number,
    hookName: string
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Shutdown hook "${hookName}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      // Prevent the timer from keeping the process alive.
      timer.unref?.();
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private bindProcessSignals(): void {
    if (this.signalHandlersBound) return;
    this.signalHandlersBound = true;

    const onSignal = (sig: NodeJS.Signals): void => {
      void this.shutdown(`signal:${sig}`, 0);
    };
    process.once('SIGTERM', onSignal);
    process.once('SIGINT', onSignal);

    process.on('uncaughtException', (err) => {
      this.logger.error('uncaughtException; initiating shutdown.', {
        error: err.message,
        stack: err.stack,
      });
      void this.shutdown('uncaughtException', 1);
    });

    process.on('unhandledRejection', (reason) => {
      this.logger.error('unhandledRejection; initiating shutdown.', {
        reason: reason instanceof Error ? reason.message : String(reason),
      });
      void this.shutdown('unhandledRejection', 1);
    });
  }
}
