import type { InstrumentDailyRow } from './base';
import { http } from './http';
import { MARKET_INSTRUMENTS } from '../market-universe';
import { upsertInstrumentDailyRows } from '../db';

const EASTMONEY_KLINE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';
const KLINE_FIELDS1 = 'f1,f2,f3,f4,f5,f6';
const KLINE_FIELDS2 = 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61';

interface EastmoneyKlineResponse {
  data?: {
    code?: string;
    name?: string;
    klines?: string[];
  };
}

function toCompactDate(value: string): string {
  return value.replace(/-/g, '');
}

function parseNumber(value: string): number | null {
  if (!value || value === '-') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseKlineRows(
  instrument: typeof MARKET_INSTRUMENTS[number],
  providerName: string,
  klines: string[],
): InstrumentDailyRow[] {
  let previousClose: number | null = null;

  return klines.map((line) => {
    const [
      tradeDate,
      openPrice,
      closePrice,
      highPrice,
      lowPrice,
      volume,
      amount,
      amplitude,
      changePct,
      changeAmount,
      turnoverRate,
    ] = line.split(',');

    const close = parseNumber(closePrice);
    const row: InstrumentDailyRow = {
      trade_date: tradeDate,
      instrument_code: instrument.code,
      instrument_name: instrument.name,
      instrument_type: instrument.type,
      provider: providerName,
      open_price: parseNumber(openPrice),
      high_price: parseNumber(highPrice),
      low_price: parseNumber(lowPrice),
      close_price: close,
      pre_close_price: previousClose,
      change_pct: parseNumber(changePct),
      change_amount: parseNumber(changeAmount),
      amplitude: parseNumber(amplitude),
      volume: parseNumber(volume),
      amount: parseNumber(amount),
      turnover_rate: parseNumber(turnoverRate),
      pe_ttm: null,
      pb: null,
      total_market_cap: null,
      float_market_cap: null,
      is_st: null,
      source_updated_at: new Date().toISOString(),
    };

    previousClose = close;
    return row;
  });
}

async function fetchInstrumentHistory(
  instrument: typeof MARKET_INSTRUMENTS[number],
  startDate: string,
  endDate: string,
): Promise<InstrumentDailyRow[]> {
  const url =
    `${EASTMONEY_KLINE_URL}?secid=${instrument.secid}` +
    `&fields1=${KLINE_FIELDS1}` +
    `&fields2=${KLINE_FIELDS2}` +
    '&klt=101&fqt=0' +
    `&beg=${toCompactDate(startDate)}` +
    `&end=${toCompactDate(endDate)}`;

  const json = await http.get(url).json<EastmoneyKlineResponse>();
  const klines = json.data?.klines || [];
  return parseKlineRows(instrument, 'eastmoney_push2his', klines);
}

export async function initializeInstrumentDaily(
  db: D1Database,
  startDate: string,
  endDate: string,
): Promise<{ instruments: number; rows: number }> {
  const rows: InstrumentDailyRow[] = [];

  for (const instrument of MARKET_INSTRUMENTS) {
    const instrumentRows = await fetchInstrumentHistory(instrument, startDate, endDate);
    rows.push(...instrumentRows);
  }

  const count = await upsertInstrumentDailyRows(db, rows);
  return { instruments: MARKET_INSTRUMENTS.length, rows: count };
}
