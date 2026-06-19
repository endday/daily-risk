-- Daily Risk V2: 市场快照表
-- 2026-06-16
--
-- 每日 × 每指数 = 一行，存储当天的市场温度数据。
-- 三指数（000001/000300/000905）每天产生 3 行。

CREATE TABLE IF NOT EXISTS market_snapshots (
  trade_date TEXT NOT NULL,
  index_code TEXT NOT NULL,

  -- 行情
  close_price REAL,
  change_pct REAL,

  -- 市场宽度（仅 index_code='000001' 填写）
  rise_count INTEGER,
  fall_count INTEGER,
  flat_count INTEGER,

  -- 量能
  turnover_amount REAL,
  turnover_rate REAL,

  -- 波动
  volatility_20d REAL,

  -- 外资（仅 index_code='000300' 填写）
  northbound_amt REAL,
  northbound_num INTEGER,

  -- 估值（数据源就绪后填充）
  pe_ttm REAL,
  pb REAL,

  -- 杠杆（接口就绪后填充）
  margin_balance REAL,

  -- 利率
  bond_yield_10y REAL,

  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (trade_date, index_code)
);

-- 按日期查询
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON market_snapshots(trade_date);
