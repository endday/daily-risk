import * as db from '../db';
import type { Env } from '../env';
import { MARKET_INSTRUMENTS } from '../market-universe';
import { buildIndexAccumulationItem, type IndexSeries } from '../domain/index-accumulation';
import type { IndexAccumulationResponse } from '../../../shared/types';

const SUPPORTED = MARKET_INSTRUMENTS.filter((item) => item.type === 'broad_index' && item.dailyLineEnabled);
const LOOKBACK_DAYS = 5 * 366;

export async function handleIndexAccumulation(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const requested = url.searchParams.get('codes')?.split(',').map((code) => code.trim()).filter(Boolean);
  const instruments = requested?.length ? SUPPORTED.filter((item) => requested.includes(item.code)) : SUPPORTED;
  if (requested?.some((code) => !SUPPORTED.some((item) => item.code === code))) {
    return Response.json({ error: 'Unsupported index code', supported: SUPPORTED.map((item) => item.code) }, { status: 400, headers });
  }
  const startDate = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);
  try {
    const entries = await Promise.all(instruments.map(async (instrument) => {
      const rows = await db.getInstrumentDailyClosesByDateRange(env.DB, instrument.code, startDate, '9999-12-31');
      return [instrument.code, { code: instrument.code, name: instrument.name, rows }] as const;
    }));
    const items = entries.map(([, series]) => buildIndexAccumulationItem(series as IndexSeries));
    const tradeDate = entries.flatMap(([, series]) => series.rows.map((row) => row.trade_date)).sort().at(-1) ?? null;
    if (items.every((item) => item.close == null)) return Response.json({ error: 'No instrument daily data available yet' }, { status: 503, headers });
    const payload: IndexAccumulationResponse = { trade_date: tradeDate, generated_at: new Date().toISOString(), primary_code: '000922', items };
    return Response.json(payload, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300', ...headers } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /no such table|no such column/i.test(message) ? 503 : 500;
    return Response.json({ error: status === 503 ? 'Instrument daily data store is not ready' : 'Index accumulation calculation failed' }, { status, headers });
  }
}

