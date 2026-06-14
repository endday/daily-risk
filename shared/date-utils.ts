/**
 * 北京时间日期工具
 * 统一前后端的北京时间计算逻辑，避免多处重复实现
 */

/**
 * 获取北京时间的日期字符串 YYYY-MM-DD
 * @param offsetDays - 相对今天的偏移天数（0=今天，1=明天，-1=昨天）
 */
export function getBeijingDate(offsetDays: number = 0): string {
  const now = new Date()
  // 北京时间 = UTC+8，再加偏移天数
  const ms = now.getTime() + (8 * 3600 + offsetDays * 86400) * 1000
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** 获取今天日期（北京时间） */
export function getToday(): string {
  return getBeijingDate(0)
}

/** 获取明天日期（北京时间） */
export function getTomorrow(): string {
  return getBeijingDate(1)
}

// ============================================
// 星期 / 日期计算
// ============================================

/** 完整星期名（索引 0=星期日） */
export const WEEKDAYS: readonly string[] = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

/** 短星期名（索引 0=周日） */
export const WEEKDAYS_SHORT: readonly string[] = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 解析日期字符串为数字 parts */
export function formatDateParts(date: string): { year: number; month: number; day: number } {
  const [y, m, d] = date.split('-').map(Number)
  return { year: y, month: m, day: d }
}

/**
 * 获取给定日期所在周的周一（Zeller 公式）
 * @param anyDate - YYYY-MM-DD 格式日期
 * @returns YYYY-MM-DD 格式的周一日期
 */
export function getMonday(anyDate: string): string {
  const { year: y0, month: m0, day: d0 } = formatDateParts(anyDate)
  let y = y0, m = m0, d = d0
  if (m < 3) { m += 12; y -= 1 }
  const K = y % 100, J = Math.floor(y / 100)
  const h = (d + Math.floor(13 * (m + 1) / 5) + K + Math.floor(K / 4) + Math.floor(J / 4) - 2 * J) % 7
  const dayOfWeek = ((h + 6) % 7)
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  d += diff
  const dim = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  while (d < 1) { m--; if (m < 1) { m = 12; y-- } d += dim[m - 1] || 30 }
  while (d > (dim[m - 1] || 30)) { d -= dim[m - 1] || 30; m++; if (m > 12) { m = 1; y++ } }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * 日期偏移（基于 UTC 避免时区问题）
 * @param base - YYYY-MM-DD 格式的基准日期
 * @param days - 偏移天数（正数向后，负数向前）
 */
export function offsetDate(base: string, days: number): string {
  const [y, m, d] = base.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/** 日期 → 短星期名（"周一"~"周日"） */
export function dateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return WEEKDAYS_SHORT[day]
}

/** 日期 → 简写（"6/14"） */
export function dateShort(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${m}/${d}`
}
