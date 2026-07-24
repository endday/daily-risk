import { describe, expect, it } from 'vitest';
import { buildValuationRanking, buildValuationRankingItem, MINIMUM_PE_SAMPLES, type ValuationSeries } from '../domain/valuation-ranking';

function rows(count: number, latestPe: number, closeAt = (index: number) => 100 + index) {
  return Array.from({ length: count }, (_, index) => ({
    trade_date: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10),
    close_price: closeAt(index),
    pe_ttm: index === count - 1 ? latestPe : index + 1,
  }));
}

function series(code: string, latestPe: number, count = MINIMUM_PE_SAMPLES): ValuationSeries {
  return { code, name: code, category: 'broad', peHistorySupported: true, rows: rows(count, latestPe) };
}

describe('valuation ranking domain', () => {
  it('uses PE percentile thresholds including exact boundaries', () => {
    expect(buildValuationRankingItem(series('LOW', 47)).state).toBe('low');
    expect(buildValuationRankingItem(series('BELOW', 95)).state).toBe('below_average');
    expect(buildValuationRankingItem(series('FAIR', 167)).state).toBe('fair');
    expect(buildValuationRankingItem(series('HIGH', 215)).state).toBe('high');
  });

  it('excludes insufficient or missing PE history without losing price metrics', () => {
    const insufficient = buildValuationRankingItem(series('SHORT', 10, MINIMUM_PE_SAMPLES - 1));
    expect(insufficient.state).toBe('unavailable');
    expect(insufficient.pe_percentile).toBeNull();
    expect(insufficient.return_20d_pct).not.toBeNull();

    const missing = buildValuationRankingItem({
      code: 'MISSING', name: 'MISSING', category: 'broad', peHistorySupported: true,
      rows: rows(MINIMUM_PE_SAMPLES, 10).map((row) => ({ ...row, pe_ttm: null })),
    });
    expect(missing.state).toBe('unavailable');
    expect(missing.latest_pe_ttm).toBeNull();
    expect(missing.pe_sample_count).toBe(0);
  });

  it('ranks low percentiles first, then stronger 20-session return, and keeps unavailable last', () => {
    const rankings = buildValuationRanking([
      series('SECOND', 47),
      { ...series('FIRST', 47), rows: rows(MINIMUM_PE_SAMPLES, 47, (index) => 100 + index * 2) },
      series('UNAVAILABLE', 8, 20),
    ]);

    expect(rankings.map((item) => item.code)).toEqual(['FIRST', 'SECOND', 'UNAVAILABLE']);
    expect(rankings.map((item) => item.rank)).toEqual([1, 2, null]);
  });

  it('calculates session return and rolling maximum drawdown from valid close prices', () => {
    const closes = Array.from({ length: MINIMUM_PE_SAMPLES }, (_, index) => {
      if (index < MINIMUM_PE_SAMPLES - 60) return 100;
      if (index < MINIMUM_PE_SAMPLES - 30) return 200;
      return 150;
    });
    const result = buildValuationRankingItem({
      code: 'METRICS', name: 'METRICS', category: 'broad', peHistorySupported: true,
      rows: rows(MINIMUM_PE_SAMPLES, 10, (index) => closes[index]),
    });

    expect(result.return_20d_pct).toBe(0);
    expect(result.max_drawdown_60d_pct).toBe(-25);
  });
});
