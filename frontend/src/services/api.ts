/**
 * API 服务层
 * 封装所有后端 API 调用
 */

// 类型统一从 shared/types 导入，避免重复定义
import type {
  DayResponse,
  RiskEvent,
  CalendarEffects,
  MarketTemperatureResponse,
  MarketTemperatureCompactResponse,
} from '../../../shared/types'

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
  MarketSnapshot,
  TemperatureDerived,
  MarketTemperatureResponse,
  MarketTemperatureCompactResponse,
} from '../../../shared/types'

import { getToday, getTomorrow } from '../../../shared/date-utils'

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

/** 获取 ERP 详情页长历史，走轻量响应避免移动端加载过重 */
export async function fetchErpHistory(
  years = 8,
  indexCode = '000300',
  maxPoints = 320,
): Promise<MarketTemperatureCompactResponse> {
  const days = years * 365
  const response = await fetch(`${API_BASE}/market-temperature?days=${days}&compact=1&indexCode=${indexCode}&maxPoints=${maxPoints}`)
  if (!response.ok) {
    throw new Error(`ERP history API error: ${response.status}`)
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
