/**
 * Market Cap Collector — A 股总市值
 *
 * 数据源：东方财富 push2 clist 接口（免费公开，无需 API Key）
 *
 * 拉取全部沪深 A 股（m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23）的 f20（总市值，单位：元），
 * 求和得到 A 股总市值（万亿元），写入 market_snapshots.total_market_cap。
 *
 * 用于巴菲特指数计算：总市值 / 中国名义 GDP。
 */

import type { CollectorConfig, CollectorResult, MarketSnapshotRow } from './base';
import { getBeijingDate } from '../../../shared/date-utils';
import { http } from './http';
import { BROAD_MARKET_INDEX_CODES } from '../market-universe';

/** 目标指数 — 总市值是市场级数据，写入所有指数行 */
const INDEX_CODES = BROAD_MARKET_INDEX_CODES;

const CLIST_URL = 'https://push2.eastmoney.com/api/qt/clist/get';

/**
 * 从 push2 clist 拉取全部 A 股总市值并求和
 * @returns 总市值（万亿元人民币），null 表示拉取失败
 */
async function fetchTotalMarketCap(): Promise<number | null> {
  const params = new URLSearchParams({
    pn: '1',
    pz: '6000',       // 一次拉完（A 股约 5300 只）
    po: '1',
    np: '1',
    ut: 'bd1d9ddb04089700cf9c27f6f7426281',
    fltt: '2',
    invt: '2',
    fid: 'f20',
    // 沪深 A 股：深主板(m:0+t:6) + 创业板(m:0+t:80) + 沪主板(m:1+t:2) + 科创板(m:1+t:23)
    fs: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23',
    fields: 'f20',
  });

  const url = `${CLIST_URL}?${params}`;
  console.log(`[MarketCap] Fetching ${url}`);

  const json = await http.get(url).json<any>();
  if (!json.data?.diff) {
    console.warn('[MarketCap] push2 API returned no data');
    return null;
  }

  const stocks = json.data.diff;
  let totalYuan = 0;
  let validCount = 0;

  for (const stock of stocks) {
    const f20 = stock.f20;
    if (f20 != null && typeof f20 === 'number' && f20 > 0) {
      totalYuan += f20;
      validCount++;
    }
  }

  if (validCount === 0) {
    console.warn('[MarketCap] No valid market cap data found');
    return null;
  }

  // 元 → 万亿元
  const totalWanyi = totalYuan / 1e12;
  console.log(`[MarketCap] Total A-share market cap: ${totalWanyi.toFixed(2)} 万亿元 (${validCount} stocks)`);

  return Math.round(totalWanyi * 100) / 100;
}

/**
 * 空 snapshot 行（只填 total_market_cap）
 */
function emptyRow(tradeDate: string, indexCode: string): MarketSnapshotRow {
  return {
    trade_date: tradeDate,
    index_code: indexCode,
    close_price: null,
    change_pct: null,
    rise_count: null,
    fall_count: null,
    flat_count: null,
    turnover_amount: null,
    turnover_rate: null,
    volatility_20d: null,
    northbound_amt: null,
    northbound_num: null,
    pe_ttm: null,
    pb: null,
    margin_balance: null,
    bond_yield_10y: null,
    us_2y_yield: null,
    fed_funds_rate: null,
    usd_index: null,
    oil_wti: null,
    us_yield_spread: null,
    total_market_cap: null,
  };
}

/**
 * 采集 A 股总市值
 */
export async function collectMarketCap(): Promise<MarketSnapshotRow[]> {
  const totalCap = await fetchTotalMarketCap();
  const tradeDate = getBeijingDate(0);

  if (totalCap === null) {
    console.warn('[MarketCap] Skipping — no data');
    return [];
  }

  return INDEX_CODES.map(indexCode => {
    const row = emptyRow(tradeDate, indexCode);
    row.total_market_cap = totalCap;
    return row;
  });
}

// ============================================
// Collector 接口
// ============================================

export const marketCapCollector: CollectorConfig = {
  name: 'market_cap',
  async collect(): Promise<CollectorResult> {
    const snapshots = await collectMarketCap();
    return {
      events: [],
      snapshots,
      meta: {
        source_count: 1,
        warnings: snapshots.length === 0 ? ['Market cap data unavailable'] : [],
      },
    };
  },
};
