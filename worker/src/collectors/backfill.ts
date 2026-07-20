/**
 * 历史数据回填 — 一次性灌入 market_snapshots
 *
 * 各数据源都支持日期范围查询，一次性拉取历史数据并批量写入。
 * 不同回填函数写不同字段，COALESCE upsert 自动合并同一行。
 *
 * 回填顺序：valuation → chinabond → margin → northbound
 * 各采集器写独占字段，互不干扰。
 */

import type { MarketSnapshotRow } from './base';
import { http } from './http';
import { upsertSnapshots } from '../db';
import { BROAD_MARKET_INDEX_CODES } from '../market-universe';

const INDEX_CODES = BROAD_MARKET_INDEX_CODES;

/** 单采集器最大分页请求数（防封禁/防超时） */
const MAX_PAGES = 100;
/** 分页请求间隔（毫秒） */
const PAGE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function emptyRow(trade_date: string, index_code: string): MarketSnapshotRow {
  return {
    trade_date, index_code,
    close_price: null, change_pct: null,
    rise_count: null, fall_count: null, flat_count: null,
    turnover_amount: null, turnover_rate: null, volatility_20d: null,
    northbound_amt: null, northbound_num: null,
    pe_ttm: null, pb: null, margin_balance: null, bond_yield_10y: null,
    us_2y_yield: null, fed_funds_rate: null, usd_index: null, oil_wti: null, us_yield_spread: null, total_market_cap: null,
  };
}

// ============================================
// 1. PE(TTM) + close — csindex.com.cn
// ============================================

async function backfillValuation(
  db: D1Database,
  startDate: string,
  endDate: string,
): Promise<number> {
  const start = startDate.replace(/-/g, '');
  const end = endDate.replace(/-/g, '');
  const allRows: MarketSnapshotRow[] = [];

  for (const index_code of INDEX_CODES) {
    console.log(`[Backfill] valuation: fetching ${index_code} from csindex...`);

    let json: { code: string; data: any[] };
    try {
      const url = `https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=${index_code}&startDate=${start}&endDate=${end}`;
      json = await http.get(url).json<{ code: string; data: any[] }>();
    } catch (e) {
      console.warn(`[Backfill] valuation: HTTP error for ${index_code}: ${(e as Error).message}`);
      continue;
    }

    if (json.code !== '200' || !json.data?.length) {
      console.warn(`[Backfill] valuation: no data for ${index_code}`);
      continue;
    }

    for (const item of json.data) {
      const trade_date = item.tradeDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
      const row = emptyRow(trade_date, index_code);
      row.pe_ttm = item.peg ?? null;
      row.close_price = item.close ?? null;
      allRows.push(row);
    }

    console.log(`[Backfill] valuation: ${index_code} got ${json.data.length} rows`);
    await sleep(PAGE_DELAY_MS);
  }

  const count = await upsertSnapshots(db, allRows);
  console.log(`[Backfill] valuation: upserted ${count} rows`);
  return count;
}

// ============================================
// 2. 10Y 国债收益率 — chinabond.com.cn
//    注意：API 限制日期范围 < 1 年，需分段查询
//    参考 AKShare: bond_china_yield()
// ============================================

/** 解析 chinabond HTML，提取 10Y 收益率 */
function parseBondYieldHTML(html: string): Array<{ date: string; value10y: number }> {
  const results: Array<{ date: string; value10y: number }> = [];
  const cleaned = html.replace(/&nbsp/g, '');
  const rows = cleaned.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  // 日期格式校验：YYYY-MM-DD
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  let matchedRows = 0;
  for (const row of rows) {
    if (!row.includes('中债国债收益率曲线')) continue;
    matchedRows++;

    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    const values = cells.map(c => c.replace(/<[^>]+>/g, '').trim());

    // values: [曲线名称, 日期, 3月, 6月, 1年, 3年, 5年, 7年, 10年, 30年]
    if (values.length >= 9) {
      const date = values[1];
      const yield10y = parseFloat(values[8]);

      // 跳过 header 行（日期不是 YYYY-MM-DD 格式）
      if (!DATE_RE.test(date)) continue;
      if (isNaN(yield10y)) continue;

      results.push({ date, value10y: yield10y });
    }
  }

  console.log(`[Backfill] chinabond parse: ${rows.length} <tr>, ${matchedRows} matched '中债国债', ${results.length} valid`);
  return results;
}

/** 生成月份偏移后的日期字符串 */
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().split('T')[0];
}

async function backfillBondYield(
  db: D1Database,
  startDate: string,
  endDate: string,
  debug: Record<string, any>,
): Promise<number> {
  console.log(`[Backfill] chinabond: fetching ${startDate} → ${endDate} (chunked by 11 months)...`);
  debug.chinabond_chunks = [];

  const snapshots: MarketSnapshotRow[] = [];
  const CHUNK_MONTHS = 11; // chinabond API 限制 < 1 年

  // 分段查询：每段 11 个月
  let chunkStart = startDate;
  while (chunkStart <= endDate) {
    const chunkEnd = addMonths(chunkStart, CHUNK_MONTHS);
    const actualEnd = chunkEnd > endDate ? endDate : chunkEnd;

    const chunkDebug: Record<string, any> = { start: chunkStart, end: actualEnd };

    try {
      const params = new URLSearchParams({
        startDate: chunkStart,
        endDate: actualEnd,
        gjqx: '0',
        qxId: 'ycqx',
        locale: 'cn_ZH',
      });

      const url = `https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/historyQuery?${params}`;
      const html = (await http.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      }).text());

      chunkDebug.htmlLength = html.length;
      chunkDebug.yields = parseBondYieldHTML(html);
      chunkDebug.yieldCount = chunkDebug.yields.length;

      for (const y of chunkDebug.yields) {
        for (const index_code of INDEX_CODES) {
          const r = emptyRow(y.date, index_code);
          r.bond_yield_10y = y.value10y;
          snapshots.push(r);
        }
      }
    } catch (e) {
      chunkDebug.error = (e as Error).message;
      console.warn(`[Backfill] chinabond: error for ${chunkStart}→${actualEnd}: ${(e as Error).message}`);
    }

    debug.chinabond_chunks.push(chunkDebug);

    // 下一段：从上一段结束日 +1 天
    chunkStart = addMonths(chunkStart, CHUNK_MONTHS);
    // 加 1 天避免重叠
    const nextDay = new Date(chunkStart + 'T00:00:00Z');
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    chunkStart = nextDay.toISOString().split('T')[0];

    await sleep(PAGE_DELAY_MS);
  }

  const count = await upsertSnapshots(db, snapshots);
  console.log(`[Backfill] chinabond: upserted ${count} rows (${snapshots.length / 3} dates)`);
  return count;
}

// ============================================
// 3. 融资融券 — eastmoney
// ============================================

async function backfillMargin(
  db: D1Database,
  startDate: string,
  endDate: string,
): Promise<number> {
  console.log(`[Backfill] margin: fetching ${startDate} → ${endDate}...`);

  const allRows: MarketSnapshotRow[] = [];
  let page = 1;
  const pageSize = 500;
  let totalPages = 1;
  let truncated = false;

  while (page <= totalPages) {
    if (page > MAX_PAGES) {
      truncated = true;
      console.warn(`[Backfill] margin: hit page limit (${MAX_PAGES}), stopping`);
      break;
    }

    let json: any;
    try {
      const url = `https://datacenter-web.eastmoney.com/api/data/v1/get` +
        `?reportName=RPTA_WEB_MARGIN_DAILYTRADE` +
        `&columns=STATISTICS_DATE,MARGIN_BALANCE` +
        `&pageNumber=${page}` +
        `&pageSize=${pageSize}` +
        `&sortColumns=STATISTICS_DATE` +
        `&sortTypes=-1` +
        `&source=WEB&client=WEB`;

      json = await http.get(url).json<any>();
    } catch (e) {
      console.warn(`[Backfill] margin: HTTP error on page ${page}: ${(e as Error).message}`);
      break;
    }

    if (!json.success || !json.result?.data?.length) break;

    totalPages = json.result.pages || 1;
    const records = json.result.data;

    for (const rec of records) {
      const date = rec.STATISTICS_DATE?.split(' ')[0];
      if (!date || date < startDate || date > endDate) continue;

      for (const index_code of INDEX_CODES) {
        const r = emptyRow(date, index_code);
        r.margin_balance = rec.MARGIN_BALANCE ?? null;
        allRows.push(r);
      }
    }

    console.log(`[Backfill] margin: page ${page}/${totalPages}, got ${records.length} records`);
    page++;
    await sleep(PAGE_DELAY_MS);
  }

  const count = await upsertSnapshots(db, allRows);
  console.log(`[Backfill] margin: upserted ${count} rows${truncated ? ' (truncated)' : ''}`);
  return count;
}

// ============================================
// 4. 北向资金 — eastmoney
// ============================================

async function backfillNorthbound(
  db: D1Database,
  startDate: string,
  endDate: string,
): Promise<number> {
  console.log(`[Backfill] northbound: fetching ${startDate} → ${endDate}...`);

  const allRows: MarketSnapshotRow[] = [];
  let page = 1;
  const pageSize = 500;
  let totalPages = 1;
  let truncated = false;

  while (page <= totalPages) {
    if (page > MAX_PAGES) {
      truncated = true;
      console.warn(`[Backfill] northbound: hit page limit (${MAX_PAGES}), stopping`);
      break;
    }

    let json: any;
    try {
      const url = `https://datacenter-web.eastmoney.com/api/data/v1/get` +
        `?reportName=RPT_MUTUAL_DEAL_HISTORY` +
        `&columns=TRADE_DATE,DEAL_AMT,DEAL_NUM` +
        `&filter=(MUTUAL_TYPE=%22005%22)` +
        `&pageNumber=${page}` +
        `&pageSize=${pageSize}` +
        `&sortColumns=TRADE_DATE` +
        `&sortTypes=-1` +
        `&source=WEB&client=WEB`;

      json = await http.get(url).json<any>();
    } catch (e) {
      console.warn(`[Backfill] northbound: HTTP error on page ${page}: ${(e as Error).message}`);
      break;
    }

    if (!json.success || !json.result?.data?.length) break;

    totalPages = json.result.pages || 1;
    const records = json.result.data;

    for (const rec of records) {
      const date = rec.TRADE_DATE?.split(' ')[0];
      if (!date || date < startDate || date > endDate) continue;

      // 北向资金写入 000300 行（市场级数据，沪深300 代理）
      const r = emptyRow(date, '000300');
      r.northbound_amt = rec.DEAL_AMT ?? null;      // 万元
      r.northbound_num = rec.DEAL_NUM ?? null;       // 笔数
      allRows.push(r);
    }

    console.log(`[Backfill] northbound: page ${page}/${totalPages}, got ${records.length} records`);
    page++;
    await sleep(PAGE_DELAY_MS);
  }

  const count = await upsertSnapshots(db, allRows);
  console.log(`[Backfill] northbound: upserted ${count} rows${truncated ? ' (truncated)' : ''}`);
  return count;
}

// ============================================
// 主入口
// ============================================

export interface BackfillResult {
  inserted: number;
  details: Record<string, number>;
  debug?: Record<string, any>;
  warnings: string[];
}

/**
 * 回填 market_snapshots 历史数据
 *
 * @param db D1 数据库实例
 * @param startDate 起始日期 "YYYY-MM-DD"
 * @param endDate 结束日期 "YYYY-MM-DD"
 */
export async function backfillSnapshots(
  db: D1Database,
  startDate: string,
  endDate: string,
): Promise<BackfillResult> {
  const details: Record<string, number> = {};
  const debug: Record<string, any> = {};
  const warnings: string[] = [];

  console.log(`[Backfill] Starting: ${startDate} → ${endDate}`);
  const t0 = Date.now();

  // 1. PE + close (csindex)
  try {
    details.valuation = await backfillValuation(db, startDate, endDate);
  } catch (e) {
    const msg = `valuation failed: ${(e as Error).message}`;
    console.error(`[Backfill] ${msg}`);
    warnings.push(msg);
  }

  // 2. 10Y bond yield (chinabond)
  try {
    details.chinabond = await backfillBondYield(db, startDate, endDate, debug);
  } catch (e) {
    const msg = `chinabond failed: ${(e as Error).message}`;
    console.error(`[Backfill] ${msg}`);
    warnings.push(msg);
  }

  // 3. Margin (eastmoney)
  try {
    details.margin = await backfillMargin(db, startDate, endDate);
  } catch (e) {
    const msg = `margin failed: ${(e as Error).message}`;
    console.error(`[Backfill] ${msg}`);
    warnings.push(msg);
  }

  // 4. Northbound (eastmoney)
  try {
    details.northbound = await backfillNorthbound(db, startDate, endDate);
  } catch (e) {
    const msg = `northbound failed: ${(e as Error).message}`;
    console.error(`[Backfill] ${msg}`);
    warnings.push(msg);
  }

  const inserted = Object.values(details).reduce((a, b) => a + b, 0);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`[Backfill] Done in ${elapsed}s: ${inserted} rows total`);
  for (const [k, v] of Object.entries(details)) {
    console.log(`[Backfill]   ${k}: ${v} rows`);
  }

  return { inserted, details, debug, warnings };
}
