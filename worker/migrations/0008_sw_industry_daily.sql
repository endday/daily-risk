CREATE TABLE IF NOT EXISTS sw_industry_daily (
  trade_date TEXT NOT NULL,
  industry_code TEXT NOT NULL,
  industry_name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'free-stockdb',
  open_price REAL,
  high_price REAL,
  low_price REAL,
  close_price REAL,
  change_pct REAL,
  volume REAL,
  amount REAL,
  member_count INTEGER,
  source_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (trade_date, industry_code)
);

CREATE INDEX IF NOT EXISTS idx_sw_industry_daily_code_date
  ON sw_industry_daily(industry_code, trade_date);

CREATE INDEX IF NOT EXISTS idx_sw_industry_daily_date
  ON sw_industry_daily(trade_date);
