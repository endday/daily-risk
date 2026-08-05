// ============================================
// Daily Risk - Shared Type Definitions
// ============================================

export interface NormalizedEvent {
  event_key: string;
  source: string;
  title: string;
  display_name: string;
  description?: string;
  event_date: string;
  event_time?: string;
  timezone: string;
  event_datetime_utc?: string;
  country: string;
  importance: number;
  market_impact?: string[];
  release_id?: number;
  series_id?: string;
  symbol?: string;
  period?: string;
  display_format?: string;
  previous_value?: string;
  actual_value?: string;
  forecast_value?: string;
  confidence?: 'confirmed' | 'estimated';
  source_url?: string;
  raw_json?: string;
  raw_text?: string;
}

export interface RiskEvent {
  event_key: string;
  score: number;
  display_name: string;
  description?: string | null;
  previous_value: string | null;
  actual_value: string | null;
  forecast_value?: string | null;
  confidence: 'confirmed' | 'estimated';
  source_url?: string | null;
  event_time: string | null;
  timezone: string;
  country: string;
  market_impact: string[];
  status: string;
  source: string;
}

export interface HolidayEntry {
  date: string;
  name: string;
  is_trading_day: boolean;  // false = 休市（法定假日），true = 补班（周末变交易日）
}

export interface DayResponse {
  date: string;
  timezone: string;
  risk_index: number;
  events: RiskEvent[];
  updated_at: string;
  calendar_effects?: CalendarEffects;
  holidays?: HolidayEntry[];
}

export interface TodayTomorrowResponse {
  timezone: string;
  days: { date: string; risk_index: number; events: RiskEvent[] }[];
}

export interface RiskRule {
  display_name: string;
  score: number;
  country: string;
  time?: string;
  timezone: string;
  market_impact: string[];
  calendar_source: string;
  value_source?: string;
  fred_release_id?: number;
  fred_series?: string;
  fred_units?: string;
  symbol?: string;
  display_format: string;
}

export interface RiskRulesConfig {
  rules: Record<string, RiskRule>;
}

export interface ChinaEvent {
  event_key: string;
  title: string;
  date: string;
  time: string;
  country: string;
  importance: number;
  value_source: string;
  official_source: string;
}

export interface ChinaEventsConfig {
  year: number;
  source: string;
  timezone: string;
  events: ChinaEvent[];
}

// ============================================
// Calendar Effects Types
// ============================================

export interface CalendarDayStat {
  day: number;
  sample_count: number;
  up_probability: number;
  avg_change_pct: number;
  z_score?: number;
  rating?: number;
}

export interface CalendarMonthStat {
  month: number;
  sample_count: number;
  up_probability: number;
  avg_change_pct: number;
  volatility: number;
  label: string | null;
  confidence: number;
  z_score?: number;
  rating?: number;
  decay?: {
    recent_5y?: { up_probability: number; avg_change_pct: number; sample_count: number };
    recent_10y?: { up_probability: number; avg_change_pct: number; sample_count: number };
  };
  streaks?: {
    avg_up_streak: number;
    avg_down_streak: number;
    max_up_streak: number;
    max_down_streak: number;
  };
}

export interface CalendarToday {
  day_of_month: number;
  up_probability: number;
  avg_change_pct: number;
  sample_count: number;
  z_score?: number;
  rating?: number;
}

export interface CalendarThisMonth {
  month: number;
  up_probability: number;
  avg_change_pct: number;
  label: string | null;
  z_score?: number;
  rating?: number;
  volatility: number;
  decay?: CalendarMonthStat['decay'];
  streaks?: CalendarMonthStat['streaks'];
}

export interface CalendarBannerData {
  key: string;
  name: string;
  icon: string;
  text: string;
}

export interface IndexMonthlyData {
  name: string;
  data: {
    month: number;
    up_probability: number;
    avg_change_pct: number;
    label: string | null;
    z_score?: number;
    rating?: number;
  }[];
}

export interface IndicesMonthlyData {
  '000001'?: IndexMonthlyData;
  '000300'?: IndexMonthlyData;
  '000905'?: IndexMonthlyData;
}

export interface SpecialEffectStats {
  spring_festival?: {
    aggregate: {
      pre_5d?: { up_probability: number; avg_change_pct: number; total: number };
      post_5d?: { up_probability: number; avg_change_pct: number; total: number };
    };
  };
  turn_of_month?: {
    window: { up_probability: number; avg_change_pct: number };
    non_window: { up_probability: number; avg_change_pct: number };
    premium: { up_probability_diff: number; avg_change_diff_pct: number };
  };
  two_sessions?: {
    pre?: { up_probability: number; avg_change_pct: number };
    during?: { up_probability: number; avg_change_pct: number };
    post?: { up_probability: number; avg_change_pct: number };
  };
  earnings_season?: {
    q1_annual?: { month: number; up_probability: number; avg_change_pct: number; volatility: number };
    h1?: { month: number; up_probability: number; avg_change_pct: number; volatility: number };
    q3?: { month: number; up_probability: number; avg_change_pct: number; volatility: number };
  };
}

export interface NextTradingDay {
  date: string;
  day_of_month: number;
  up_probability: number;
  avg_change_pct: number;
  rating: number;
  sample_count: number;
}

export interface AlmanacSignal {
  action: 'add' | 'hold' | 'reduce';
  label: string;
  description: string;
}

export interface AlmanacDimension {
  rating: number;
  signal: AlmanacSignal;
}

export interface Almanac {
  short_term: AlmanacDimension;  // 短线：明日评分 → 今日操作
  swing: AlmanacDimension;       // 波段：下月评分 → 本月操作
  advice: string;                // 综合操作建议
}

export interface IndexAlmanacData {
  name: string;
  almanac: Almanac;
  today_prob: number;
  today_sample_count: number;
  next_day_prob: number;
  next_day_sample_count: number;
  this_month_prob: number;
  this_month_sample_count: number;
  next_month_prob: number;
  next_month_sample_count: number;
}

export interface AlmanacByIndex {
  '000001'?: IndexAlmanacData;
  '000300'?: IndexAlmanacData;
  '000905'?: IndexAlmanacData;
  '399006'?: IndexAlmanacData;
}

export interface CalendarEffects {
  today: CalendarToday;
  this_month: CalendarThisMonth;
  next_trading_day: NextTradingDay;
  almanac: Almanac;
  almanac_by_index?: AlmanacByIndex;
  daily_calendar: CalendarDayStat[];
  all_months: CalendarMonthStat[];
  indices_monthly?: IndicesMonthlyData;
  special_effect_stats?: SpecialEffectStats;
  active_banner: CalendarBannerData | null;
  yearly_overview: {
    best_month: { month: number; up_probability: number; label: string | null };
    worst_month: { month: number; up_probability: number; label: string | null };
  };
}

export interface MarketSnapshotRowLike {
  trade_date: string;
  index_code: string;
  close_price: number | null;
  change_pct: number | null;
  rise_count: number | null;
  fall_count: number | null;
  flat_count: number | null;
  turnover_amount: number | null;
  turnover_rate: number | null;
  volatility_20d: number | null;
  northbound_amt: number | null;
  pe_ttm: number | null;
  pb: number | null;
  margin_balance: number | null;
  bond_yield_10y: number | null;
  us_2y_yield: number | null;
  fed_funds_rate: number | null;
  usd_index: number | null;
  oil_wti: number | null;
  us_yield_spread: number | null;
  total_market_cap: number | null;
}

export interface MarketSnapshot extends MarketSnapshotRowLike {
  northbound_num?: number | null;
}

export interface MarketSentimentDailyRow {
  trade_date: string;
  provider: string;
  qvix_close: number | null;
  qvix_change_pct: number | null;
  market_close_price: number | null;
  market_change_pct: number | null;
  main_net_inflow: number | null;
  small_net_inflow: number | null;
  medium_net_inflow: number | null;
  large_net_inflow: number | null;
  super_large_net_inflow: number | null;
  main_net_inflow_ratio: number | null;
  source_updated_at: string | null;
}

export interface TemperatureDerived {
  advance_decline_ratio: number | null;
  advance_decline_label: string | null;
  turnover_5d_avg: number | null;
  turnover_20d_avg: number | null;
  turnover_trend: string | null;
  northbound_5d_avg: number | null;
  northbound_20d_avg: number | null;
  northbound_trend: string | null;
  volatility_label: string | null;
  qvix_close: number | null;
  qvix_change_pct: number | null;
  qvix_percentile: number | null;
  qvix_label: string | null;
  market_net_inflow: number | null;
  market_net_inflow_5d_avg: number | null;
  market_flow_label: string | null;
  margin_balance_yi: number | null;
  pe_ttm: number | null;
  pe_percentile: number | null;
  pe_label: string | null;
  erp: number | null;
  erp_label: string | null;
  total_market_cap: number | null;
  buffett_ratio: number | null;
  buffett_label: string | null;
  us_2y_yield: number | null;
  fed_funds_rate: number | null;
  usd_index: number | null;
  usd_trend: string | null;
  oil_wti: number | null;
  us_yield_spread: number | null;
  yield_curve_label: string | null;
}

export interface MarketTemperatureResponse {
  trade_date: string;
  latest: MarketSnapshot[];
  derived: TemperatureDerived;
  history: MarketSnapshot[];
  history_days: number;
  sentiment_history?: MarketSentimentDailyRow[];
}

export interface MarketTemperatureCompactResponse {
  trade_date: string;
  latest: MarketSnapshot[];
  derived: TemperatureDerived;
  history: MarketSnapshot[];
  history_days: number;
  compact: true;
  index_code: string;
  sampled?: boolean;
  sample_step?: number;
  sentiment_history?: MarketSentimentDailyRow[];
}

export type MarketRiskLevel = 'unavailable' | 'calm' | 'balanced' | 'fragile' | 'elevated';
export type MarketRiskSignalState = 'unavailable' | 'supportive' | 'neutral' | 'watch' | 'elevated';
export type MarketTemperatureBand = 'unavailable' | 'cold' | 'cool' | 'neutral' | 'warm' | 'hot';
export type MarketMetricStatus = 'available' | 'missing';

export interface MarketRiskMetric {
  key: string;
  label: string;
  value: number | string | boolean | null;
  display_value: string;
  status: MarketMetricStatus;
  description?: string;
}

export interface MarketRiskDimension {
  key: string;
  label: string;
  score: number | null;
  band: MarketTemperatureBand;
  summary: string;
  metrics: MarketRiskMetric[];
}

export interface MarketRiskTemperature {
  score: number | null;
  band: MarketTemperatureBand;
  label: string;
  summary: string;
  available_dimension_count: number;
  total_dimension_count: number;
  missing_metric_count: number;
  dimensions: MarketRiskDimension[];
}

export interface MarketRiskBreadth {
  state: MarketRiskSignalState;
  summary: string;
  as_of_date: string | null;
  industry_count: number;
  above_ma20_ratio: number | null;
  breadth_change_5d: number | null;
  concentration_top5_pct: number | null;
}

export interface MarketRiskLiquidity {
  state: MarketRiskSignalState;
  summary: string;
  turnover_5d_vs_20d_pct: number | null;
  turnover_percentile_60d: number | null;
  margin_change_20d_pct: number | null;
}

export interface MarketRiskTail {
  state: MarketRiskSignalState;
  summary: string;
  max_drawdown_60d_pct: number | null;
  downside_volatility_20d: number | null;
  expected_shortfall_5pct: number | null;
}

export interface MarketRiskValuation {
  state: MarketRiskSignalState;
  summary: string;
  erp: number | null;
  erp_percentile: number | null;
  sample_count: number;
}

export interface MarketRiskResponse {
  trade_date: string | null;
  generated_at: string;
  state: MarketRiskLevel;
  summary: string;
  available_component_count: number;
  temperature?: MarketRiskTemperature;
  breadth: MarketRiskBreadth;
  liquidity: MarketRiskLiquidity;
  tail: MarketRiskTail;
  valuation: MarketRiskValuation;
}

export type RotationPeriod = 'week' | 'month' | 'half_year';

export interface IndustryRotationMetric {
  board_code: string;
  board_name: string;
  trading_days: number;
  avg_turnover_amount: number;
  period_return_pct: number | null;
  log_bias_20_pct: number | null;
}

export interface IndustryRotationWindow {
  trading_days: number;
  industries: IndustryRotationMetric[];
}

export interface IndustryRotationMatrixResponse {
  trade_date: string;
  industry_count: number;
  annual_available: boolean;
  windows: Record<RotationPeriod, IndustryRotationWindow>;
}

export type RelativeStrengthState = 'unavailable' | 'normal' | 'strong' | 'overheated' | 'weak' | 'oversold';

export interface InstrumentQualityStats {
  instrument_code: string;
  instrument_name: string;
  row_count: number;
  valid_close_count: number;
  missing_close_count: number;
  non_positive_close_count: number;
  duplicate_date_count: number;
  first_date: string | null;
  latest_date: string | null;
  return_20d: number | null;
  return_60d: number | null;
  return_120d: number | null;
  return_252d: number | null;
  volatility_20d: number | null;
  max_drawdown_pct: number | null;
  window_available: Record<'20' | '60' | '120' | '242' | '252', boolean>;
}

export interface RelativeForwardStats {
  horizon_days: 5 | 20 | 60;
  sample_count: number;
  avg_relative_return_pct: number | null;
  positive_probability: number | null;
  max_favorable_pct: number | null;
  max_adverse_pct: number | null;
}

export interface RelativeStrengthPair {
  pair_key: string;
  numerator_code: string;
  numerator_name: string;
  denominator_code: string;
  denominator_name: string;
  trade_date: string | null;
  aligned_sample_count: number;
  first_aligned_date: string | null;
  relative_return_20d: number | null;
  relative_return_60d: number | null;
  relative_return_120d: number | null;
  relative_return_252d: number | null;
  spread_return_40d: number | null;
  log_bias_20_pct: number | null;
  rsi_14: number | null;
  zscore_242: number | null;
  historical_percentile: number | null;
  state: RelativeStrengthState;
  state_changed_at: string | null;
  forward_stats: RelativeForwardStats[];
}

export interface RelativeStrengthResponse {
  trade_date: string | null;
  generated_at: string;
  base_code: string | null;
  quality: InstrumentQualityStats[];
  pairs: RelativeStrengthPair[];
}

export type ValuationCategory = 'broad' | 'industry' | 'theme' | 'strategy';
export type ValuationRankState = 'low' | 'below_average' | 'fair' | 'high' | 'unavailable';

export interface ValuationRankingItem {
  rank: number | null;
  code: string;
  name: string;
  category: ValuationCategory;
  pe_history_supported: boolean;
  state: ValuationRankState;
  latest_pe_ttm: number | null;
  pe_percentile: number | null;
  pe_sample_count: number;
  return_20d_pct: number | null;
  max_drawdown_60d_pct: number | null;
  latest_close_price: number | null;
  as_of_date: string | null;
}

export interface ValuationRankingResponse {
  trade_date: string | null;
  generated_at: string;
  methodology: 'pe_ttm_historical_percentile';
  minimum_pe_samples: number;
  rankable_count: number;
  items: ValuationRankingItem[];
}

export type DataHealthState = 'healthy' | 'partial' | 'stale' | 'unavailable';

export interface DataHealthDataset {
  key: string;
  label: string;
  source: string;
  source_url: string;
  state: DataHealthState;
  record_count: number;
  min_trade_date: string | null;
  latest_trade_date: string | null;
  source_updated_at: string | null;
  trading_days_behind: number | null;
  expected_series_count?: number;
  available_series_count?: number;
  last_run_status: string | null;
  last_success_at: string | null;
  last_records_upserted: number | null;
  error: string | null;
}

export interface DataHealthCollector {
  provider: string;
  run_type: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  last_success_at: string | null;
  records_upserted: number;
  error: string | null;
}

export interface DataHealthResponse {
  generated_at: string;
  expected_latest_trading_date: string;
  datasets: DataHealthDataset[];
  collectors: DataHealthCollector[];
}

export interface ChinaGdpData {
  data: Record<string, number>;
}
