/**
 * API 服务层
 * 封装所有后端 API 调用
 */

// 类型统一从 shared/types 导入，避免重复定义
import type { DayResponse } from '../../../shared/types'

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
  ActionSignal,
  Almanac,
  AlmanacSignal,
  IndexAlmanacData,
  AlmanacByIndex,
  DayResponse,
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

// 重新导出共享日期工具，方便前端组件使用
export { getToday, getTomorrow }
