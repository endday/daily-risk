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

export interface DayResponse {
  date: string;
  timezone: string;
  risk_index: number;
  events: RiskEvent[];
  updated_at: string;
  calendar_effects?: CalendarEffects;
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

export interface CalendarEffects {
  today: CalendarToday;
  this_month: CalendarThisMonth;
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
