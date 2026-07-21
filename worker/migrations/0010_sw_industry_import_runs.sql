CREATE TABLE IF NOT EXISTS sw_industry_import_runs (
  run_id TEXT PRIMARY KEY,
  trade_date TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('daily', 'backfill')),
  expected_industries INTEGER NOT NULL,
  expected_rows INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'staging' CHECK (status IN ('staging', 'completed', 'failed')),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS sw_industry_daily_staging (
  run_id TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  industry_code TEXT NOT NULL,
  industry_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  open_price REAL,
  high_price REAL,
  low_price REAL,
  close_price REAL,
  change_pct REAL,
  volume REAL,
  amount REAL,
  member_count INTEGER,
  source_updated_at TEXT,
  PRIMARY KEY (run_id, trade_date, industry_code),
  FOREIGN KEY (run_id) REFERENCES sw_industry_import_runs(run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sw_industry_import_runs_status
  ON sw_industry_import_runs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_sw_industry_staging_run
  ON sw_industry_daily_staging(run_id, trade_date);
