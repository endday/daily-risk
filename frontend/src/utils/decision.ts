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
 *
 * T+1 逻辑：
 * - 买入：今天买 → 明天才能卖 → 推荐"下一个交易日评分最高"的买入日
 *   （买入日的下一天涨，才能赚钱出来）
 * - 卖出：今天卖 → 今天成交 → 推荐"下一个交易日评分最低"的卖出日
 *   （明天要跌，今天赶紧跑）
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

  // 构建 day → stat 映射，方便查找下一天
  const statByDay = new Map<number, CalendarDayStat>()
  for (const stat of dailyCalendar) {
    statByDay.set(stat.day, stat)
  }

  // 为每个候选日找到下一个交易日的评分
  const scored = candidates.map(c => {
    const nextDay = findNextTradingDay(c.day, statByDay, year, month)
    return { candidate: c, nextDay }
  })

  // 买入：选下一天评分最高的（买入后明天涨）
  // 卖出：选下一天评分最低的（明天要跌，今天赶紧卖）
  scored.sort((a, b) => {
    const aRating = a.nextDay?.rating ?? 5
    const bRating = b.nextDay?.rating ?? 5
    return intent === 'buy'
      ? bRating - aRating
      : aRating - bRating
  })

  const best = scored[0]
  const stat = best.candidate
  const nextStat = best.nextDay

  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(stat.day).padStart(2, '0')}`
  const weekday = new Date(Date.UTC(year, month - 1, stat.day)).getUTCDay()

  return {
    date: dateStr,
    dayLabel: `${month}月${stat.day}日 ${WEEKDAYS_SHORT[weekday]}`,
    rating: nextStat?.rating ?? stat.rating ?? 0,
    upProbability: nextStat?.up_probability ?? stat.up_probability,
    avgChange: nextStat?.avg_change_pct ?? stat.avg_change_pct,
    sampleCount: nextStat?.sample_count ?? stat.sample_count,
    reasons: generateReasons(intent, stat, nextStat),
    caveats: generateCaveats(intent, stat, nextStat, candidates),
  }
}

/**
 * 查找给定日期之后的下一个交易日（跳过周末）
 */
function findNextTradingDay(
  currentDay: number,
  statByDay: Map<number, CalendarDayStat>,
  year: number,
  month: number,
): CalendarDayStat | null {
  let d = currentDay + 1
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

  while (d <= daysInMonth) {
    const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay()
    if (dow !== 0 && dow !== 6) {
      return statByDay.get(d) ?? null
    }
    d++
  }
  return null // 月末，无下一个交易日
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
 * T+1 话术：
 * - 买入：强调"买入后次日"的数据（明天涨才能赚）
 * - 卖出：强调"次日下跌风险"（明天要跌，今天赶紧跑）
 */
function generateReasons(
  intent: Intent,
  stat: CalendarDayStat,
  nextStat: CalendarDayStat | null,
): string[] {
  const reasons: string[] = []

  if (intent === 'buy' && nextStat) {
    // 买入论据：围绕"买入次日"的数据
    const nextRating = nextStat.rating ?? 0
    const nextProb = nextStat.up_probability
    const nextAvg = nextStat.avg_change_pct

    if (nextRating >= 7) {
      reasons.push(`买入次日评分 ${nextRating.toFixed(1)}，历史强利好`)
    } else if (nextRating >= 5) {
      reasons.push(`买入次日评分 ${nextRating.toFixed(1)}，偏多`)
    }

    if (nextProb > 0.6) {
      reasons.push(`次日上涨概率 ${pct(nextProb)}，T+1 获利概率大`)
    } else if (nextProb > 0.5) {
      reasons.push(`次日上涨概率 ${pct(nextProb)}`)
    }

    if (nextAvg > 0.003) {
      reasons.push(`次日历史平均涨幅 +${pct(nextAvg)}`)
    } else if (nextAvg > 0) {
      reasons.push(`次日历史平均涨幅 +${pct(nextAvg)}`)
    }

    if (nextStat.sample_count >= 15) {
      reasons.push(`样本充足（n=${nextStat.sample_count}），统计可信`)
    }
  } else if (intent === 'sell' && nextStat) {
    // 卖出论据：围绕"次日下跌风险"
    const nextRating = nextStat.rating ?? 0
    const nextProb = nextStat.up_probability
    const nextAvg = nextStat.avg_change_pct

    if (nextRating < 3) {
      reasons.push(`次日评分仅 ${nextRating.toFixed(1)}，下跌风险大，适合今日离场`)
    } else if (nextRating < 5) {
      reasons.push(`次日评分 ${nextRating.toFixed(1)}，偏弱，今日卖出可规避`)
    }

    if (nextProb < 0.4) {
      reasons.push(`次日上涨概率仅 ${pct(nextProb)}，持有风险大`)
    } else if (nextProb < 0.5) {
      reasons.push(`次日上涨概率 ${pct(nextProb)}，低于均值`)
    }

    if (nextAvg < -0.003) {
      reasons.push(`次日历史平均跌幅 ${pct(nextAvg)}`)
    } else if (nextAvg < 0) {
      reasons.push(`次日历史平均跌幅 ${pct(nextAvg)}`)
    }

    if (nextStat.sample_count >= 15) {
      reasons.push(`样本充足（n=${nextStat.sample_count}），统计可信`)
    }
  }

  // 兜底
  if (reasons.length === 0) {
    const r = nextStat?.rating ?? stat.rating ?? 0
    reasons.push(intent === 'buy'
      ? `该日次日评分 ${r.toFixed(1)}，在范围内相对最优`
      : `该日次日评分 ${r.toFixed(1)}，在范围内风险最大，适合提前离场`)
  }

  return reasons
}

/**
 * 生成反面提醒
 */
function generateCaveats(
  intent: Intent,
  stat: CalendarDayStat,
  nextStat: CalendarDayStat | null,
  allCandidates: CalendarDayStat[],
): string[] {
  const caveats: string[] = []

  if (intent === 'buy' && nextStat) {
    const nextProb = nextStat.up_probability
    const downProb = 1 - nextProb
    if (downProb > 0.3) {
      caveats.push(`次日仍有 ${pct(downProb)} 概率下跌，T+1 锁仓风险`)
    }

    const maxVolatility = allCandidates.reduce(
      (max, c) => Math.max(max, Math.abs(c.avg_change_pct)), 0
    )
    if (maxVolatility > 0.01) {
      caveats.push('近期市场波动较大，注意控制仓位')
    }

    caveats.push('A 股 T+1，买入当天无法卖出，需承受隔夜风险')
    caveats.push('历史统计基于近20年数据，不代表未来表现')
  } else if (intent === 'sell' && nextStat) {
    const nextProb = nextStat.up_probability
    if (nextProb > 0.45) {
      caveats.push(`次日仍有 ${pct(nextProb)} 上涨概率，卖出可能踏空`)
    }

    caveats.push('历史统计基于近20年数据，不代表未来表现')
  } else {
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
