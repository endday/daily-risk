/**
 * 简单 API 测试
 * 验证 Worker 路由和基本功能
 */

import { describe, it, expect } from 'vitest'
import { calculateRiskIndex } from '../db'

describe('Daily Risk Worker', () => {
  it('should export default handler', async () => {
    const handler = await import('../index')
    expect(handler.default).toBeDefined()
    expect(handler.default.fetch).toBeDefined()
    expect(handler.default.scheduled).toBeDefined()
  })

  it('should calculate risk index correctly', () => {
    const events = [
      { importance: 10 },
      { importance: 8 },
      { importance: 7 },
    ]

    expect(calculateRiskIndex(events)).toBe(10)
  })

  it('should return 0 for empty events', () => {
    expect(calculateRiskIndex([])).toBe(0)
  })

  it('should return the single event score directly', () => {
    expect(calculateRiskIndex([{ importance: 6.4 }])).toBe(6.4)
  })

  it('should cap accumulated risk index at 10', () => {
    const events = [
      { importance: 10 },
      { importance: 10 },
      { importance: 10 },
      { importance: 10 },
    ]

    expect(calculateRiskIndex(events)).toBe(10)
  })
})
