import { describe, expect, it, vi } from 'vitest';

vi.mock('../trading-calendar', () => ({
  isTradingDay: vi.fn().mockResolvedValue(true),
}));

import { getExpectedLatestTradingDate, handleDataHealth } from '../api/data-health';
import * as db from '../db';
import type { Env } from '../env';
import { isTradingDay } from '../trading-calendar';

describe('data health API', () => {
  it('reports incomplete valuation coverage separately from fresh data', async () => {
    const valuationSpy = vi.spyOn(db, 'getInstrumentValuationCoverage').mockResolvedValue({
      record_count: 3_600,
      series_count: 24,
      min_trade_date: '2020-01-02',
      max_trade_date: '9999-12-31',
      source_updated_at: '2026-07-27T10:00:00.000Z',
    });
    const marketSnapshotSpy = vi.spyOn(db, 'getMarketSnapshotCoverage').mockResolvedValue({
      record_count: 3_750,
      series_count: 5,
      min_trade_date: '2020-01-02',
      max_trade_date: '9999-12-31',
      source_updated_at: '2026-07-27T10:00:00.000Z',
    });
    const industrySpy = vi.spyOn(db, 'getIndustryFundFlowCoverage').mockResolvedValue({
      record_count: 3_080,
      series_count: 22,
      min_trade_date: '2026-01-02',
      max_trade_date: '9999-12-31',
      source_updated_at: '2026-07-27T10:00:00.000Z',
    });
    const runsSpy = vi.spyOn(db, 'getProviderRunHealth').mockResolvedValue([
      {
        provider: 'market_snapshot',
        run_type: 'daily_collection',
        started_at: '2026-07-27T10:00:00.000Z',
        finished_at: '2026-07-27T10:00:10.000Z',
        status: 'success',
        records_upserted: 375,
        error: null,
        last_success_at: '2026-07-27T10:00:10.000Z',
      },
      {
        provider: 'index_valuation',
        run_type: 'daily_collection',
        started_at: '2026-07-27T10:00:00.000Z',
        finished_at: '2026-07-27T10:00:10.000Z',
        status: 'success',
        records_upserted: 375,
        error: null,
        last_success_at: '2026-07-27T10:00:10.000Z',
      },
      {
        provider: 'industry_fund_flow',
        run_type: 'daily_collection',
        started_at: '2026-07-27T10:00:00.000Z',
        finished_at: '2026-07-27T10:00:10.000Z',
        status: 'success',
        records_upserted: 154,
        error: null,
        last_success_at: '2026-07-27T10:00:10.000Z',
      },
    ]);

    const response = await handleDataHealth(
      new Request('http://localhost/api/data-health'),
      { DB: {} as D1Database } as Env,
      {},
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.expected_latest_trading_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.datasets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'market_snapshot',
        state: 'healthy',
        last_records_upserted: 375,
      }),
      expect.objectContaining({
        key: 'index_valuation',
        state: 'partial',
        expected_series_count: 25,
        available_series_count: 24,
        last_records_upserted: 375,
      }),
      expect.objectContaining({
        key: 'industry_fund_flow',
        state: 'healthy',
        last_records_upserted: 154,
      }),
    ]));
    expect(body.collectors).toHaveLength(3);

    marketSnapshotSpy.mockRestore();
    valuationSpy.mockRestore();
    industrySpy.mockRestore();
    runsSpy.mockRestore();
  });

  it('marks a dataset stale when it lags more than two trading days', async () => {
    const valuationSpy = vi.spyOn(db, 'getInstrumentValuationCoverage').mockResolvedValue({
      record_count: 3_750,
      series_count: 25,
      min_trade_date: '2020-01-02',
      max_trade_date: '2000-01-01',
      source_updated_at: '2000-01-01T10:00:00.000Z',
    });
    const marketSnapshotSpy = vi.spyOn(db, 'getMarketSnapshotCoverage').mockResolvedValue({
      record_count: 3_750,
      series_count: 5,
      min_trade_date: '2020-01-02',
      max_trade_date: '2000-01-01',
      source_updated_at: '2000-01-01T10:00:00.000Z',
    });
    const industrySpy = vi.spyOn(db, 'getIndustryFundFlowCoverage').mockResolvedValue({
      record_count: 22,
      series_count: 22,
      min_trade_date: '2000-01-01',
      max_trade_date: '2000-01-01',
      source_updated_at: '2000-01-01T10:00:00.000Z',
    });
    const runsSpy = vi.spyOn(db, 'getProviderRunHealth').mockResolvedValue([]);

    const response = await handleDataHealth(
      new Request('http://localhost/api/data-health'),
      { DB: {} as D1Database } as Env,
      {},
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.datasets).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'market_snapshot', state: 'stale' }),
      expect.objectContaining({ key: 'index_valuation', state: 'stale' }),
      expect.objectContaining({ key: 'industry_fund_flow', state: 'stale' }),
    ]));

    marketSnapshotSpy.mockRestore();
    valuationSpy.mockRestore();
    industrySpy.mockRestore();
    runsSpy.mockRestore();
  });

  it('marks current coverage partial when the latest automatic run failed', async () => {
    const coverage = {
      record_count: 3_750,
      series_count: 5,
      min_trade_date: '2020-01-02',
      max_trade_date: '9999-12-31',
      source_updated_at: '2026-07-31T10:00:00.000Z',
    };
    const marketSnapshotSpy = vi.spyOn(db, 'getMarketSnapshotCoverage').mockResolvedValue(coverage);
    const valuationSpy = vi.spyOn(db, 'getInstrumentValuationCoverage').mockResolvedValue({
      ...coverage,
      series_count: 25,
    });
    const industrySpy = vi.spyOn(db, 'getIndustryFundFlowCoverage').mockResolvedValue(coverage);
    const runsSpy = vi.spyOn(db, 'getProviderRunHealth').mockResolvedValue([
      {
        provider: 'market_snapshot',
        run_type: 'daily_collection',
        started_at: '2026-08-02T10:00:00.000Z',
        finished_at: '2026-08-02T10:00:10.000Z',
        status: 'failed',
        records_upserted: 0,
        error: 'upstream unavailable',
        last_success_at: '2026-07-31T10:00:00.000Z',
      },
    ]);

    const response = await handleDataHealth(
      new Request('http://localhost/api/data-health'),
      { DB: {} as D1Database } as Env,
      {},
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.datasets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'market_snapshot',
        state: 'partial',
        trading_days_behind: 0,
        last_run_status: 'failed',
        error: 'upstream unavailable',
      }),
    ]));

    marketSnapshotSpy.mockRestore();
    valuationSpy.mockRestore();
    industrySpy.mockRestore();
    runsSpy.mockRestore();
  });

  it('expects the preceding trading day until the 18:00 Beijing sync cutoff', async () => {
    vi.mocked(isTradingDay).mockImplementation(async (_database, date) => {
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      return weekday !== 0 && weekday !== 6;
    });

    const database = {} as D1Database;
    await expect(
      getExpectedLatestTradingDate(database, new Date('2026-07-27T09:59:00.000Z')),
    ).resolves.toBe('2026-07-24');
    await expect(
      getExpectedLatestTradingDate(database, new Date('2026-07-27T10:00:00.000Z')),
    ).resolves.toBe('2026-07-27');

    vi.mocked(isTradingDay).mockResolvedValue(true);
  });
});
