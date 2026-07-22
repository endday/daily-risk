import * as db from '../db';
import type { Env } from '../env';
import { MARKET_INSTRUMENTS } from '../market-universe';
import { buildInstrumentQuality, buildRelativeStrengthPair, type InstrumentSeries } from '../domain/relative-strength';
import type { RelativeStrengthResponse } from '../../../shared/types';

const DEFAULT_PAIRS = [
  ['399006', '000300'],
  ['000688', '399006'],
  ['000905', '000300'],
  ['000300', '000001'],
] as const;

const SUPPORTED = MARKET_INSTRUMENTS.filter((instrument) => instrument.type === 'broad_index');
const SUPPORTED_BY_CODE = new Map(SUPPORTED.map((instrument) => [instrument.code, instrument]));
const ANALYSIS_LOOKBACK_DAYS = 12 * 365;

function analysisStartDate(now = new Date()): string {
  return new Date(now.getTime() - ANALYSIS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export async function handleRelativeStrength(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  const url = new URL(request.url);
  const baseCode = url.searchParams.get('base');
  if (baseCode && !SUPPORTED_BY_CODE.has(baseCode)) {
    return Response.json({
      error: 'Unsupported base index',
      supported: SUPPORTED.map((instrument) => instrument.code),
    }, { status: 400, headers });
  }

  const pairCodes: readonly (readonly [string, string])[] = baseCode
    ? SUPPORTED.filter((instrument) => instrument.code !== baseCode).map((instrument) => [instrument.code, baseCode] as const)
    : DEFAULT_PAIRS;
  const neededCodes = [...new Set(pairCodes.flat())];
  const startDate = analysisStartDate();

  try {
    const seriesEntries = await Promise.all(neededCodes.map(async (code) => {
      const instrument = SUPPORTED_BY_CODE.get(code)!;
      const rows = await db.getInstrumentDailyClosesByDateRange(env.DB, code, startDate, '9999-12-31');
      return [code, {
        code,
        name: instrument.name,
        rows: rows.map((row) => ({ trade_date: row.trade_date, close_price: row.close_price })),
      }] as const;
    }));
    const seriesByCode = new Map<string, InstrumentSeries>(seriesEntries);
    const quality = neededCodes.map((code) => buildInstrumentQuality(seriesByCode.get(code)!));
    const pairs = pairCodes.map(([numeratorCode, denominatorCode]) => buildRelativeStrengthPair(
      seriesByCode.get(numeratorCode)!,
      seriesByCode.get(denominatorCode)!,
    ));

    if (quality.every((item) => item.valid_close_count === 0)) {
      return Response.json({ error: 'No instrument daily data available yet' }, { status: 503, headers });
    }

    const payload: RelativeStrengthResponse = {
      trade_date: pairs.map((pair) => pair.trade_date).filter((date): date is string => date != null).sort().at(-1) ?? null,
      generated_at: new Date().toISOString(),
      base_code: baseCode,
      quality,
      pairs,
    };
    return Response.json(payload, {
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300', ...headers },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /no such table|no such column/i.test(message) ? 503 : 500;
    return Response.json({
      error: status === 503 ? 'Instrument daily data store is not ready' : 'Relative strength calculation failed',
    }, { status, headers });
  }
}
