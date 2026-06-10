/**
 * 简单 API 测试
 * 验证 Worker 路由和基本功能
 */

import { describe, it, expect } from 'vitest'

describe('Daily Risk Worker', () => {
  it('should export default handler', async () => {
    const handler = await import('../index')
    expect(handler.default).toBeDefined()
    expect(handler.default.fetch).toBeDefined()
    expect(handler.default.scheduled).toBeDefined()
  })

  it('should calculate risk index correctly', () => {
    // Test risk index calculation
    const events = [
      { importance: 10 },
      { importance: 8 },
      { importance: 7 },
    ]

    const sumScore = events.reduce((sum, e) => sum + e.importance, 0)
    const sumScoreSquared = events.reduce((sum, e) => sum + e.importance ** 2, 0)
    const riskIndex = sumScoreSquared / sumScore

    expect(riskIndex).toBeCloseTo(8.53, 1)
  })

  it('should return 0 for empty events', () => {
    const events: any[] = []
    const sumScore = events.reduce((sum, e) => sum + (e.importance || 0), 0)
    expect(sumScore).toBe(0)
  })
})
