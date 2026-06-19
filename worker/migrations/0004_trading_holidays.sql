-- Trading calendar: holidays and makeup workdays
-- Source: timor.tech/api/holiday (synced yearly)
CREATE TABLE IF NOT EXISTS trading_holidays (
  date TEXT PRIMARY KEY,           -- '2026-01-01'
  is_holiday INTEGER NOT NULL,     -- 1 = market closed, 0 = makeup workday (weekend but trading)
  name TEXT NOT NULL DEFAULT ''    -- '元旦', '春节前补班', etc.
);
