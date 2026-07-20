CREATE TABLE IF NOT EXISTS industry_fund_flow_daily (
  trade_date TEXT NOT NULL,
  board_code TEXT NOT NULL,
  board_name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'eastmoney',
  close_price REAL,
  change_pct REAL,
  main_net_inflow REAL,
  small_net_inflow REAL,
  medium_net_inflow REAL,
  large_net_inflow REAL,
  super_large_net_inflow REAL,
  main_net_inflow_ratio REAL,
  small_net_inflow_ratio REAL,
  medium_net_inflow_ratio REAL,
  large_net_inflow_ratio REAL,
  super_large_net_inflow_ratio REAL,
  source_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (trade_date, board_code)
);

CREATE INDEX IF NOT EXISTS idx_industry_flow_board_date
  ON industry_fund_flow_daily(board_code, trade_date);

CREATE INDEX IF NOT EXISTS idx_industry_flow_date
  ON industry_fund_flow_daily(trade_date);
