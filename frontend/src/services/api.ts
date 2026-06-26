/**
 * API 服务层
 * 封装所有后端 API 调用
 */

// 类型统一从 shared/types 导入，避免重复定义
import type { DayResponse, RiskEvent, CalendarEffects } from '../../../shared/types'

export type {
  RiskEvent,
  CalendarDayStat,
  CalendarToday,
  CalendarThisMonth,
  CalendarBannerData,
  CalendarMonthStat,
  IndexMonthlyData,
  IndicesMonthlyData,
  SpecialEffectStats,
  CalendarEffects,
  NextTradingDay,
  Almanac,
  AlmanacSignal,
  IndexAlmanacData,
  AlmanacByIndex,
  DayResponse,
} from '../../../shared/types'

import { getToday, getTomorrow } from '../../../shared/date-utils'

// ============================================
// 市场温度 API 类型
// ============================================

export interface MarketSnapshot {
  trade_date: string
  index_code: string
  close_price: number | null
  change_pct: number | null
  rise_count: number | null
  fall_count: number | null
  flat_count: number | null
  turnover_amount: number | null
  turnover_rate: number | null
  volatility_20d: number | null
  northbound_amt: number | null
  northbound_num: number | null
  pe_ttm: number | null
  pb: number | null
  margin_balance: number | null
  bond_yield_10y: number | null
}

export interface TemperatureDerived {
  advance_decline_ratio: number | null
  advance_decline_label: string | null
  turnover_5d_avg: number | null
  turnover_20d_avg: number | null
  turnover_trend: string | null
  northbound_5d_avg: number | null
  northbound_20d_avg: number | null
  northbound_trend: string | null
  volatility_label: string | null
  margin_balance_yi: number | null
  pe_ttm: number | null
  pe_percentile: number | null
  pe_label: string | null
  erp: number | null
  erp_label: string | null
  // 巴菲特指数
  total_market_cap: number | null
  buffett_ratio: number | null
  buffett_label: string | null
  // 全球宏观（FRED）
  us_2y_yield: number | null
  fed_funds_rate: number | null
  usd_index: number | null
  usd_trend: string | null
  oil_wti: number | null
  us_yield_spread: number | null
  yield_curve_label: string | null
}

export interface MarketTemperatureResponse {
  trade_date: string
  latest: MarketSnapshot[]
  derived: TemperatureDerived
  history: MarketSnapshot[]
  history_days: number
}

// API 路径：开发和生产都用相对路径（生产环境由 Cloudflare Route 转发）
const API_BASE = '/api'

/** 查询单日事件 */
export async function fetchEventsByDate(date: string): Promise<DayResponse> {
  const response = await fetch(`${API_BASE}/events?date=${date}`)
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
  return response.json()
}

/** 获取市场温度（最新快照 + 衍生指标 + 历史） */
export async function fetchMarketTemperature(days = 20): Promise<MarketTemperatureResponse> {
  const response = await fetch(`${API_BASE}/market-temperature?days=${days}`)
  if (!response.ok) {
    throw new Error(`Market temperature API error: ${response.status}`)
  }
  return response.json()
}

// ============================================
// 周日历 API 类型
// ============================================

export interface WeekDayData {
  date: string
  day_label: string
  risk_index: number
  events: RiskEvent[]
  calendar_effects: CalendarEffects | null
}

export interface WeekResponse {
  timezone: string
  week_start: string
  days: WeekDayData[]
  holidays?: Array<{ date: string; name: string; is_trading_day: boolean }>
}

/** 获取一周的事件和日历效应 */
export async function fetchWeekEvents(date: string): Promise<WeekResponse> {
  const response = await fetch(`${API_BASE}/events?week=${date}`)
  if (!response.ok) {
    throw new Error(`Week events API error: ${response.status}`)
  }
  return response.json()
}

// 重新导出共享日期工具，方便前端组件使用
export { getToday, getTomorrow }
