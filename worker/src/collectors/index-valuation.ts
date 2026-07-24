import { upsertInstrumentDailyRows } from '../db';
import { CSINDEX_VALUATION_INDICES, type ValuationIndex } from '../valuation-universe';
import type { InstrumentDailyRow } from './base';
import { http } from './http';

const CSINDEX_PERF_URL = 'https://www.csindex.com.cn/csindex-home/perf/index-perf';

interface CSIndexPerfRow {
  tradeDate: string;
  close?: number | string | null;
  change?: number | string | null;
  changePct?: number | string | null;
  peg?: number | string | null;
}

interface CSIndexPerfResponse {
  code?: string | number;
  data?: CSIndexPerfRow[];
}

function asNumber(value: unknown): number | null {
  if (value == null || value === '' || value === '-') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toCompactDate(value: string): string {
  return value.replace(/-/g, '');
}

function toTradeDate(value: string): string | null {
  const compact = value.replace(/\D/g, '');
  if (!/^\d{8}$/.test(compact)) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function baseRow(index: ValuationIndex, tradeDate: string): InstrumentDailyRow {
  return {
    trade_date: tradeDate,
    instrument_code: index.code,
    instrument_name: index.name,
    instrument_type: `${index.category}_index`,
    provider: 'csindex_index_perf',
    open_price: null,
    high_price: null,
    low_price: null,
    close_price: null,
    pre_close_price: null,
    change_pct: null,
    change_amount: null,
    amplitude: null,
    volume: null,
    amount: null,
    turnover_rate: null,
    pe_ttm: null,
    pb: null,
    total_market_cap: null,
    float_market_cap: null,
    is_st: null,
    source_updated_at: new Date().toISOString(),
  };
}

export function parseCSIndexValuationRows(
  index: ValuationIndex,
  rows: CSIndexPerfRow[],
): InstrumentDailyRow[] {
  return rows.flatMap((raw) => {
    const tradeDate = toTradeDate(raw.tradeDate);
    if (!tradeDate) return [];

    const close = asNumber(raw.close);
    const change = asNumber(raw.change);
    const pe = asNumber(raw.peg);
    return [{
      ...baseRow(index, tradeDate),
      close_price: close,
      pre_close_price: close != null && change != null ? close - change : null,
      change_pct: asNumber(raw.changePct),
      change_amount: change,
      pe_ttm: pe != null && pe > 0 ? pe : null,
    }];
  });
}

async function fetchCSIndexRows(index: ValuationIndex, startDate: string, endDate: string): Promise<InstrumentDailyRow[]> {
  const params = new URLSearchParams({
    indexCode: index.code,
    startDate: toCompactDate(startDate),
    endDate: toCompactDate(endDate),
  });
  const payload = await http.get(`${CSINDEX_PERF_URL}?${params}`).json<CSIndexPerfResponse>();
  if (String(payload.code) !== '200' || !payload.data?.length) return [];
  return parseCSIndexValuationRows(index, payload.data);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const result: R[] = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      result.push(await mapper(item));
    }
  });
  await Promise.all(workers);
  return result;
}

export async function syncIndexValuationDaily(
  database: D1Database,
  startDate: string,
  endDate: string,
): Promise<{ valuationIndices: number; rows: number }> {
  const valuationRows = await mapWithConcurrency(
    CSINDEX_VALUATION_INDICES,
    4,
    (index) => fetchCSIndexRows(index, startDate, endDate),
  );
  const rows = valuationRows.flat();
  const upserted = await upsertInstrumentDailyRows(database, rows);
  return {
    valuationIndices: CSINDEX_VALUATION_INDICES.length,
    rows: upserted,
  };
}
