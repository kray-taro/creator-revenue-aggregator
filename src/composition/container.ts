import { Queue, Worker, QueueEvents } from 'bullmq';
import type { IConfig } from '@domain/ports';
import { Logger } from './Logger';
import { ShutdownManager } from './ShutdownManager';
import { PgPool } from '@infrastructure/database/PgPool';
import { RedisConnectionFactory } from '@infrastructure/cache/RedisClient';
import { AesEncryptionService } from '@infrastructure/security/AesEncryptionService';
import { ConsoleAuditLogger } from '@infrastructure/logging/ConsoleAuditLogger';
import { RedlockService } from '@infrastructure/locking/RedlockService';
import { S3RawResponseArchivalService } from '@infrastructure/storage/S3RawResponseArchivalService';
import { LoggingNotificationService } from '@infrastructure/notifications/LoggingNotificationService';

// Repositories
import { PgTransactionRepository } from '@infrastructure/database/PgTransactionRepository';
import { PgPlatformConnectionRepository } from '@infrastructure/database/PgPlatformConnectionRepository';
import { PgPlatformStatusRepository } from '@infrastructure/database/PgPlatformStatusRepository';

// Factories
import { PlatformAdapterFactory } from '@application/factories/PlatformAdapterFactory';

// Services
import {
  IngestionOrchestrator,
  NightlyIngestionDispatcher,
  TokenHealthMonitor,
  ConfidenceScoringService,
  DeduplicationService,
  TransactionPersistenceService,
  IngestionErrorHandler,
  IngestionAuditService,
} from '@application/services';

// Workers & Queue
import { BullMQIngestionJobQueue } from '@infrastructure/workers/bullmq/BullMQIngestionJobQueue';
import { IngestionWorker } from '@infrastructure/workers/bullmq/IngestionWorker';
import { MaintenanceWorker } from '@infrastructure/workers/bullmq/MaintenanceWorker';

// Scheduler
import { BullMQScheduler } from '@infrastructure/scheduling/BullMQScheduler';
import { SchedulerBootstrap } from '@infrastructure/scheduling/SchedulerBootstrap';

export interface Container {
  // Core
  readonly config: IConfig;
  readonly logger: Logger;
  readonly shutdownManager: ShutdownManager;

  // Infrastructure
  readonly pool: PgPool;
  readonly redisFactory: RedisConnectionFactory;

  // Application Services (subset needed for entrypoint)
  readonly ingestionOrchestrator: IngestionOrchestrator;
  readonly nightlyIngestionDispatcher: NightlyIngestionDispatcher;
  readonly tokenHealthMonitor: TokenHealthMonitor;

  // Workers
  readonly ingestionWorker: IngestionWorker;
  readonly maintenanceWorker: MaintenanceWorker;

  // Scheduler
  readonly schedulerBootstrap: SchedulerBootstrap;

  // BullMQ Primitives (for bootstrap)
  readonly bullmqIngestionQueue: Queue;
  readonly bullmqMaintenanceQueue: Queue;
}

/**
 * Builds the application container with all dependencies wired.
 *
 * Construction order respects dependency graph:
 *  1. Config, Logger, ShutdownManager
 *  2. PgPool + health check
 *  3. Redis clients
 *  4. Core services (encryption, audit, redlock, oauth state, archival, notification)
 *  5. Repositories
 *  6. Factories
 *  7. Orchestrators & application services
 *  8. Queue & Workers (instantiated but not started)
 *  9. Scheduler
 */
export async function buildContainer(config: IConfig): Promise<Container> {
  // 1. Core
  const logger = new Logger();
  const shutdownManager = new ShutdownManager({
    logger,
    timeoutMs: config.shutdownTimeoutMs,
  });

  // 2. PgPool
  const pool = new PgPool({
    connectionString: config.dbUrl,
    max: config.dbPoolMax,
    idleTimeoutMillis: config.dbPoolIdleMs,
    ssl: config.dbSsl,
    logger,
  });

  // Health check on boot
  try {
    await pool.healthCheck();
    logger.info('Database health check passed.');
  } catch (err) {
    throw new Error(`Database health check failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Register pool shutdown
  shutdownManager.register({
    name: 'pg-pool',
    order: 100,
    close: () => pool.close(),
  });

  // 3. Redis clients
  const redisFactory = new RedisConnectionFactory({
    url: config.redisUrl,
    logger,
  });

  const sharedRedis = redisFactory.create('shared');
  const redlockRedis = redisFactory.create('redlock');

  shutdownManager.register({
    name: 'redis-clients',
    order: 90,
    close: () => redisFactory.closeAll(),
  });

  // 4. Core services
  const encryptionService = new AesEncryptionService(config);
  const auditLogger = new ConsoleAuditLogger();
  const redlockService = new RedlockService(redlockRedis as any);
  // OAuth state store - commented out until needed in future sprints
  // const oauthStateStore = new RedisOAuthStateStore(sharedRedis as any);
  const archivalService = new S3RawResponseArchivalService(
    config.s3RawResponseBucket,
    config.awsRegion
  );
  const notificationService = new LoggingNotificationService(logger, auditLogger);
  // Password service - commented out until needed in future sprints
  // const passwordService = new PasswordService();

  // 5. Repositories
  const transactionRepo = new PgTransactionRepository(pool);
  const connectionRepo = new PgPlatformConnectionRepository(pool, encryptionService);
  const statusRepo = new PgPlatformStatusRepository(pool);
  // Client and bookkeeper repos - commented out until needed in future sprints
  // const clientRepo = new PgClientRepository(pool);
  // const bookkeeperRepo = new PgBookkeeperRepository(pool);

  // 6. Factories
  const platformAdapterFactory = new PlatformAdapterFactory(
    connectionRepo,
    encryptionService,
    archivalService
  );

  // OAuth strategy factory - commented out until needed in future sprints
  // Build OAuth configs map from environment (simplified for Sprint 2)
  // In production, these would come from config/env vars per platform
  // const oauthConfigs = new Map();
  // const oauthStrategyFactory = new OAuthStrategyFactory(oauthConfigs);

  // 7. Application services
  const confidenceScoringService = new ConfidenceScoringService();
  const deduplicationService = new DeduplicationService(transactionRepo);
  
  const persistenceService = new TransactionPersistenceService(transactionRepo);
  
  const errorHandler = new IngestionErrorHandler(statusRepo);
  const ingestionAuditService = new IngestionAuditService(auditLogger);

  const ingestionOrchestrator = new IngestionOrchestrator(
    platformAdapterFactory,
    persistenceService,
    errorHandler,
    ingestionAuditService,
    logger,
    connectionRepo,
    deduplicationService,
    confidenceScoringService
  );

  // OAuth orchestrator - not used in minimal container but kept for future expansion
  // Uncomment when needed:
  // const oauthOrchestrator = new OAuthOrchestrator(
  //   oauthStrategyFactory,
  //   oauthStateStore,
  //   connectionRepo,
  //   encryptionService,
  //   redlockService,
  //   logger,
  //   auditLogger
  // );

  // Sync orchestrator - not used in minimal container but kept for future expansion
  // Uncomment when needed:
  // const syncOrchestrator = new SyncOrchestrator(
  //   connectionRepo,
  //   {} as any, // ingestionQueue - will be wired below
  //   auditLogger,
  //   redlockService,
  //   logger,
  //   { syncLockTtlMs: 5 * 60_000 }
  // );

  // Auth service - not used in minimal container but kept for future expansion
  // Uncomment when needed:
  // const authService = new AuthenticationService(
  //   bookkeeperRepo,
  //   passwordService,
  //   {} as any, // IAuthService - JWT service, deferred
  //   auditLogger
  // );

  // Client onboarding - not used in minimal container but kept for future expansion
  // Uncomment when needed:
  // const clientOnboardingService = new ClientOnboardingService(
  //   clientRepo,
  //   auditLogger,
  //   config.oauthRedirectBaseUrl
  // );

  // 8. Queue & Workers
  const bullmqIngestionQueue = new Queue(config.ingestionQueueName, {
    connection: sharedRedis as any,
  });

  const bullmqMaintenanceQueue = new Queue(config.maintenanceQueueName, {
    connection: sharedRedis as any,
  });

  const ingestionQueue = new BullMQIngestionJobQueue(bullmqIngestionQueue as any);

  const nightlyIngestionDispatcher = new NightlyIngestionDispatcher(
    connectionRepo,
    ingestionQueue,
    redlockService,
    auditLogger,
    logger
  );

  const tokenHealthMonitor = new TokenHealthMonitor(
    connectionRepo,
    statusRepo,
    notificationService,
    sharedRedis,
    auditLogger,
    logger
  );

  const ingestionWorker = new IngestionWorker(
    ingestionOrchestrator,
    redlockService,
    logger,
    { workerLockTtlMs: 5 * 60_000 }
  );

  const maintenanceWorker = new MaintenanceWorker(
    nightlyIngestionDispatcher,
    tokenHealthMonitor,
    logger
  );

  // 9. Scheduler
  const scheduler = new BullMQScheduler(
    (queueName: string) => {
      if (queueName === config.maintenanceQueueName) {
        return bullmqMaintenanceQueue;
      }
      throw new Error(`Unknown queue name: ${queueName}`);
    },
    logger
  );

  const schedulerBootstrap = new SchedulerBootstrap(scheduler, config, logger);

  return {
    config,
    logger,
    shutdownManager,
    pool,
    redisFactory,
    ingestionOrchestrator,
    nightlyIngestionDispatcher,
    tokenHealthMonitor,
    ingestionWorker,
    maintenanceWorker,
    schedulerBootstrap,
    bullmqIngestionQueue,
    bullmqMaintenanceQueue,
  };
}

/**
 * Starts BullMQ workers for the given container.
 * Returns cleanup functions for graceful shutdown.
 */
export async function startWorkers(container: Container): Promise<{
  ingestionWorker: Worker;
  maintenanceWorker: Worker;
  ingestionEvents: QueueEvents;
  maintenanceEvents: QueueEvents;
}> {
  const { config, ingestionWorker, maintenanceWorker, shutdownManager, logger } = container;

  // Create dedicated Redis connections for workers
  const workerBclient1 = container.redisFactory.create('bclient');
  const workerBclient2 = container.redisFactory.create('bclient');
  const subscriberRedis1 = container.redisFactory.create('subscriber');
  const subscriberRedis2 = container.redisFactory.create('subscriber');

  // Create BullMQ Worker instances
  const bullmqIngestionWorker = new Worker(
    config.ingestionQueueName,
    async (job) => {
      await ingestionWorker.process(job as any);
      // IngestionWorker.process returns void, so we don't check result
    },
    {
      connection: workerBclient1 as any,
      concurrency: config.workerConcurrency,
    }
  );

  const bullmqMaintenanceWorker = new Worker(
    config.maintenanceQueueName,
    async (job) => {
      const result = await maintenanceWorker.process(job as any);
      if (result && !result.ok) {
        throw new Error(result.error.message);
      }
    },
    {
      connection: workerBclient2 as any,
      concurrency: config.workerConcurrency,
    }
  );

  // Create QueueEvents for monitoring
  const ingestionEvents = new QueueEvents(config.ingestionQueueName, {
    connection: subscriberRedis1 as any,
  });

  const maintenanceEvents = new QueueEvents(config.maintenanceQueueName, {
    connection: subscriberRedis2 as any,
  });

  // Wire up event handlers
  bullmqIngestionWorker.on('completed', (job) => {
    logger.info('Ingestion job completed.', { jobId: job.id });
  });

  bullmqIngestionWorker.on('failed', (job, err) => {
    logger.error('Ingestion job failed.', {
      jobId: job?.id,
      error: err.message,
    });
  });

  bullmqMaintenanceWorker.on('completed', (job) => {
    logger.info('Maintenance job completed.', { jobId: job.id, jobName: job.name });
  });

  bullmqMaintenanceWorker.on('failed', (job, err) => {
    logger.error('Maintenance job failed.', {
      jobId: job?.id,
      jobName: job?.name,
      error: err.message,
    });
  });

  // Register shutdown hooks
  shutdownManager.register({
    name: 'bullmq-workers',
    order: 80,
    close: async () => {
      await Promise.all([
        bullmqIngestionWorker.close(),
        bullmqMaintenanceWorker.close(),
        ingestionEvents.close(),
        maintenanceEvents.close(),
      ]);
    },
  });

  logger.info('BullMQ workers started.', {
    ingestionQueue: config.ingestionQueueName,
    maintenanceQueue: config.maintenanceQueueName,
    concurrency: config.workerConcurrency,
  });

  return {
    ingestionWorker: bullmqIngestionWorker,
    maintenanceWorker: bullmqMaintenanceWorker,
    ingestionEvents,
    maintenanceEvents,
  };
}

