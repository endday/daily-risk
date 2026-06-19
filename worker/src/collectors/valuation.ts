/**
 * Valuation Collector — 指数估值（PE/PB）
 *
 * 数据源：中证指数官网 (csindex.com.cn)
 * 免费公开 API，无需 API Key。
 *
 * 两个端点（参考 AKShare index_stock_zh_csindex.py）：
 *
 * 1. JSON 行情（含 PE TTM）
 *    GET /csindex-home/perf/index-perf?indexCode=000300&startDate=...&endDate=...
 *    返回字段：tradeDate, close, peg(=PE TTM), tradingVol, tradingValue, consNumber
 *    AKShare 对应函数：stock_zh_index_hist_csindex()
 *
 * 2. XLS 估值文件（含 PE + 股息率，BIFF8 二进制格式）
 *    GET /static/html/csindex/public/uploads/file/autofile/indicator/{code}indicator.xls
 *    AKShare 对应函数：stock_zh_index_value_csindex()
 *    列：日期, 指数代码, ..., 市盈率1, 市盈率2, 股息率1, 股息率2
 *    注意：CF Worker 无法直接解析 XLS，暂用 JSON 端点获取 PE。
 *
 * 百度股市通（备选/补充）：
 *    GET https://gushitong.baidu.com/opendata
 *    只支持个股代码（如 600519），不支持指数/ETF 代码。
 *    AKShare 对应函数：stock_zh_valuation_baidu()
 */

import type { CollectorConfig, CollectorResult, MarketSnapshotRow } from './base';
import { getBeijingDate } from '../../../shared/date-utils';
import { http } from './http';

const CSINDEX_PERF_URL = 'https://www.csindex.com.cn/csindex-home/perf/index-perf';

/** 目标指数 */
const INDEX_CODES = ['000001', '000300', '000905'];

interface CSIndexPerfRow {
  tradeDate: string;      // e.g. "20260616"
  indexCode: string;
  close: number;
  peg: number;            // 滚动市盈率 (PE TTM)
  consNumber: number;     // 样本数量
}

/**
 * 从中证指数官网获取指数估值（PE TTM）
 *
 * @param indexCode 指数代码（如 '000300'）
 * @returns { date, pe_ttm } 或 null
 */
async function fetchIndexPE(indexCode: string): Promise<{ date: string; pe_ttm: number } | null> {
  const today = getBeijingDate(0);
  const startDate = today.replace(/-/g, '');
  // 查最近 15 天（覆盖春节 7 天假期 + 周末余量，确保拿到最近交易日）
  const d = new Date(today);
  d.setDate(d.getDate() - 15);
  const endDate = d.toISOString().slice(0, 10).replace(/-/g, '');

  const url = `${CSINDEX_PERF_URL}?indexCode=${indexCode}&startDate=${endDate}&endDate=${startDate}`;

  const json = await http.get(url).json<{ code: string; data: CSIndexPerfRow[] }>();

  if (json.code !== '200' || !json.data?.length) {
    console.warn(`[Valuation] CSIndex API: no data for ${indexCode}`);
    return null;
  }

  // 取最新一行
  const latest = json.data[json.data.length - 1];
  const date = latest.tradeDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
  const pe_ttm = latest.peg;

  if (!pe_ttm || isNaN(pe_ttm)) {
    console.warn(`[Valuation] CSIndex: PE is NaN for ${indexCode}`);
    return null;
  }

  return { date, pe_ttm };
}

/**
 * 采集三指数估值数据，生成 snapshot 行（只填 pe_ttm 字段）
 */
export async function collectValuation(): Promise<MarketSnapshotRow[]> {
  const tradeDate = getBeijingDate(0);
  const snapshots: MarketSnapshotRow[] = [];

  for (const index_code of INDEX_CODES) {
    const data = await fetchIndexPE(index_code);

    if (!data) {
      console.warn(`[Valuation] Skipped ${index_code} — no data`);
      continue;
    }

    console.log(`[Valuation] ${index_code}: PE(TTM)=${data.pe_ttm} on ${data.date}`);

    snapshots.push({
      trade_date: tradeDate,
      index_code,
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
      pe_ttm: data.pe_ttm,
      pb: null,
      margin_balance: null,
      bond_yield_10y: null,
    });
  }

  return snapshots;
}

// ============================================
// Collector 接口
// ============================================

export const valuationCollector: CollectorConfig = {
  name: 'valuation',
  async collect(): Promise<CollectorResult> {
    const snapshots = await collectValuation();
    return {
      events: [],
      snapshots,
      meta: {
        source_count: 1,
        warnings: snapshots.length === 0 ? ['CSIndex PE data unavailable'] : [],
      },
    };
  },
};
