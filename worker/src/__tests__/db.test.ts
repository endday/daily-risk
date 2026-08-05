import { describe, expect, it, vi } from 'vitest';

import { getInstrumentValuationCoverage, getProviderRunHealth } from '../db';

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('db health queries', () => {
  it('counts valuation series only on the latest PE trade date', async () => {
    const first = vi.fn().mockResolvedValue({
      record_count: 3,
      series_count: 1,
      min_trade_date: '2026-07-24',
      max_trade_date: '2026-07-27',
      source_updated_at: '2026-07-27T10:00:00.000Z',
    });
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const database = { prepare } as unknown as D1Database;

    const coverage = await getInstrumentValuationCoverage(database, ['000300', '000905']);

    expect(coverage.series_count).toBe(1);
    expect(bind).toHaveBeenCalledWith('000300', '000905');
    const sql = normalizeSql(prepare.mock.calls[0][0]);
    expect(sql).toContain('WITH valuation_rows AS');
    expect(sql).toContain('SELECT MAX(trade_date) AS max_trade_date FROM valuation_rows');
    expect(sql).toContain('WHERE trade_date = latest.max_trade_date');
  });

  it('does not treat partial provider runs as last success', async () => {
    const all = vi.fn().mockResolvedValue({ results: [] });
    const prepare = vi.fn().mockReturnValue({ all });
    const database = { prepare } as unknown as D1Database;

    await getProviderRunHealth(database);

    const sql = normalizeSql(prepare.mock.calls[0][0]);
    expect(sql).toContain("WHERE status = 'success'");
    expect(sql).not.toContain("WHERE status IN ('success', 'partial_success')");
  });
});
