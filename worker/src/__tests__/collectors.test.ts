/**
 * 采集器测试 - 验证数据契约和语义正确性
 *
 * 注意：ky 内部先调 response.text() 再解析 JSON，
 * 所以 mock 必须同时提供 text() 和 json() 方法。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 构造一个 ky 兼容的 mock response
 * ky 会先调 .text() 再 JSON.parse，所以需要同时提供 text() 和 json()
 */
function mockResponse(data: any) {
  const text = JSON.stringify(data);
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(data),
    headers: new Map(),
  };
}

describe('FRED Collector', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should mark all events as confidence: estimated (dates are inferred)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockResponse({
      observations: [
        { date: '2026-05-01', value: '3.2' },
        { date: '2026-04-01', value: '3.1' },
      ],
    }))
    vi.stubGlobal('fetch', mockFetch)

    const { collectFredData } = await import('../collectors/fred')

    const events = await collectFredData({ apiKey: 'test-key' })

    // All FRED events should be marked as estimated
    expect(events.length).toBeGreaterThan(0)
    for (const event of events) {
      expect(event.confidence).toBe('estimated')
    }
  })

  it('should NOT set actual_value for future events', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockResponse({
      observations: [
        { date: '2026-05-01', value: '3.2' },
        { date: '2026-04-01', value: '3.1' },
      ],
    }))
    vi.stubGlobal('fetch', mockFetch)

    const { collectFredData } = await import('../collectors/fred')

    const events = await collectFredData({ apiKey: 'test-key' })

    // Future events should not have actual_value
    expect(events.length).toBeGreaterThan(0)
    for (const event of events) {
      expect(event.actual_value).toBeNull()
    }
  })

  it('should put latest observed value in previous_value', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockResponse({
      observations: [
        { date: '2026-05-01', value: '3.2' },
        { date: '2026-04-01', value: '3.1' },
      ],
    }))
    vi.stubGlobal('fetch', mockFetch)

    const { collectFredData } = await import('../collectors/fred')

    const events = await collectFredData({ apiKey: 'test-key' })

    // Latest observed value should be in previous_value for reference
    expect(events.length).toBeGreaterThan(0)
    for (const event of events) {
      expect(event.previous_value).toBeDefined()
      expect(event.previous_value).not.toBeNull()
    }
  })
})

describe('EastMoney Collector', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should use API REPORT_DATE as event_date when available', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockResponse({
      result: {
        data: [
          {
            REPORT_DATE: '2026-06-10 00:00:00',
            TIME: '2026年05月份',
            NATIONAL_SAME: 2.5,
          },
          {
            REPORT_DATE: '2026-05-10 00:00:00',
            TIME: '2026年04月份',
            NATIONAL_SAME: 2.3,
          },
        ],
      },
    }))
    vi.stubGlobal('fetch', mockFetch)

    const { collectEastMoneyData } = await import('../collectors/eastmoney')

    const events = await collectEastMoneyData()

    // Should use actual report date from API
    expect(events.length).toBeGreaterThan(0)
    for (const event of events) {
      expect(event.event_date).toBe('2026-06-10')
      expect(event.confidence).toBe('confirmed')
    }
  })

  it('should mark as estimated when REPORT_DATE is missing', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockResponse({
      result: {
        data: [
          {
            REPORT_DATE: null,
            TIME: '2026年05月份',
            NATIONAL_SAME: 2.5,
          },
        ],
      },
    }))
    vi.stubGlobal('fetch', mockFetch)

    const { collectEastMoneyData } = await import('../collectors/eastmoney')

    const events = await collectEastMoneyData()

    // Should fall back to estimated
    expect(events.length).toBeGreaterThan(0)
    for (const event of events) {
      expect(event.confidence).toBe('estimated')
    }
  })

  it('should set actual_value for published data', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockResponse({
      result: {
        data: [
          {
            REPORT_DATE: '2026-06-10 00:00:00',
            TIME: '2026年05月份',
            NATIONAL_SAME: 2.5,
          },
          {
            REPORT_DATE: '2026-05-10 00:00:00',
            TIME: '2026年04月份',
            NATIONAL_SAME: 2.3,
          },
        ],
      },
    }))
    vi.stubGlobal('fetch', mockFetch)

    const { collectEastMoneyData } = await import('../collectors/eastmoney')

    const events = await collectEastMoneyData()

    // Published CPI data should have actual_value = '2.5%'
    // (PPI events may have undefined values depending on mock data)
    const cpiEvents = events.filter(e => e.event_key.startsWith('CN_CPI'))
    expect(cpiEvents.length).toBeGreaterThan(0)
    for (const event of cpiEvents) {
      expect(event.actual_value).toBe('2.5%')
      expect(event.previous_value).toBe('2.3%')
    }
  })
})
