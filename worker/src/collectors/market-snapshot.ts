/**
 * Market Snapshot Collector — A 股市场快照
 *
 * 数据源：东方财富 push2 API（实时行情），腾讯历史日线作为核心指数备用源
 * 免费公开 API，无需 API Key。
 *
 * 每次采集返回 3 行数据（三指数各一行）：
 * - 000001（上证指数）：行情 + 涨跌家数 + 成交额 + 换手率
 * - 000300（沪深300）：行情 + 成交额 + 换手率
 * - 000905（中证500）：行情 + 成交额 + 换手率
 */

import type { CollectorConfig, CollectorResult, MarketSnapshotRow } from './base';
import { getBeijingDate, offsetDate } from '../../../shared/date-utils';
import { http } from './http';
import { SNAPSHOT_MARKET_INSTRUMENTS, type MarketInstrument } from '../market-universe';

/** push2 字段映射 */
const INDEX_CONFIG = SNAPSHOT_MARKET_INSTRUMENTS;
const CORE_INDEX_CONFIG = INDEX_CONFIG.filter((instrument) => instrument.priority === 'p0');

/** 请求的 push2 字段列表 */
const FIELDS = 'f2,f3,f5,f6,f8,f104,f105,f106,f12,f14,f124';
const TENCENT_KLINE_URL = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get';

function quoteDate(raw: any): string {
  if (typeof raw.f124 === 'number' && Number.isFinite(raw.f124) && raw.f124 > 0) {
    return new Date((raw.f124 + 8 * 60 * 60) * 1000).toISOString().slice(0, 10);
  }
  return getBeijingDate(0);
}

/**
 * 从 push2 获取三指数实时行情
 */
async function fetchPush2Data(instruments: MarketInstrument[], retry = 2): Promise<any[]> {
  const secids = instruments.map(c => c.secid).join(',');
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?secids=${secids}&fields=${FIELDS}`;

  const json = await http.get(url, { retry }).json<any>();
  if (json.rc !== 0 || !json.data?.diff) {
    throw new Error(`push2 API returned error: rc=${json.rc}`);
  }

  return json.data.diff;
}

/**
 * 将 push2 原始数据转换为 MarketSnapshotRow
 */
function parseSnapshotRow(raw: any, config: typeof INDEX_CONFIG[number]): MarketSnapshotRow {
  const tradeDate = quoteDate(raw);

  return {
    trade_date: tradeDate,
    index_code: config.code,

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
    us_2y_yield: null,
    fed_funds_rate: null,
    usd_index: null,
    oil_wti: null,
    us_yield_spread: null,
    total_market_cap: null,
  };
}

function validSnapshot(row: MarketSnapshotRow): boolean {
  return row.close_price != null && Number.isFinite(row.close_price) && row.close_price > 0;
}

function mapSnapshotRows(
  rawData: any[],
  instruments: MarketInstrument[],
): Map<string, MarketSnapshotRow> {
  const rows = new Map<string, MarketSnapshotRow>();
  const configByCode = new Map(instruments.map((instrument) => [instrument.code, instrument]));

  for (const raw of rawData) {
    const code = String(raw?.f12 ?? '');
    const config = configByCode.get(code);
    if (!config) continue;

    const row = parseSnapshotRow(raw, config);
    if (validSnapshot(row)) rows.set(row.index_code, row);
  }

  return rows;
}

async function fetchIndividualSnapshot(instrument: MarketInstrument): Promise<MarketSnapshotRow | null> {
  const rawData = await fetchPush2Data([instrument], 0);
  const rows = mapSnapshotRows(rawData, [instrument]);
  return rows.get(instrument.code) ?? null;
}

function tencentSymbol(instrument: MarketInstrument): string {
  return `${instrument.secid.startsWith('1.') ? 'sh' : 'sz'}${instrument.code}`;
}

function nullableTencentNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchTencentSnapshot(instrument: MarketInstrument): Promise<MarketSnapshotRow | null> {
  const endDate = getBeijingDate(0);
  const startDate = offsetDate(endDate, -10);
  const symbol = tencentSymbol(instrument);
  const url = `${TENCENT_KLINE_URL}?param=${symbol},day,${startDate},${endDate},30,qfq`;
  const json = await http.get(url, { retry: 1 }).json<{
    code?: number;
    data?: Record<string, { day?: string[][] }>;
  }>();
  const days = json.data?.[symbol]?.day ?? [];
  const validDays = days.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day[0] ?? ''));
  const latest = validDays.at(-1);
  if (json.code !== 0 || !latest) return null;

  const close = nullableTencentNumber(latest[2]);
  if (close == null || close <= 0) return null;

  const previous = validDays.at(-2);
  const previousClose = nullableTencentNumber(previous?.[2]);
  const changePct = previousClose && previousClose > 0
    ? Number((((close / previousClose) - 1) * 100).toFixed(2))
    : null;

  return {
    trade_date: latest[0],
    index_code: instrument.code,
    close_price: close,
    change_pct: changePct,
    rise_count: null,
    fall_count: null,
    flat_count: null,
    // Tencent's index K-line endpoint exposes volume, not a compatible
    // turnover amount, so leave this field for the existing sources.
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

async function collectMarketSnapshotResult(): Promise<{
  rows: MarketSnapshotRow[];
  warnings: string[];
}> {
  const warnings: string[] = [];
  const rowsByCode = new Map<string, MarketSnapshotRow>();

  let batchRows: Map<string, MarketSnapshotRow>;
  let batchFailed = false;
  try {
    batchRows = mapSnapshotRows(await fetchPush2Data(INDEX_CONFIG), INDEX_CONFIG);
  } catch (error) {
    batchFailed = true;
    warnings.push(`批量行情请求失败: ${error instanceof Error ? error.message : String(error)}`);
    batchRows = new Map();
  }

  const missing = batchFailed
    ? CORE_INDEX_CONFIG.filter((instrument) => !batchRows.has(instrument.code))
    : INDEX_CONFIG.filter((instrument) => !batchRows.has(instrument.code));
  if (missing.length > 0) {
    const fallbackResults = await Promise.allSettled(
      missing.map((instrument) => fetchIndividualSnapshot(instrument)),
    );
    fallbackResults.forEach((result, index) => {
      const instrument = missing[index];
      if (result.status === 'fulfilled' && result.value) {
        batchRows.set(instrument.code, result.value);
      } else {
        warnings.push(
          `${instrument.name}行情请求失败: ${
            result.status === 'rejected'
              ? result.reason instanceof Error ? result.reason.message : String(result.reason)
              : '返回空价格'
          }`,
        );
      }
    });
  }

  if (batchFailed) {
    const skippedOptional = INDEX_CONFIG
      .filter((instrument) => instrument.priority !== 'p0' && !batchRows.has(instrument.code))
      .map((instrument) => instrument.name);
    if (skippedOptional.length > 0) {
      warnings.push(`批量失败时跳过可选标的: ${skippedOptional.join('、')}`);
    }
  }

  const tencentMissing = CORE_INDEX_CONFIG.filter((instrument) => !batchRows.has(instrument.code));
  if (tencentMissing.length > 0) {
    const tencentResults = await Promise.allSettled(
      tencentMissing.map((instrument) => fetchTencentSnapshot(instrument)),
    );
    tencentResults.forEach((result, index) => {
      const instrument = tencentMissing[index];
      if (result.status === 'fulfilled' && result.value) {
        batchRows.set(instrument.code, result.value);
        warnings.push(`${instrument.name}已切换腾讯历史日线备用源`);
      } else {
        warnings.push(
          `${instrument.name}腾讯备用行情失败: ${
            result.status === 'rejected'
              ? result.reason instanceof Error ? result.reason.message : String(result.reason)
              : '返回空价格'
          }`,
        );
      }
    });
  }

  for (const instrument of INDEX_CONFIG) {
    const row = batchRows.get(instrument.code);
    if (row) rowsByCode.set(instrument.code, row);
  }

  const missingCore = CORE_INDEX_CONFIG.filter((instrument) => !rowsByCode.has(instrument.code));
  if (missingCore.length > 0) {
    throw new Error(`核心指数行情不可用: ${missingCore.map((instrument) => instrument.name).join('、')}`);
  }

  return {
    rows: INDEX_CONFIG
      .map((instrument) => rowsByCode.get(instrument.code))
      .filter((row): row is MarketSnapshotRow => row != null),
    warnings,
  };
}

/**
 * 采集市场快照数据
 */
export async function collectMarketSnapshot(): Promise<MarketSnapshotRow[]> {
  console.log('[MarketSnapshot] Fetching push2 data...');

  const result = await collectMarketSnapshotResult();
  for (const row of result.rows) {
    console.log(
      `[MarketSnapshot] ${row.index_code}: ` +
      `close=${row.close_price}, change=${row.change_pct}%, ` +
      `rise=${row.rise_count}, fall=${row.fall_count}, ` +
      `turnover=${row.turnover_amount ? (row.turnover_amount / 1e12).toFixed(2) + 'T' : '--'}`
    );
  }

  return result.rows;
}

// ============================================
// Collector 接口
// ============================================

export const marketSnapshotCollector: CollectorConfig = {
  name: 'market_snapshot',
  async collect(): Promise<CollectorResult> {
    const result = await collectMarketSnapshotResult();
    return {
      events: [],
      snapshots: result.rows,
      meta: { source_count: 1, warnings: result.warnings },
    };
  },
};
