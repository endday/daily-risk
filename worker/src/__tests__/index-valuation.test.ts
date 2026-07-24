import { describe, expect, it } from 'vitest';
import { parseCSIndexValuationRows } from '../collectors/index-valuation';
import { CSINDEX_VALUATION_INDICES, VALUATION_INDICES, type ValuationIndex } from '../valuation-universe';

const index: ValuationIndex = {
  code: '000300', name: '沪深300', category: 'broad',
};

describe('index valuation collector', () => {
  it('normalizes CSIndex dates, prices and valid PE values', () => {
    const rows = parseCSIndexValuationRows(index, [
      { tradeDate: '20260721', close: '4000.5', change: '10.5', changePct: '0.26', peg: '13.2' },
      { tradeDate: 'invalid', close: 1, peg: 1 },
      { tradeDate: '20260722', close: 3990, change: -10.5, peg: -2 },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      trade_date: '2026-07-21', close_price: 4000.5, pre_close_price: 3990, pe_ttm: 13.2,
    });
    expect(rows[1].pe_ttm).toBeNull();
  });

  it('excludes indices without a verified historical PE series from the valuation universe', () => {
    expect(VALUATION_INDICES).toHaveLength(25);
    expect(CSINDEX_VALUATION_INDICES).toEqual(VALUATION_INDICES);
    expect(VALUATION_INDICES.map((item) => item.code)).not.toEqual(expect.arrayContaining(['399001', '399006', '399330']));
  });
});
