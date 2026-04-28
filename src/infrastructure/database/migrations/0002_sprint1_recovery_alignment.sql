-- Sprint 1 recovery alignment: schema integrity + business rule constraints

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Ensure clients.accounting_mode is constrained to supported modes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_clients_accounting_mode'
      AND conrelid = 'clients'::regclass
  ) THEN
    ALTER TABLE clients
      ADD CONSTRAINT chk_clients_accounting_mode
      CHECK (accounting_mode IN ('accrual', 'cash'));
  END IF;
END $$;

-- Enforce known platform connection statuses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_platform_connections_status'
      AND conrelid = 'platform_connections'::regclass
  ) THEN
    ALTER TABLE platform_connections
      ADD CONSTRAINT chk_platform_connections_status
      CHECK (status IN ('active', 'pending', 'expired', 'error', 'disconnected'));
  END IF;
END $$;

-- Add missing foreign key from transactions.client_id -> clients(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_transactions_client_id'
      AND conrelid = 'transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT fk_transactions_client_id
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure reviewed_by FK is valid after users table creation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_transactions_reviewed_by'
      AND conrelid = 'transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT fk_transactions_reviewed_by
      FOREIGN KEY (reviewed_by) REFERENCES users(id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Replace uniqueness with client-scoped idempotency key
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS uq_transactions_platform_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_transactions_client_platform_txn'
      AND conrelid = 'transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT uq_transactions_client_platform_txn
      UNIQUE (client_id, platform_transaction_id, source_platform);
  END IF;
END $$;

-- Business rule checks from PRD/CRS invariants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_transactions_gross_non_negative'
      AND conrelid = 'transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT chk_transactions_gross_non_negative
      CHECK (gross_revenue >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_transactions_fee_non_negative'
      AND conrelid = 'transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT chk_transactions_fee_non_negative
      CHECK (platform_fee >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_transactions_not_future_dated'
      AND conrelid = 'transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT chk_transactions_not_future_dated
      CHECK (transaction_date <= CURRENT_DATE);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_transactions_source_hierarchy'
      AND conrelid = 'transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT chk_transactions_source_hierarchy
      CHECK (source_hierarchy IN ('primary', 'processor'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_transactions_status'
      AND conrelid = 'transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT chk_transactions_status
      CHECK (status IN ('pending_review', 'approved', 'synced', 'voided', 'rejected', 'error'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_transactions_qb_sync_status'
      AND conrelid = 'transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT chk_transactions_qb_sync_status
      CHECK (qb_sync_status IN ('pending', 'synced', 'failed', 'voided'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_transactions_crs_equation'
      AND conrelid = 'transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT chk_transactions_crs_equation
      CHECK (ABS((gross_revenue - platform_fee) - net_payout) <= 0.01);
  END IF;
END $$;
