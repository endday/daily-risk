-- Optimize long-history ERP queries by index_code + trade_date
CREATE INDEX IF NOT EXISTS idx_snapshots_index_code_date
  ON market_snapshots(index_code, trade_date);
