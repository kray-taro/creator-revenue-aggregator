-- Sprint 2 Rollback: Remove OAuth onboarding schema changes
-- Migration: 0003_sprint2_oauth_down

DROP INDEX IF EXISTS idx_platform_connections_expires_active;

ALTER TABLE platform_connections
  DROP COLUMN IF EXISTS scopes,
  DROP COLUMN IF EXISTS refresh_token_encrypted,
  DROP COLUMN IF EXISTS token_refreshed_at,
  DROP COLUMN IF EXISTS last_health_check_at,
  DROP COLUMN IF EXISTS platform_user_id;

DROP INDEX IF EXISTS idx_invitations_bookkeeper;
DROP INDEX IF EXISTS idx_invitations_client;
DROP INDEX IF EXISTS idx_invitations_token;

DROP TABLE IF EXISTS client_invitations;

ALTER TABLE clients
  DROP COLUMN IF EXISTS bookkeeper_id;

DROP INDEX IF EXISTS idx_bookkeepers_email;

DROP TABLE IF EXISTS bookkeepers;
