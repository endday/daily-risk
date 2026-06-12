-- Daily Risk Seed Data
-- Generated for development testing
DELETE FROM events;
INSERT OR REPLACE INTO events (
        event_key, source, title, display_name,
        event_date, event_time, timezone, event_datetime_utc,
        country, importance, market_impact,
        previous_value, status
      ) VALUES (
        'CN_CPI', 'manual', '中国CPI', '中国CPI',
        '2026-06-11', '09:30', 'Asia/Shanghai', '2026-06-11T01:30:00.000Z',
        'CN', 8, '["上证","恒指","CNY"]',
        '0.2%', 'scheduled'
      );
INSERT OR REPLACE INTO events (
        event_key, source, title, display_name,
        event_date, event_time, timezone, event_datetime_utc,
        country, importance, market_impact,
        previous_value, status
      ) VALUES (
        'CN_PPI', 'manual', '中国PPI', '中国PPI',
        '2026-06-11', '09:30', 'Asia/Shanghai', '2026-06-11T01:30:00.000Z',
        'CN', 6, '["上证","商品"]',
        '-2.5%', 'scheduled'
      );
INSERT OR REPLACE INTO events (
        event_key, source, title, display_name,
        event_date, event_time, timezone, event_datetime_utc,
        country, importance, market_impact,
        previous_value, status
      ) VALUES (
        'US_CPI', 'fred', '美国CPI', '美国CPI',
        '2026-06-12', '20:30', 'Asia/Shanghai', '2026-06-12T12:30:00.000Z',
        'US', 10, '["NASDAQ","GOLD","USD","US10Y"]',
        '2.8%', 'scheduled'
      );
INSERT OR REPLACE INTO events (
        event_key, source, title, display_name,
        event_date, event_time, timezone, event_datetime_utc,
        country, importance, market_impact,
        previous_value, status
      ) VALUES (
        'NVDA_EARNINGS', 'alpha_vantage', 'NVDA财报', 'NVDA财报',
        '2026-06-12', '盘后', 'Asia/Shanghai', '2026-06-12T12:00:00.000Z',
        'US', 8, '["NASDAQ","半导体","TSM"]',
        NULL, 'scheduled'
      );
INSERT OR REPLACE INTO events (
        event_key, source, title, display_name,
        event_date, event_time, timezone, event_datetime_utc,
        country, importance, market_impact,
        previous_value, status
      ) VALUES (
        'AAPL_EARNINGS', 'alpha_vantage', 'AAPL财报', 'AAPL财报',
        '2026-06-12', '盘后', 'Asia/Shanghai', '2026-06-12T12:00:00.000Z',
        'US', 7, '["NASDAQ","消费电子"]',
        NULL, 'scheduled'
      );
INSERT OR REPLACE INTO events (
        event_key, source, title, display_name,
        event_date, event_time, timezone, event_datetime_utc,
        country, importance, market_impact,
        previous_value, status
      ) VALUES (
        'CN_PMI', 'manual', '中国PMI', '中国PMI',
        '2026-06-13', '09:30', 'Asia/Shanghai', '2026-06-13T01:30:00.000Z',
        'CN', 7, '["上证","恒指","铁矿石"]',
        '50.2', 'scheduled'
      );
INSERT OR REPLACE INTO events (
        event_key, source, title, display_name,
        event_date, event_time, timezone, event_datetime_utc,
        country, importance, market_impact,
        previous_value, status
      ) VALUES (
        'US_FOMC_RATE', 'fred', 'FOMC利率决议', 'FOMC利率决议',
        '2026-06-14', '02:00', 'Asia/Shanghai', '2026-06-13T18:00:00.000Z',
        'US', 10, '["NASDAQ","GOLD","USD","全市场"]',
        '5.25-5.50%', 'scheduled'
      );
INSERT OR REPLACE INTO events (
        event_key, source, title, display_name,
        event_date, event_time, timezone, event_datetime_utc,
        country, importance, market_impact,
        previous_value, status
      ) VALUES (
        'US_NONFARM', 'fred', '美国非农就业', '美国非农就业',
        '2026-06-15', '20:30', 'Asia/Shanghai', '2026-06-15T12:30:00.000Z',
        'US', 10, '["NASDAQ","GOLD","USD"]',
        '187K', 'scheduled'
      );
INSERT OR REPLACE INTO events (
        event_key, source, title, display_name,
        event_date, event_time, timezone, event_datetime_utc,
        country, importance, market_impact,
        previous_value, status
      ) VALUES (
        'US_UNEMPLOYMENT', 'fred', '美国失业率', '美国失业率',
        '2026-06-15', '20:30', 'Asia/Shanghai', '2026-06-15T12:30:00.000Z',
        'US', 9, '["NASDAQ","USD"]',
        '4.0%', 'scheduled'
      );
INSERT OR REPLACE INTO events (
        event_key, source, title, display_name,
        event_date, event_time, timezone, event_datetime_utc,
        country, importance, market_impact,
        previous_value, status
      ) VALUES (
        'TSLA_EARNINGS', 'alpha_vantage', 'TSLA财报', 'TSLA财报',
        '2026-06-15', '盘后', 'Asia/Shanghai', '2026-06-15T12:00:00.000Z',
        'US', 6, '["NASDAQ","电动车"]',
        NULL, 'scheduled'
      );
INSERT OR REPLACE INTO events (
        event_key, source, title, display_name,
        event_date, event_time, timezone, event_datetime_utc,
        country, importance, market_impact,
        previous_value, status
      ) VALUES (
        'US_GDP', 'fred', '美国GDP', '美国GDP',
        '2026-06-16', '20:30', 'Asia/Shanghai', '2026-06-16T12:30:00.000Z',
        'US', 8, '["NASDAQ","USD"]',
        '3.2%', 'scheduled'
      );
INSERT OR REPLACE INTO events (
        event_key, source, title, display_name,
        event_date, event_time, timezone, event_datetime_utc,
        country, importance, market_impact,
        previous_value, status
      ) VALUES (
        'CN_M2', 'manual', '中国M2货币供应', '中国M2货币供应',
        '2026-06-17', '10:00', 'Asia/Shanghai', '2026-06-17T02:00:00.000Z',
        'CN', 6, '["上证","CNY"]',
        '8.6%', 'scheduled'
      );
-- Verify
SELECT event_date, display_name, importance, previous_value FROM events ORDER BY event_date, importance DESC;
