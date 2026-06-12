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
