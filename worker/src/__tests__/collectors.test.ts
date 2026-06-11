/**
 * 采集器测试 - 验证数据契约和语义正确性
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('FRED Collector', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should mark all events as confidence: estimated (dates are inferred)', async () => {
    // Mock fetch to return FRED observations
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        observations: [
          { date: '2026-05-01', value: '3.2' },
          { date: '2026-04-01', value: '3.1' },
        ],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { collectFredData } = await import('../collectors/fred')

    const events = await collectFredData({ apiKey: 'test-key' })

    // All FRED events should be marked as estimated
    for (const event of events) {
      expect(event.confidence).toBe('estimated')
    }
  })

  it('should NOT set actual_value for future events', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        observations: [
          { date: '2026-05-01', value: '3.2' },
          { date: '2026-04-01', value: '3.1' },
        ],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { collectFredData } = await import('../collectors/fred')

    const events = await collectFredData({ apiKey: 'test-key' })

    // Future events should not have actual_value
    for (const event of events) {
      expect(event.actual_value).toBeNull()
    }
  })

  it('should put latest observed value in previous_value', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        observations: [
          { date: '2026-05-01', value: '3.2' },
          { date: '2026-04-01', value: '3.1' },
        ],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { collectFredData } = await import('../collectors/fred')

    const events = await collectFredData({ apiKey: 'test-key' })

    // Latest observed value should be in previous_value for reference
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
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
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
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { collectEastMoneyData } = await import('../collectors/eastmoney')

    const events = await collectEastMoneyData()

    // Should use actual report date from API
    for (const event of events) {
      expect(event.event_date).toBe('2026-06-10')
      expect(event.confidence).toBe('confirmed')
    }
  })

  it('should mark as estimated when REPORT_DATE is missing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        result: {
          data: [
            {
              REPORT_DATE: null,
              TIME: '2026年05月份',
              NATIONAL_SAME: 2.5,
            },
          ],
        },
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { collectEastMoneyData } = await import('../collectors/eastmoney')

    const events = await collectEastMoneyData()

    // Should fall back to estimated
    for (const event of events) {
      expect(event.confidence).toBe('estimated')
    }
  })

  it('should set actual_value for published data', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
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
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { collectEastMoneyData } = await import('../collectors/eastmoney')

    const events = await collectEastMoneyData()

    // Published data should have actual_value
    for (const event of events) {
      expect(event.actual_value).toBe('2.5%')
      expect(event.previous_value).toBe('2.3%')
    }
  })
})
