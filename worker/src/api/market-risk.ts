import * as db from '../db';
import { buildMarketRisk } from '../domain/market-risk';
import type { Env } from '../env';
import type { MarketRiskResponse, MarketSnapshotRowLike } from '../../../shared/types';

const MARKET_LOOKBACK_DAYS = 5 * 365;
const INDUSTRY_LOOKBACK_DAYS = 100;

function offsetCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export async function handleMarketRisk(
  _request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  try {
    const latest = await db.getLatestSnapshots(env.DB);
    const latestDate = latest.find((row) => row.index_code === '000300')?.trade_date ?? latest[0]?.trade_date;
    if (!latestDate) {
      return Response.json({ error: 'No market risk data available yet' }, { status: 503, headers });
    }

    const marketStartDate = offsetCalendarDays(latestDate, MARKET_LOOKBACK_DAYS);
    const industryStartDate = offsetCalendarDays(latestDate, INDUSTRY_LOOKBACK_DAYS);
    const [hs300Rows, marketRows, industryRows, industryFlows] = await Promise.all([
      db.getSnapshotsByDateRangeAndIndex(env.DB, '000300', marketStartDate, latestDate),
      db.getSnapshotsByDateRangeAndIndex(env.DB, '000001', marketStartDate, latestDate),
      db.getSwIndustryDailyRows(env.DB, industryStartDate, latestDate).catch((error) => {
        console.warn('[MarketRisk] Industry daily data unavailable:', error);
        return [];
      }),
      db.getIndustryFundFlowRows(env.DB, industryStartDate, latestDate).catch((error) => {
        console.warn('[MarketRisk] Industry flow data unavailable:', error);
        return [];
      }),
    ]);

    const payload: MarketRiskResponse = {
      ...buildMarketRisk(
        hs300Rows as MarketSnapshotRowLike[],
        marketRows as MarketSnapshotRowLike[],
        industryRows,
        industryFlows,
      ),
      generated_at: new Date().toISOString(),
    };
    return Response.json(payload, {
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300', ...headers },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const schemaMissing = /no such table|no such column/i.test(message);
    return Response.json({
      error: schemaMissing ? 'Market risk data store is not ready' : 'Failed to load market risk',
    }, { status: schemaMissing ? 503 : 500, headers });
  }
}
