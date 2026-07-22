import type {
  InstrumentQualityStats,
  RelativeForwardStats,
  RelativeStrengthPair,
  RelativeStrengthState,
} from '../../../shared/types';

export interface ClosePoint {
  trade_date: string;
  close_price: number | null;
}

export interface InstrumentSeries {
  code: string;
  name: string;
  rows: ClosePoint[];
}

const WINDOWS = [20, 60, 120, 242, 252] as const;
const FORWARD_HORIZONS = [5, 20, 60] as const;

function round(value: number | null, digits = 2): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function validRows(rows: ClosePoint[]): ClosePoint[] {
  const byDate = new Map<string, ClosePoint>();
  for (const row of rows) {
    if (row.close_price != null && Number.isFinite(row.close_price) && row.close_price > 0) {
      byDate.set(row.trade_date, row);
    }
  }
  return [...byDate.values()].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
}

function priceReturn(values: number[], window: number): number | null {
  if (values.length <= window) return null;
  return (values.at(-1)! / values[values.length - 1 - window] - 1) * 100;
}

function historicalVolatility(values: number[], window = 20): number | null {
  if (values.length <= window) return null;
  const selected = values.slice(-(window + 1));
  const returns = selected.slice(1).map((value, index) => Math.log(value / selected[index]));
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function maxDrawdown(values: number[]): number | null {
  if (values.length === 0) return null;
  let peak = values[0];
  let worst = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    worst = Math.min(worst, value / peak - 1);
  }
  return worst * 100;
}

export function buildInstrumentQuality(series: InstrumentSeries): InstrumentQualityStats {
  const seen = new Set<string>();
  let duplicateDates = 0;
  let missingCloses = 0;
  let nonPositiveCloses = 0;

  for (const row of series.rows) {
    if (seen.has(row.trade_date)) duplicateDates += 1;
    seen.add(row.trade_date);
    if (row.close_price == null || !Number.isFinite(row.close_price)) missingCloses += 1;
    else if (row.close_price <= 0) nonPositiveCloses += 1;
  }

  const valid = validRows(series.rows);
  const closes = valid.map((row) => row.close_price as number);
  return {
    instrument_code: series.code,
    instrument_name: series.name,
    row_count: series.rows.length,
    valid_close_count: valid.length,
    missing_close_count: missingCloses,
    non_positive_close_count: nonPositiveCloses,
    duplicate_date_count: duplicateDates,
    first_date: valid[0]?.trade_date ?? null,
    latest_date: valid.at(-1)?.trade_date ?? null,
    return_20d: round(priceReturn(closes, 20)),
    return_60d: round(priceReturn(closes, 60)),
    return_120d: round(priceReturn(closes, 120)),
    return_252d: round(priceReturn(closes, 252)),
    volatility_20d: round(historicalVolatility(closes)),
    max_drawdown_pct: round(maxDrawdown(closes)),
    window_available: Object.fromEntries(
      WINDOWS.map((window) => [String(window), valid.length > window]),
    ) as InstrumentQualityStats['window_available'],
  };
}

function alignRelativeSeries(numerator: ClosePoint[], denominator: ClosePoint[]) {
  const denominatorByDate = new Map(
    validRows(denominator).map((row) => [row.trade_date, row.close_price as number]),
  );
  return validRows(numerator).flatMap((row) => {
    const denominatorClose = denominatorByDate.get(row.trade_date);
    if (denominatorClose == null) return [];
    return [{
      trade_date: row.trade_date,
      log_relative: Math.log(row.close_price as number) - Math.log(denominatorClose),
    }];
  });
}

function relativeReturn(values: number[], window: number): number | null {
  if (values.length <= window) return null;
  return (Math.exp(values.at(-1)! - values[values.length - 1 - window]) - 1) * 100;
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const alpha = 2 / (period + 1);
  return values.reduce((current, value, index) => index === 0 ? value : value * alpha + current * (1 - alpha));
}

export function calculateRsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  const selected = values.slice(-(period + 1));
  const adjacent = selected.slice(1).map((value, index) => value - selected[index]);
  const gains = adjacent.reduce((sum, value) => sum + Math.max(value, 0), 0) / period;
  const losses = adjacent.reduce((sum, value) => sum + Math.max(-value, 0), 0) / period;
  if (gains === 0 && losses === 0) return 50;
  if (losses === 0) return 100;
  if (gains === 0) return 0;
  return 100 - 100 / (1 + gains / losses);
}

function zscore(values: number[], window: number): number | null {
  if (values.length < window) return null;
  const selected = values.slice(-window);
  const mean = selected.reduce((sum, value) => sum + value, 0) / selected.length;
  const variance = selected.reduce((sum, value) => sum + (value - mean) ** 2, 0) / selected.length;
  if (variance === 0) return null;
  return (selected.at(-1)! - mean) / Math.sqrt(variance);
}

function percentile(values: number[]): number | null {
  if (values.length < 20) return null;
  const current = values.at(-1)!;
  return values.filter((value) => value <= current).length / values.length * 100;
}

function classifyState(rsi: number | null, z: number | null, return20: number | null): RelativeStrengthState {
  if ((z != null && z >= 2) || (rsi != null && rsi >= 80)) return 'overheated';
  if ((z != null && z <= -2) || (rsi != null && rsi <= 20)) return 'oversold';
  if (return20 != null && return20 >= 2) return 'strong';
  if (return20 != null && return20 <= -2) return 'weak';
  return 'normal';
}

function stateAt(values: number[]): RelativeStrengthState {
  return classifyState(calculateRsi(values), zscore(values, 242), relativeReturn(values, 20));
}

function findStateChangedAt(points: { trade_date: string; log_relative: number }[], state: RelativeStrengthState): string | null {
  if (points.length === 0) return null;
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const windowStart = Math.max(0, index - 241);
    if (stateAt(points.slice(windowStart, index + 1).map((point) => point.log_relative)) !== state) {
      return points[index + 1].trade_date;
    }
  }
  return points[0].trade_date;
}

function buildForwardStats(values: number[]): RelativeForwardStats[] {
  const extremeIndices: { index: number; direction: 1 | -1 }[] = [];
  let previousDirection: 1 | -1 | null = null;
  for (let index = 241; index < values.length; index += 1) {
    const history = values.slice(index - 241, index + 1);
    const rsi = calculateRsi(history);
    const z = zscore(history, 242);
    const overheated = (z != null && z >= 2) || (rsi != null && rsi >= 80);
    const oversold = (z != null && z <= -2) || (rsi != null && rsi <= 20);
    const direction: 1 | -1 | null = overheated ? -1 : oversold ? 1 : null;
    // Treat a continuous extreme stretch as one episode so sample counts are not inflated.
    if (direction != null && direction !== previousDirection) extremeIndices.push({ index, direction });
    previousDirection = direction;
  }

  return FORWARD_HORIZONS.map((horizon) => {
    const outcomes = extremeIndices.flatMap(({ index, direction }) => {
      if (index + horizon >= values.length) return [];
      const relativeReturnPct = (Math.exp(values[index + horizon] - values[index]) - 1) * 100;
      return [relativeReturnPct * direction];
    });
    return {
      horizon_days: horizon,
      sample_count: outcomes.length,
      avg_relative_return_pct: round(outcomes.length ? outcomes.reduce((sum, value) => sum + value, 0) / outcomes.length : null),
      positive_probability: round(outcomes.length ? outcomes.filter((value) => value > 0).length / outcomes.length * 100 : null, 1),
      max_favorable_pct: round(outcomes.length ? Math.max(...outcomes) : null),
      max_adverse_pct: round(outcomes.length ? Math.min(...outcomes) : null),
    };
  });
}

export function buildRelativeStrengthPair(
  numerator: InstrumentSeries,
  denominator: InstrumentSeries,
): RelativeStrengthPair {
  const points = alignRelativeSeries(numerator.rows, denominator.rows);
  const values = points.map((point) => point.log_relative);
  const currentEma = ema(values, 20);
  const rsi = calculateRsi(values);
  const z = zscore(values, 242);
  const return20 = relativeReturn(values, 20);
  const state = classifyState(rsi, z, return20);

  return {
    pair_key: `${numerator.code}_${denominator.code}`,
    numerator_code: numerator.code,
    numerator_name: numerator.name,
    denominator_code: denominator.code,
    denominator_name: denominator.name,
    trade_date: points.at(-1)?.trade_date ?? null,
    aligned_sample_count: points.length,
    first_aligned_date: points[0]?.trade_date ?? null,
    relative_return_20d: round(return20),
    relative_return_60d: round(relativeReturn(values, 60)),
    relative_return_120d: round(relativeReturn(values, 120)),
    relative_return_252d: round(relativeReturn(values, 252)),
    spread_return_40d: round(relativeReturn(values, 40)),
    log_bias_20_pct: round(currentEma == null || values.length === 0 ? null : (values.at(-1)! - currentEma) * 100),
    rsi_14: round(rsi),
    zscore_242: round(z),
    historical_percentile: round(percentile(values), 1),
    state,
    state_changed_at: findStateChangedAt(points, state),
    forward_stats: buildForwardStats(values),
  };
}
