-- Sprint 1 foundation schema - DOWN migration
-- Drops tables in reverse order of creation to respect foreign key dependencies

DROP INDEX IF EXISTS idx_coa_mappings_client_id;
DROP TABLE IF EXISTS coa_mappings;

DROP INDEX IF EXISTS idx_platform_statuses_status;
DROP TABLE IF EXISTS platform_statuses;

DROP INDEX IF EXISTS idx_transactions_dedup_hash_unique;
DROP INDEX IF EXISTS idx_transactions_platform_date;
DROP INDEX IF EXISTS idx_transactions_client_id;
DROP TABLE IF EXISTS transactions;

DROP INDEX IF EXISTS idx_platform_connections_client_status;
DROP TABLE IF EXISTS platform_connections;

DROP INDEX IF EXISTS idx_users_email;
DROP TABLE IF EXISTS users;

DROP INDEX IF EXISTS idx_clients_name;
DROP TABLE IF EXISTS clients;
