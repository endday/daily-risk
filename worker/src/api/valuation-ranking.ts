import * as db from '../db';
import { buildValuationRanking } from '../domain/valuation-ranking';
import type { Env } from '../env';
import { VALUATION_INDICES } from '../valuation-universe';
import type { ValuationRankingResponse } from '../../../shared/types';

const LOOKBACK_DAYS = 6 * 365;

function analysisStartDate(now = new Date()): string {
  return new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export async function handleValuationRanking(
  _request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  try {
    const startDate = analysisStartDate();
    const series = await Promise.all(VALUATION_INDICES.map(async (index) => ({
      code: index.code,
      name: index.name,
      category: index.category,
      peHistorySupported: true,
      rows: await db.getInstrumentDailyByDateRange(env.DB, index.code, startDate, '9999-12-31'),
    })));
    const items = buildValuationRanking(series);
    const tradeDate = items.map((item) => item.as_of_date).filter((date): date is string => date != null).sort().at(-1) ?? null;
    const payload: ValuationRankingResponse = {
      trade_date: tradeDate,
      generated_at: new Date().toISOString(),
      methodology: 'pe_ttm_historical_percentile',
      minimum_pe_samples: 240,
      rankable_count: items.filter((item) => item.rank != null).length,
      items,
    };
    return Response.json(payload, {
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300', ...headers },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const schemaMissing = /no such table|no such column/i.test(message);
    return Response.json({
      error: schemaMissing ? 'Valuation data store is not ready' : 'Failed to load valuation ranking',
    }, { status: schemaMissing ? 503 : 500, headers });
  }
}
