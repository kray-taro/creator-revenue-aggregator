-- Sprint 1 foundation schema

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  accounting_mode VARCHAR(20) NOT NULL,
  qb_company_id VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients (name);

CREATE TABLE IF NOT EXISTS platform_connections (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  encrypted_token BYTEA,
  token_iv TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_platform_connections_client_status
  ON platform_connections (client_id, status);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL,
  source_platform VARCHAR(50) NOT NULL,
  platform_transaction_id VARCHAR(255) NOT NULL,
  platform_id VARCHAR(255),
  transaction_date DATE NOT NULL,

  gross_revenue NUMERIC(12, 2) NOT NULL,
  platform_fee NUMERIC(12, 2) NOT NULL,
  net_payout NUMERIC(12, 2) NOT NULL,

  description TEXT,
  deduplication_hash VARCHAR(64),
  source_hierarchy VARCHAR(20),
  suggested_category VARCHAR(100),
  confidence_score NUMERIC(5, 4),
  status VARCHAR(50) NOT NULL,

  qb_account_id VARCHAR(50),
  qb_entry_id VARCHAR(50),
  qb_sync_status VARCHAR(50),
  synced_at TIMESTAMP,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,

  receipt_snapshot_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_transactions_platform_key UNIQUE (platform_transaction_id, source_platform)
);

CREATE INDEX IF NOT EXISTS idx_transactions_client_id ON transactions (client_id);
CREATE INDEX IF NOT EXISTS idx_transactions_platform_date ON transactions (source_platform, transaction_date);

CREATE TABLE IF NOT EXISTS platform_statuses (
  client_id UUID NOT NULL,
  platform VARCHAR(50) NOT NULL,
  status VARCHAR(10) NOT NULL,
  last_error TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_platform_statuses_status ON platform_statuses (status);

CREATE TABLE IF NOT EXISTS coa_mappings (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform_category VARCHAR(100) NOT NULL,
  qb_account_id VARCHAR(50) NOT NULL,
  qb_account_name VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, platform_category)
);

CREATE INDEX IF NOT EXISTS idx_coa_mappings_client_id ON coa_mappings (client_id);
