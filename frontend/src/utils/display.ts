/**
 * 显示层工具函数
 * 统一管理评分、信号、概率等到 CSS class / 显示文本的映射
 * 避免各组件各自定义导致阈值不一致
 */

// ============================================
// 百分比 / 数值格式化
// ============================================

/** 概率 → 百分比文本（如 0.567 → "57%"），null/undefined 返回 "--" */
export function formatPct(v: number | null | undefined): string {
  return v != null ? `${Math.round(v * 100)}%` : '--'
}

/** 评分 → 保留一位小数（如 6 → "6.0"），undefined 返回 "--" */
export function formatScore(v: number | null | undefined): string {
  return v != null ? v.toFixed(1) : '--'
}

/** 成交额（亿元） → 可读文本（万亿/亿），null/undefined 返回 "--" */
export function formatTurnover(v: number | null | undefined): string {
  if (v == null) return '--'
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万亿`
  return `${Math.round(v)}亿`
}

// ============================================
// 差值计算（前值 vs 公布值）
// ============================================

/**
 * 解析字符串中的数值（如 "2.8%" → 2.8, "-1.5" → -1.5）
 * 返回 null 表示无法解析
 */
function parseNumericValue(s: string | null | undefined): number | null {
  if (!s || s === '--') return null
  const cleaned = s.replace(/[,，\s]/g, '').replace(/[%％]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

export interface DeltaInfo {
  text: string   // 格式化文本，如 "+0.3%", "-1.2"
  class: string  // 'delta-up' | 'delta-down' | 'delta-flat'
}

/**
 * 计算前值与公布值的差值
 * 返回 { text, class }，任意为空时返回 null
 */
export function computeDelta(previous: string | null | undefined, actual: string | null | undefined): DeltaInfo | null {
  const prevNum = parseNumericValue(previous)
  const actualNum = parseNumericValue(actual)
  if (prevNum === null || actualNum === null) return null

  const diff = actualNum - prevNum
  const absDiff = Math.abs(diff)
  const hasPct = (previous?.includes('%') ?? false) || (actual?.includes('%') ?? false)
  const decimals = absDiff < 1 ? 2 : 1
  const suffix = hasPct ? '%' : ''
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : ''
  const text = `${sign}${absDiff.toFixed(decimals)}${suffix}`
  const cls = diff > 0 ? 'delta-up' : diff < 0 ? 'delta-down' : 'delta-flat'
  return { text, class: cls }
}

// ============================================
// 评分 → CSS class 映射
// ============================================

/**
 * 信号强度 → 3 级 CSS class（bullish / neutral / bearish）
 * 用于 HomePage 的 signalClass、AlmanacCard 的 scoreClass
 * 阈值：>=6 bullish, >=4 neutral, <4 bearish
 */
export function signalClass(rating: number | null | undefined): string {
  if (rating == null) return ''
  if (rating >= 6) return 'bullish'
  if (rating >= 4) return 'neutral'
  return 'bearish'
}

/**
 * 评分 → 5 级 CSS class
 * 用于 CalendarStatsView、MonthlyCalendarGrid 的 ratingClass
 */
export function ratingClass(rating: number | undefined): string {
  if (rating === undefined) return 'rating-neutral'
  if (rating >= 8) return 'rating-excellent'
  if (rating >= 6) return 'rating-good'
  if (rating >= 4) return 'rating-neutral'
  if (rating >= 2) return 'rating-poor'
  return 'rating-terrible'
}

/**
 * 事件分数 → 颜色名（red / orange / yellow / gray）
 * 用于事件卡片、日期条上的风险圆点
 */
export function scoreColor(score: number): string {
  if (score >= 9) return 'red'
  if (score >= 7) return 'orange'
  if (score >= 5) return 'yellow'
  return 'gray'
}

// ============================================
// 概率 → 进度条样式
// ============================================

/** 概率 → 进度条 CSS class（bar-up / bar-down / bar-neutral） */
export function probColorClass(prob: number): string {
  if (prob > 0.55) return 'bar-up'
  if (prob < 0.45) return 'bar-down'
  return 'bar-neutral'
}

/** 概率 → 文字色 CSS class（prob-up / prob-down / prob-neutral） */
export function probTextClass(prob: number): string {
  if (prob > 0.55) return 'prob-up'
  if (prob < 0.45) return 'prob-down'
  return 'prob-neutral'
}

// ============================================
// 评分 → 热力图 CSS class
// ============================================

/**
 * 评分(0-10) → 热力图 CSS class（heat-5 ~ heat-1）
 * 统一 MonthlyCalendarGrid 和 CalendarStatsView 的热力图逻辑
 */
export function heatmapClass(rating: number | undefined): string {
  if (rating === undefined) return 'heat-3'
  if (rating >= 8) return 'heat-5'
  if (rating >= 6) return 'heat-4'
  if (rating >= 4) return 'heat-3'
  if (rating >= 2) return 'heat-2'
  return 'heat-1'
}
