/**
 * 市场温度 — 编辑式文案生成
 *
 * 根据衍生指标拼出一段简短的"编辑点评"，风格匹配报纸体的温和叙事。
 * 避免绝对判断（"必须买"/"必须卖"），始终保留不确定性。
 */

import type { TemperatureDerived, MarketSnapshot } from '../services/api'

/**
 * 生成一句话市场天气
 *
 * 风格：像老黄历一样，用比喻描述市场状态
 * 示例：
 * - "估值便宜，情绪不错，适合做事"
 * - "天冷，少出门"
 * - "市场在打瞌睡，没什么方向"
 */
export function generateTemperatureNarrative(
  derived: TemperatureDerived,
  _latest: MarketSnapshot[],
): string {
  // 判断市场温度
  const temp = getMarketTemperature(derived)

  // 根据温度 + 修饰词生成天气
  return generateWeather(temp, derived)
}

/**
 * 判断市场温度等级
 */
function getMarketTemperature(derived: TemperatureDerived): 'hot' | 'warm' | 'normal' | 'cool' | 'cold' {
  const erp = derived.erp
  const pePct = derived.pe_percentile

  // ERP 优先（最核心的估值指标）
  if (erp != null) {
    if (erp > 8) return 'hot'
    if (erp > 5) return 'warm'
    if (erp > 2) return 'normal'
    if (erp > 0) return 'cool'
    return 'cold'
  }

  // 其次 PE 百分位
  if (pePct != null) {
    if (pePct <= 20) return 'hot'
    if (pePct <= 40) return 'warm'
    if (pePct <= 60) return 'normal'
    if (pePct <= 80) return 'cool'
    return 'cold'
  }

  return 'normal'
}

/**
 * 根据温度 + 市场状态生成天气文案
 */
function generateWeather(
  temp: 'hot' | 'warm' | 'normal' | 'cool' | 'cold',
  derived: TemperatureDerived,
): string {
  // 情绪和量能修饰
  const sentiment = getSentiment(derived)
  const volume = getVolume(derived)

  // 核心天气文案
  const weatherMap: Record<string, string[]> = {
    hot: [
      '估值很便宜，市场给机会',
      '股票打折卖，别错过',
      '天热，适合出手',
    ],
    warm: [
      '估值不贵，可以做事',
      '市场偏暖，适合布局',
      '价格合适，值得关注',
    ],
    normal: [
      '不贵不便宜，看着办',
      '市场平稳，没啥特别的',
      '估值中性，正常操作',
    ],
    cool: [
      '有点贵，别急',
      '估值偏高，轻仓为宜',
      '天凉，少出手',
    ],
    cold: [
      '太贵了，等等吧',
      '估值高企，谨慎为上',
      '天冷，少出门',
    ],
  }

  // 选择基础天气（基于日期，确保同一天文案稳定）
  const options = weatherMap[temp]
  const dayHash = getDayHash()
  let weather = options[dayHash % options.length]

  // 情绪修饰
  if (sentiment === 'good' && (temp === 'normal' || temp === 'warm' || temp === 'hot')) {
    weather += '，情绪也不错'
  } else if (sentiment === 'bad' && (temp === 'warm' || temp === 'normal')) {
    weather += '，但情绪偏弱'
  }

  // 量能修饰
  if (volume === 'shrinking' && (temp === 'normal' || temp === 'cool')) {
    weather += '，成交缩量，市场在打瞌睡'
  } else if (volume === 'expanding' && temp === 'hot') {
    weather += '，放量上涨，势头不错'
  }

  return weather
}

/**
 * 判断市场情绪
 */
function getSentiment(derived: TemperatureDerived): 'good' | 'neutral' | 'bad' {
  const ratio = derived.advance_decline_ratio
  if (ratio == null) return 'neutral'
  if (ratio >= 60) return 'good'
  if (ratio >= 45) return 'neutral'
  return 'bad'
}

/**
 * 判断量能状态
 */
function getVolume(derived: TemperatureDerived): 'expanding' | 'normal' | 'shrinking' {
  const trend = derived.turnover_trend
  if (trend === '放量') return 'expanding'
  if (trend === '缩量') return 'shrinking'
  return 'normal'
}

/**
 * 基于当前日期生成稳定的哈希值（同一天返回相同值）
 */
function getDayHash(): number {
  const now = new Date()
  const dateStr = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
  let hash = 0
  for (let i = 0; i < dateStr.length; i++) {
    const char = dateStr.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

/**
 * ERP → 温度条百分比位置 (0-100)
 * 映射：ERP -5% → 0%, ERP 12% → 100%
 * 这样 0% = 极度高估（绿），100% = 极度便宜（红）
 */
export function erpToTemperaturePosition(erp: number): number {
  const min = -5
  const max = 12
  const pos = ((erp - min) / (max - min)) * 100
  return Math.max(0, Math.min(100, pos))
}

/**
 * ERP → CSS 颜色类名（复用报纸风的红绿色系）
 */
export function erpColorClass(erp: number): string {
  if (erp > 8) return 'erp-extreme-cheap'     // 深红
  if (erp > 5) return 'erp-cheap'              // 红
  if (erp > 2) return 'erp-fair'               // 金
  if (erp > 0) return 'erp-expensive'          // 绿
  return 'erp-extreme-expensive'               // 深绿
}

/**
 * PE 百分位 → CSS 颜色类名
 */
export function pePercentileColorClass(percentile: number | null): string {
  if (percentile == null) return ''
  if (percentile <= 20) return 'erp-extreme-cheap'
  if (percentile <= 40) return 'erp-cheap'
  if (percentile <= 60) return 'erp-fair'
  if (percentile <= 80) return 'erp-expensive'
  return 'erp-extreme-expensive'
}
