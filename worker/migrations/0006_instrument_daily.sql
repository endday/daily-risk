CREATE TABLE IF NOT EXISTS instrument_daily (
  trade_date TEXT NOT NULL,
  instrument_code TEXT NOT NULL,
  instrument_name TEXT NOT NULL,
  instrument_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  open_price REAL,
  high_price REAL,
  low_price REAL,
  close_price REAL,
  pre_close_price REAL,
  change_pct REAL,
  change_amount REAL,
  amplitude REAL,
  volume REAL,
  amount REAL,
  turnover_rate REAL,
  pe_ttm REAL,
  pb REAL,
  total_market_cap REAL,
  float_market_cap REAL,
  is_st INTEGER,
  source_updated_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (trade_date, instrument_code)
);

CREATE INDEX IF NOT EXISTS idx_instrument_daily_code_date
  ON instrument_daily(instrument_code, trade_date);
