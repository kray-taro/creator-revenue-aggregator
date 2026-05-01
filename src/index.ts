import { loadConfig } from '@infrastructure/config/AppConfig';
import { buildContainer, startWorkers } from './composition/container';
import * as http from 'http';

/**
 * Role-switched entrypoint for the Creator Revenue Aggregator.
 *
 * Supports four process roles via PROCESS_ROLE env var:
 *  - `api`: HTTP server only (placeholder health endpoint)
 *  - `worker`: BullMQ workers only (ingestion + maintenance)
 *  - `scheduler`: Repeatable job registration only
 *  - `all`: All of the above (default for local dev)
 *
 * Graceful shutdown is handled by ShutdownManager, which coordinates
 * ordered cleanup of all long-lived resources (workers, queues, redis, pg).
 */

async function main() {
  // 1. Load and validate config
  const config = loadConfig();

  // 2. Build container
  const container = await buildContainer(config);
  const { logger, schedulerBootstrap } = container;

  logger.info('Creator Revenue Aggregator starting...', {
    nodeEnv: config.nodeEnv,
    processRole: config.processRole,
    dbPoolMax: config.dbPoolMax,
    workerConcurrency: config.workerConcurrency,
    schedulerEnabled: config.schedulerEnabled,
  });

  // 3. Start components based on role
  const role = config.processRole;

  try {
    // Start API server
    if (role === 'api' || role === 'all') {
      await startApiServer(config.apiPort, logger);
      logger.info('API server started.', { port: config.apiPort });
    }

    // Start workers
    if (role === 'worker' || role === 'all') {
      await startWorkers(container);
      logger.info('Workers started.');
    }

    // Register scheduler
    if (role === 'scheduler' || role === 'all') {
      const result = await schedulerBootstrap.register();
      if (result.ok) {
        logger.info('Scheduler registered.');
      } else if (result.error.code !== 'SCHEDULER_DISABLED') {
        logger.error('Scheduler registration failed.', { error: result.error });
        throw new Error(`Scheduler registration failed: ${result.error.message}`);
      }
    }

    logger.info('Startup complete. Process is ready.', { role });

    // Keep process alive
    await new Promise(() => {}); // Infinite promise - shutdown via signals only
  } catch (err) {
    logger.error('Startup failed.', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
}

/**
 * Starts a minimal HTTP server with health and readiness endpoints.
 * Full API routes are deferred to Sprint 3+.
 */
async function startApiServer(
  port: number,
  logger: { info: (msg: string, ctx?: Record<string, unknown>) => void }
): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
      return;
    }

    if (req.url === '/ready') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ready', timestamp: new Date().toISOString() }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      logger.info('HTTP server listening.', { port });
      resolve(server);
    });

    server.on('error', (err) => {
      logger.info('HTTP server error.', { error: err.message });
      reject(err);
    });
  });
}

// Start the application
main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});

