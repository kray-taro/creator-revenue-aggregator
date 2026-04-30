-- Sprint 2: OAuth Onboarding + Bookkeeper Auth
-- Migration: 0003_sprint2_oauth

-- Bookkeepers table (primary user of the system)
CREATE TABLE IF NOT EXISTS bookkeepers (
  id           UUID         PRIMARY KEY,
  email        VARCHAR(255) NOT NULL UNIQUE,
  name         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookkeepers_email ON bookkeepers (email);

-- Add bookkeeper ownership to clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS bookkeeper_id UUID REFERENCES bookkeepers(id) ON DELETE SET NULL;

-- Client invitations table
-- Stores invite tokens for the "Add Client" flow (email dispatch deferred to Sprint 12)
CREATE TABLE IF NOT EXISTS client_invitations (
  id             UUID         PRIMARY KEY,
  bookkeeper_id  UUID         NOT NULL REFERENCES bookkeepers(id) ON DELETE CASCADE,
  client_id      UUID         NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  invite_token   VARCHAR(255) NOT NULL UNIQUE,
  status         VARCHAR(20)  NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at     TIMESTAMP    NOT NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token
  ON client_invitations (invite_token);

CREATE INDEX IF NOT EXISTS idx_invitations_client
  ON client_invitations (client_id);

CREATE INDEX IF NOT EXISTS idx_invitations_bookkeeper
  ON client_invitations (bookkeeper_id);

-- Extend platform_connections with OAuth metadata
ALTER TABLE platform_connections
  ADD COLUMN IF NOT EXISTS scopes                  TEXT[],
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS token_refreshed_at      TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_health_check_at    TIMESTAMP,
  ADD COLUMN IF NOT EXISTS platform_user_id        VARCHAR(255);

-- Partial index to efficiently find expiring active connections
-- Used by token refresh health monitoring (findExpiringConnections)
CREATE INDEX IF NOT EXISTS idx_platform_connections_expires_active
  ON platform_connections (expires_at)
  WHERE status = 'active';
