import { describe, expect, it } from 'vitest';
import { buildMarketRisk } from '../domain/market-risk';
import type { IndustryFundFlowRow, SwIndustryDailyRow } from '../collectors/base';
import type { MarketSnapshotRowLike } from '../../../shared/types';

function dateAt(index: number): string {
  return new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10);
}

function snapshot(index: number, overrides: Partial<MarketSnapshotRowLike> = {}): MarketSnapshotRowLike {
  return {
    trade_date: dateAt(index),
    index_code: '000300',
    close_price: 100,
    change_pct: null,
    rise_count: null,
    fall_count: null,
    flat_count: null,
    turnover_amount: 100,
    turnover_rate: null,
    volatility_20d: null,
    northbound_amt: null,
    pe_ttm: 15,
    pb: null,
    margin_balance: 100,
    bond_yield_10y: 2,
    us_2y_yield: null,
    fed_funds_rate: null,
    usd_index: null,
    oil_wti: null,
    us_yield_spread: null,
    total_market_cap: null,
    ...overrides,
  };
}

function industryRow(industry: number, day: number, close: number): SwIndustryDailyRow {
  return {
    trade_date: dateAt(day),
    industry_code: `801${String(industry).padStart(3, '0')}.SL`,
    industry_name: `行业${industry}`,
    provider: 'test',
    open_price: close,
    high_price: close,
    low_price: close,
    close_price: close,
    change_pct: null,
    volume: null,
    amount: null,
    member_count: null,
    source_updated_at: null,
  };
}

function flowRow(industry: number, amount: number): IndustryFundFlowRow {
  return {
    trade_date: dateAt(29),
    board_code: `801${String(industry).padStart(3, '0')}`,
    board_name: `行业${industry}`,
    provider: 'test',
    close_price: null,
    change_pct: null,
    main_net_inflow: amount,
    small_net_inflow: null,
    medium_net_inflow: null,
    large_net_inflow: null,
    super_large_net_inflow: null,
    main_net_inflow_ratio: null,
    small_net_inflow_ratio: null,
    medium_net_inflow_ratio: null,
    large_net_inflow_ratio: null,
    super_large_net_inflow_ratio: null,
    source_updated_at: null,
  };
}

function flowRowAt(day: number, industry: number, amount: number): IndustryFundFlowRow {
  return {
    ...flowRow(industry, amount),
    trade_date: dateAt(day),
  };
}

function metricValue(result: ReturnType<typeof buildMarketRisk>, dimensionKey: string, metricKey: string) {
  return result.temperature?.dimensions
    .find((dimension) => dimension.key === dimensionKey)
    ?.metrics.find((item) => item.key === metricKey)
    ?.value;
}

describe('market risk domain', () => {
  it('does not create a composite state when the input is incomplete', () => {
    const result = buildMarketRisk([snapshot(0)], [], [snapshot(0)], [], []);

    expect(result.state).toBe('unavailable');
    expect(result.available_component_count).toBe(0);
    expect(result.breadth.state).toBe('unavailable');
    expect(result.tail.state).toBe('unavailable');
  });

  it('does not label a partial price window as a 60-day drawdown', () => {
    const indexRows = Array.from({ length: 21 }, (_, index) => snapshot(index, {
      close_price: 100 - index,
      pe_ttm: null,
      bond_yield_10y: null,
    }));

    const result = buildMarketRisk(indexRows, [], indexRows, [], []);

    expect(result.tail.max_drawdown_60d_pct).toBeNull();
    expect(result.tail.expected_shortfall_5pct).not.toBeNull();
  });

  it('detects narrow breadth, crowded liquidity and elevated tail risk', () => {
    const indexRows = Array.from({ length: 60 }, (_, index) => snapshot(index, {
      close_price: 100 - index * 0.35,
      pe_ttm: null,
      bond_yield_10y: null,
    }));
    const marketRows = Array.from({ length: 60 }, (_, index) => snapshot(index, {
      index_code: '000001',
      close_price: null,
      turnover_amount: index >= 55 ? 220 : 100,
      margin_balance: index >= 55 ? 106 : 100,
      pe_ttm: null,
      bond_yield_10y: null,
    }));
    const industries = Array.from({ length: 12 }, (_, industry) =>
      Array.from({ length: 30 }, (_, day) => industryRow(industry, day, day === 29 ? 80 : 100)).flat(),
    ).flat();
    const flows = Array.from({ length: 12 }, (_, industry) => flowRow(industry, industry < 5 ? 100 : 1));

    const result = buildMarketRisk(indexRows, marketRows, [...indexRows, ...marketRows], industries, flows);

    expect(result.breadth.industry_count).toBe(12);
    expect(result.breadth.above_ma20_ratio).toBe(0);
    expect(result.breadth.state).toBe('watch');
    expect(result.liquidity.state).toBe('elevated');
    expect(result.tail.state).toBe('elevated');
    expect(result.tail.max_drawdown_60d_pct).toBeLessThan(-10);
    expect(result.state).toBe('elevated');
    expect(result.temperature?.dimensions.map((item) => item.key)).toEqual([
      'advance_decline',
      'index_trend',
      'turnover',
      'industry_diffusion',
      'fund_flow',
      'valuation',
      'risk_pressure',
    ]);
    expect(result.temperature?.dimensions.find((item) => item.key === 'industry_diffusion')?.metrics.length).toBeGreaterThan(10);
    expect(result.temperature?.missing_metric_count).toBeGreaterThan(0);
  });

  it('uses ERP historical rank only after a full trading-year sample', () => {
    const indexRows = Array.from({ length: 260 }, (_, index) => snapshot(index, {
      pe_ttm: index === 259 ? 25 : 20,
      bond_yield_10y: 2,
    }));
    const marketRows = Array.from({ length: 30 }, (_, index) => snapshot(index));

    const result = buildMarketRisk(indexRows, marketRows, [...indexRows, ...marketRows], [], []);

    expect(result.valuation.sample_count).toBe(260);
    expect(result.valuation.erp_percentile).toBeLessThanOrEqual(20);
    expect(result.valuation.state).toBe('watch');
  });

  it('adds derived temperature metrics from existing turnover, industry and flow data', () => {
    const indexRows = Array.from({ length: 130 }, (_, index) => snapshot(index, {
      close_price: 100,
      pe_ttm: null,
      bond_yield_10y: null,
    }));
    const marketRows = Array.from({ length: 130 }, (_, index) => snapshot(index, {
      index_code: '000001',
      close_price: 100,
      change_pct: 0.2,
      turnover_amount: 100 + index,
      pe_ttm: null,
      bond_yield_10y: null,
    }));
    const industries = Array.from({ length: 12 }, (_, industry) =>
      Array.from({ length: 30 }, (_, day) => industryRow(
        industry,
        day,
        industry < 8 ? 100 + day : 100 - day,
      )).flat(),
    ).flat();
    const flows = Array.from({ length: 10 }, (_, dayOffset) =>
      Array.from({ length: 12 }, (_, industry) => flowRowAt(
        20 + dayOffset,
        industry,
        dayOffset < 5 ? -10 : 10,
      )),
    ).flat();

    const result = buildMarketRisk(indexRows, marketRows, [...indexRows, ...marketRows], industries, flows);

    expect(metricValue(result, 'turnover', 'turnover_percentile_120d')).toBe(100);
    expect(metricValue(result, 'turnover', 'consecutive_volume_up_days')).toBe(129);
    expect(metricValue(result, 'industry_diffusion', 'industry_beat_hs300_20d_count')).toBe(8);
    expect(metricValue(result, 'industry_diffusion', 'industry_beat_hs300_20d_ratio')).toBe(66.7);
    expect(metricValue(result, 'fund_flow', 'industry_flow_consecutive_in_days')).toBe(5);
    expect(metricValue(result, 'fund_flow', 'industry_flow_consecutive_out_days')).toBe(0);
    expect(metricValue(result, 'fund_flow', 'industry_flow_net_5d_avg')).toBe(120);
    expect(metricValue(result, 'fund_flow', 'industry_flow_net_5d_change')).toBe(240);
  });
});
