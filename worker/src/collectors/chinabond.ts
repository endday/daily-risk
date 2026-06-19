/**
 * ChinaBond Collector — 中国国债收益率曲线
 *
 * 数据源：中国债券信息网（chinabond.com.cn）
 * 免费公开，无需 API Key。
 *
 * 返回 HTML 表格，用正则解析提取各期限收益率。
 * 重点关注 10 年期国债收益率（股债利差的核心数据）。
 *
 * AKShare 源码参考：akshare/bond/bond_china.py::bond_china_yield
 */

import type { CollectorConfig, CollectorResult, MarketSnapshotRow } from './base';
import { getBeijingDate } from '../../../shared/date-utils';
import { httpText } from './http';

const YIELD_URL = 'https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/historyQuery';

/** 目标指数 — 10Y 收益率写入所有指数的行 */
const INDEX_CODES = ['000001', '000300', '000905', '399006'];

/**
 * 从 ChinaBond 获取国债收益率
 */
async function fetchBondYield(): Promise<{ date: string; yield_10y: number } | null> {
  // 查询最近 15 天（覆盖春节 7 天假期 + 周末余量）
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    startDate: formatDate(weekAgo),
    endDate: formatDate(today),
    gjqx: '0',
    qxId: 'ycqx',
    locale: 'cn_ZH',
  });

  console.log(`[ChinaBond] Fetching ${YIELD_URL}?${params}`);
  const html = (await httpText(YIELD_URL, {
    searchParams: Object.fromEntries(params.entries()),
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  })).replace(/&nbsp/g, '');

  // 解析 HTML 表格：提取"中债国债收益率曲线"行的日期和 10 年列
  // 表格结构：<tr><td>曲线名称</td><td>日期</td><td>3月</td>...<td>10年</td><td>30年</td></tr>
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

  for (const row of rows) {
    // 只找"中债国债收益率曲线"行
    if (!row.includes('中债国债收益率曲线')) continue;

    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    const values = cells.map(c => c.replace(/<[^>]+>/g, '').trim());

    // values: [曲线名称, 日期, 3月, 6月, 1年, 3年, 5年, 7年, 10年, 30年]
    if (values.length >= 9) {
      const date = values[1];
      const yield10y = parseFloat(values[8]); // 第 9 列 = 10 年

      if (date && !isNaN(yield10y)) {
        return { date, yield_10y: yield10y };
      }
    }
  }

  console.warn('[ChinaBond] No valid 10Y yield found in response');
  return null;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 采集国债收益率，生成 snapshot 行（只填 bond_yield_10y 字段）
 */
export async function collectChinaBond(): Promise<MarketSnapshotRow[]> {
  const bondData = await fetchBondYield();

  if (!bondData) {
    console.warn('[ChinaBond] No data returned');
    return [];
  }

  console.log(`[ChinaBond] 10Y yield: ${bondData.yield_10y}% on ${bondData.date}`);

  const tradeDate = getBeijingDate(0);

  // 为每个指数生成一行（只填 bond_yield_10y，其余为 null）
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
    margin_balance: null,
    bond_yield_10y: bondData.yield_10y,
  }));
}

// ============================================
// Collector 接口
// ============================================

export const chinabondCollector: CollectorConfig = {
  name: 'chinabond',
  async collect(): Promise<CollectorResult> {
    const snapshots = await collectChinaBond();
    return {
      events: [],
      snapshots,
      meta: { source_count: 1, warnings: [] },
    };
  },
};
