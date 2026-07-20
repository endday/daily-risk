export type MarketInstrumentType = 'broad_index' | 'industry_etf' | 'theme_etf';

export interface MarketInstrument {
  code: string;
  name: string;
  secid: string;
  type: MarketInstrumentType;
  priority: 'p0' | 'p1';
  snapshotEnabled: boolean;
  dailyLineEnabled: boolean;
}

export const MARKET_INSTRUMENTS: MarketInstrument[] = [
  { code: '000001', name: '上证指数', secid: '1.000001', type: 'broad_index', priority: 'p0', snapshotEnabled: true, dailyLineEnabled: true },
  { code: '000300', name: '沪深300', secid: '1.000300', type: 'broad_index', priority: 'p0', snapshotEnabled: true, dailyLineEnabled: true },
  { code: '000905', name: '中证500', secid: '1.000905', type: 'broad_index', priority: 'p0', snapshotEnabled: true, dailyLineEnabled: true },
  { code: '399006', name: '创业板指', secid: '0.399006', type: 'broad_index', priority: 'p0', snapshotEnabled: true, dailyLineEnabled: true },
  { code: '000688', name: '科创50', secid: '1.000688', type: 'broad_index', priority: 'p0', snapshotEnabled: true, dailyLineEnabled: true },
  { code: '159915', name: '创业板ETF', secid: '0.159915', type: 'theme_etf', priority: 'p1', snapshotEnabled: true, dailyLineEnabled: true },
  { code: '588000', name: '科创50ETF', secid: '1.588000', type: 'theme_etf', priority: 'p1', snapshotEnabled: true, dailyLineEnabled: true },
  { code: '512010', name: '医药ETF', secid: '1.512010', type: 'industry_etf', priority: 'p1', snapshotEnabled: true, dailyLineEnabled: true },
  { code: '512880', name: '证券ETF', secid: '1.512880', type: 'industry_etf', priority: 'p1', snapshotEnabled: true, dailyLineEnabled: true },
  { code: '515790', name: '光伏ETF', secid: '1.515790', type: 'industry_etf', priority: 'p1', snapshotEnabled: true, dailyLineEnabled: true },
];

export const SNAPSHOT_MARKET_INSTRUMENTS = MARKET_INSTRUMENTS.filter(
  (instrument) => instrument.snapshotEnabled,
);

export const BROAD_MARKET_INDEX_CODES = MARKET_INSTRUMENTS.filter(
  (instrument) => instrument.type === 'broad_index' && instrument.dailyLineEnabled,
).map((instrument) => instrument.code);
