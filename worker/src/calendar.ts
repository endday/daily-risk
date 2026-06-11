/**
 * Calendar Effects Module
 *
 * Loads calendar-effects.json and provides:
 * - Today's probability (day-of-month historical stats)
 * - This month's probability
 * - Daily calendar grid data
 * - Active special window banner (Spring Festival, Two Sessions, etc.)
 * - Z-Score for visual differentiation
 */

import calendarData from '../data/calendar-effects.json';
import type { CalendarEffects, CalendarBannerData, CalendarDayStat } from '../../shared/types';

// Default index: Shanghai Composite
const DEFAULT_INDEX = '000001';

// Banner priority (lower = higher priority)
const BANNER_PRIORITY: Record<string, number> = {
  spring_festival: 1,
  earnings_deadline_q1: 2,
  two_sessions: 3,
  golden_october: 4,
  turn_of_month: 5,
  earnings_deadline_h1: 6,
  earnings_deadline_q3: 7,
};

/**
 * Calculate mean of an array
 */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Calculate standard deviation of an array
 */
function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Calculate Z-Score
 */
function zScore(value: number, m: number, s: number): number {
  if (s === 0) return 0;
  return (value - m) / s;
}

/**
 * Convert Z-Score to a 0-10 score
 * Z = -2 → 0, Z = 0 → 5, Z = +2 → 10
 */
function zScoreToRating(z: number): number {
  const score = 5 + z * 2.5;
  return Math.round(Math.max(0, Math.min(10, score)) * 10) / 10; // Round to 1 decimal
}

/**
 * Get calendar effects for a given date string.
 * @param dateStr - The target date in YYYY-MM-DD format (Beijing time)
 */
export function getActiveCalendarEffects(dateStr: string): CalendarEffects {
  // Parse date string directly to avoid timezone issues
  const [year, month, dayOfMonth] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, dayOfMonth));

  // 1. Today's probability (day-of-month stats)
  const dailyMonthData = (calendarData as any).daily_by_month?.[DEFAULT_INDEX]?.data?.[String(month)] || [];
  const todayStat = dailyMonthData.find((d: CalendarDayStat) => d.day === dayOfMonth);

  // Calculate Z-Score for today's day (relative to all days in this month)
  const allDayProbs = dailyMonthData.map((d: CalendarDayStat) => d.up_probability);
  const dayMean = mean(allDayProbs);
  const dayStd = std(allDayProbs);
  const todayZScore = todayStat ? zScore(todayStat.up_probability, dayMean, dayStd) : 0;

  const today = {
    day_of_month: dayOfMonth,
    up_probability: todayStat?.up_probability ?? 0.5,
    avg_change_pct: todayStat?.avg_change_pct ?? 0,
    sample_count: todayStat?.sample_count ?? 0,
    z_score: Math.round(todayZScore * 100) / 100, // Round to 2 decimals
    rating: zScoreToRating(todayZScore),
  };

  // 2. This month's probability
  const monthlyData = (calendarData as any).monthly?.[DEFAULT_INDEX]?.data || [];
  const monthStat = monthlyData.find((m: any) => m.month === month);

  // Calculate Z-Score for this month (relative to all 12 months)
  const allMonthProbs = monthlyData.map((m: any) => m.up_probability);
  const monthMean = mean(allMonthProbs);
  const monthStd = std(allMonthProbs);
  const monthZScore = monthStat ? zScore(monthStat.up_probability, monthMean, monthStd) : 0;

  const thisMonth = {
    month,
    up_probability: monthStat?.up_probability ?? 0.5,
    avg_change_pct: monthStat?.avg_change_pct ?? 0,
    label: monthStat?.label ?? null,
    volatility: monthStat?.volatility ?? 0,
    decay: monthStat?.decay ?? null,
    streaks: monthStat?.streaks ?? null,
    z_score: Math.round(monthZScore * 100) / 100, // Round to 2 decimals
    rating: zScoreToRating(monthZScore),
  };

  // 3. Daily calendar (all days of this month) - with Z-Scores and ratings
  const dailyCalendar: CalendarDayStat[] = dailyMonthData.map((d: CalendarDayStat) => {
    const z = zScore(d.up_probability, dayMean, dayStd);
    return {
      ...d,
      z_score: Math.round(z * 100) / 100,
      rating: zScoreToRating(z),
    };
  });

  // 3.5 All 12 months data (with decay, streaks, Z-Scores, and ratings)
  const allMonths = monthlyData.map((m: any) => {
    const z = zScore(m.up_probability, monthMean, monthStd);
    return {
      month: m.month,
      sample_count: m.sample_count,
      up_probability: m.up_probability,
      avg_change_pct: m.avg_change_pct,
      volatility: m.volatility ?? 0,
      label: m.label ?? null,
      confidence: m.confidence ?? 0,
      decay: m.decay ?? null,
      streaks: m.streaks ?? null,
      z_score: Math.round(z * 100) / 100,
      rating: zScoreToRating(z),
    };
  });

  // 3.6 Index comparison for all 12 months (3 indices)
  const allIndicesData = buildAllIndicesMonthlyData();

  // 3.7 Special effect stats (from JSON)
  const specialEffectStats = (calendarData as any).special_effect_stats ?? null;

  // 4. Match special windows → banner (max 1, highest priority)
  const activeBanner = matchActiveBanner(date, year, month, dayOfMonth);

  // 5. Yearly overview (best/worst month)
  const sorted = [...monthlyData].sort((a: any, b: any) => b.up_probability - a.up_probability);
  const bestMonth = sorted[0];
  const worstMonth = sorted[sorted.length - 1];

  return {
    today,
    this_month: thisMonth,
    daily_calendar: dailyCalendar,
    all_months: allMonths,
    indices_monthly: allIndicesData,
    special_effect_stats: specialEffectStats,
    active_banner: activeBanner,
    yearly_overview: {
      best_month: {
        month: bestMonth?.month ?? 2,
        up_probability: bestMonth?.up_probability ?? 0,
        label: bestMonth?.label ?? null,
      },
      worst_month: {
        month: worstMonth?.month ?? 4,
        up_probability: worstMonth?.up_probability ?? 0,
        label: worstMonth?.label ?? null,
      },
    },
  };
}

/**
 * Build full 12-month data for all indices with ratings.
 */
function buildAllIndicesMonthlyData(): any {
  const indices = ['000001', '000300', '000905'];
  const result: any = {};

  for (const code of indices) {
    const monthData = (calendarData as any).monthly?.[code]?.data || [];
    const indexInfo = (calendarData as any).indices?.find((i: any) => i.code === code);

    // Calculate mean and std for this index
    const probs = monthData.map((m: any) => m.up_probability);
    const indexMean = mean(probs);
    const indexStd = std(probs);

    result[code] = {
      name: indexInfo?.name ?? code,
      data: monthData.map((m: any) => {
        const z = zScore(m.up_probability, indexMean, indexStd);
        return {
          month: m.month,
          up_probability: m.up_probability,
          avg_change_pct: m.avg_change_pct,
          label: m.label ?? null,
          z_score: Math.round(z * 100) / 100,
          rating: zScoreToRating(z),
        };
      }),
    };
  }

  return result;
}

/**
 * Match all special windows and return the highest-priority banner.
 */
function matchActiveBanner(date: Date, year: number, month: number, day: number): CalendarBannerData | null {
  const windows = (calendarData as any).special_windows || [];
  const matched: { priority: number; banner: CalendarBannerData }[] = [];

  for (const w of windows) {
    const result = matchWindow(date, year, month, day, w);
    if (result) {
      matched.push({
        priority: BANNER_PRIORITY[w.key] ?? 99,
        banner: result,
      });
    }
  }

  if (matched.length === 0) return null;

  matched.sort((a, b) => a.priority - b.priority);
  return matched[0].banner;
}

/**
 * Match a single special window definition against a date.
 */
function matchWindow(
  date: Date,
  year: number,
  month: number,
  day: number,
  window: any,
): CalendarBannerData | null {
  switch (window.type) {
    case 'fixed_date_range':
      return matchFixedDateRange(month, day, window);

    case 'month_range':
      return matchMonthRange(month, window);

    case 'day_of_month_range':
      return matchDayOfMonthRange(date, year, month, day, window);

    case 'chinese_calendar':
      return matchChineseCalendar(date, year, window);

    default:
      return null;
  }
}

/**
 * Fixed date range: e.g. 03-01 to 03-20 (Two Sessions), 10-01 to 10-15 (Golden October)
 */
function matchFixedDateRange(month: number, day: number, window: any): CalendarBannerData | null {
  const range = window.date_range;
  if (!range) return null;

  const [startMonth, startDay] = range.start.split('-').map(Number);
  const [endMonth, endDay] = range.end.split('-').map(Number);

  const dateVal = month * 100 + day;
  const startVal = startMonth * 100 + startDay;
  const endVal = endMonth * 100 + endDay;

  if (dateVal >= startVal && dateVal <= endVal) {
    return {
      key: window.key,
      name: window.name,
      icon: window.icon,
      text: window.description || window.name,
    };
  }

  return null;
}

/**
 * Month range: e.g. month=4 (Earnings season)
 */
function matchMonthRange(month: number, window: any): CalendarBannerData | null {
  if (window.month === month) {
    return {
      key: window.key,
      name: window.name,
      icon: window.icon,
      text: window.warning || window.description || window.name,
    };
  }
  return null;
}

/**
 * Day of month range: e.g. last 1 day of month + first 3 days of next month (Turn of Month)
 */
function matchDayOfMonthRange(_date: Date, year: number, month: number, day: number, window: any): CalendarBannerData | null {
  const ranges = window.ranges || [];

  for (const range of ranges) {
    // range.start = -1 means "last day of previous month"
    // range.end = 3 means "first 3 days of this month"

    // Check if it's the first N days of the month
    if (range.end > 0 && day <= range.end) {
      return {
        key: window.key,
        name: window.name,
        icon: window.icon,
        text: window.description || window.name,
      };
    }

    // Check if it's the last days of the month
    if (range.start < 0) {
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      if (day > daysInMonth + range.start) {
        return {
          key: window.key,
          name: window.name,
          icon: window.icon,
          text: window.description || window.name,
        };
      }
    }
  }

  return null;
}

/**
 * Chinese calendar: Spring Festival effect
 * Uses pre-calculated spring_festival_dates to find the festival date for the year,
 * then checks if the current date falls within the trigger range.
 */
function matchChineseCalendar(date: Date, year: number, window: any): CalendarBannerData | null {
  const festivalDates: Record<string, string> = (calendarData as any).spring_festival_dates || {};

  // Check current year and adjacent years
  for (const y of [year - 1, year, year + 1]) {
    const festivalDateStr = festivalDates[String(y)];
    if (!festivalDateStr) continue;

    const festivalDate = new Date(festivalDateStr + 'T00:00:00Z'); // UTC 对齐 date 参数
    const diffDays = Math.round((date.getTime() - festivalDate.getTime()) / (24 * 60 * 60 * 1000));

    // Trigger range: ~15 days before to ~15 days after
    if (diffDays >= -15 && diffDays <= 15) {
      // 从数据中读取实际涨幅，避免硬编码
      const postPct = (calendarData as any).special_effect_stats?.spring_festival?.aggregate?.post_5d?.avg_change_pct;
      const pctText = typeof postPct === 'number'
        ? `${postPct >= 0 ? '+' : ''}${postPct.toFixed(2)}%`
        : '+1.95%'; // fallback

      let text = '';
      if (diffDays < 0) {
        text = `距春节还有 ${Math.abs(diffDays)} 天 · 节后5日历史均涨${pctText}`;
      } else if (diffDays === 0) {
        text = `今天是春节 · 节后5日历史均涨${pctText}`;
      } else {
        text = `春节后 ${diffDays} 天 · 节后5日历史均涨${pctText}`;
      }

      return {
        key: window.key,
        name: window.name,
        icon: window.icon,
        text,
      };
    }
  }

  return null;
}
