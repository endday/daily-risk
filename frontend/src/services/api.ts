/**
 * API 服务层
 * 封装所有后端 API 调用
 */

// 类型统一从 shared/types 导入，避免重复定义
import type { DayResponse, TodayTomorrowResponse } from '../../../shared/types'

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
  DayResponse,
  TodayTomorrowResponse,
} from '../../../shared/types'

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

/** 查询今日+明日事件 */
export async function fetchTodayTomorrow(): Promise<TodayTomorrowResponse> {
  const response = await fetch(`${API_BASE}/events?range=today_tomorrow`)
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
  return response.json()
}

/** 获取明天日期 YYYY-MM-DD */
export function getTomorrowDate(): string {
  const now = new Date()
  // 北京时间 UTC+8
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  beijing.setDate(beijing.getDate() + 1)
  return beijing.toISOString().split('T')[0]
}

/** 获取今天日期 YYYY-MM-DD */
export function getTodayDate(): string {
  const now = new Date()
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  return beijing.toISOString().split('T')[0]
}

/** 格式化日期显示 */
export function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00+08:00')
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`
}
