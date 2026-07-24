import { describe, expect, it, vi } from 'vitest';
import * as db from '../db';
import { handleValuationRanking } from '../api/valuation-ranking';
import type { Env } from '../env';

describe('handleValuationRanking', () => {
  it('returns the configured universe with a cached PE percentile ranking', async () => {
    const historySpy = vi.spyOn(db, 'getInstrumentDailyByDateRange').mockImplementation(async (_database, code) => (
      Array.from({ length: 240 }, (_, index) => ({
        trade_date: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10),
        instrument_code: code,
        close_price: 100 + index,
        pe_ttm: index === 239 ? 47 : index + 1,
      })) as any
    ));

    const response = await handleValuationRanking(
      new Request('http://localhost/api/valuation-ranking'),
      { DB: {} as D1Database } as Env,
      { 'Access-Control-Allow-Origin': '*' },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(25);
    expect(body.rankable_count).toBe(25);
    expect(body.items[0]).toMatchObject({ rank: 1, state: 'low' });
    expect(response.headers.get('Cache-Control')).toContain('max-age=300');
    historySpy.mockRestore();
  });

  it('does not leak an incomplete schema error', async () => {
    const historySpy = vi
      .spyOn(db, 'getInstrumentDailyByDateRange')
      .mockRejectedValue(new Error('no such table: instrument_daily'));

    const response = await handleValuationRanking(
      new Request('http://localhost/api/valuation-ranking'),
      { DB: {} as D1Database } as Env,
      {},
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Valuation data store is not ready' });
    historySpy.mockRestore();
  });
});
