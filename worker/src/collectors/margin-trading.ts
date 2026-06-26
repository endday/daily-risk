/**
 * Margin Trading Collector — 融资融券市场汇总
 *
 * 数据源：东方财富 datacenter — RPTA_WEB_MARGIN_DAILYTRADE
 * 免费公开 API，无需 API Key。
 *
 * 返回全市场融资融券汇总数据（JSON）：
 * - 融资余额（亿元）
 * - 融券余额（亿元）
 * - 融资融券余额合计（亿元）
 * - 融资买入额 / 融券卖出额
 * - 参与交易的投资者数量
 *
 * AKShare 源码参考：akshare/stock_feature/stock_margin_em.py::stock_margin_account_info
 */

import type { CollectorConfig, CollectorResult, MarketSnapshotRow } from './base';
import { getBeijingDate } from '../../../shared/date-utils';
import { http } from './http';

const MARGIN_URL = 'https://datacenter-web.eastmoney.com/api/data/v1/get';

/** 目标指数 — margin_balance 写入所有指数的行（市场级数据） */
const INDEX_CODES = ['000001', '000300', '000905', '399006'];

interface MarginData {
  date: string;
  fin_balance: number;       // 融资余额（亿元）
  loan_balance: number;      // 融券余额（亿元）
  margin_balance: number;    // 融资融券余额合计（亿元）
  fin_buy_amt: number;       // 融资买入额（亿元）
  loan_sell_amt: number;     // 融券卖出额（亿元）
  investor_num: number;      // 参与交易的投资者数量
  sci_close: number;         // 上证收盘价
  sci_change: number;        // 上证涨跌幅
}

/**
 * 从东方财富获取融资融券市场汇总
 */
async function fetchMarginData(): Promise<MarginData | null> {
  const params = new URLSearchParams({
    reportName: 'RPTA_WEB_MARGIN_DAILYTRADE',
    columns: 'ALL',
    pageNumber: '1',
    pageSize: '1',
    sortColumns: 'STATISTICS_DATE',
    sortTypes: '-1',
    source: 'WEB',
    client: 'WEB',
  });

  console.log(`[Margin] Fetching ${MARGIN_URL}?reportName=RPTA_WEB_MARGIN_DAILYTRADE`);
  const json = await http.get(`${MARGIN_URL}?${params}`).json<any>();
  if (!json.success || !json.result?.data?.length) {
    throw new Error(`Margin API: ${json.message || 'no data'}`);
  }

  const row = json.result.data[0];

  return {
    date: row.STATISTICS_DATE?.split(' ')[0] || getBeijingDate(0),
    fin_balance: row.FIN_BALANCE ?? 0,
    loan_balance: row.LOAN_BALANCE ?? 0,
    margin_balance: row.MARGIN_BALANCE ?? 0,
    fin_buy_amt: row.FIN_BUY_AMT ?? 0,
    loan_sell_amt: row.LOAN_SELL_AMT ?? 0,
    investor_num: row.INVESTOR_NUM ?? 0,
    sci_close: row.SCI_CLOSE_PRICE ?? 0,
    sci_change: row.SCI_CHANGE_RATE ?? 0,
  };
}

/**
 * 采集融资融券数据，生成 snapshot 行（只填 margin_balance 字段）
 */
export async function collectMarginTrading(): Promise<MarketSnapshotRow[]> {
  const data = await fetchMarginData();

  if (!data) {
    console.warn('[Margin] No data returned');
    return [];
  }

  console.log(
    `[Margin] ${data.date}: ` +
    `融资余额=${data.fin_balance.toFixed(0)}亿, ` +
    `融资融券合计=${data.margin_balance.toFixed(0)}亿, ` +
    `投资者=${data.investor_num}`
  );

  const tradeDate = getBeijingDate(0);

  // 为每个指数生成一行（只填 margin_balance，其余为 null）
  return INDEX_CODES.map(index_code => ({
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
    pe_ttm: null,
    pb: null,
    margin_balance: data.margin_balance,
    bond_yield_10y: null,
    us_2y_yield: null,
    fed_funds_rate: null,
    usd_index: null,
    oil_wti: null,
    us_yield_spread: null,
    total_market_cap: null,
  }));
}

// ============================================
// Collector 接口
// ============================================

export const marginTradingCollector: CollectorConfig = {
  name: 'margin_trading',
  async collect(): Promise<CollectorResult> {
    const snapshots = await collectMarginTrading();
    return {
      events: [],
      snapshots,
      meta: { source_count: 1, warnings: [] },
    };
  },
};
