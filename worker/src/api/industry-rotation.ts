import * as db from '../db';
import type { SwIndustryDailyRow } from '../collectors/base';
import type { Env } from '../env';
import { offsetDate } from '../../../shared/date-utils';

export type RotationPeriod = 'week' | 'month' | 'half_year';

const PERIOD_DAYS: Record<RotationPeriod, number> = {
  week: 5,
  month: 20,
  half_year: 120,
};

function secondsUntilNextIndustryRefresh(now = new Date()): number {
  // Industry data is scheduled for 18:15 Beijing time. Leave a small buffer
  // so cached responses are never served across the next scheduled refresh.
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  let refreshAt = Date.UTC(
    beijing.getUTCFullYear(),
    beijing.getUTCMonth(),
    beijing.getUTCDate(),
    10,
    20,
    0,
  );
  if (refreshAt <= now.getTime()) refreshAt += 24 * 60 * 60 * 1000;
  return Math.max(60, Math.floor((refreshAt - now.getTime()) / 1000));
}

export interface IndustryRotationItem {
  board_code: string;
  board_name: string;
  trading_days: number;
  avg_turnover_amount: number;
  period_return_pct: number | null;
  log_bias_20_pct: number | null;
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function buildIndustryRotation(
  rows: SwIndustryDailyRow[],
  tradingDays: number,
): IndustryRotationItem[] {
  const grouped = new Map<string, IndustryFundFlowRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.industry_code) ?? [];
    list.push(row);
    grouped.set(row.industry_code, list);
  }

  const aggregates = [...grouped.entries()].map(([boardCode, boardRows]) => {
    const sorted = boardRows.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    const hasFullReturnWindow = sorted.length > tradingDays;
    const selected = sorted.slice(-tradingDays);
    const returnWindow = hasFullReturnWindow ? sorted.slice(-(tradingDays + 1)) : selected;
    const amounts = selected.map((row) => row.amount).filter((value): value is number => value != null);
    const closes = returnWindow.map((row) => row.close_price).filter((value): value is number => value != null);
    const logCloses = sorted
      .map((row) => row.close_price)
      .filter((value): value is number => value != null && value > 0)
      .map((value) => Math.log(value));
    const periodReturn = closes.length >= 2 ? ((closes.at(-1)! / closes[0]) - 1) * 100 : null;
    const alpha = 2 / 21;
    const ema20Log = logCloses.length >= 60
      ? logCloses.reduce((ema, value) => ema == null ? value : value * alpha + ema * (1 - alpha), null as number | null)
      : null;
    const logBias20 = ema20Log != null && logCloses.at(-1) != null
      ? (logCloses.at(-1)! - ema20Log) * 100
      : null;

    return {
      board_code: boardCode,
      board_name: selected.at(-1)?.industry_name ?? boardCode,
      trading_days: hasFullReturnWindow ? Math.max(0, closes.length - 1) : selected.length,
      avg_turnover_amount: amounts.length > 0
        ? amounts.reduce((sum, value) => sum + value, 0) / amounts.length
        : 0,
      period_return_pct: periodReturn,
      log_bias_20_pct: logBias20,
    };
  }).filter((item) => item.trading_days >= Math.min(3, tradingDays));

  return aggregates
    .map((item) => {
      return {
        ...item,
        avg_turnover_amount: round(item.avg_turnover_amount),
        period_return_pct: item.period_return_pct == null ? null : round(item.period_return_pct),
        log_bias_20_pct: item.log_bias_20_pct == null ? null : round(item.log_bias_20_pct),
      };
    })
    .sort((a, b) => (b.period_return_pct ?? -Infinity) - (a.period_return_pct ?? -Infinity));
}

export async function handleIndustryRotation(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  try {
    const [coverage, latestSync] = await Promise.all([
      db.getSwIndustryDailyRange(env.DB),
      db.getLatestSwIndustryImportRun(env.DB),
    ]);
    if (!coverage.max_date) {
      return new Response(JSON.stringify({
        error: 'No industry fund flow data available yet',
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...headers },
      });
    }

    const startDate = offsetDate(coverage.max_date, -210);
    const rows = await db.getSwIndustryDailyRows(env.DB, startDate, coverage.max_date);
    const windows = Object.fromEntries(
      (Object.entries(PERIOD_DAYS) as [RotationPeriod, number][]).map(([period, tradingDays]) => [
        period,
        { trading_days: tradingDays, industries: buildIndustryRotation(rows, tradingDays) },
      ]),
    );
    const cacheSeconds = secondsUntilNextIndustryRefresh();
    return new Response(JSON.stringify({
      trade_date: coverage.max_date,
      industry_count: windows.month.industries.length,
      annual_available: false,
      sync: latestSync ? {
        run_id: latestSync.run_id,
        status: latestSync.status,
        mode: latestSync.mode,
        row_count: latestSync.expected_rows,
        checksum: latestSync.checksum,
        completed_at: latestSync.completed_at,
      } : null,
      windows,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=60`,
        ...headers,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const schemaMissing = message.includes('no such table');
    return new Response(JSON.stringify({
      error: schemaMissing ? 'Industry rotation data store is not ready' : 'Failed to load industry rotation',
    }), {
      status: schemaMissing ? 503 : 500,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }
}
