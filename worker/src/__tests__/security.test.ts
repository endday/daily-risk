/**
 * 安全与数据完整性测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock D1 Database
function createMockDB() {
  return {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue({ results: [] }),
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue({}),
  }
}

describe('Admin Endpoint Security', () => {
  let mockEnv: any

  beforeEach(() => {
    mockEnv = {
      DB: createMockDB(),
      ADMIN_TOKEN: undefined,
      FRED_API_KEY: 'test-key',
    }
  })

  it('should reject /admin/collect when ADMIN_TOKEN is not configured', async () => {
    const { default: handler } = await import('../index')

    const request = new Request('http://localhost/admin/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await handler.fetch(request, mockEnv, {} as ExecutionContext)
    expect(response.status).toBe(503)

    const body = await response.json()
    expect(body.error).toBe('Admin endpoint not available')
  })

  it('should reject /admin/collect with invalid token', async () => {
    mockEnv.ADMIN_TOKEN = 'secret-token'

    const { default: handler } = await import('../index')

    const request = new Request('http://localhost/admin/collect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wrong-token',
      },
    })

    const response = await handler.fetch(request, mockEnv, {} as ExecutionContext)
    expect(response.status).toBe(401)

    const body = await response.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('should accept /admin/collect with valid token', async () => {
    mockEnv.ADMIN_TOKEN = 'secret-token'

    const { default: handler } = await import('../index')

    const request = new Request('http://localhost/admin/collect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer secret-token',
      },
    })

    const response = await handler.fetch(request, mockEnv, {
      waitUntil: vi.fn(),
    } as any)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('accepted')
  })
})

describe('API Event Format', () => {
  it('should include confidence field in event response', async () => {
    const mockDB = createMockDB()
    mockDB.prepare().all.mockResolvedValue({
      results: [{
        id: 1,
        event_key: 'US_CPI_2026-06-12',
        source: 'fred',
        title: '美国 CPI',
        display_name: '美国 CPI',
        event_date: '2026-06-12',
        event_time: '20:30',
        timezone: 'Asia/Shanghai',
        country: 'US',
        importance: 10,
        market_impact: '["NASDAQ","GOLD"]',
        previous_value: '3.2%',
        actual_value: null,
        confidence: 'estimated',
        status: 'scheduled',
      }],
    })

    const mockEnv = {
      DB: mockDB,
      ADMIN_TOKEN: 'test',
    }

    const { default: handler } = await import('../index')
    const request = new Request('http://localhost/api/events?date=2026-06-12')
    const response = await handler.fetch(request, mockEnv, {} as ExecutionContext)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.events).toHaveLength(1)
    expect(body.events[0].confidence).toBe('estimated')
  })
})

describe('Beijing Timezone Date Boundary', () => {
  it('should correctly identify today in Beijing time (UTC+8)', () => {
    // 北京时间 2026-06-11 10:00 = UTC 2026-06-11 02:00
    const utcTime = new Date('2026-06-11T02:00:00Z')
    const beijingOffset = 8 * 60 * 60 * 1000
    const beijingDate = new Date(utcTime.getTime() + beijingOffset)

    const year = beijingDate.getUTCFullYear()
    const month = String(beijingDate.getUTCMonth() + 1).padStart(2, '0')
    const day = String(beijingDate.getUTCDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`

    expect(dateStr).toBe('2026-06-11')
  })

  it('should handle date rollover at UTC 16:00 (Beijing midnight)', () => {
    // UTC 2026-06-11 16:00 = 北京时间 2026-06-12 00:00
    const utcTime = new Date('2026-06-11T16:00:00Z')
    const beijingOffset = 8 * 60 * 60 * 1000
    const beijingDate = new Date(utcTime.getTime() + beijingOffset)

    const year = beijingDate.getUTCFullYear()
    const month = String(beijingDate.getUTCMonth() + 1).padStart(2, '0')
    const day = String(beijingDate.getUTCDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`

    expect(dateStr).toBe('2026-06-12')
  })
})
