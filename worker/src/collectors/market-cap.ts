/**
 * Market Cap Collector — A 股总市值
 *
 * 数据源：东方财富中证全指（000985）行情（免费公开，无需 API Key）
 *
 * 使用中证全指行情的总市值作为 A 股市场总市值代理，写入
 * market_snapshots.total_market_cap。该口径不包含完整北交所，且受指数样本规则约束；
 * 详细限制见 docs/market-cap-gdp-methodology.md。
 *
 * 用于巴菲特指数计算：总市值 / 中国名义 GDP。
 */

import type { CollectorConfig, CollectorResult, MarketSnapshotRow } from './base';
import { getBeijingDate } from '../../../shared/date-utils';
import { http } from './http';
import { BROAD_MARKET_INDEX_CODES } from '../market-universe';

/** 目标指数 — 总市值是市场级数据，写入所有指数行 */
const INDEX_CODES = BROAD_MARKET_INDEX_CODES;

const CSI_ALL_SHARE_URL = 'https://push2.eastmoney.com/api/qt/stock/get';
const CSI_ALL_SHARE_SECID = '1.000985';

/**
 * 获取中证全指总市值代理值
 */
async function fetchTotalMarketCap(): Promise<{ tradeDate: string; totalMarketCap: number } | null> {
  const params = new URLSearchParams({
    fltt: '2',
    invt: '2',
    secid: CSI_ALL_SHARE_SECID,
    fields: 'f57,f58,f116,f124',
  });
  const json = await http.get(`${CSI_ALL_SHARE_URL}?${params}`, {
    headers: { Referer: 'https://quote.eastmoney.com/center/' },
  }).json<any>();
  const totalYuan = json.data?.f116;

  if (
    json.data?.f57 !== '000985' ||
    typeof totalYuan !== 'number' ||
    !Number.isFinite(totalYuan) ||
    totalYuan <= 0
  ) {
    console.warn('[MarketCap] Invalid CSI All Share market-cap response');
    return null;
  }

  const totalTrillion = Math.round(totalYuan / 1e10) / 100;
  const tradeDate = typeof json.data?.f124 === 'number' && json.data.f124 > 0
    ? new Date((json.data.f124 + 8 * 60 * 60) * 1000).toISOString().slice(0, 10)
    : getBeijingDate(0);
  console.log(`[MarketCap] CSI All Share proxy: ${totalTrillion.toFixed(2)} 万亿元`);
  return { tradeDate, totalMarketCap: totalTrillion };
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
  const data = await fetchTotalMarketCap();

  if (data === null) {
    console.warn('[MarketCap] Skipping — no data');
    return [];
  }

  return INDEX_CODES.map(indexCode => {
    const row = emptyRow(data.tradeDate, indexCode);
    row.total_market_cap = data.totalMarketCap;
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
