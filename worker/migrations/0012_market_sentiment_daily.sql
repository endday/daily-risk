CREATE TABLE IF NOT EXISTS market_sentiment_daily (
  trade_date TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  vix_close REAL,
  vix_change_pct REAL,
  market_close_price REAL,
  market_change_pct REAL,
  main_net_inflow REAL,
  small_net_inflow REAL,
  medium_net_inflow REAL,
  large_net_inflow REAL,
  super_large_net_inflow REAL,
  main_net_inflow_ratio REAL,
  source_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_market_sentiment_date
  ON market_sentiment_daily(trade_date);
