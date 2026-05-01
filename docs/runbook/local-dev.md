# Local Development Runbook

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis 7+
- Docker (optional, for running Postgres + Redis)

## Quick Start

### 1. Environment Setup

Copy the example environment file and configure:

```bash
cp .env.example .env
```

Edit `.env` with your local database and Redis URLs:

```env
DB_URL=postgresql://user:password@localhost:5432/creator_revenue_dev
REDIS_URL=redis://localhost:6379
PROCESS_ROLE=all
NODE_ENV=development
```

### 2. Database Migration

Run migrations to set up the schema:

```bash
npm run migrate
```

### 3. Build

Compile TypeScript to JavaScript:

```bash
npm run build
```

### 4. Start the Application

Start all processes (API + Worker + Scheduler):

```bash
npm start
```

Or start individual roles:

```bash
# API server only
npm run start:api

# Workers only
npm run start:worker

# Scheduler only
npm run start:scheduler
```

## Process Roles

The application supports four process roles via the `PROCESS_ROLE` environment variable:

- **`all`** (default): Runs API server, workers, and scheduler in a single process. Best for local development.
- **`api`**: HTTP server only. Exposes `/health` and `/ready` endpoints.
- **`worker`**: BullMQ workers only. Processes ingestion and maintenance jobs.
- **`scheduler`**: Repeatable job registration only. Registers nightly ingestion and token health check schedules.

## Health Checks

Once running, verify the application is healthy:

```bash
# Health endpoint
curl http://localhost:3000/health

# Readiness endpoint
curl http://localhost:3000/ready
```

## Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## Docker Compose (Optional)

If you don't have Postgres and Redis installed locally, use Docker Compose:

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379

## Troubleshooting

### Database Connection Fails

- Verify Postgres is running: `psql -U user -d creator_revenue_dev`
- Check `DB_URL` in `.env` matches your Postgres configuration
- Ensure migrations have run: `npm run migrate`

### Redis Connection Fails

- Verify Redis is running: `redis-cli ping`
- Check `REDIS_URL` in `.env`

### Workers Not Processing Jobs

- Ensure `PROCESS_ROLE=all` or `PROCESS_ROLE=worker`
- Check Redis connection
- Verify BullMQ queues exist: `redis-cli KEYS bull:*`

### Scheduler Not Registering Jobs

- Ensure `SCHEDULER_ENABLED=true` in `.env`
- Check `PROCESS_ROLE=all` or `PROCESS_ROLE=scheduler`
- Verify repeatable jobs: Use BullMQ UI or Redis CLI

## Configuration Reference

Key environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PROCESS_ROLE` | `all` | Process role: `api`, `worker`, `scheduler`, or `all` |
| `NODE_ENV` | `development` | Environment: `development`, `test`, or `production` |
| `DB_URL` | - | PostgreSQL connection string (required) |
| `REDIS_URL` | - | Redis connection string (required) |
| `DB_POOL_MAX` | `10` | Max database connections |
| `WORKER_CONCURRENCY` | `4` | BullMQ worker concurrency |
| `SCHEDULER_ENABLED` | `true` | Enable/disable scheduler |
| `NIGHTLY_INGESTION_CRON` | `0 2 * * *` | Cron for nightly ingestion (2 AM UTC) |
| `TOKEN_HEALTH_CRON` | `0 6 * * *` | Cron for token health check (6 AM UTC) |
| `SHUTDOWN_TIMEOUT_MS` | `15000` | Graceful shutdown timeout |
| `API_PORT` | `3000` | HTTP server port |

See `.env.example` for the complete list.