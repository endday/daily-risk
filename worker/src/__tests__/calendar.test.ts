/**
 * Calendar Effects 模块测试
 * 验证核心日历效应计算逻辑
 */

import { describe, it, expect } from 'vitest'
import { getActiveCalendarEffects } from '../calendar'

describe('getActiveCalendarEffects', () => {
  // 使用一个已知的日期测试基本输出结构
  it('should return complete CalendarEffects structure', () => {
    const result = getActiveCalendarEffects('2026-06-11')

    // 顶层字段完整性
    expect(result.today).toBeDefined()
    expect(result.this_month).toBeDefined()
    expect(result.next_trading_day).toBeDefined()
    expect(result.action_signal).toBeDefined()
    expect(result.daily_calendar).toBeDefined()
    expect(result.all_months).toBeDefined()
    expect(result.yearly_overview).toBeDefined()
    expect(result.yearly_overview.best_month).toBeDefined()
    expect(result.yearly_overview.worst_month).toBeDefined()
  })

  it('should have valid today fields', () => {
    const result = getActiveCalendarEffects('2026-06-11')

    expect(result.today.day_of_month).toBe(11)
    expect(typeof result.today.up_probability).toBe('number')
    expect(result.today.up_probability).toBeGreaterThanOrEqual(0)
    expect(result.today.up_probability).toBeLessThanOrEqual(1)
    expect(typeof result.today.rating).toBe('number')
    expect(result.today.rating!).toBeGreaterThanOrEqual(0)
    expect(result.today.rating!).toBeLessThanOrEqual(10)
  })

  it('should have valid this_month fields', () => {
    const result = getActiveCalendarEffects('2026-06-11')

    expect(result.this_month.month).toBe(6)
    expect(typeof result.this_month.up_probability).toBe('number')
    expect(typeof result.this_month.volatility).toBe('number')
    expect(typeof result.this_month.rating).toBe('number')
  })

  it('should return 12 months in all_months', () => {
    const result = getActiveCalendarEffects('2026-06-11')

    expect(result.all_months).toHaveLength(12)
    for (const m of result.all_months) {
      expect(m.month).toBeGreaterThanOrEqual(1)
      expect(m.month).toBeLessThanOrEqual(12)
      expect(typeof m.rating).toBe('number')
    }
  })

  it('should return daily calendar for current month', () => {
    const result = getActiveCalendarEffects('2026-06-11')

    // June has 30 days
    expect(result.daily_calendar.length).toBeGreaterThan(0)
    expect(result.daily_calendar.length).toBeLessThanOrEqual(31)

    for (const day of result.daily_calendar) {
      expect(day.day).toBeGreaterThanOrEqual(1)
      expect(day.day).toBeLessThanOrEqual(31)
      expect(typeof day.rating).toBe('number')
    }
  })
})

describe('next_trading_day', () => {
  it('should skip weekend: Friday → Monday', () => {
    // 2026-06-12 is a Friday
    const result = getActiveCalendarEffects('2026-06-12')
    // Next trading day should be Monday 2026-06-15
    expect(result.next_trading_day.date).toBe('2026-06-15')
  })

  it('should skip weekend: Thursday → Friday', () => {
    // 2026-06-11 is a Thursday
    const result = getActiveCalendarEffects('2026-06-11')
    // Next trading day should be Friday 2026-06-12
    expect(result.next_trading_day.date).toBe('2026-06-12')
  })

  it('should have valid rating for next trading day', () => {
    const result = getActiveCalendarEffects('2026-06-11')
    expect(result.next_trading_day.rating).toBeGreaterThanOrEqual(0)
    expect(result.next_trading_day.rating).toBeLessThanOrEqual(10)
  })
})

describe('action_signal', () => {
  it('should return valid action signal with all required fields', () => {
    const result = getActiveCalendarEffects('2026-06-11')
    const signal = result.action_signal

    expect(['strong_buy', 'buy', 'hold', 'caution', 'sell']).toContain(signal.action)
    expect(typeof signal.label).toBe('string')
    expect(typeof signal.description).toBe('string')
    expect(typeof signal.basis_rating).toBe('number')
    expect(signal.basis_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('should match rating thresholds to correct action', () => {
    // Test multiple dates to verify rating→action mapping consistency
    const dates = [
      '2026-01-15', '2026-03-15', '2026-06-11',
      '2026-09-15', '2026-11-15',
    ]

    for (const date of dates) {
      const result = getActiveCalendarEffects(date)
      const { action, basis_rating } = result.action_signal

      if (basis_rating >= 8) expect(action).toBe('strong_buy')
      else if (basis_rating >= 6) expect(action).toBe('buy')
      else if (basis_rating >= 4) expect(action).toBe('hold')
      else if (basis_rating >= 2) expect(action).toBe('caution')
      else expect(action).toBe('sell')
    }
  })
})

describe('indices_monthly', () => {
  it('should return data for 3 indices', () => {
    const result = getActiveCalendarEffects('2026-06-11')

    expect(result.indices_monthly).toBeDefined()
    expect(result.indices_monthly!['000001']).toBeDefined()
    expect(result.indices_monthly!['000300']).toBeDefined()
    expect(result.indices_monthly!['000905']).toBeDefined()
  })

  it('should have 12 months of data per index', () => {
    const result = getActiveCalendarEffects('2026-06-11')
    const shanghai = result.indices_monthly!['000001']

    expect(shanghai.data).toHaveLength(12)
    expect(typeof shanghai.name).toBe('string')
  })
})
