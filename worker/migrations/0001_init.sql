-- Daily Risk V1 Database Schema
-- 2026-06-09

-- 事件日历表
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  display_name TEXT NOT NULL,

  event_date TEXT NOT NULL,
  event_time TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  event_datetime_utc TEXT,

  country TEXT NOT NULL,
  importance INTEGER NOT NULL,
  market_impact TEXT,

  release_id INTEGER,
  series_id TEXT,
  symbol TEXT,
  period TEXT,
  display_format TEXT,

  previous_value TEXT,
  actual_value TEXT,
  actual_updated_at TEXT,

  status TEXT NOT NULL DEFAULT 'scheduled',
  last_checked_at TEXT,
  last_fetch_error TEXT,

  raw_json TEXT,
  raw_text TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 采集运行日志表
CREATE TABLE provider_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  run_type TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  events_upserted INTEGER DEFAULT 0,
  error TEXT
);

-- 财报跟踪列表
CREATE TABLE earnings_watchlist (
  symbol TEXT PRIMARY KEY,
  company TEXT,
  importance INTEGER DEFAULT 5,
  active INTEGER DEFAULT 1
);

-- 索引
CREATE INDEX idx_events_date_importance ON events(event_date, importance DESC);
CREATE INDEX idx_events_status_time ON events(status, event_datetime_utc);
CREATE INDEX idx_events_key_date ON events(event_key, event_date);
CREATE UNIQUE INDEX idx_events_unique
  ON events(event_key, event_date, IFNULL(symbol, ''), IFNULL(period, ''));

-- 初始数据：财报 watchlist
INSERT INTO earnings_watchlist (symbol, company, importance) VALUES
  ('NVDA', 'NVIDIA', 8),
  ('AAPL', 'Apple', 7),
  ('MSFT', 'Microsoft', 7),
  ('META', 'Meta Platforms', 7),
  ('GOOGL', 'Alphabet', 7),
  ('AMZN', 'Amazon', 7),
  ('TSLA', 'Tesla', 6),
  ('TSM', 'TSMC', 7);
