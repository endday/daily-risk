/**
 * 市场温度 — 编辑式文案生成
 *
 * 根据衍生指标拼出一段简短的"编辑点评"，风格匹配报纸体的温和叙事。
 * 避免绝对判断（"必须买"/"必须卖"），始终保留不确定性。
 */

import type { TemperatureDerived, MarketSnapshot } from '../services/api'

/**
 * 生成一句话市场温度点评
 *
 * 示例输出：
 * "沪深300 PE 14.84 倍，处于历史中位；股债利差 5.01%，股票相对债券仍有吸引力。但今日涨跌比仅 34%，短线情绪偏弱。"
 */
export function generateTemperatureNarrative(
  derived: TemperatureDerived,
  _latest: MarketSnapshot[],
): string {
  const parts: string[] = []

  // 1) 估值
  if (derived.pe_ttm != null) {
    const pePart = `沪深300 PE ${derived.pe_ttm.toFixed(1)} 倍`
    if (derived.pe_label) {
      parts.push(`${pePart}，${derived.pe_label}`)
    } else {
      parts.push(pePart)
    }
  }

  // 2) 股债利差（ERP）
  if (derived.erp != null) {
    const erpVal = derived.erp.toFixed(2)
    const erpDesc = erpInterpretation(derived.erp)
    parts.push(`股债利差 ${erpVal}%，${erpDesc}`)
  }

  // 3) 情绪（涨跌比）
  if (derived.advance_decline_label != null && derived.advance_decline_ratio != null) {
    const ratio = derived.advance_decline_ratio.toFixed(0)
    parts.push(`涨跌比 ${ratio}%，${derived.advance_decline_label}`)
  }

  // 4) 量能
  if (derived.turnover_trend != null && derived.turnover_5d_avg != null) {
    const amt = formatAmount(derived.turnover_5d_avg)
    parts.push(`成交额 ${amt}，${derived.turnover_trend}`)
  }

  // 5) 融资融券（补充）
  if (derived.margin_balance_yi != null) {
    parts.push(`两融余额 ${derived.margin_balance_yi.toLocaleString()} 亿`)
  }

  if (parts.length === 0) return '数据积累中，稍后呈现'

  return parts.join('；') + '。'
}

/**
 * ERP → 解释文案
 */
function erpInterpretation(erp: number): string {
  if (erp > 8) return '股票相对债券极具吸引力'
  if (erp > 5) return '股票相对债券仍有吸引力'
  if (erp > 2) return '股债吸引力相当'
  if (erp > 0) return '债券相对更有吸引力'
  return '债券吸引力显著高于股票'
}

/**
 * 亿元数值 → 可读文本（万亿/亿）
 */
function formatAmount(yi: number): string {
  if (yi >= 10000) return `${(yi / 10000).toFixed(1)} 万亿`
  return `${Math.round(yi)} 亿`
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
