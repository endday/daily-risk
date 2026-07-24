import type { InstrumentDailyRow } from '../collectors/base';
import type { ValuationCategory, ValuationRankingItem, ValuationRankState } from '../../../shared/types';

const MINIMUM_PE_SAMPLES = 240;

export interface ValuationSeries {
  code: string;
  name: string;
  category: ValuationCategory;
  peHistorySupported: boolean;
  rows: Pick<InstrumentDailyRow, 'trade_date' | 'close_price' | 'pe_ttm'>[];
}

function round(value: number, decimals = 1): number {
  const unit = 10 ** decimals;
  return Math.round(value * unit) / unit;
}

function positive(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

function returnForSessions(closes: number[], sessions: number): number | null {
  if (closes.length <= sessions) return null;
  return round((closes.at(-1)! / closes.at(-1 - sessions)! - 1) * 100, 2);
}

function maximumDrawdown(closes: number[]): number | null {
  if (closes.length < 2) return null;
  let peak = closes[0];
  let drawdown = 0;
  for (const close of closes) {
    peak = Math.max(peak, close);
    drawdown = Math.min(drawdown, (close / peak - 1) * 100);
  }
  return round(drawdown, 2);
}

function valuationState(percentile: number | null, sampleCount: number): ValuationRankState {
  if (percentile == null || sampleCount < MINIMUM_PE_SAMPLES) return 'unavailable';
  if (percentile <= 20) return 'low';
  if (percentile <= 40) return 'below_average';
  if (percentile <= 70) return 'fair';
  return 'high';
}

export function buildValuationRankingItem(series: ValuationSeries): ValuationRankingItem {
  const rows = [...series.rows]
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.trade_date))
    .sort((left, right) => left.trade_date.localeCompare(right.trade_date));
  const validPeRows = rows.filter((row) => positive(row.pe_ttm));
  const latestPeRow = validPeRows.at(-1);
  const latestPe = latestPeRow?.pe_ttm ?? null;
  const peSampleCount = validPeRows.length;
  const percentile = latestPe == null
    ? null
    : round(validPeRows.filter((row) => row.pe_ttm! <= latestPe).length / peSampleCount * 100, 1);
  const validCloses = rows.filter((row) => positive(row.close_price)).map((row) => row.close_price!);
  const status = valuationState(percentile, peSampleCount);

  return {
    rank: null,
    code: series.code,
    name: series.name,
    category: series.category,
    pe_history_supported: series.peHistorySupported,
    state: status,
    latest_pe_ttm: latestPe == null ? null : round(latestPe, 2),
    pe_percentile: status === 'unavailable' ? null : percentile,
    pe_sample_count: peSampleCount,
    return_20d_pct: returnForSessions(validCloses, 20),
    max_drawdown_60d_pct: maximumDrawdown(validCloses.slice(-60)),
    latest_close_price: validCloses.at(-1) ?? null,
    as_of_date: latestPeRow?.trade_date ?? rows.at(-1)?.trade_date ?? null,
  };
}

export function buildValuationRanking(series: ValuationSeries[]): ValuationRankingItem[] {
  const items = series.map(buildValuationRankingItem);
  const rankable = items
    .filter((item) => item.state !== 'unavailable' && item.pe_percentile != null)
    .sort((left, right) => {
      const percentileDiff = left.pe_percentile! - right.pe_percentile!;
      if (percentileDiff !== 0) return percentileDiff;
      return (right.return_20d_pct ?? Number.NEGATIVE_INFINITY) - (left.return_20d_pct ?? Number.NEGATIVE_INFINITY)
        || left.code.localeCompare(right.code);
    });
  rankable.forEach((item, index) => { item.rank = index + 1; });

  const unavailable = items
    .filter((item) => item.state === 'unavailable')
    .sort((left, right) => left.code.localeCompare(right.code));
  return [...rankable, ...unavailable];
}

export { MINIMUM_PE_SAMPLES };
