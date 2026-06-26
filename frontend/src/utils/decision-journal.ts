/**
 * 决策日记 — localStorage 存储用户决策，支持事后回看
 *
 * 用户点击"我想买/我想卖"时记录，
 * T+1/T+3/T+5 后展示结果反馈。
 */

import type { Intent } from './decision'
import { getDayHash } from '../../../shared/date-utils'

const STORAGE_KEY = 'decision_journal'
const MAX_ENTRIES = 30  // 最多保留 30 条记录

export interface DecisionRecord {
  id: string
  date: string           // 决策日期 YYYY-MM-DD
  intent: Intent         // 'buy' | 'sell'
  indexCode: string      // 参考指数，如 '000300'
  closePrice: number     // 决策时的收盘价
  createdAt: string      // ISO 时间戳
}

export interface DecisionReviewItem extends DecisionRecord {
  daysPassed: number     // 已过天数
  currentPrice: number   // 当前价格
  returnPct: number      // 收益率 %
  returnText: string     // 收益文案
}

/**
 * 记录一条决策
 */
export function recordDecision(
  intent: Intent,
  indexCode: string,
  closePrice: number,
): DecisionRecord {
  const record: DecisionRecord = {
    id: generateId(),
    date: getTodayStr(),
    intent,
    indexCode,
    closePrice,
    createdAt: new Date().toISOString(),
  }

  const entries = loadEntries()
  entries.unshift(record)  // 新的在前

  // 限制条数
  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES
  }

  saveEntries(entries)
  return record
}

/**
 * 获取需要回看的决策（有当前价格对比的）
 */
export function getReviewableDecisions(
  currentPrices: Record<string, number>,  // indexCode → currentPrice
): DecisionReviewItem[] {
  const entries = loadEntries()
  const today = new Date(getTodayStr() + 'T00:00:00+08:00')
  const reviews: DecisionReviewItem[] = []

  for (const entry of entries) {
    const currentPrice = currentPrices[entry.indexCode]
    if (!currentPrice) continue

    const daysPassed = daysBetween(entry.date, today)
    if (daysPassed < 1) continue  // 当天不回看

    const returnPct = calculateReturn(entry.intent, entry.closePrice, currentPrice)
    const returnText = generateReturnText(entry.intent, returnPct, daysPassed)

    reviews.push({
      ...entry,
      daysPassed,
      currentPrice,
      returnPct,
      returnText,
    })
  }

  return reviews
}

/**
 * 计算收益率
 */
function calculateReturn(intent: Intent, buyPrice: number, currentPrice: number): number {
  const raw = (currentPrice - buyPrice) / buyPrice * 100
  // 卖出方向：涨了是亏，跌了是赚
  return intent === 'buy' ? raw : -raw
}

/**
 * 生成收益文案（基于日期，同一天文案稳定）
 */
function generateReturnText(_intent: Intent, returnPct: number, daysPassed: number): string {
  const absReturn = Math.abs(returnPct).toFixed(1)
  const sign = returnPct >= 0 ? '+' : ''

  // 基于日期生成稳定索引
  const dayHash = getDayHash()

  // 赚了
  if (returnPct > 0.5) {
    const phrases = [
      `眼光不错，${daysPassed}天${sign}${returnPct.toFixed(1)}%`,
      `判断正确，赚了${absReturn}%`,
      `数据支持你，${sign}${returnPct.toFixed(1)}%`,
    ]
    return phrases[dayHash % phrases.length]
  }

  // 小赚小亏
  if (returnPct >= -0.5 && returnPct <= 0.5) {
    return `波动不大，${sign}${returnPct.toFixed(1)}%`
  }

  // 亏了
  const phrases = [
    `市场有意外，${returnPct.toFixed(1)}%`,
    `这次不太对，${returnPct.toFixed(1)}%`,
    `判断有依据，但结果${returnPct.toFixed(1)}%`,
  ]
  return phrases[dayHash % phrases.length]
}

// ============================================
// localStorage 操作
// ============================================

function loadEntries(): DecisionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as DecisionRecord[]
  } catch {
    return []
  }
}

function saveEntries(entries: DecisionRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

/**
 * 获取全部决策记录（带当前价格对比）
 */
export function getAllDecisions(
  currentPrices: Record<string, number>,
): DecisionReviewItem[] {
  const entries = loadEntries()
  const today = new Date(getTodayStr() + 'T00:00:00+08:00')
  return entries.map(entry => {
    const currentPrice = currentPrices[entry.indexCode] ?? entry.closePrice
    const daysPassed = daysBetween(entry.date, today)
    const returnPct = calculateReturn(entry.intent, entry.closePrice, currentPrice)
    const returnText = generateReturnText(entry.intent, returnPct, daysPassed)
    return { ...entry, daysPassed, currentPrice, returnPct, returnText }
  })
}

/**
 * 清空全部决策记录
 */
export function clearAllDecisions(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * 获取决策统计
 */
export function getDecisionStats(entries: DecisionReviewItem[]): {
  total: number
  wins: number
  winRate: number
} {
  const withReturn = entries.filter(e => e.daysPassed >= 1)
  const wins = withReturn.filter(e => e.returnPct > 0.5).length
  return {
    total: withReturn.length,
    wins,
    winRate: withReturn.length > 0 ? wins / withReturn.length * 100 : 0,
  }
}

// ============================================
// 辅助函数
// ============================================

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function getTodayStr(): string {
  const now = new Date()
  // 北京时间
  const bj = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const y = bj.getUTCFullYear()
  const m = String(bj.getUTCMonth() + 1).padStart(2, '0')
  const d = String(bj.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function daysBetween(dateStr: string, today: Date): number {
  const date = new Date(dateStr + 'T00:00:00+08:00')
  const diff = today.getTime() - date.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}
