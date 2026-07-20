import { describe, expect, it, vi } from 'vitest';
import { upsertInstrumentDailyRows } from '../db';
import type { InstrumentDailyRow } from '../collectors/base';

function createMockDb() {
  const prepared = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ success: true }),
  };

  return {
    prepare: vi.fn().mockReturnValue(prepared),
    batch: vi.fn().mockResolvedValue([]),
    prepared,
  };
}

const row: InstrumentDailyRow = {
  trade_date: '2026-07-09',
  instrument_code: '000300',
  instrument_name: '沪深300',
  instrument_type: 'broad_index',
  provider: 'free-stockdb',
  open_price: 3900,
  high_price: 3950,
  low_price: 3880,
  close_price: 3930,
  pre_close_price: 3910,
  change_pct: 0.51,
  change_amount: 20,
  amplitude: 1.79,
  volume: 100,
  amount: 200,
  turnover_rate: 0.8,
  pe_ttm: 13.2,
  pb: 1.4,
  total_market_cap: null,
  float_market_cap: null,
  is_st: 0,
  source_updated_at: '2026-07-10T00:00:00.000Z',
};

describe('upsertInstrumentDailyRows', () => {
  it('uses the same primary-key upsert path on repeated initialization', async () => {
    const mock = createMockDb();
    const db = mock as unknown as D1Database;

    await upsertInstrumentDailyRows(db, [row]);
    await upsertInstrumentDailyRows(db, [row]);

    expect(mock.prepare).toHaveBeenCalledTimes(2);
    expect(mock.batch).toHaveBeenCalledTimes(2);

    const sql = mock.prepare.mock.calls[0][0] as string;
    expect(sql).toContain('ON CONFLICT(trade_date, instrument_code) DO UPDATE SET');
    expect(sql).toContain('COALESCE(excluded.close_price, instrument_daily.close_price)');
  });
});
