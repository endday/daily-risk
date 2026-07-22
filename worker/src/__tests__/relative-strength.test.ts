import { describe, expect, it } from 'vitest';
import {
  buildInstrumentQuality,
  buildRelativeStrengthPair,
  calculateRsi,
  type InstrumentSeries,
} from '../domain/relative-strength';

function series(code: string, multiplier: (index: number) => number, length = 320): InstrumentSeries {
  return {
    code,
    name: code,
    rows: Array.from({ length }, (_, index) => ({
      trade_date: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10),
      close_price: 100 * multiplier(index),
    })),
  };
}

describe('relative strength domain', () => {
  it('reports invalid rows, duplicates and available windows', () => {
    const input: InstrumentSeries = {
      code: 'A',
      name: '指数A',
      rows: [
        ...series('A', (index) => 1 + index / 100, 253).rows,
        { trade_date: '2024-01-01', close_price: 100 },
        { trade_date: '2027-01-01', close_price: null },
        { trade_date: '2027-01-02', close_price: 0 },
      ],
    };

    const result = buildInstrumentQuality(input);
    expect(result.duplicate_date_count).toBe(1);
    expect(result.missing_close_count).toBe(1);
    expect(result.non_positive_close_count).toBe(1);
    expect(result.valid_close_count).toBe(253);
    expect(result.window_available['252']).toBe(true);
    expect(result.return_20d).toBeGreaterThan(0);
    expect(result.max_drawdown_pct).toBe(0);
  });

  it('handles RSI edge cases', () => {
    expect(calculateRsi(Array.from({ length: 15 }, (_, index) => index))).toBe(100);
    expect(calculateRsi(Array.from({ length: 15 }, (_, index) => -index))).toBe(0);
    expect(calculateRsi(Array(15).fill(1))).toBe(50);
    expect(calculateRsi(Array(14).fill(1))).toBeNull();
  });

  it('calculates aligned relative returns and an overheated state', () => {
    const numerator = series('A', (index) => Math.exp(index * 0.004));
    const denominator = series('B', () => 1);
    const result = buildRelativeStrengthPair(numerator, denominator);

    expect(result.aligned_sample_count).toBe(320);
    expect(result.relative_return_20d).toBeCloseTo((Math.exp(0.08) - 1) * 100, 2);
    expect(result.relative_return_252d).toBeGreaterThan(100);
    expect(result.rsi_14).toBe(100);
    expect(result.state).toBe('overheated');
    expect(result.forward_stats).toHaveLength(3);
  });

  it('returns null metrics when aligned history is insufficient', () => {
    const result = buildRelativeStrengthPair(series('A', () => 1, 10), series('B', () => 1, 10));
    expect(result.relative_return_20d).toBeNull();
    expect(result.rsi_14).toBeNull();
    expect(result.zscore_242).toBeNull();
    expect(result.state).toBe('normal');
  });

  it('aligns mismatched trading dates instead of comparing row positions', () => {
    const numerator = series('A', (index) => 1 + index / 100, 30);
    const denominator = series('B', () => 1, 30);
    denominator.rows.splice(10, 1);
    const result = buildRelativeStrengthPair(numerator, denominator);
    expect(result.aligned_sample_count).toBe(29);
    expect(result.trade_date).toBe(numerator.rows.at(-1)!.trade_date);
  });
});
