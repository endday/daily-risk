import * as db from '../db';
import type {
  CollectorConfig,
  CollectorEnv,
  CollectorResult,
  MarketSentimentDailyRow,
} from './base';
import { getBeijingDate } from '../../../shared/date-utils';
import { http } from './http';

const OPTBBS_QVIX_DAILY_URL = 'https://1.optbbs.com/d/csv/d/k.csv';
const EASTMONEY_FLOW_URL = 'https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get';

export interface QvixPoint {
  trade_date: string;
  qvix_close: number;
  qvix_change_pct: number | null;
}

export interface MarketFlowPoint {
  trade_date: string;
  market_close_price: number | null;
  market_change_pct: number | null;
  main_net_inflow: number | null;
  small_net_inflow: number | null;
  medium_net_inflow: number | null;
  large_net_inflow: number | null;
  super_large_net_inflow: number | null;
  main_net_inflow_ratio: number | null;
}

function nullableNumber(value: string | undefined): number | null {
  if (value == null || value === '' || value === '-' || value === '.') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseQvixDate(value: string | undefined): string | null {
  const match = value?.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

export function parseQvixCsv(csv: string): QvixPoint[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const points: QvixPoint[] = [];
  let previous: number | null = null;
  for (const line of lines.slice(1)) {
    const fields = line.split(',');
    const date = parseQvixDate(fields[0]);
    const value = nullableNumber(fields[4]);
    if (date == null || value == null || value <= 0) continue;
    points.push({
      trade_date: date,
      qvix_close: value,
      qvix_change_pct: previous != null && previous > 0
        ? Number(((value / previous - 1) * 100).toFixed(2))
        : null,
    });
    previous = value;
  }
  return points;
}

export function parseMarketFlowLine(line: string): MarketFlowPoint | null {
  const fields = line.split(',');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields[0] ?? '')) return null;
  return {
    trade_date: fields[0],
    main_net_inflow: nullableNumber(fields[1]),
    small_net_inflow: nullableNumber(fields[2]),
    medium_net_inflow: nullableNumber(fields[3]),
    large_net_inflow: nullableNumber(fields[4]),
    super_large_net_inflow: nullableNumber(fields[5]),
    main_net_inflow_ratio: nullableNumber(fields[6]),
    market_close_price: nullableNumber(fields[11]),
    market_change_pct: nullableNumber(fields[12]),
  };
}

export function mergeMarketSentimentRows(
  qvixPoints: QvixPoint[],
  flowPoints: MarketFlowPoint[],
): MarketSentimentDailyRow[] {
  const byDate = new Map<string, MarketSentimentDailyRow>();
  for (const point of qvixPoints) {
    byDate.set(point.trade_date, {
      trade_date: point.trade_date,
      provider: 'optbbs_qvix',
      qvix_close: point.qvix_close,
      qvix_change_pct: point.qvix_change_pct,
      market_close_price: null,
      market_change_pct: null,
      main_net_inflow: null,
      small_net_inflow: null,
      medium_net_inflow: null,
      large_net_inflow: null,
      super_large_net_inflow: null,
      main_net_inflow_ratio: null,
      source_updated_at: new Date().toISOString(),
    });
  }

  for (const point of flowPoints) {
    const row = byDate.get(point.trade_date) ?? {
      trade_date: point.trade_date,
      provider: 'eastmoney_market_flow',
      qvix_close: null,
      qvix_change_pct: null,
      market_close_price: null,
      market_change_pct: null,
      main_net_inflow: null,
      small_net_inflow: null,
      medium_net_inflow: null,
      large_net_inflow: null,
      super_large_net_inflow: null,
      main_net_inflow_ratio: null,
      source_updated_at: null,
    };
    Object.assign(row, point, {
      provider: row.qvix_close != null ? 'optbbs_qvix+eastmoney_market_flow' : 'eastmoney_market_flow',
      source_updated_at: new Date().toISOString(),
    });
    byDate.set(point.trade_date, row);
  }

  return [...byDate.values()].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
}

async function fetchQvixHistory(limit: number): Promise<QvixPoint[]> {
  const csv = await http.get(OPTBBS_QVIX_DAILY_URL, { retry: 1 }).text();
  return parseQvixCsv(csv).slice(-Math.max(limit, 10));
}

async function fetchMarketFlowHistory(limit: number): Promise<MarketFlowPoint[]> {
  const params = new URLSearchParams({
    lmt: String(limit),
    klt: '101',
    secid: '1.000001',
    ut: 'fa5fd1943c7b386172d6893dbfba10b',
    fields1: 'f1,f2,f3,f7',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63',
  });
  const payload = await http.get(`${EASTMONEY_FLOW_URL}?${params}`, { retry: 1 }).json<{
    data?: { klines?: string[] };
  }>();
  return (payload.data?.klines ?? [])
    .map(parseMarketFlowLine)
    .filter((row): row is MarketFlowPoint => row != null);
}

async function getRequestedDays(database: D1Database): Promise<number> {
  try {
    const coverage = await db.getMarketSentimentCoverage(database);
    return coverage.record_count === 0 ? 1825 : 45;
  } catch {
    return 45;
  }
}

export async function collectMarketSentimentRows(
  database: D1Database,
  requestedDays?: number,
): Promise<{ rows: MarketSentimentDailyRow[]; warnings: string[] }> {
  const days = requestedDays ?? await getRequestedDays(database);
  const [qvixResult, flowResult] = await Promise.allSettled([
    fetchQvixHistory(days),
    fetchMarketFlowHistory(Math.min(Math.max(days, 10), 250)),
  ]);

  const warnings: string[] = [];
  const qvixPoints = qvixResult.status === 'fulfilled' ? qvixResult.value : [];
  const flowPoints = flowResult.status === 'fulfilled' ? flowResult.value : [];
  if (qvixResult.status === 'rejected') warnings.push(`QVIX: ${String(qvixResult.reason)}`);
  if (flowResult.status === 'rejected') warnings.push(`market flow: ${String(flowResult.reason)}`);

  return {
    rows: mergeMarketSentimentRows(qvixPoints, flowPoints),
    warnings,
  };
}

export async function syncMarketSentiment(
  database: D1Database,
  requestedDays?: number,
): Promise<{ rows: number; warnings: string[] }> {
  const result = await collectMarketSentimentRows(database, requestedDays);
  await db.upsertMarketSentimentRows(database, result.rows);
  return { rows: result.rows.length, warnings: result.warnings };
}

export const marketSentimentCollector: CollectorConfig = {
  name: 'market_sentiment',
  async collect(env: CollectorEnv): Promise<CollectorResult> {
    const result = await collectMarketSentimentRows(env.DB);
    return {
      events: [],
      sentiments: result.rows,
      meta: {
        source_count: 2,
        warnings: result.warnings,
      },
    };
  },
};
