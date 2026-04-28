CREATE TABLE IF NOT EXISTS platform_connections (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'pending', 'expired', 'error', 'disconnected')),
  encrypted_token BYTEA,
  token_iv TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_platform_connections_client_status
  ON platform_connections (client_id, status);
