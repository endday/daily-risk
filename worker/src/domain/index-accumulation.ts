import type {
  IndexAccumulationItem,
  IndexAccumulationMaSignal,
  IndexAccumulationSignal,
} from '../../../shared/types';

export interface IndexCloseRow { trade_date: string; close_price: number | null }
export interface IndexSeries { code: string; name: string; rows: IndexCloseRow[] }

function chartPoint(rows: IndexCloseRow[], index: number) {
  const values = rows.slice(0, index + 1).map((row) => row.close_price as number);
  const close = values.at(-1)!;
  const high = Math.max(...values.slice(-252));
  return { date: rows[index].trade_date, close, ma50: movingAverage(values, 50), ma200: movingAverage(values, 200), rsi14: calculateRsi(values), drawdown52w: (close / high - 1) * 100, return20d: pctReturn(values, 20) };
}

function validRows(series: IndexSeries): IndexCloseRow[] {
  return series.rows
    .filter((row) => Number.isFinite(row.close_price) && (row.close_price as number) > 0)
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date));
}

export function movingAverage(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return values.slice(-period).reduce((sum, value) => sum + value, 0) / period;
}

export function calculateRsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  const changes = values.slice(-period - 1).slice(1).map((value, i) => value - values.slice(-period - 1)[i]);
  const gains = changes.reduce((s, change) => s + Math.max(change, 0), 0) / period;
  const losses = changes.reduce((s, change) => s + Math.max(-change, 0), 0) / period;
  if (losses === 0) return gains === 0 ? 50 : 100;
  return 100 - 100 / (1 + gains / losses);
}

function pctReturn(values: number[], period: number): number | null {
  if (values.length <= period) return null;
  return (values.at(-1)! / values[values.length - 1 - period] - 1) * 100;
}

function maSignal(values: number[]): { ma50: number | null; ma200: number | null; signal: IndexAccumulationMaSignal } {
  const ma50 = movingAverage(values, 50);
  const ma200 = movingAverage(values, 200);
  if (ma50 == null || ma200 == null) return { ma50, ma200, signal: 'insufficient' };
  const previous = values.slice(0, -1);
  const previous50 = movingAverage(previous, 50);
  const previous200 = movingAverage(previous, 200);
  if (previous50 != null && previous200 != null) {
    if (ma50 >= ma200 && previous50 < previous200) return { ma50, ma200, signal: 'golden_cross' };
    if (ma50 < ma200 && previous50 >= previous200) return { ma50, ma200, signal: 'death_cross' };
  }
  return { ma50, ma200, signal: ma50 >= ma200 ? 'above' : 'below' };
}

function buildSignal(score: number | null): IndexAccumulationSignal {
  if (score == null) return 'unavailable';
  if (score >= 4) return 'strong_buy';
  if (score >= 2) return 'buy';
  if (score <= -2) return 'wait';
  return 'hold';
}

export function buildIndexAccumulationItem(series: IndexSeries): IndexAccumulationItem {
  const rows = validRows(series);
  const values = rows.map((row) => row.close_price as number);
  const close = values.at(-1) ?? null;
  const ma = maSignal(values);
  const rsi14 = calculateRsi(values);
  const return20d = pctReturn(values, 20);
  const return60d = pctReturn(values, 60);
  const return252d = pctReturn(values, 252);
  const high = values.length ? Math.max(...values.slice(-252)) : null;
  const drawdown52w = close != null && high != null ? (close / high - 1) * 100 : null;
  const chartStart = Math.max(0, rows.length - 260);
  const chart_points = rows.slice(chartStart).map((_, index) => chartPoint(rows, chartStart + index));
  const indicator_events = chart_points.flatMap((point, index) => {
    const previous = index > 0 ? chart_points[index - 1] : null;
    const events = [] as Array<{ date: string; type: 'golden_cross' | 'death_cross' | 'oversold' | 'overbought' | 'deep_drawdown'; label: string }>;
    if (previous?.ma50 != null && previous.ma200 != null && point.ma50 != null && point.ma200 != null) {
      if (point.ma50 >= point.ma200 && previous.ma50 < previous.ma200) events.push({ date: point.date, type: 'golden_cross', label: '50日均线上穿200日均线' });
      if (point.ma50 < point.ma200 && previous.ma50 >= previous.ma200) events.push({ date: point.date, type: 'death_cross', label: '50日均线下穿200日均线' });
    }
    if (point.rsi14 != null && point.rsi14 < 30) events.push({ date: point.date, type: 'oversold', label: 'RSI14超卖' });
    if (point.rsi14 != null && point.rsi14 > 70) events.push({ date: point.date, type: 'overbought', label: 'RSI14超买' });
    if (point.drawdown52w <= -20) events.push({ date: point.date, type: 'deep_drawdown', label: '较52周高点回撤超过20%' });
    return events;
  });
  if (close == null) return { code: series.code, name: series.name, close, ma50: ma.ma50, ma200: ma.ma200, ma_signal: ma.signal, rsi14, return20d, return60d, return252d, drawdown52w, score: null, signal: 'unavailable', signals: [], chart_points: [], indicator_events: [] };
  const signals: string[] = [];
  let score = 0;
  if (ma.signal === 'golden_cross') { score += 3; signals.push('50日均线上穿200日均线'); }
  else if (ma.signal === 'death_cross') { score -= 3; signals.push('50日均线下穿200日均线'); }
  else if (ma.signal === 'above') { score += 1; signals.push('价格趋势位于长期均线上方'); }
  else if (ma.signal === 'below') { score -= 1; signals.push('价格趋势位于长期均线下方'); }
  if (rsi14 != null) {
    if (rsi14 < 30) { score += 2; signals.push('RSI14超卖'); }
    else if (rsi14 > 70) { score -= 2; signals.push('RSI14超买'); }
  }
  if (drawdown52w != null && drawdown52w <= -20) { score += 2; signals.push('较52周高点回撤较深'); }
  if (return20d != null && return20d > 10) { score -= 1; signals.push('短期涨幅偏高'); }
  return { code: series.code, name: series.name, close, ma50: ma.ma50, ma200: ma.ma200, ma_signal: ma.signal, rsi14, return20d, return60d, return252d, drawdown52w, score, signal: buildSignal(score), signals, chart_points, indicator_events };
}
