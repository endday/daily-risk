import { describe, expect, it } from 'vitest';
import { buildIndexAccumulationItem, calculateRsi } from '../domain/index-accumulation';

describe('index accumulation indicators', () => {
  it('calculates trend windows and chart points', () => {
    const rows = Array.from({ length: 300 }, (_, i) => ({
      trade_date: `2025-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
      close_price: 100 + i,
    }));
    const item = buildIndexAccumulationItem({ code: '000300', name: '沪深300', rows });
    expect(item.close).toBe(399);
    expect(item.ma50).toBeCloseTo(374.5);
    expect(item.ma200).toBeCloseTo(299.5);
    expect(item.return20d).toBeGreaterThan(0);
    expect(item.chart_points.length).toBe(260);
    expect(item.rsi14).toBe(100);
  });

  it('returns null RSI when history is too short', () => {
    expect(calculateRsi([1, 2, 3])).toBeNull();
  });
});
