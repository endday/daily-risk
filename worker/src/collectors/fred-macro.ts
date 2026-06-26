/**
 * FRED Macro Collector — 全球宏观指标采集
 *
 * 与 fred.ts 不同：本采集器不生成 events，而是将全球宏观数据
 * 写入 market_snapshots 表，供 MarketPulse 展示和巴菲特指数计算。
 *
 * 采集的 FRED 系列：
 * - DGS2: 美国 2 年期国债收益率
 * - DFF: 联邦基金有效利率
 * - DTWEXBFS: 美元指数 (Broad, floating)
 * - DCOILWTICO: WTI 原油现货价 (美元/桶)
 * - T10Y2Y: 美国 10 年-2 年国债利差
 */

import type { CollectorConfig, CollectorEnv, CollectorResult, MarketSnapshotRow } from './base';
import { getBeijingDate } from '../../../shared/date-utils';
import { http } from './http';

/** 目标指数 — 全球指标写入所有指数行（市场级数据） */
const INDEX_CODES = ['000001', '000300', '000905', '399006'];

/** FRED 全球宏观 series → snapshot 字段映射 */
const FRED_MACRO_SERIES = [
  { series_id: 'DGS2', field: 'us_2y_yield' as const },
  { series_id: 'DFF', field: 'fed_funds_rate' as const },
  { series_id: 'DTWEXBFS', field: 'usd_index' as const },
  { series_id: 'DCOILWTICO', field: 'oil_wti' as const },
  { series_id: 'T10Y2Y', field: 'us_yield_spread' as const },
];

/**
 * 从 FRED 获取指定系列的最新观测值（数值）
 */
async function fetchLatestValue(seriesId: string, apiKey: string): Promise<number | null> {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: 'json',
    sort_order: 'desc',
    limit: '5',
  });

  const url = `https://api.stlouisfed.org/fred/series/observations?${params}`;
  const data = await http.get(url).json<any>();

  if (!data.observations) return null;

  // 找最新的非缺失值（FRED 用 '.' 表示缺失）
  for (const obs of data.observations) {
    if (obs.value !== '.' && obs.value !== '') {
      const num = parseFloat(obs.value);
      if (!isNaN(num)) return num;
    }
  }

  return null;
}

/**
 * 空 snapshot 行（所有全球指标为 null）
 */
function emptyMacroRow(tradeDate: string, indexCode: string): MarketSnapshotRow {
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
 * 采集 FRED 全球宏观数据
 */
export async function collectFredMacro(apiKey: string): Promise<MarketSnapshotRow[]> {
  const tradeDate = getBeijingDate(0);
  const warnings: string[] = [];

  // 并行拉取所有 series
  const values: Record<string, number | null> = {};
  const fetches = FRED_MACRO_SERIES.map(async ({ series_id, field }) => {
    try {
      const value = await fetchLatestValue(series_id, apiKey);
      values[field] = value;
      if (value !== null) {
        console.log(`[FredMacro] ${series_id} = ${value}`);
      } else {
        console.warn(`[FredMacro] ${series_id}: no valid data`);
        warnings.push(`${series_id}: no data`);
      }
    } catch (error) {
      console.error(`[FredMacro] Failed to fetch ${series_id}:`, error);
      values[field] = null;
      warnings.push(`${series_id}: fetch error`);
    }
  });

  await Promise.all(fetches);

  // 为每个指数生成一行（所有行写相同的全球指标值）
  return INDEX_CODES.map(indexCode => {
    const row = emptyMacroRow(tradeDate, indexCode);
    row.us_2y_yield = values.us_2y_yield;
    row.fed_funds_rate = values.fed_funds_rate;
    row.usd_index = values.usd_index;
    row.oil_wti = values.oil_wti;
    row.us_yield_spread = values.us_yield_spread;
    return row;
  });
}

// ============================================
// Collector 接口
// ============================================

export const fredMacroCollector: CollectorConfig = {
  name: 'fred_macro',
  canRun: (env: CollectorEnv) => !!env.FRED_API_KEY,
  async collect(env: CollectorEnv): Promise<CollectorResult> {
    const snapshots = await collectFredMacro(env.FRED_API_KEY!);
    return {
      events: [],
      snapshots,
      meta: {
        source_count: FRED_MACRO_SERIES.length,
        warnings: [],
      },
    };
  },
};
