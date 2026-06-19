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
  verdict: string        // 主结论（如"数据支持你的判断"）
  verdictClass: string   // 主结论 CSS class（positive/caution/negative）
  reasons: string[]      // 支持论据
  caveat: string         // 底部一句软提醒
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

  const finalNextStat = nextStat ?? stat
  return {
    date: dateStr,
    dayLabel: `${month}月${stat.day}日 ${WEEKDAYS_SHORT[weekday]}`,
    rating: nextStat?.rating ?? stat.rating ?? 0,
    upProbability: nextStat?.up_probability ?? stat.up_probability,
    avgChange: nextStat?.avg_change_pct ?? stat.avg_change_pct,
    sampleCount: nextStat?.sample_count ?? stat.sample_count,
    verdict: generateVerdict(intent, finalNextStat),
    verdictClass: generateVerdictClass(intent, finalNextStat),
    reasons: generateReasons(intent, nextStat),
    caveat: generateCaveat(intent, finalNextStat),
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
 * 主结论 — 把"历史上这种日子上涨概率 X%"提到最显眼的位置
 * 三档话术（产品方向文档 7.0）：
 *   ≥ 55% → 绿色强化："数据支持你，历史上这种日子 62% 是涨的"
 *   45-55% → 黄色中立："数据中性，历史上涨跌各半"
 *   < 45% → 红色提醒："数据偏谨慎，历史上只有 42% 真的涨了"
 */
function generateVerdict(intent: Intent, stat: CalendarDayStat): string {
  const prob = stat.up_probability
  const pctStr = pct(prob)

  if (intent === 'buy') {
    if (prob > 0.55) return `数据支持你的判断，历史上这种日子 ${pctStr} 是涨的`
    if (prob >= 0.45) return `数据中性，历史上这种日子涨跌各半`
    return `数据偏谨慎，历史上只有 ${pctStr} 真的涨了`
  }

  // sell
  if (prob < 0.45) return `数据支持你的判断，历史上这种日子只有 ${pctStr} 会涨`
  if (prob <= 0.55) return `数据中性，历史上这种日子涨跌各半`
  return `数据偏正面，历史上 ${pctStr} 还是会涨的`
}

function generateVerdictClass(intent: Intent, stat: CalendarDayStat): string {
  const prob = stat.up_probability

  if (intent === 'buy') {
    if (prob > 0.55) return 'positive'
    if (prob >= 0.45) return 'neutral'
    return 'caution'
  }

  // sell
  if (prob < 0.45) return 'positive'
  if (prob <= 0.55) return 'neutral'
  return 'caution'
}

/**
 * 支持论据 — 概率已在 verdict 中显式展示，
 * 这里补充平均涨跌 + 样本量 + 特殊窗口描述
 */
function generateReasons(
  intent: Intent,
  nextStat: CalendarDayStat | null,
): string[] {
  const reasons: string[] = []

  if (intent === 'buy' && nextStat) {
    const nextAvg = nextStat.avg_change_pct

    // 平均涨跌（verdict 说了概率，这里补涨跌幅度）
    if (nextAvg > 0.005) {
      reasons.push(`历史平均涨幅 +${pct(nextAvg)}，有赚头`)
    } else if (nextAvg > 0) {
      reasons.push(`历史平均小幅上涨 +${pct(nextAvg)}`)
    } else if (nextAvg < -0.005) {
      reasons.push(`历史平均跌幅 ${pct(nextAvg)}，注意仓位`)
    }

    // 样本量
    if (nextStat.sample_count >= 15) {
      reasons.push(`基于 ${nextStat.sample_count} 年历史数据，样本充足`)
    }
  } else if (intent === 'sell' && nextStat) {
    const nextAvg = nextStat.avg_change_pct

    if (nextAvg < -0.005) {
      reasons.push(`历史平均跌幅 ${pct(nextAvg)}，离场有依据`)
    } else if (nextAvg < 0) {
      reasons.push(`历史平均小幅下跌 ${pct(nextAvg)}`)
    } else if (nextAvg < 0.003) {
      reasons.push(`历史平均涨幅不大（+${pct(nextAvg)}），持有意义有限`)
    }

    if (nextStat.sample_count >= 15) {
      reasons.push(`基于 ${nextStat.sample_count} 年历史数据，样本充足`)
    }
  }

  // 兜底
  if (reasons.length === 0) {
    reasons.push(intent === 'buy'
      ? '当前窗口历史数据有限，建议结合其他判断'
      : '当前窗口历史数据有限，离场也是一种选择')
  }

  return reasons
}

/**
 * 底部一句软提醒 — 不泼冷水，保留诚实
 * 从清单式提醒压缩为一句融入正文的免责
 */
function generateCaveat(intent: Intent, stat: CalendarDayStat): string {
  const prob = stat.up_probability
  const rating = stat.rating ?? 0

  // 数据明显不支持时：诚实提醒
  if (intent === 'buy' && (prob < 0.45 || rating < 4)) {
    return '数据偏谨慎，不急的话可以再等等'
  }
  if (intent === 'sell' && prob > 0.55 && rating >= 6) {
    return '数据偏正面，可以再观察一天'
  }

  // 常规免责（温暖版）
  return '以上基于历史统计，市场总有意外，控制仓位就好'
}

// ============================================
// 辅助函数
// ============================================

/** 小数 → 百分比文本 (0.567 → "57%") */
function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}
