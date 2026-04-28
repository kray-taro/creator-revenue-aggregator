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
