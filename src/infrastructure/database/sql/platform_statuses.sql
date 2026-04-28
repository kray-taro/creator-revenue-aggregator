CREATE TABLE IF NOT EXISTS platform_statuses (
  client_id UUID NOT NULL,
  platform VARCHAR(50) NOT NULL,
  status VARCHAR(10) NOT NULL,
  last_error TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_platform_statuses_status ON platform_statuses (status);
