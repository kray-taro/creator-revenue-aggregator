CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  source_platform VARCHAR(50) NOT NULL,
  platform_transaction_id VARCHAR(255) NOT NULL,
  platform_id VARCHAR(255),
  transaction_date DATE NOT NULL CHECK (transaction_date <= CURRENT_DATE),

  gross_revenue NUMERIC(12, 2) NOT NULL CHECK (gross_revenue >= 0),
  platform_fee NUMERIC(12, 2) NOT NULL CHECK (platform_fee >= 0),
  net_payout NUMERIC(12, 2) NOT NULL,

  description TEXT,
  deduplication_hash VARCHAR(64),
  source_hierarchy VARCHAR(20) CHECK (source_hierarchy IN ('primary', 'processor')),
  suggested_category VARCHAR(100),
  confidence_score NUMERIC(5, 4),
  status VARCHAR(50) NOT NULL CHECK (status IN ('pending_review', 'approved', 'synced', 'voided', 'rejected', 'error')),

  qb_account_id VARCHAR(50),
  qb_entry_id VARCHAR(50),
  qb_sync_status VARCHAR(50) CHECK (qb_sync_status IN ('pending', 'synced', 'failed', 'voided')),
  synced_at TIMESTAMP,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,

  receipt_snapshot_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_transactions_platform_key UNIQUE (client_id, platform_transaction_id, source_platform),
  CONSTRAINT chk_transactions_crs_equation
    CHECK (ABS((gross_revenue - platform_fee) - net_payout) <= 0.01)
);

CREATE INDEX IF NOT EXISTS idx_transactions_client_id ON transactions (client_id);
CREATE INDEX IF NOT EXISTS idx_transactions_platform_date ON transactions (source_platform, transaction_date);
