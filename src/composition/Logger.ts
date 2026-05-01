/**
 * Minimal structured JSON logger with zero external dependencies.
 *
 * Satisfies both `ILogger` (OAuthOrchestrator, IngestionOrchestrator) and
 * `IWorkerLogger` (IngestionWorker) shapes via structural typing.
 *
 * Output is single-line JSON for easy ingestion by CloudWatch, Datadog,
 * Loki, etc. No color codes, no pretty-printing — aggregators render them.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  readonly level?: LogLevel;
  readonly service?: string;
  readonly env?: string;
  /**
   * Override sink for testability. Defaults to console.{level}.
   */
  readonly sink?: (level: LogLevel, record: Record<string, unknown>) => void;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_SINK = (level: LogLevel, record: Record<string, unknown>): void => {
  const line = JSON.stringify(record);
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
};

export class Logger {
  private readonly level: LogLevel;
  private readonly base: Record<string, unknown>;
  private readonly sink: (level: LogLevel, record: Record<string, unknown>) => void;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.base = {
      service: options.service ?? 'creator-revenue-aggregator',
      env: options.env ?? process.env.NODE_ENV ?? 'development',
    };
    this.sink = options.sink ?? DEFAULT_SINK;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.emit('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.emit('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.emit('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.emit('error', message, context);
  }

  child(bindings: Record<string, unknown>): Logger {
    const child = new Logger({ level: this.level, sink: this.sink });
    Object.assign(child.base, this.base, bindings);
    return child;
  }

  private emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) {
      return;
    }
    const record: Record<string, unknown> = {
      level,
      time: new Date().toISOString(),
      message,
      ...this.base,
    };
    if (context && Object.keys(context).length > 0) {
      record.context = context;
    }
    this.sink(level, record);
  }
}
