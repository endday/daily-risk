// ============================================
// Daily Risk - Shared Type Definitions
// ============================================

export interface NormalizedEvent {
  event_key: string;
  source: string;
  title: string;
  display_name: string;
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
  raw_json?: string;
  raw_text?: string;
}

export interface RiskEvent {
  event_key: string;
  score: number;
  display_name: string;
  previous_value: string | null;
  actual_value: string | null;
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
