/**
 * 决策推荐算法 + 论据生成
 * 根据用户意图（买/卖）和时间范围，从日历统计数据中推荐最佳日期并生成支持论据
 */

import type { CalendarDayStat } from '../../../shared/types'
import { WEEKDAYS_SHORT, formatDateParts } from '../../../shared/date-utils'

// ============================================
// 类型定义
// ============================================

export type Intent = 'buy' | 'sell'
export type DateRange = '3d' | '7d' | 'month'

export interface Recommendation {
  date: string           // YYYY-MM-DD
  dayLabel: string       // "6月17日 周二"
  rating: number
  upProbability: number
  avgChange: number
  sampleCount: number
  reasons: string[]      // 支持论据
  caveats: string[]      // 反面提醒（折叠区）
}

// ============================================
// 核心推荐函数
// ============================================

/**
 * 推荐最佳操作日期
 * @param intent - 'buy' 推荐评分最高的日期, 'sell' 推荐评分最低的日期
 * @param range - 时间范围: '3d'(3个交易日) | '7d'(7个交易日) | 'month'(本月剩余)
 * @param dailyCalendar - 当月每日统计数据
 * @param selectedDate - 当前选中日期 YYYY-MM-DD（用于确定年月上下文）
 * @returns 推荐结果，范围内无有效数据时返回 null
 */
export function recommend(
  intent: Intent,
  range: DateRange,
  dailyCalendar: CalendarDayStat[],
  selectedDate: string,
): Recommendation | null {
  if (!dailyCalendar || dailyCalendar.length === 0) return null

  const { year, month, day: todayDay } = formatDateParts(selectedDate)
  const candidates = filterCandidates(dailyCalendar, range, year, month, todayDay)

  if (candidates.length === 0) return null

  // 排序：买入取最高 rating，卖出取最低 rating
  const sorted = [...candidates].sort((a, b) =>
    intent === 'buy'
      ? (b.rating ?? 0) - (a.rating ?? 0)
      : (a.rating ?? 0) - (b.rating ?? 0)
  )

  const best = sorted[0]
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(best.day).padStart(2, '0')}`
  const weekday = new Date(Date.UTC(year, month - 1, best.day)).getUTCDay()

  return {
    date: dateStr,
    dayLabel: `${month}月${best.day}日 ${WEEKDAYS_SHORT[weekday]}`,
    rating: best.rating ?? 0,
    upProbability: best.up_probability,
    avgChange: best.avg_change_pct,
    sampleCount: best.sample_count,
    reasons: generateReasons(intent, best),
    caveats: generateCaveats(intent, best, candidates),
  }
}

// ============================================
// 候选日过滤
// ============================================

/**
 * 根据范围和日期条件过滤候选交易日
 * - 排除周末（周六/周日）
 * - 排除已过去的日期（从明天开始）
 * - 按 range 限制交易日数量
 */
function filterCandidates(
  dailyCalendar: CalendarDayStat[],
  range: DateRange,
  year: number,
  month: number,
  todayDay: number,
): CalendarDayStat[] {
  // 过滤：未来日期 + 工作日
  const futureWeekdays = dailyCalendar.filter(stat => {
    if (stat.day <= todayDay) return false // 排除今天及之前
    const d = new Date(Date.UTC(year, month - 1, stat.day))
    const dow = d.getUTCDay()
    return dow !== 0 && dow !== 6 // 排除周末
  })

  // 按日期升序排列
  futureWeekdays.sort((a, b) => a.day - b.day)

  // 按范围截取
  switch (range) {
    case '3d':
      return futureWeekdays.slice(0, 3)
    case '7d':
      return futureWeekdays.slice(0, 7)
    case 'month':
    default:
      return futureWeekdays
  }
}

// ============================================
// 论据生成
// ============================================

/**
 * 根据意图和推荐日期数据生成支持论据
 */
function generateReasons(intent: Intent, stat: CalendarDayStat): string[] {
  const reasons: string[] = []
  const rating = stat.rating ?? 0
  const prob = stat.up_probability
  const avg = stat.avg_change_pct

  if (intent === 'buy') {
    // 评分信号
    if (rating >= 7) {
      reasons.push(`短线强买信号，评分 ${rating.toFixed(1)}`)
    } else if (rating >= 5) {
      reasons.push(`短线买入信号，评分 ${rating.toFixed(1)}`)
    }

    // 历史概率
    if (prob > 0.6) {
      reasons.push(`近20年该日上涨概率 ${pct(prob)}`)
    } else if (prob > 0.5) {
      reasons.push(`近20年该日上涨概率 ${pct(prob)}，略高于均值`)
    }

    // 历史涨幅
    if (avg > 0.003) {
      reasons.push(`历史平均涨幅 +${pct(avg)}`)
    } else if (avg > 0) {
      reasons.push(`历史平均涨幅 +${pct(avg)}`)
    }

    // 样本量
    if (stat.sample_count >= 15) {
      reasons.push(`样本充足（n=${stat.sample_count}），统计可信`)
    }
  } else {
    // 卖出论据
    if (rating < 3) {
      reasons.push(`短线谨慎信号，评分仅 ${rating.toFixed(1)}`)
    } else if (rating < 5) {
      reasons.push(`短线偏弱，评分 ${rating.toFixed(1)}`)
    }

    if (prob < 0.4) {
      reasons.push(`近20年该日上涨概率仅 ${pct(prob)}`)
    } else if (prob < 0.5) {
      reasons.push(`近20年该日上涨概率 ${pct(prob)}，低于均值`)
    }

    if (avg < -0.003) {
      reasons.push(`历史平均跌幅 ${pct(avg)}`)
    } else if (avg < 0) {
      reasons.push(`历史平均跌幅 ${pct(avg)}`)
    }

    if (stat.sample_count >= 15) {
      reasons.push(`样本充足（n=${stat.sample_count}），统计可信`)
    }
  }

  // 兜底：如果论据为空，给一个通用说明
  if (reasons.length === 0) {
    reasons.push(intent === 'buy'
      ? `该日评分 ${rating.toFixed(1)}，在范围内相对最优`
      : `该日评分 ${rating.toFixed(1)}，在范围内风险最低`)
  }

  return reasons
}

/**
 * 生成反面提醒（折叠区内容）
 */
function generateCaveats(
  intent: Intent,
  stat: CalendarDayStat,
  allCandidates: CalendarDayStat[],
): string[] {
  const caveats: string[] = []
  const prob = stat.up_probability

  if (intent === 'buy') {
    // 买入时提醒下跌可能性
    const downProb = 1 - prob
    if (downProb > 0.3) {
      caveats.push(`仍有 ${pct(downProb)} 的概率下跌，历史并非绝对`)
    }

    // 候选中是否有波动更大的日期
    const maxVolatility = allCandidates.reduce(
      (max, c) => Math.max(max, Math.abs(c.avg_change_pct)), 0
    )
    if (maxVolatility > 0.01) {
      caveats.push('近期市场波动较大，注意控制仓位')
    }

    // 通用提醒
    caveats.push('历史统计基于近20年数据，不代表未来表现')
  } else {
    // 卖出时提醒可能错过涨幅
    if (prob > 0.4) {
      caveats.push(`该日仍有 ${pct(prob)} 的上涨概率，卖出可能踏空`)
    }

    // 候选中是否有评分更高的日期（说明不是最差时机）
    const higherDays = allCandidates.filter(c => (c.rating ?? 0) > (stat.rating ?? 0))
    if (higherDays.length > 0) {
      caveats.push(`范围内还有 ${higherDays.length} 个交易日评分更高，并非最差选择`)
    }

    caveats.push('历史统计基于近20年数据，不代表未来表现')
  }

  return caveats
}

// ============================================
// 辅助函数
// ============================================

/** 小数 → 百分比文本 (0.567 → "57%") */
function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}
