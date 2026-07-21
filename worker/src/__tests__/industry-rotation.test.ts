import { describe, expect, it } from 'vitest';
import { buildIndustryRotation } from '../api/industry-rotation';
import { EASTMONEY_PRIMARY_INDUSTRIES, parseIndustryFundFlowLine } from '../collectors/industry-fund-flow';
import type { IndustryFundFlowRow, SwIndustryDailyRow } from '../collectors/base';

function row(
  date: string,
  code: string,
  name: string,
  flow: number,
  flowRatio: number,
  close: number,
): IndustryFundFlowRow {
  return {
    trade_date: date,
    board_code: code,
    board_name: name,
    provider: 'eastmoney',
    close_price: close,
    change_pct: null,
    main_net_inflow: flow,
    small_net_inflow: null,
    medium_net_inflow: null,
    large_net_inflow: null,
    super_large_net_inflow: null,
    main_net_inflow_ratio: flowRatio,
    small_net_inflow_ratio: null,
    medium_net_inflow_ratio: null,
    large_net_inflow_ratio: null,
    super_large_net_inflow_ratio: null,
    source_updated_at: null,
  };
}

function swRow(date: string, code: string, name: string, amount: number, close: number): SwIndustryDailyRow {
  return {
    trade_date: date,
    industry_code: code,
    industry_name: name,
    provider: 'free-stockdb',
    open_price: null,
    high_price: null,
    low_price: null,
    close_price: close,
    change_pct: null,
    volume: null,
    amount,
    member_count: 10,
    source_updated_at: null,
  };
}

describe('industry fund flow parsing', () => {
  it('keeps concepts and broad indices out of the industry universe', () => {
    const names = EASTMONEY_PRIMARY_INDUSTRIES.map((item) => item.f14);
    expect(names.some((name) => name.includes('概念'))).toBe(false);
    expect(names).not.toContain('AB股');
    expect(names).not.toContain('HS300_');
  });

  it('maps EastMoney fields to the documented money-flow buckets', () => {
    const parsed = parseIndustryFundFlowLine(
      'BK0475',
      '银行',
      '2026-07-16,-1394000240,1189441536,204558592,-808055808,-585944432,-5.29,4.52,0.78,-3.07,-2.22,4095.61,-0.76',
    );

    expect(parsed).toMatchObject({
      trade_date: '2026-07-16',
      board_code: 'BK0475',
      main_net_inflow: -1394000240,
      small_net_inflow: 1189441536,
      super_large_net_inflow: -585944432,
      main_net_inflow_ratio: -5.29,
      close_price: 4095.61,
      change_pct: -0.76,
    });
  });
});

describe('industry rotation scoring', () => {
  it('sorts by transparent period return without producing an opaque score', () => {
    const rows = [
      swRow('2026-07-14', 'A', '强势行业', 100, 100),
      swRow('2026-07-15', 'A', '强势行业', 120, 103),
      swRow('2026-07-16', 'A', '强势行业', 150, 106),
      swRow('2026-07-14', 'B', '弱势行业', 100, 100),
      swRow('2026-07-15', 'B', '弱势行业', 80, 98),
      swRow('2026-07-16', 'B', '弱势行业', 10, 96),
    ];

    const result = buildIndustryRotation(rows, 5);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ board_code: 'A' });
    expect(result[0].period_return_pct).toBe(6);
    expect(result[0].log_bias_20_pct).toBeNull();
    expect(result[1]).toMatchObject({ board_code: 'B' });
    expect('score' in result[0]).toBe(false);
  });

  it('calculates mainline bias from the EMA of log closes', () => {
    const rows = Array.from({ length: 60 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10);
      return swRow(date, 'T', '趋势行业', 1, Math.exp(index * 0.002));
    });

    const result = buildIndustryRotation(rows, 20);
    expect(result[0].log_bias_20_pct).toBeGreaterThan(0);
    expect(result[0].log_bias_20_pct).toBeLessThan(5);
  });
});
