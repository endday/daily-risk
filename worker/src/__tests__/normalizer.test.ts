/**
 * Normalizer 模块测试
 * 验证数据校验和归一化逻辑
 */

import { describe, it, expect, vi } from 'vitest'
import { normalizeEvent, normalizeEvents, formatEventValue } from '../../../shared/normalizer'

// 静默 logger，避免测试输出噪音
const silentLogger = {
  error: vi.fn(),
  warn: vi.fn(),
}

describe('normalizeEvent', () => {
  it('should reject event without event_key', () => {
    const result = normalizeEvent({ event_date: '2026-06-11' }, undefined, silentLogger)
    expect(result).toBeNull()
    expect(silentLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('event_key'),
      expect.anything()
    )
  })

  it('should reject event without event_date', () => {
    const result = normalizeEvent({ event_key: 'US_CPI' }, undefined, silentLogger)
    expect(result).toBeNull()
  })

  it('should reject event with invalid date format', () => {
    const result = normalizeEvent(
      { event_key: 'US_CPI', event_date: '2026/06/11' },
      undefined,
      silentLogger
    )
    expect(result).toBeNull()
  })

  it('should accept valid minimal event', () => {
    const result = normalizeEvent(
      { event_key: 'US_CPI', event_date: '2026-06-11' },
      undefined,
      silentLogger
    )
    expect(result).not.toBeNull()
    expect(result!.event_key).toBe('US_CPI')
    expect(result!.event_date).toBe('2026-06-11')
    expect(result!.source).toBe('unknown')
    expect(result!.country).toBe('US')
    expect(result!.importance).toBe(5)
  })

  it('should uppercase event_key', () => {
    const result = normalizeEvent(
      { event_key: 'us_cpi', event_date: '2026-06-11' },
      undefined,
      silentLogger
    )
    expect(result!.event_key).toBe('US_CPI')
  })

  it('should apply rule score when provided', () => {
    const rule = {
      display_name: '美国 CPI',
      score: 10,
      country: 'US',
      timezone: 'America/New_York',
      market_impact: ['NASDAQ', 'GOLD'],
      calendar_source: 'fred',
      display_format: 'percent',
    }

    const result = normalizeEvent(
      { event_key: 'US_CPI', event_date: '2026-06-11' },
      rule,
      silentLogger
    )

    expect(result!.importance).toBe(10)
    expect(result!.display_name).toBe('美国 CPI')
    expect(result!.market_impact).toEqual(['NASDAQ', 'GOLD'])
  })

  it('should reject rule with invalid score', () => {
    const rule = {
      display_name: 'Test',
      score: 15, // invalid: must be 1-10
      country: 'US',
      timezone: 'UTC',
      market_impact: [],
      calendar_source: 'test',
      display_format: 'percent',
    }

    const result = normalizeEvent(
      { event_key: 'TEST', event_date: '2026-06-11' },
      rule,
      silentLogger
    )
    expect(result).toBeNull()
  })
})

describe('normalizeEvents', () => {
  it('should filter out invalid events', () => {
    const rawEvents = [
      { event_key: 'US_CPI', event_date: '2026-06-11' },
      { event_key: '', event_date: '2026-06-11' }, // invalid
      { event_key: 'US_PMI', event_date: 'invalid' }, // invalid
      { event_key: 'US_PPI', event_date: '2026-06-11' },
    ]

    const result = normalizeEvents(rawEvents, {}, silentLogger)
    expect(result).toHaveLength(2)
    expect(result[0].event_key).toBe('US_CPI')
    expect(result[1].event_key).toBe('US_PPI')
  })
})

describe('formatEventValue', () => {
  it('should return "--" for null/undefined', () => {
    expect(formatEventValue(null)).toBe('--')
    expect(formatEventValue(null, 'percent')).toBe('--')
  })

  it('should format percent', () => {
    expect(formatEventValue('3.2', 'percent')).toBe('3.2%')
    expect(formatEventValue(3.2, 'percent')).toBe('3.2%')
  })

  it('should format yoy_percent', () => {
    expect(formatEventValue('5.1', 'yoy_percent')).toBe('5.1%')
  })

  it('should format eps', () => {
    expect(formatEventValue('1.25', 'eps')).toBe('$1.25')
  })

  it('should return raw value for unknown format', () => {
    expect(formatEventValue('some-value')).toBe('some-value')
    expect(formatEventValue(42)).toBe('42')
  })

  it('should handle rate_range format', () => {
    expect(formatEventValue('5.25-5.50%', 'rate_range')).toBe('5.25-5.50%')
  })
})
