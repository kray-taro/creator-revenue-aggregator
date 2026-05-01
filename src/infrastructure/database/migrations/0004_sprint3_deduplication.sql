-- Sprint 3 deduplication performance indexes
-- Enables O(log n) fingerprint lookups during ingestion

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_dedup_hash
  ON transactions (client_id, deduplication_hash)
  WHERE deduplication_hash IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_client_date_amount
  ON transactions (client_id, transaction_date, gross_revenue);
