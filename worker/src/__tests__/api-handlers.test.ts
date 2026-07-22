import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleEvents } from '../api/events';
import { handleMarketTemperature } from '../api/market-temperature';
import { handleRelativeStrength } from '../api/relative-strength';
import type { Env } from '../env';

function createMockPreparedStatement(results: any) {
  return {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue({ results }),
  };
}

function createMockDb() {
  return {
    prepare: vi.fn(),
  };
}

describe('handleEvents', () => {
  let env: Env;
  let headers: Record<string, string>;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    headers = { 'Access-Control-Allow-Origin': '*' };
    mockDb = createMockDb();
    env = {
      DB: mockDb as any,
    };
  });

  it('should reject invalid date format', async () => {
    const response = await handleEvents(
      new Request('http://localhost/api/events?date=2026/06/11'),
      env,
      headers,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid date format, expected YYYY-MM-DD',
    });
  });

  it('should include parsed market_impact in event response', async () => {
    mockDb.prepare
      .mockReturnValueOnce(createMockPreparedStatement([]))
      .mockReturnValueOnce(createMockPreparedStatement([{
        event_key: 'US_CPI',
        importance: 10,
        display_name: '美国 CPI',
        description: null,
        previous_value: '3.2%',
        actual_value: null,
        forecast_value: '3.1%',
        confidence: 'estimated',
        source_url: null,
        event_time: '20:30',
        timezone: 'Asia/Shanghai',
        country: 'US',
        market_impact: '["NASDAQ","GOLD"]',
        status: 'scheduled',
        source: 'fred',
      }]))
      .mockReturnValueOnce(createMockPreparedStatement([]));

    const response = await handleEvents(
      new Request('http://localhost/api/events?date=2026-06-11'),
      env,
      headers,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.events[0].market_impact).toEqual(['NASDAQ', 'GOLD']);
    expect(body.holidays).toEqual([]);
  });
});

describe('handleMarketTemperature', () => {
  let env: Env;
  let headers: Record<string, string>;

  beforeEach(() => {
    headers = { 'Access-Control-Allow-Origin': '*' };
    env = {
      DB: {} as D1Database,
    };
  });

  it('should return 503 when no snapshots are available', async () => {
    const latestSpy = vi.spyOn(await import('../db'), 'getLatestSnapshots').mockResolvedValue([]);

    const response = await handleMarketTemperature(
      new Request('http://localhost/api/market-temperature'),
      env,
      headers,
      { data: { 2025: 134.9 } },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: 'No market temperature data available yet. Run /admin/collect first.',
    });

    latestSpy.mockRestore();
  });

  it('should return latest and history payloads when snapshots exist', async () => {
    const dbModule = await import('../db');
    const latestRows = [{
      trade_date: '2026-06-20',
      index_code: '000300',
      close_price: 4000,
      change_pct: 0.8,
      rise_count: 3200,
      fall_count: 1800,
      flat_count: 200,
      turnover_amount: 1.1e12,
      turnover_rate: 1.5,
      volatility_20d: 18,
      northbound_amt: 250000,
      pe_ttm: 12,
      pb: 1.4,
      margin_balance: 19000,
      bond_yield_10y: 2.1,
      us_2y_yield: 4.2,
      fed_funds_rate: 5.25,
      usd_index: 104,
      oil_wti: 78,
      us_yield_spread: 0.2,
      total_market_cap: 95,
    }];
    const historyRows = [latestRows[0]];

    const latestSpy = vi.spyOn(dbModule, 'getLatestSnapshots').mockResolvedValue(latestRows as any);
    const historySpy = vi.spyOn(dbModule, 'getSnapshotsByDateRange').mockResolvedValue(historyRows as any);

    const response = await handleMarketTemperature(
      new Request('http://localhost/api/market-temperature?days=20'),
      env,
      headers,
      { data: { 2025: 134.9 } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.trade_date).toBe('2026-06-20');
    expect(body.latest).toHaveLength(1);
    expect(body.history).toHaveLength(1);
    expect(body.derived.advance_decline_ratio).toBeDefined();

    latestSpy.mockRestore();
    historySpy.mockRestore();
  });

  it('should return compact history for ERP detail requests', async () => {
    const dbModule = await import('../db');
    const latestRows = [{
      trade_date: '2026-06-20',
      index_code: '000300',
      close_price: 4000,
      change_pct: 0.8,
      rise_count: 3200,
      fall_count: 1800,
      flat_count: 200,
      turnover_amount: 1.1e12,
      turnover_rate: 1.5,
      volatility_20d: 18,
      northbound_amt: 250000,
      pe_ttm: 12,
      pb: 1.4,
      margin_balance: 19000,
      bond_yield_10y: 2.1,
      us_2y_yield: 4.2,
      fed_funds_rate: 5.25,
      usd_index: 104,
      oil_wti: 78,
      us_yield_spread: 0.2,
      total_market_cap: 95,
    }];
    const historyRows = [latestRows[0]];

    const latestSpy = vi.spyOn(dbModule, 'getLatestSnapshots').mockResolvedValue(latestRows as any);
    const historySpy = vi.spyOn(dbModule, 'getSnapshotsByDateRangeAndIndex').mockResolvedValue(historyRows as any);

    const response = await handleMarketTemperature(
      new Request('http://localhost/api/market-temperature?days=2920&compact=1&indexCode=000300'),
      env,
      headers,
      { data: { 2025: 134.9 } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.compact).toBe(true);
    expect(body.index_code).toBe('000300');
    expect(body.latest).toHaveLength(1);
    expect(body.history_days).toBe(2920);

    latestSpy.mockRestore();
    historySpy.mockRestore();
  });

  it('should sample compact history when maxPoints is provided', async () => {
    const dbModule = await import('../db');
    const latestRows = [{
      trade_date: '2026-06-20',
      index_code: '000300',
      close_price: 4000,
      change_pct: 0.8,
      rise_count: 3200,
      fall_count: 1800,
      flat_count: 200,
      turnover_amount: 1.1e12,
      turnover_rate: 1.5,
      volatility_20d: 18,
      northbound_amt: 250000,
      pe_ttm: 12,
      pb: 1.4,
      margin_balance: 19000,
      bond_yield_10y: 2.1,
      us_2y_yield: 4.2,
      fed_funds_rate: 5.25,
      usd_index: 104,
      oil_wti: 78,
      us_yield_spread: 0.2,
      total_market_cap: 95,
    }];
    const historyRows = Array.from({ length: 500 }, (_, index) => ({
      ...latestRows[0],
      trade_date: `2025-01-${String((index % 28) + 1).padStart(2, '0')}`,
      close_price: 3500 + index,
    }));

    const latestSpy = vi.spyOn(dbModule, 'getLatestSnapshots').mockResolvedValue(latestRows as any);
    const historySpy = vi.spyOn(dbModule, 'getSnapshotsByDateRangeAndIndex').mockResolvedValue(historyRows as any);

    const response = await handleMarketTemperature(
      new Request('http://localhost/api/market-temperature?days=2920&compact=1&indexCode=000300&maxPoints=120'),
      env,
      headers,
      { data: { 2025: 134.9 } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sampled).toBe(true);
    expect(body.sample_step).toBeGreaterThan(1);
    expect(body.history.length).toBeLessThanOrEqual(121);

    latestSpy.mockRestore();
    historySpy.mockRestore();
  });

  it('should return 503 when local D1 schema is incomplete', async () => {
    const latestSpy = vi
      .spyOn(await import('../db'), 'getLatestSnapshots')
      .mockRejectedValue(new Error('no such table: market_snapshots'));

    const response = await handleMarketTemperature(
      new Request('http://localhost/api/market-temperature?days=20'),
      env,
      headers,
      { data: { 2025: 134.9 } },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Market temperature data store is not ready',
    });

    latestSpy.mockRestore();
  });
});

describe('handleRelativeStrength', () => {
  it('rejects an unsupported base index', async () => {
    const response = await handleRelativeStrength(
      new Request('http://localhost/api/relative-strength?base=INVALID'),
      { DB: {} as D1Database } as Env,
      {},
    );
    expect(response.status).toBe(400);
  });

  it('returns quality and pair metrics from instrument daily history', async () => {
    const dbModule = await import('../db');
    const historySpy = vi.spyOn(dbModule, 'getInstrumentDailyByDateRange').mockImplementation(async (_, code) => (
      Array.from({ length: 280 }, (_, index) => ({
        trade_date: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10),
        instrument_code: code,
        instrument_name: code,
        close_price: code === '399006' ? 100 + index : 100 + index / 2,
      })) as any
    ));

    const response = await handleRelativeStrength(
      new Request('http://localhost/api/relative-strength'),
      { DB: {} as D1Database } as Env,
      {},
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.quality).toHaveLength(5);
    expect(body.pairs).toHaveLength(4);
    expect(body.pairs[0].relative_return_20d).not.toBeNull();
    expect(body.pairs[0].aligned_sample_count).toBe(280);
    historySpy.mockRestore();
  });
});
