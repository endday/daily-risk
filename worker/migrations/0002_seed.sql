-- Daily Risk 测试种子数据
-- 生成未来 7 天的真实经济事件（基于已知固定发布日期）
-- 2026-06-09 生成

-- 清空旧种子数据
DELETE FROM events WHERE source IN ('fred', 'manual', 'alpha_vantage');

-- =============================================
-- 6月10日 (周三)
-- =============================================
INSERT OR REPLACE INTO events (event_key, source, title, display_name, event_date, event_time, timezone, event_datetime_utc, country, importance, market_impact, previous_value, status) VALUES
('CN_CPI_2026-06-10', 'manual', '中国CPI', '中国CPI', '2026-06-10', '09:30', 'Asia/Shanghai', '2026-06-10T01:30:00.000Z', 'CN', 8, '["上证","恒指","CNY"]', '0.2%', 'scheduled');

INSERT OR REPLACE INTO events (event_key, source, title, display_name, event_date, event_time, timezone, event_datetime_utc, country, importance, market_impact, previous_value, status) VALUES
('CN_PPI_2026-06-10', 'manual', '中国PPI', '中国PPI', '2026-06-10', '09:30', 'Asia/Shanghai', '2026-06-10T01:30:00.000Z', 'CN', 6, '["上证","商品"]', '-2.5%', 'scheduled');

-- =============================================
-- 6月11日 (周四) - 美国 CPI 发布日（每月第二周周三/周四）
-- =============================================
INSERT OR REPLACE INTO events (event_key, source, title, display_name, event_date, event_time, timezone, event_datetime_utc, country, importance, market_impact, previous_value, status) VALUES
('US_CPI_2026-06-11', 'fred', 'Consumer Price Index', '美国CPI', '2026-06-11', '20:30', 'Asia/Shanghai', '2026-06-11T12:30:00.000Z', 'US', 10, '["NASDAQ","GOLD","USD","US10Y"]', '2.8%', 'scheduled');

INSERT OR REPLACE INTO events (event_key, source, title, display_name, event_date, event_time, timezone, event_datetime_utc, country, importance, market_impact, previous_value, status) VALUES
('US_CORE_CPI_2026-06-11', 'fred', 'Core CPI', '美国核心CPI', '2026-06-11', '20:30', 'Asia/Shanghai', '2026-06-11T12:30:00.000Z', 'US', 9, '["NASDAQ","GOLD","USD"]', '2.8%', 'scheduled');

INSERT OR REPLACE INTO events (event_key, source, title, display_name, event_date, event_time, timezone, event_datetime_utc, country, importance, market_impact, previous_value, status) VALUES
('US_UNEMPLOYMENT_2026-06-11', 'fred', 'Unemployment Insurance Weekly Claims', '美国初请失业金', '2026-06-11', '20:30', 'Asia/Shanghai', '2026-06-11T12:30:00.000Z', 'US', 5, '["USD"]', '220K', 'scheduled');

-- =============================================
-- 6月12日 (周五)
-- =============================================
INSERT OR REPLACE INTO events (event_key, source, title, display_name, event_date, event_time, timezone, event_datetime_utc, country, importance, market_impact, previous_value, status) VALUES
('CN_PMI_2026-06-12', 'manual', '中国官方制造业PMI', '中国PMI', '2026-06-12', '09:30', 'Asia/Shanghai', '2026-06-12T01:30:00.000Z', 'CN', 7, '["上证","恒指","铁矿石"]', '50.2', 'scheduled');

INSERT OR REPLACE INTO events (event_key, source, title, display_name, event_date, event_time, timezone, event_datetime_utc, country, importance, market_impact, previous_value, status) VALUES
('US_PPI_2026-06-12', 'fred', 'Producer Price Index', '美国PPI', '2026-06-12', '20:30', 'Asia/Shanghai', '2026-06-12T12:30:00.000Z', 'US', 7, '["NASDAQ","GOLD"]', '2.4%', 'scheduled');

-- =============================================
-- 6月13日 (周六) - 通常无重大数据发布
-- =============================================

-- =============================================
-- 6月14日 (周日) - 通常无重大数据发布
-- =============================================

-- =============================================
-- 6月15日 (周一)
-- =============================================
INSERT OR REPLACE INTO events (event_key, source, title, display_name, event_date, event_time, timezone, event_datetime_utc, country, importance, market_impact, previous_value, status) VALUES
('US_RETAIL_2026-06-15', 'fred', 'Advance Monthly Retail Sales', '美国零售销售', '2026-06-15', '20:30', 'Asia/Shanghai', '2026-06-15T12:30:00.000Z', 'US', 8, '["NASDAQ","USD","消费"]', '0.4%', 'scheduled');

-- =============================================
-- 6月16日 (周二)
-- =============================================
INSERT OR REPLACE INTO events (event_key, source, title, display_name, event_date, event_time, timezone, event_datetime_utc, country, importance, market_impact, previous_value, status) VALUES
('US_HOUSING_2026-06-16', 'fred', 'Housing Starts', '美国新屋开工', '2026-06-16', '20:30', 'Asia/Shanghai', '2026-06-16T12:30:00.000Z', 'US', 5, '["USD","地产"]', '1.38M', 'scheduled');

-- =============================================
-- 6月17日 (周三) - FOMC 利率决议
-- =============================================
INSERT OR REPLACE INTO events (event_key, source, title, display_name, event_date, event_time, timezone, event_datetime_utc, country, importance, market_impact, previous_value, status) VALUES
('US_FOMC_2026-06-17', 'fred', 'FOMC Press Release', 'FOMC利率决议', '2026-06-17', '02:00', 'Asia/Shanghai', '2026-06-16T18:00:00.000Z', 'US', 10, '["NASDAQ","GOLD","USD","US10Y","全市场"]', '5.25-5.50%', 'scheduled');

INSERT OR REPLACE INTO events (event_key, source, title, display_name, event_date, event_time, timezone, event_datetime_utc, country, importance, market_impact, previous_value, status) VALUES
('US_FOMC_STATEMENT_2026-06-17', 'fred', 'FOMC Statement', 'FOMC声明', '2026-06-17', '02:00', 'Asia/Shanghai', '2026-06-16T18:00:00.000Z', 'US', 9, '["全市场"]', NULL, 'scheduled');

-- 验证数据
SELECT event_date, display_name, importance, previous_value, event_time FROM events ORDER BY event_date, importance DESC;
