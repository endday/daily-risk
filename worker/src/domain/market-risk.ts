import type {
  MarketRiskBreadth,
  MarketRiskDimension,
  MarketRiskLevel,
  MarketRiskLiquidity,
  MarketRiskMetric,
  MarketRiskResponse,
  MarketRiskSignalState,
  MarketTemperatureBand,
  MarketRiskTail,
  MarketRiskValuation,
  MarketSnapshotRowLike,
} from '../../../shared/types';
import type {
  IndustryFundFlowRow,
  MarketSentimentDailyRow,
  SwIndustryDailyRow,
} from '../collectors/base';

type PricedSnapshot = Pick<MarketSnapshotRowLike,
  'trade_date' |
  'index_code' |
  'close_price' |
  'change_pct' |
  'rise_count' |
  'fall_count' |
  'flat_count' |
  'turnover_amount' |
  'margin_balance' |
  'northbound_amt' |
  'pe_ttm' |
  'bond_yield_10y'
>;

const INDEX_NAMES: Record<string, string> = {
  '000001': '上证指数',
  '000300': '沪深300',
  '000905': '中证500',
  '399006': '创业板指',
  '000688': '科创50',
  '159915': '创业板ETF',
  '588000': '科创50ETF',
  '512010': '医药ETF',
  '512880': '证券ETF',
  '515790': '光伏ETF',
};

function round(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentileRank(values: number[], current: number | null): number | null {
  if (current == null || values.length === 0) return null;
  return round(values.filter((value) => value <= current).length / values.length * 100);
}

function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current / previous) - 1) * 100;
}

function stateScore(state: MarketRiskSignalState): number {
  if (state === 'elevated') return 2;
  if (state === 'watch') return 1;
  return 0;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, round(value, 0)));
}

function bandFromScore(score: number | null): MarketTemperatureBand {
  if (score == null) return 'unavailable';
  if (score < 20) return 'cold';
  if (score < 40) return 'cool';
  if (score < 60) return 'neutral';
  if (score < 80) return 'warm';
  return 'hot';
}

function labelFromBand(band: MarketTemperatureBand): string {
  return {
    unavailable: '数据不足',
    cold: '极冷',
    cool: '偏冷',
    neutral: '中性',
    warm: '偏暖',
    hot: '过热',
  }[band];
}

function metric(
  key: string,
  label: string,
  value: number | string | boolean | null,
  displayValue: string,
  description?: string,
): MarketRiskMetric {
  return {
    key,
    label,
    value,
    display_value: displayValue,
    status: value == null ? 'missing' : 'available',
    ...(description ? { description } : {}),
  };
}

function unavailableMetric(key: string, label: string, description?: string): MarketRiskMetric {
  return metric(key, label, null, '未接入', description);
}

function formatPct(value: number | null, digits = 1, withSign = false): string {
  if (value == null) return '--';
  const sign = withSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

function formatNumber(value: number | null, digits = 0): string {
  if (value == null) return '--';
  return value.toFixed(digits);
}

function formatAmountYi(value: number | null): string {
  if (value == null) return '--';
  return `${round(value / 1e8, 0).toLocaleString('zh-CN')} 亿`;
}

function formatFlowWan(value: number | null): string {
  if (value == null) return '--';
  return `${round(value / 10000, 0).toLocaleString('zh-CN')} 万`;
}

function movingAverage(rows: PricedSnapshot[], days: number): number | null {
  const values = rows
    .slice(-days)
    .map((row) => row.close_price)
    .filter((value): value is number => value != null && value > 0);
  if (values.length < days) return null;
  return average(values);
}

function latestPricedRow(rows: PricedSnapshot[]): PricedSnapshot | null {
  return [...rows]
    .filter((row) => row.close_price != null && row.close_price > 0)
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date))
    .at(-1) ?? null;
}

function periodReturn(rows: PricedSnapshot[], days: number): number | null {
  return periodReturnFromRows(rows, days);
}

function periodReturnFromRows<T extends { trade_date: string; close_price: number | null }>(rows: T[], days: number): number | null {
  const sorted = [...rows]
    .filter((row) => row.close_price != null && row.close_price > 0)
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const latest = sorted.at(-1)?.close_price ?? null;
  const prior = sorted.length > days ? sorted.at(-days - 1)?.close_price ?? null : null;
  return latest != null && prior != null ? percentChange(latest, prior) : null;
}

function countConsecutiveChanges(values: number[], direction: 'up' | 'down'): number | null {
  if (values.length < 2) return null;
  let count = 0;
  for (let index = values.length - 1; index > 0; index--) {
    const current = values[index];
    const previous = values[index - 1];
    if (direction === 'up' ? current > previous : current < previous) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

function countConsecutiveSigns(values: number[], sign: 'positive' | 'negative'): number | null {
  if (values.length === 0) return null;
  let count = 0;
  for (let index = values.length - 1; index >= 0; index--) {
    const value = values[index];
    if (sign === 'positive' ? value > 0 : value < 0) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

function createDimension(
  key: string,
  label: string,
  score: number | null,
  summary: string,
  metrics: MarketRiskMetric[],
): MarketRiskDimension {
  return {
    key,
    label,
    score,
    band: bandFromScore(score),
    summary,
    metrics,
  };
}

function createBreadthUnavailable(): MarketRiskBreadth {
  return {
    state: 'unavailable',
    summary: '行业日线积累中',
    as_of_date: null,
    industry_count: 0,
    above_ma20_ratio: null,
    breadth_change_5d: null,
    concentration_top5_pct: null,
  };
}

function buildBreadth(
  rows: SwIndustryDailyRow[],
  flows: IndustryFundFlowRow[],
): MarketRiskBreadth {
  const grouped = new Map<string, SwIndustryDailyRow[]>();
  for (const row of rows) {
    if (row.close_price == null || row.close_price <= 0) continue;
    const list = grouped.get(row.industry_code) ?? [];
    list.push(row);
    grouped.set(row.industry_code, list);
  }

  const latestDate = [...grouped.values()]
    .map((list) => list.map((row) => row.trade_date).sort().at(-1) ?? null)
    .filter((date): date is string => date != null)
    .sort()
    .at(-1) ?? null;
  if (!latestDate) return createBreadthUnavailable();

  const currentFlags: boolean[] = [];
  const priorFlags: boolean[] = [];
  for (const list of grouped.values()) {
    const sorted = list.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    if (sorted.at(-1)?.trade_date !== latestDate || sorted.length < 25) continue;
    const closes = sorted.map((row) => row.close_price!).filter((value) => value > 0);
    const currentMa = average(closes.slice(-20));
    const priorMa = average(closes.slice(-25, -5));
    const current = closes.at(-1);
    const prior = closes.at(-6);
    if (currentMa == null || priorMa == null || current == null || prior == null) continue;
    currentFlags.push(current >= currentMa);
    priorFlags.push(prior >= priorMa);
  }

  if (currentFlags.length < 12) return createBreadthUnavailable();

  const aboveMa20 = round(currentFlags.filter(Boolean).length / currentFlags.length * 100);
  const priorAboveMa20 = priorFlags.filter(Boolean).length / priorFlags.length * 100;
  const breadthChange = round(aboveMa20 - priorAboveMa20);

  const latestFlowDate = flows.map((row) => row.trade_date).sort().at(-1) ?? null;
  const latestFlows = latestFlowDate == null
    ? []
    : flows
      .filter((row) => row.trade_date === latestFlowDate && row.main_net_inflow != null)
      .map((row) => Math.abs(row.main_net_inflow!))
      .filter((value) => value > 0)
      .sort((a, b) => b - a);
  const totalFlow = latestFlows.reduce((sum, value) => sum + value, 0);
  const concentration = latestFlows.length >= 5 && totalFlow > 0
    ? round(latestFlows.slice(0, 5).reduce((sum, value) => sum + value, 0) / totalFlow * 100)
    : null;

  let state: MarketRiskSignalState = 'neutral';
  let summary = '行业扩散度处于中性区间';
  if (aboveMa20 < 35 || breadthChange <= -15) {
    state = 'watch';
    summary = '行业广度走弱，指数内部扩散不足';
  } else if (aboveMa20 >= 80 && concentration != null && concentration >= 65) {
    state = 'elevated';
    summary = '广度偏热且资金向少数行业集中';
  } else if (aboveMa20 >= 60 && breadthChange >= -5 && (concentration == null || concentration < 60)) {
    state = 'supportive';
    summary = '多数行业站上20日均线，扩散较健康';
  } else if (concentration != null && concentration >= 65) {
    state = 'watch';
    summary = '行业资金集中度偏高';
  }

  return {
    state,
    summary,
    as_of_date: latestDate,
    industry_count: currentFlags.length,
    above_ma20_ratio: aboveMa20,
    breadth_change_5d: breadthChange,
    concentration_top5_pct: concentration,
  };
}

function buildLiquidity(rows: PricedSnapshot[]): MarketRiskLiquidity {
  const sorted = [...rows].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const turnover = sorted
    .map((row) => row.turnover_amount)
    .filter((value): value is number => value != null && value > 0);
  const margins = sorted
    .map((row) => row.margin_balance)
    .filter((value): value is number => value != null && value > 0);

  const turnoverChange = turnover.length >= 20
    ? percentChange(average(turnover.slice(-5))!, average(turnover.slice(-20))!)
    : null;
  const turnoverPercentile = turnover.length >= 60
    ? round(turnover.slice(-60).filter((value) => value <= turnover.at(-1)!).length / 60 * 100)
    : null;
  const marginChange = margins.length >= 21
    ? percentChange(margins.at(-1)!, margins.at(-21)!)
    : null;

  if (turnoverChange == null && marginChange == null) {
    return {
      state: 'unavailable',
      summary: '量能与杠杆数据积累中',
      turnover_5d_vs_20d_pct: null,
      turnover_percentile_60d: turnoverPercentile,
      margin_change_20d_pct: null,
    };
  }

  let state: MarketRiskSignalState = 'neutral';
  let summary = '量能与融资变化处于中性区间';
  if (turnoverPercentile != null && turnoverPercentile >= 90 && (marginChange ?? 0) >= 3) {
    state = 'elevated';
    summary = '量能和杠杆同步升温，需留意拥挤';
  } else if ((turnoverChange ?? 0) <= -20 && (marginChange == null || marginChange <= 0)) {
    state = 'watch';
    summary = '量能收缩且杠杆未扩张，流动性支撑转弱';
  } else if ((turnoverChange ?? 0) >= 10 && (marginChange == null || marginChange >= 0)) {
    state = 'supportive';
    summary = '量能改善，杠杆未显示收缩';
  }

  return {
    state,
    summary,
    turnover_5d_vs_20d_pct: turnoverChange == null ? null : round(turnoverChange),
    turnover_percentile_60d: turnoverPercentile,
    margin_change_20d_pct: marginChange == null ? null : round(marginChange),
  };
}

function buildTail(rows: PricedSnapshot[]): MarketRiskTail {
  const closes = [...rows]
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date))
    .map((row) => row.close_price)
    .filter((value): value is number => value != null && value > 0);
  if (closes.length < 21) {
    return {
      state: 'unavailable',
      summary: '指数日线不足，暂不计算尾部风险',
      max_drawdown_60d_pct: null,
      downside_volatility_20d: null,
      expected_shortfall_5pct: null,
    };
  }

  const recentCloses = closes.slice(-60);
  let maxDrawdown: number | null = null;
  if (closes.length >= 60) {
    let peak = recentCloses[0];
    maxDrawdown = 0;
    for (const close of recentCloses) {
      peak = Math.max(peak, close);
      maxDrawdown = Math.min(maxDrawdown, (close / peak - 1) * 100);
    }
  }

  const returns = recentCloses.slice(1).map((close, index) => (close / recentCloses[index] - 1) * 100);
  const downsideReturns = returns.slice(-20).filter((value) => value < 0);
  const downsideVolatility = downsideReturns.length >= 3
    ? Math.sqrt(downsideReturns.reduce((sum, value) => sum + value ** 2, 0) / downsideReturns.length) * Math.sqrt(252)
    : null;
  const sortedReturns = [...returns].sort((a, b) => a - b);
  const worstCount = Math.max(1, Math.ceil(sortedReturns.length * 0.05));
  const expectedShortfall = sortedReturns.length >= 20
    ? average(sortedReturns.slice(0, worstCount))
    : null;

  let state: MarketRiskSignalState = 'neutral';
  let summary = '回撤与下行波动处于可控区间';
  if ((maxDrawdown != null && maxDrawdown <= -12) || (expectedShortfall ?? 0) <= -3.5) {
    state = 'elevated';
    summary = '近期尾部损失扩大，波动压力较高';
  } else if ((maxDrawdown != null && maxDrawdown <= -6) || (downsideVolatility ?? 0) >= 25) {
    state = 'watch';
    summary = '回撤或下行波动抬升，需关注承受范围';
  } else if ((maxDrawdown == null || maxDrawdown > -3) && (downsideVolatility == null || downsideVolatility < 15)) {
    state = 'supportive';
    summary = '近期回撤与下行波动相对平稳';
  }

  return {
    state,
    summary,
    max_drawdown_60d_pct: maxDrawdown == null ? null : round(maxDrawdown),
    downside_volatility_20d: downsideVolatility == null ? null : round(downsideVolatility),
    expected_shortfall_5pct: expectedShortfall == null ? null : round(expectedShortfall, 2),
  };
}

function buildValuation(rows: PricedSnapshot[]): MarketRiskValuation {
  const erpValues = [...rows]
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date))
    .map((row) => row.pe_ttm != null && row.pe_ttm > 0 && row.bond_yield_10y != null
      ? 1 / row.pe_ttm * 100 - row.bond_yield_10y
      : null,
    )
    .filter((value): value is number => value != null);
  const erp = erpValues.at(-1) ?? null;
  const sampleCount = erpValues.length;
  const percentile = sampleCount >= 240 && erp != null
    ? round(erpValues.filter((value) => value <= erp).length / sampleCount * 100)
    : null;

  if (erp == null || percentile == null) {
    return {
      state: 'unavailable',
      summary: 'ERP历史样本不足，暂不评价估值缓冲',
      erp: erp == null ? null : round(erp, 2),
      erp_percentile: null,
      sample_count: sampleCount,
    };
  }

  let state: MarketRiskSignalState = 'neutral';
  let summary = 'ERP位于历史中间区间';
  if (percentile >= 70) {
    state = 'supportive';
    summary = 'ERP历史分位较高，估值缓冲相对充足';
  } else if (percentile <= 20) {
    state = 'watch';
    summary = 'ERP历史分位偏低，估值缓冲较薄';
  }

  return {
    state,
    summary,
    erp: round(erp, 2),
    erp_percentile: percentile,
    sample_count: sampleCount,
  };
}

function rowsByIndex(rows: PricedSnapshot[]): Record<string, PricedSnapshot[]> {
  const grouped: Record<string, PricedSnapshot[]> = {};
  for (const row of rows) {
    if (!grouped[row.index_code]) grouped[row.index_code] = [];
    grouped[row.index_code].push(row);
  }
  for (const code of Object.keys(grouped)) {
    grouped[code].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  }
  return grouped;
}

function buildAdvanceDeclineDimension(marketRows: PricedSnapshot[]): MarketRiskDimension {
  const latest = latestPricedRow(marketRows);
  const rise = latest?.rise_count ?? null;
  const fall = latest?.fall_count ?? null;
  const flat = latest?.flat_count ?? null;
  const traded = rise != null && fall != null ? rise + fall + (flat ?? 0) : null;
  const active = rise != null && fall != null ? rise + fall : null;
  const riseRatio = rise != null && active != null && active > 0 ? round(rise / active * 100) : null;
  const fallRatio = fall != null && active != null && active > 0 ? round(fall / active * 100) : null;
  const advDeclineRatio = rise != null && fall != null && fall > 0 ? round(rise / fall, 2) : null;
  const score = riseRatio == null ? null : clampScore(riseRatio);

  return createDimension(
    'advance_decline',
    '涨跌广度',
    score,
    score == null
      ? '全市场涨跌家数暂未接入'
      : riseRatio >= 60 ? '上涨家数占优，市场体感偏强'
        : riseRatio >= 45 ? '涨跌分布接近均衡'
          : '下跌家数占优，市场体感偏弱',
    [
      metric('rise_count', '上涨家数', rise, rise == null ? '--' : rise.toLocaleString('zh-CN')),
      metric('fall_count', '下跌家数', fall, fall == null ? '--' : fall.toLocaleString('zh-CN')),
      metric('flat_count', '平盘家数', flat, flat == null ? '--' : flat.toLocaleString('zh-CN')),
      metric('traded_count', '统计股票数', traded, traded == null ? '--' : traded.toLocaleString('zh-CN')),
      metric('rise_ratio', '上涨家数占比', riseRatio, formatPct(riseRatio, 0)),
      metric('fall_ratio', '下跌家数占比', fallRatio, formatPct(fallRatio, 0)),
      metric('advance_decline_ratio', '涨跌家数比', advDeclineRatio, advDeclineRatio == null ? '--' : `${advDeclineRatio.toFixed(2)}x`),
      unavailableMetric('limit_up_count', '涨停家数', '未接入全市场个股行情'),
      unavailableMetric('limit_down_count', '跌停家数', '未接入全市场个股行情'),
      unavailableMetric('median_stock_return_pct', '全市场涨跌中位数', '未接入全市场个股行情'),
    ],
  );
}

function buildTrendDimension(allRows: PricedSnapshot[]): MarketRiskDimension {
  const grouped = rowsByIndex(allRows);
  const broadCodes = ['000001', '000300', '000905', '399006', '000688'];
  const changeValues: number[] = [];
  const aboveMa20Flags: boolean[] = [];
  const metrics: MarketRiskMetric[] = [];

  for (const code of broadCodes) {
    const rows = grouped[code] ?? [];
    const latest = latestPricedRow(rows);
    const ma20 = movingAverage(rows, 20);
    const ma60 = movingAverage(rows, 60);
    const change = latest?.change_pct ?? null;
    const ret5 = periodReturn(rows, 5);
    const ret20 = periodReturn(rows, 20);
    const ret60 = periodReturn(rows, 60);
    const aboveMa20 = latest?.close_price != null && ma20 != null ? latest.close_price >= ma20 : null;
    const aboveMa60 = latest?.close_price != null && ma60 != null ? latest.close_price >= ma60 : null;
    if (change != null) changeValues.push(change);
    if (aboveMa20 != null) aboveMa20Flags.push(aboveMa20);
    const name = INDEX_NAMES[code] ?? code;
    metrics.push(
      metric(`${code}_change_pct`, `${name}今日涨跌幅`, change, formatPct(change, 2, true)),
      metric(`${code}_return_5d_pct`, `${name}近5日涨跌幅`, ret5 == null ? null : round(ret5, 2), formatPct(ret5, 2, true)),
      metric(`${code}_return_20d_pct`, `${name}近20日涨跌幅`, ret20 == null ? null : round(ret20, 2), formatPct(ret20, 2, true)),
      metric(`${code}_return_60d_pct`, `${name}近60日涨跌幅`, ret60 == null ? null : round(ret60, 2), formatPct(ret60, 2, true)),
      metric(`${code}_above_ma20`, `${name}站上20日线`, aboveMa20, aboveMa20 == null ? '--' : aboveMa20 ? '是' : '否'),
      metric(`${code}_above_ma60`, `${name}站上60日线`, aboveMa60, aboveMa60 == null ? '--' : aboveMa60 ? '是' : '否'),
    );
  }

  const hs300Ret20 = periodReturn(grouped['000300'] ?? [], 20);
  const csi500Ret20 = periodReturn(grouped['000905'] ?? [], 20);
  const chinextRet20 = periodReturn(grouped['399006'] ?? [], 20);
  const csi500Relative = csi500Ret20 != null && hs300Ret20 != null ? round(csi500Ret20 - hs300Ret20, 2) : null;
  const chinextRelative = chinextRet20 != null && hs300Ret20 != null ? round(chinextRet20 - hs300Ret20, 2) : null;
  metrics.push(
    metric('csi500_vs_hs300_20d_pct', '中证500相对沪深300近20日强弱', csi500Relative, formatPct(csi500Relative, 2, true)),
    metric('chinext_vs_hs300_20d_pct', '创业板指相对沪深300近20日强弱', chinextRelative, formatPct(chinextRelative, 2, true)),
  );

  const avgChange = average(changeValues);
  const aboveRatio = aboveMa20Flags.length > 0 ? aboveMa20Flags.filter(Boolean).length / aboveMa20Flags.length * 100 : null;
  const scoreParts = [
    avgChange == null ? null : 50 + avgChange * 12,
    aboveRatio,
    hs300Ret20 == null ? null : 50 + hs300Ret20 * 2.5,
  ].filter((value): value is number => value != null);
  const score = scoreParts.length === 0 ? null : clampScore(average(scoreParts)!);

  return createDimension(
    'index_trend',
    '指数趋势',
    score,
    score == null
      ? '主要指数趋势数据不足'
      : score >= 65 ? '主要指数趋势偏强'
        : score >= 45 ? '主要指数趋势中性'
          : '主要指数趋势偏弱',
    metrics,
  );
}

function buildTurnoverDimension(marketRows: PricedSnapshot[]): MarketRiskDimension {
  const sorted = [...marketRows].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const turnovers = sorted.map((row) => row.turnover_amount).filter((value): value is number => value != null && value > 0);
  const latestTurnover = turnovers.at(-1) ?? null;
  const avg5 = turnovers.length >= 5 ? average(turnovers.slice(-5)) : null;
  const avg20 = turnovers.length >= 20 ? average(turnovers.slice(-20)) : null;
  const avg60 = turnovers.length >= 60 ? average(turnovers.slice(-60)) : null;
  const median20 = turnovers.length >= 20 ? median(turnovers.slice(-20)) : null;
  const ratio5v20 = avg5 != null && avg20 != null && avg20 > 0 ? round((avg5 / avg20 - 1) * 100) : null;
  const ratioToday20 = latestTurnover != null && avg20 != null && avg20 > 0 ? round(latestTurnover / avg20, 2) : null;
  const ratioToday60 = latestTurnover != null && avg60 != null && avg60 > 0 ? round(latestTurnover / avg60, 2) : null;
  const percentile60 = turnovers.length >= 60 ? percentileRank(turnovers.slice(-60), latestTurnover) : null;
  const percentile120 = turnovers.length >= 120 ? percentileRank(turnovers.slice(-120), latestTurnover) : null;
  const latestChange = sorted.at(-1)?.change_pct ?? null;
  const priorTurnover = turnovers.length >= 2 ? turnovers.at(-2)! : null;
  const turnoverChange = latestTurnover != null && priorTurnover != null ? percentChange(latestTurnover, priorTurnover) : null;
  const volumeUpDays = countConsecutiveChanges(turnovers, 'up');
  const volumeDownDays = countConsecutiveChanges(turnovers, 'down');
  const priceVolumeState = latestChange == null || turnoverChange == null
    ? null
    : latestChange >= 0 && turnoverChange >= 0 ? '放量上涨'
      : latestChange >= 0 ? '缩量上涨'
        : turnoverChange >= 0 ? '放量下跌' : '缩量下跌';
  const scoreParts = [
    percentile60,
    ratio5v20 == null ? null : 50 + ratio5v20,
    ratioToday20 == null ? null : ratioToday20 * 50,
  ].filter((value): value is number => value != null);
  const score = scoreParts.length === 0 ? null : clampScore(average(scoreParts)!);

  return createDimension(
    'turnover',
    '成交热度',
    score,
    score == null
      ? '成交数据积累中'
      : score >= 70 ? '成交活跃度偏高'
        : score >= 45 ? '成交热度处于常态'
          : '成交热度偏低',
    [
      metric('turnover_amount', '全市场成交额', latestTurnover, formatAmountYi(latestTurnover)),
      metric('turnover_5d_avg', '5日成交额均值', avg5 == null ? null : round(avg5), formatAmountYi(avg5)),
      metric('turnover_20d_avg', '20日成交额均值', avg20 == null ? null : round(avg20), formatAmountYi(avg20)),
      metric('turnover_60d_avg', '60日成交额均值', avg60 == null ? null : round(avg60), formatAmountYi(avg60)),
      metric('turnover_20d_median', '20日成交额中位数', median20 == null ? null : round(median20), formatAmountYi(median20)),
      metric('turnover_today_vs_20d', '今日成交额/20日均值', ratioToday20, ratioToday20 == null ? '--' : `${ratioToday20.toFixed(2)}x`),
      metric('turnover_today_vs_60d', '今日成交额/60日均值', ratioToday60, ratioToday60 == null ? '--' : `${ratioToday60.toFixed(2)}x`),
      metric('turnover_5d_vs_20d_pct', '5日成交额较20日', ratio5v20, formatPct(ratio5v20, 0, true)),
      metric('turnover_percentile_60d', '成交额60日分位', percentile60, formatPct(percentile60, 0)),
      metric('turnover_percentile_120d', '成交额120日分位', percentile120, formatPct(percentile120, 0)),
      metric('turnover_change_pct', '成交额较昨日变化', turnoverChange == null ? null : round(turnoverChange), formatPct(turnoverChange, 0, true)),
      metric('price_volume_state', '量价状态', priceVolumeState, priceVolumeState ?? '--'),
      metric('consecutive_volume_up_days', '连续放量天数', volumeUpDays, volumeUpDays == null ? '--' : `${volumeUpDays} 天`),
      metric('consecutive_volume_down_days', '连续缩量天数', volumeDownDays, volumeDownDays == null ? '--' : `${volumeDownDays} 天`),
    ],
  );
}

function buildIndustryDimension(industryRows: SwIndustryDailyRow[], allRows: PricedSnapshot[]): MarketRiskDimension {
  const latestDate = industryRows.map((row) => row.trade_date).sort().at(-1) ?? null;
  const latestRows = latestDate == null ? [] : industryRows.filter((row) => row.trade_date === latestDate);
  const changes = latestRows.map((row) => row.change_pct).filter((value): value is number => value != null);
  const upCount = changes.filter((value) => value > 0).length;
  const downCount = changes.filter((value) => value < 0).length;
  const flatCount = changes.filter((value) => value === 0).length;
  const upRatio = changes.length > 0 ? round(upCount / changes.length * 100) : null;
  const medianChange = median(changes);
  const avgChange = average(changes);
  const gt1 = changes.filter((value) => value >= 1).length;
  const lt1 = changes.filter((value) => value <= -1).length;
  const gt2 = changes.filter((value) => value >= 2).length;
  const lt2 = changes.filter((value) => value <= -2).length;
  const sortedByChange = latestRows
    .filter((row) => row.change_pct != null)
    .sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0));
  const top = sortedByChange.slice(0, 3).map((row) => `${row.industry_name} ${formatPct(row.change_pct, 2, true)}`).join('、') || null;
  const bottom = sortedByChange.slice(-3).reverse().map((row) => `${row.industry_name} ${formatPct(row.change_pct, 2, true)}`).join('、') || null;
  const dispersion = changes.length >= 2
    ? Math.sqrt(changes.reduce((sum, value) => sum + (value - (avgChange ?? 0)) ** 2, 0) / changes.length)
    : null;
  const breadth = buildBreadth(industryRows, []);
  const hs300Ret5 = periodReturn(allRows.filter((row) => row.index_code === '000300'), 5);
  const hs300Ret20 = periodReturn(allRows.filter((row) => row.index_code === '000300'), 20);
  const industryGrouped = new Map<string, SwIndustryDailyRow[]>();
  for (const row of industryRows) {
    const rows = industryGrouped.get(row.industry_code) ?? [];
    rows.push(row);
    industryGrouped.set(row.industry_code, rows);
  }
  const industryRet5 = [...industryGrouped.values()].map((rows) => periodReturnFromRows(rows, 5)).filter((value): value is number => value != null);
  const industryRet20 = [...industryGrouped.values()].map((rows) => periodReturnFromRows(rows, 20)).filter((value): value is number => value != null);
  const beatHs3005Count = hs300Ret5 == null ? null : industryRet5.filter((value) => value > hs300Ret5).length;
  const beatHs30020Count = hs300Ret20 == null ? null : industryRet20.filter((value) => value > hs300Ret20).length;
  const beatHs3005Ratio = beatHs3005Count == null || industryRet5.length === 0 ? null : round(beatHs3005Count / industryRet5.length * 100);
  const beatHs30020Ratio = beatHs30020Count == null || industryRet20.length === 0 ? null : round(beatHs30020Count / industryRet20.length * 100);
  const scoreParts = [
    upRatio,
    breadth.above_ma20_ratio,
    beatHs30020Ratio,
    medianChange == null ? null : 50 + medianChange * 18,
  ].filter((value): value is number => value != null);
  const score = scoreParts.length === 0 ? null : clampScore(average(scoreParts)!);

  return createDimension(
    'industry_diffusion',
    '行业扩散',
    score,
    score == null
      ? '行业涨跌数据不足'
      : score >= 65 ? '上涨扩散到多数行业'
        : score >= 45 ? '行业扩散中性'
          : '行业扩散不足',
    [
      metric('industry_count', '行业统计数量', changes.length || null, changes.length ? String(changes.length) : '--'),
      metric('industry_up_count', '上涨行业数量', upCount, String(upCount)),
      metric('industry_down_count', '下跌行业数量', downCount, String(downCount)),
      metric('industry_flat_count', '平盘行业数量', flatCount, String(flatCount)),
      metric('industry_up_ratio', '行业上涨占比', upRatio, formatPct(upRatio, 0)),
      metric('industry_median_change_pct', '行业涨跌幅中位数', medianChange == null ? null : round(medianChange, 2), formatPct(medianChange, 2, true)),
      metric('industry_avg_change_pct', '行业涨跌幅平均数', avgChange == null ? null : round(avgChange, 2), formatPct(avgChange, 2, true)),
      metric('industry_gt_1pct_count', '涨幅超过1%的行业数量', gt1, String(gt1)),
      metric('industry_lt_1pct_count', '跌幅超过1%的行业数量', lt1, String(lt1)),
      metric('industry_gt_2pct_count', '涨幅超过2%的行业数量', gt2, String(gt2)),
      metric('industry_lt_2pct_count', '跌幅超过2%的行业数量', lt2, String(lt2)),
      metric('top_industries', '涨幅前三行业', top, top ?? '--'),
      metric('bottom_industries', '跌幅前三行业', bottom, bottom ?? '--'),
      metric('industry_dispersion', '行业涨跌分化度', dispersion == null ? null : round(dispersion, 2), dispersion == null ? '--' : dispersion.toFixed(2)),
      metric('industry_above_ma20_ratio', '站上20日线行业占比', breadth.above_ma20_ratio, formatPct(breadth.above_ma20_ratio, 0)),
      metric('industry_breadth_change_5d', '行业20日线广度近5日变化', breadth.breadth_change_5d, formatPct(breadth.breadth_change_5d, 0, true)),
      metric('industry_beat_hs300_5d_count', '近5日跑赢沪深300行业数量', beatHs3005Count, beatHs3005Count == null ? '--' : String(beatHs3005Count)),
      metric('industry_beat_hs300_5d_ratio', '近5日跑赢沪深300行业占比', beatHs3005Ratio, formatPct(beatHs3005Ratio, 0)),
      metric('industry_beat_hs300_20d_count', '近20日跑赢沪深300行业数量', beatHs30020Count, beatHs30020Count == null ? '--' : String(beatHs30020Count)),
      metric('industry_beat_hs300_20d_ratio', '近20日跑赢沪深300行业占比', beatHs30020Ratio, formatPct(beatHs30020Ratio, 0)),
      unavailableMetric('industry_above_ma60_ratio', '站上60日线行业占比'),
      unavailableMetric('industry_60d_high_count', '60日新高行业数量'),
      unavailableMetric('industry_60d_low_count', '60日新低行业数量'),
    ],
  );
}

function buildFlowDimension(
  marketRows: PricedSnapshot[],
  allRows: PricedSnapshot[],
  industryFlows: IndustryFundFlowRow[],
  sentimentRows: MarketSentimentDailyRow[] = [],
): MarketRiskDimension {
  const latestFlowDate = industryFlows.map((row) => row.trade_date).sort().at(-1) ?? null;
  const latestFlows = latestFlowDate == null ? [] : industryFlows.filter((row) => row.trade_date === latestFlowDate);
  const netValues = latestFlows.map((row) => row.main_net_inflow).filter((value): value is number => value != null);
  const netTotal = netValues.length > 0 ? netValues.reduce((sum, value) => sum + value, 0) : null;
  const inflowCount = netValues.filter((value) => value > 0).length;
  const outflowCount = netValues.filter((value) => value < 0).length;
  const inflowRatio = netValues.length > 0 ? round(inflowCount / netValues.length * 100) : null;
  const medianNet = median(netValues);
  const flowTotalsByDate = [...industryFlows.reduce((grouped, row) => {
    if (row.main_net_inflow == null) return grouped;
    grouped.set(row.trade_date, (grouped.get(row.trade_date) ?? 0) + row.main_net_inflow);
    return grouped;
  }, new Map<string, number>()).entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([, value]) => value);
  const netTotal5 = flowTotalsByDate.length >= 5 ? average(flowTotalsByDate.slice(-5)) : null;
  const priorNetTotal5 = flowTotalsByDate.length >= 10 ? average(flowTotalsByDate.slice(-10, -5)) : null;
  const netTotal5Change = netTotal5 != null && priorNetTotal5 != null ? netTotal5 - priorNetTotal5 : null;
  const consecutiveNetInflowDays = countConsecutiveSigns(flowTotalsByDate, 'positive');
  const consecutiveNetOutflowDays = countConsecutiveSigns(flowTotalsByDate, 'negative');
  const sortedInflow = latestFlows
    .filter((row) => row.main_net_inflow != null)
    .sort((a, b) => (b.main_net_inflow ?? 0) - (a.main_net_inflow ?? 0));
  const topInflow = sortedInflow.slice(0, 3).map((row) => `${row.board_name} ${formatFlowWan(row.main_net_inflow)}`).join('、') || null;
  const topOutflow = sortedInflow.slice(-3).reverse().map((row) => `${row.board_name} ${formatFlowWan(row.main_net_inflow)}`).join('、') || null;
  const absValues = netValues.map(Math.abs).sort((a, b) => b - a);
  const absTotal = absValues.reduce((sum, value) => sum + value, 0);
  const concentration = absValues.length >= 5 && absTotal > 0
    ? round(absValues.slice(0, 5).reduce((sum, value) => sum + value, 0) / absTotal * 100)
    : null;
  const sortedMarket = [...marketRows].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const marginValues = sortedMarket.map((row) => row.margin_balance).filter((value): value is number => value != null && value > 0);
  const marginChange20 = marginValues.length >= 21 ? percentChange(marginValues.at(-1)!, marginValues.at(-21)!) : null;
  const northboundValues = [...allRows]
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date))
    .map((row) => row.northbound_amt)
    .filter((value): value is number => value != null);
  const northboundLatest = northboundValues.at(-1) ?? null;
  const northbound5 = northboundValues.length >= 5 ? average(northboundValues.slice(-5)) : null;
  const marketFlowRows = sentimentRows
    .filter((row) => row.main_net_inflow != null)
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const latestMarketFlow = marketFlowRows.at(-1)?.main_net_inflow ?? null;
  const marketFlow5 = marketFlowRows.length >= 5
    ? average(marketFlowRows.slice(-5).map((row) => row.main_net_inflow!).filter(Number.isFinite))
    : null;
  const scoreParts = [
    inflowRatio,
    marginChange20 == null ? null : 50 + marginChange20 * 8,
    netTotal == null ? null : netTotal > 0 ? 65 : 35,
    latestMarketFlow == null ? null : latestMarketFlow > 0 ? 65 : 35,
  ].filter((value): value is number => value != null);
  const score = scoreParts.length === 0 ? null : clampScore(average(scoreParts)!);

  return createDimension(
    'fund_flow',
    '资金流向',
    score,
    score == null
      ? '资金流向数据不足'
      : score >= 65 ? '资金流入覆盖较广'
        : score >= 45 ? '资金流向分歧'
          : '资金流出压力偏高',
    [
      metric('industry_flow_net_total', '行业主力资金净流入合计', netTotal, formatFlowWan(netTotal)),
      metric('industry_flow_in_count', '主力净流入行业数量', inflowCount, String(inflowCount)),
      metric('industry_flow_out_count', '主力净流出行业数量', outflowCount, String(outflowCount)),
      metric('industry_flow_in_ratio', '主力资金净流入覆盖率', inflowRatio, formatPct(inflowRatio, 0)),
      metric('industry_flow_median', '行业主力资金净流入中位数', medianNet, formatFlowWan(medianNet)),
      metric('industry_flow_net_5d_avg', '行业主力资金5日均值', netTotal5, formatFlowWan(netTotal5)),
      metric('industry_flow_net_5d_change', '行业主力资金5日均值变化', netTotal5Change, formatFlowWan(netTotal5Change)),
      metric('industry_flow_consecutive_in_days', '行业资金连续净流入天数', consecutiveNetInflowDays, consecutiveNetInflowDays == null ? '--' : `${consecutiveNetInflowDays} 天`),
      metric('industry_flow_consecutive_out_days', '行业资金连续净流出天数', consecutiveNetOutflowDays, consecutiveNetOutflowDays == null ? '--' : `${consecutiveNetOutflowDays} 天`),
      metric('industry_flow_concentration_top5', '前五行业资金流集中度', concentration, formatPct(concentration, 0)),
      metric('industry_top_inflow', '资金流入最多行业', topInflow, topInflow ?? '--'),
      metric('industry_top_outflow', '资金流出最多行业', topOutflow, topOutflow ?? '--'),
      metric('margin_change_20d_pct', '融资余额近20日变化', marginChange20 == null ? null : round(marginChange20, 1), formatPct(marginChange20, 1, true)),
      metric('northbound_latest', '北向资金成交额', northboundLatest, formatFlowWan(northboundLatest)),
      metric('northbound_5d_avg', '北向资金成交额5日均值', northbound5 == null ? null : round(northbound5), formatFlowWan(northbound5)),
      metric('market_main_net_inflow', '全市场主力净流入', latestMarketFlow, formatFlowWan(latestMarketFlow)),
      metric('market_main_net_inflow_5d_avg', '全市场主力净流入5日均值', marketFlow5, formatFlowWan(marketFlow5)),
      unavailableMetric('etf_net_inflow', 'ETF资金净流入'),
      unavailableMetric('broad_etf_net_inflow', '宽基ETF净流入'),
      unavailableMetric('theme_etf_net_inflow', '主题ETF净流入'),
    ],
  );
}

function buildValuationDimension(valuation: MarketRiskValuation, indexRows: PricedSnapshot[]): MarketRiskDimension {
  const latest = latestPricedRow(indexRows);
  const pe = latest?.pe_ttm ?? null;
  const bondYield = latest?.bond_yield_10y ?? null;
  const earningsYield = pe != null && pe > 0 ? round(1 / pe * 100, 2) : null;
  const score = valuation.erp_percentile == null ? null : clampScore(valuation.erp_percentile);

  return createDimension(
    'valuation',
    '估值位置',
    score,
    score == null
      ? '估值历史样本不足'
      : score >= 70 ? '估值缓冲相对充足'
        : score >= 35 ? '估值处于中间区间'
          : '估值缓冲偏薄',
    [
      metric('hs300_pe_ttm', '沪深300 PE TTM', pe, pe == null ? '--' : pe.toFixed(2)),
      metric('bond_yield_10y', '10年国债收益率', bondYield, formatPct(bondYield, 2)),
      metric('earnings_yield', '沪深300盈利收益率 E/P', earningsYield, formatPct(earningsYield, 2)),
      metric('erp', '沪深300 ERP', valuation.erp, formatPct(valuation.erp, 2)),
      metric('erp_percentile', 'ERP历史分位数', valuation.erp_percentile, formatPct(valuation.erp_percentile, 0)),
      metric('erp_sample_count', 'ERP统计样本数', valuation.sample_count, String(valuation.sample_count)),
      unavailableMetric('hs300_pb_percentile', '沪深300 PB历史分位数'),
      unavailableMetric('csi500_pe_percentile', '中证500 PE历史分位数'),
      unavailableMetric('csi1000_pe_percentile', '中证1000 PE历史分位数'),
      unavailableMetric('all_a_pe_percentile', '全A PE历史分位数'),
      unavailableMetric('low_valuation_index_count', '低估指数数量'),
      unavailableMetric('high_valuation_index_count', '高估指数数量'),
    ],
  );
}

function buildRiskPressureDimension(
  tail: MarketRiskTail,
  marketRows: PricedSnapshot[],
  industryRows: SwIndustryDailyRow[],
  sentimentRows: MarketSentimentDailyRow[] = [],
): MarketRiskDimension {
  const latest = latestPricedRow(marketRows);
  const latestDate = industryRows.map((row) => row.trade_date).sort().at(-1) ?? null;
  const latestIndustry = latestDate == null ? [] : industryRows.filter((row) => row.trade_date === latestDate);
  const industryChanges = latestIndustry.map((row) => row.change_pct).filter((value): value is number => value != null);
  const industryDownRatio = industryChanges.length > 0
    ? round(industryChanges.filter((value) => value < 0).length / industryChanges.length * 100)
    : null;
  const drawdownPressure = tail.max_drawdown_60d_pct == null ? null : Math.abs(tail.max_drawdown_60d_pct) * 4;
  const downsideVolPressure = tail.downside_volatility_20d == null ? null : tail.downside_volatility_20d * 2;
  const expectedShortfallPressure = tail.expected_shortfall_5pct == null ? null : Math.abs(tail.expected_shortfall_5pct) * 18;
  const qvixRows = sentimentRows
    .filter((row) => row.qvix_close != null && row.qvix_close > 0)
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const latestQvix = qvixRows.at(-1)?.qvix_close ?? null;
  const qvixPressure = latestQvix == null ? null : latestQvix >= 35 ? 90 : latestQvix <= 15 ? 10 : 10 + (latestQvix - 15) * 4;
  const pressureParts = [drawdownPressure, downsideVolPressure, expectedShortfallPressure, industryDownRatio, qvixPressure]
    .filter((value): value is number => value != null);
  const score = pressureParts.length === 0 ? null : clampScore(average(pressureParts)!);

  return createDimension(
    'risk_pressure',
    '风险压力',
    score,
    score == null
      ? '风险压力数据不足'
      : score >= 70 ? '回撤或波动压力偏高'
        : score >= 45 ? '风险压力中等'
          : '风险压力较低',
    [
      metric('market_change_pct', '上证指数今日涨跌幅', latest?.change_pct ?? null, formatPct(latest?.change_pct ?? null, 2, true)),
      metric('max_drawdown_60d_pct', '沪深300近60日最大回撤', tail.max_drawdown_60d_pct, formatPct(tail.max_drawdown_60d_pct, 1)),
      metric('downside_volatility_20d', '沪深300近20日向下波动', tail.downside_volatility_20d, formatPct(tail.downside_volatility_20d, 1)),
      metric('expected_shortfall_5pct', '最差5%交易日平均跌幅', tail.expected_shortfall_5pct, formatPct(tail.expected_shortfall_5pct, 2)),
      metric('industry_down_ratio', '下跌行业占比', industryDownRatio, formatPct(industryDownRatio, 0)),
      metric('qvix_close', '300ETF QVIX收盘值', latestQvix, formatNumber(latestQvix, 2)),
      unavailableMetric('down_5pct_stock_count', '跌幅超过5%的股票数量'),
      unavailableMetric('limit_down_count', '跌停家数'),
      unavailableMetric('new_60d_low_stock_count', '60日新低股票数量'),
      unavailableMetric('limit_up_minus_down', '涨停家数-跌停家数'),
      unavailableMetric('limit_break_rate', '炸板率'),
      unavailableMetric('high_momentum_loss_effect', '高位股亏钱效应'),
    ],
  );
}

function buildTemperature(
  marketRows: PricedSnapshot[],
  allRows: PricedSnapshot[],
  industryRows: SwIndustryDailyRow[],
  industryFlows: IndustryFundFlowRow[],
  valuation: MarketRiskValuation,
  tail: MarketRiskTail,
  sentimentRows: MarketSentimentDailyRow[] = [],
): MarketRiskResponse['temperature'] {
  const dimensions = [
    buildAdvanceDeclineDimension(marketRows),
    buildTrendDimension(allRows.length > 0 ? allRows : marketRows),
    buildTurnoverDimension(marketRows),
    buildIndustryDimension(industryRows, allRows.length > 0 ? allRows : marketRows),
    buildFlowDimension(marketRows, allRows, industryFlows, sentimentRows),
    buildValuationDimension(valuation, allRows.filter((row) => row.index_code === '000300')),
    buildRiskPressureDimension(tail, marketRows, industryRows, sentimentRows),
  ];
  const availableDimensions = dimensions.filter((item) => item.score != null);
  const totalMetricCount = dimensions.reduce((sum, item) => sum + item.metrics.length, 0);
  const missingMetricCount = dimensions.reduce(
    (sum, item) => sum + item.metrics.filter((metricItem) => metricItem.status === 'missing').length,
    0,
  );
  if (availableDimensions.length === 0) {
    return {
      score: null,
      band: 'unavailable',
      label: labelFromBand('unavailable'),
      summary: '市场温度数据仍在积累',
      available_dimension_count: 0,
      total_dimension_count: dimensions.length,
      missing_metric_count: totalMetricCount,
      dimensions,
    };
  }

  const scoreParts = dimensions
    .map((item) => item.key === 'risk_pressure' && item.score != null ? 100 - item.score : item.score)
    .filter((value): value is number => value != null);
  const score = clampScore(average(scoreParts)!);
  const band = bandFromScore(score);
  return {
    score,
    band,
    label: labelFromBand(band),
    summary: band === 'hot' ? '市场温度偏高，需要同时观察拥挤和风险压力'
      : band === 'warm' ? '市场处于偏暖状态，修复质量取决于量能和扩散'
        : band === 'neutral' ? '市场温度中性，强弱线索仍然分散'
          : band === 'cool' ? '市场偏冷，风险偏好仍不足'
            : '市场极冷，关注流动性和风险压力是否缓和',
    available_dimension_count: availableDimensions.length,
    total_dimension_count: dimensions.length,
    missing_metric_count: missingMetricCount,
    dimensions,
  };
}

function overallState(states: MarketRiskSignalState[]): { state: MarketRiskLevel; summary: string } {
  const available = states.filter((state) => state !== 'unavailable');
  if (available.length < 2) {
    return { state: 'unavailable', summary: '风险数据仍在积累，暂不生成综合状态' };
  }
  const score = available.reduce((sum, state) => sum + stateScore(state), 0);
  if (score >= 4) return { state: 'elevated', summary: '多个风险维度处于高压区间' };
  if (score >= 2) return { state: 'fragile', summary: '结构、流动性或估值出现压力' };
  if (available.filter((state) => state === 'supportive').length >= 3) {
    return { state: 'calm', summary: '主要风险维度总体平稳' };
  }
  return { state: 'balanced', summary: '主要风险维度处于均衡区间' };
}

export function buildMarketRisk(
  indexRows: PricedSnapshot[],
  marketRows: PricedSnapshot[],
  allMarketRows: PricedSnapshot[],
  industryRows: SwIndustryDailyRow[],
  industryFlows: IndustryFundFlowRow[],
  sentimentRows: MarketSentimentDailyRow[] = [],
): Omit<MarketRiskResponse, 'generated_at'> {
  const breadth = buildBreadth(industryRows, industryFlows);
  const liquidity = buildLiquidity(marketRows);
  const tail = buildTail(indexRows);
  const valuation = buildValuation(indexRows);
  const overall = overallState([breadth.state, liquidity.state, tail.state, valuation.state]);
  const primaryRows = [...indexRows].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const temperature = buildTemperature(
    marketRows,
    allMarketRows.length > 0 ? allMarketRows : [...indexRows, ...marketRows],
    industryRows,
    industryFlows,
    valuation,
    tail,
    sentimentRows,
  );

  return {
    trade_date: primaryRows.at(-1)?.trade_date ?? null,
    state: overall.state,
    summary: overall.summary,
    available_component_count: [breadth, liquidity, tail, valuation]
      .filter((component) => component.state !== 'unavailable').length,
    temperature,
    breadth,
    liquidity,
    tail,
    valuation,
  };
}
