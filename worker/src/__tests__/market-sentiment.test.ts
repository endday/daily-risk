import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}));

vi.mock('../collectors/http', () => ({
  http: {
    get: getMock,
  },
}));

import {
  mergeMarketSentimentRows,
  parseMarketFlowLine,
  parseQvixCsv,
} from '../collectors/market-sentiment';

describe('market sentiment collector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses 300ETF QVIX daily CSV and skips missing observations', () => {
    const rows = parseQvixCsv([
      ',2,3,4,5,6,7,8,9,10,11,12,13',
      '2026/08/01,18,19,17,18,,,,,20,21,19,20',
      '2026/08/02,18,19,17,18,,,,,.,.,.,.',
      '2026/08/03,18,19,17,18,,,,,21,22,20,21.84',
    ].join('\n'));

    expect(rows).toEqual([
      { trade_date: '2026-08-01', qvix_close: 20, qvix_change_pct: null },
      { trade_date: '2026-08-03', qvix_close: 21.84, qvix_change_pct: 9.2 },
    ]);
  });

  it('parses the EastMoney market flow line contract', () => {
    const row = parseMarketFlowLine(
      '2026-08-03,100,20,30,40,10,0.5,1,2,3,4,3333.3,1.2',
    );

    expect(row).toMatchObject({
      trade_date: '2026-08-03',
      main_net_inflow: 100,
      main_net_inflow_ratio: 0.5,
      market_close_price: 3333.3,
      market_change_pct: 1.2,
    });
  });

  it('merges VIX and market flow without losing dates from either source', () => {
    const rows = mergeMarketSentimentRows(
      [{ trade_date: '2026-08-02', qvix_close: 20, qvix_change_pct: 2 }],
      [{
        trade_date: '2026-08-03',
        market_close_price: 3000,
        market_change_pct: -1,
        main_net_inflow: -100,
        small_net_inflow: null,
        medium_net_inflow: null,
        large_net_inflow: null,
        super_large_net_inflow: null,
        main_net_inflow_ratio: null,
      }],
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].qvix_close).toBe(20);
    expect(rows[1].main_net_inflow).toBe(-100);
  });
});
