/**
 * Market Snapshot Collector — A 股市场快照
 *
 * 数据源：东方财富 push2 API（实时行情）
 * 免费公开 API，无需 API Key。
 *
 * 每次采集返回 3 行数据（三指数各一行）：
 * - 000001（上证指数）：行情 + 涨跌家数 + 成交额 + 换手率
 * - 000300（沪深300）：行情 + 成交额 + 换手率
 * - 000905（中证500）：行情 + 成交额 + 换手率
 */

import type { CollectorConfig, CollectorResult, MarketSnapshotRow } from './base';
import { getBeijingDate } from '../../../shared/date-utils';
import { http } from './http';

/** push2 字段映射 */
const INDEX_CONFIG = [
  { secid: '1.000001', index_code: '000001', name: '上证指数' },
  { secid: '1.000300', index_code: '000300', name: '沪深300' },
  { secid: '1.000905', index_code: '000905', name: '中证500' },
];

/** 请求的 push2 字段列表 */
const FIELDS = 'f2,f3,f5,f6,f8,f104,f105,f106,f12,f14';

/**
 * 从 push2 获取三指数实时行情
 */
async function fetchPush2Data(): Promise<any[]> {
  const secids = INDEX_CONFIG.map(c => c.secid).join(',');
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?secids=${secids}&fields=${FIELDS}`;

  const json = await http.get(url).json<any>();
  if (json.rc !== 0 || !json.data?.diff) {
    throw new Error(`push2 API returned error: rc=${json.rc}`);
  }

  return json.data.diff;
}

/**
 * 将 push2 原始数据转换为 MarketSnapshotRow
 */
function parseSnapshotRow(raw: any, config: typeof INDEX_CONFIG[number]): MarketSnapshotRow {
  const tradeDate = getBeijingDate(0);

  return {
    trade_date: tradeDate,
    index_code: config.index_code,

    // 行情：push2 返回的是整数（需除以 100 还原小数）
    close_price: raw.f2 != null ? raw.f2 / 100 : null,
    change_pct: raw.f3 != null ? raw.f3 / 100 : null,

    // 涨跌家数（只有上证指数 000001 有值）
    rise_count: raw.f104 ?? null,
    fall_count: raw.f105 ?? null,
    flat_count: raw.f106 ?? null,

    // 量能
    turnover_amount: raw.f6 ?? null,
    turnover_rate: raw.f8 != null ? raw.f8 / 100 : null,

    // 以下字段由其他采集器填充
    volatility_20d: null,
    northbound_amt: null,
    northbound_num: null,
    pe_ttm: null,
    pb: null,
    margin_balance: null,
    bond_yield_10y: null,
  };
}

/**
 * 采集市场快照数据
 */
export async function collectMarketSnapshot(): Promise<MarketSnapshotRow[]> {
  console.log('[MarketSnapshot] Fetching push2 data...');

  const rawData = await fetchPush2Data();
  const snapshots: MarketSnapshotRow[] = [];

  for (let i = 0; i < INDEX_CONFIG.length; i++) {
    const raw = rawData[i];
    if (!raw) continue;

    const row = parseSnapshotRow(raw, INDEX_CONFIG[i]);
    snapshots.push(row);

    console.log(
      `[MarketSnapshot] ${row.index_code}: ` +
      `close=${row.close_price}, change=${row.change_pct}%, ` +
      `rise=${row.rise_count}, fall=${row.fall_count}, ` +
      `turnover=${row.turnover_amount ? (row.turnover_amount / 1e12).toFixed(2) + 'T' : '--'}`
    );
  }

  return snapshots;
}

// ============================================
// Collector 接口
// ============================================

export const marketSnapshotCollector: CollectorConfig = {
  name: 'market_snapshot',
  async collect(): Promise<CollectorResult> {
    const snapshots = await collectMarketSnapshot();
    return {
      events: [],
      snapshots,
      meta: { source_count: 1, warnings: [] },
    };
  },
};
