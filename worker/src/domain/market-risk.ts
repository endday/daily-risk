import type {
  MarketRiskBreadth,
  MarketRiskLevel,
  MarketRiskLiquidity,
  MarketRiskResponse,
  MarketRiskSignalState,
  MarketRiskTail,
  MarketRiskValuation,
  MarketSnapshotRowLike,
} from '../../../shared/types';
import type { IndustryFundFlowRow, SwIndustryDailyRow } from '../collectors/base';

type PricedSnapshot = Pick<MarketSnapshotRowLike, 'trade_date' | 'close_price' | 'turnover_amount' | 'margin_balance' | 'pe_ttm' | 'bond_yield_10y'>;

function round(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
  industryRows: SwIndustryDailyRow[],
  industryFlows: IndustryFundFlowRow[],
): Omit<MarketRiskResponse, 'generated_at'> {
  const breadth = buildBreadth(industryRows, industryFlows);
  const liquidity = buildLiquidity(marketRows);
  const tail = buildTail(indexRows);
  const valuation = buildValuation(indexRows);
  const overall = overallState([breadth.state, liquidity.state, tail.state, valuation.state]);
  const primaryRows = [...indexRows].sort((a, b) => a.trade_date.localeCompare(b.trade_date));

  return {
    trade_date: primaryRows.at(-1)?.trade_date ?? null,
    state: overall.state,
    summary: overall.summary,
    available_component_count: [breadth, liquidity, tail, valuation]
      .filter((component) => component.state !== 'unavailable').length,
    breadth,
    liquidity,
    tail,
    valuation,
  };
}
