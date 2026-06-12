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
import type { CalendarEffects, CalendarBannerData, CalendarDayStat, CalendarToday, NextTradingDay, ActionSignal, Almanac, AlmanacSignal } from '../../shared/types';

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
 * Calculate next trading day (skip weekends)
 */
function getNextTradingDayStr(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Skip to next weekday
  const dayOfWeek = date.getUTCDay();
  let skip = 1;
  if (dayOfWeek === 5) skip = 3; // Friday → Monday
  else if (dayOfWeek === 6) skip = 2; // Saturday → Monday
  date.setUTCDate(date.getUTCDate() + skip);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Generate action signal based on next trading day's rating
 */
function generateActionSignal(rating: number, basisDate: string): ActionSignal {
  if (rating >= 8) {
    return {
      action: 'strong_buy',
      label: '加仓窗口',
      description: '明日历史评分极高，上涨概率显著偏大，今日可考虑逢低加仓',
      basis_rating: rating,
      basis_date: basisDate,
    };
  }
  if (rating >= 6) {
    return {
      action: 'buy',
      label: '轻仓布局',
      description: '明日偏利好，今日可适度布局，控制仓位',
      basis_rating: rating,
      basis_date: basisDate,
    };
  }
  if (rating >= 4) {
    return {
      action: 'hold',
      label: '观望为主',
      description: '明日走势中性，建议持仓观望，不急于操作',
      basis_rating: rating,
      basis_date: basisDate,
    };
  }
  if (rating >= 2) {
    return {
      action: 'caution',
      label: '谨慎操作',
      description: '明日偏利空，下跌风险偏大，建议控制仓位或减仓',
      basis_rating: rating,
      basis_date: basisDate,
    };
  }
  return {
    action: 'sell',
    label: '减仓回避',
    description: '明日历史评分极低，下跌概率显著偏大，建议今日减仓或回避',
    basis_rating: rating,
    basis_date: basisDate,
  };
}

/**
 * Lightweight: compute only "today" fields for a date (used for next trading day lookup)
 */
function getActiveCalendarEffectsInner(dateStr: string): { today: CalendarToday } {
  const [year, month, dayOfMonth] = dateStr.split('-').map(Number);

  const dailyMonthData = (calendarData as any).daily_by_month?.[DEFAULT_INDEX]?.data?.[String(month)] || [];
  const todayStat = dailyMonthData.find((d: CalendarDayStat) => d.day === dayOfMonth);

  const allDayProbs = dailyMonthData.map((d: CalendarDayStat) => d.up_probability);
  const dayMean = mean(allDayProbs);
  const dayStd = std(allDayProbs);
  const todayZScore = todayStat ? zScore(todayStat.up_probability, dayMean, dayStd) : 0;

  return {
    today: {
      day_of_month: dayOfMonth,
      up_probability: todayStat?.up_probability ?? 0.5,
      avg_change_pct: todayStat?.avg_change_pct ?? 0,
      sample_count: todayStat?.sample_count ?? 0,
      z_score: Math.round(todayZScore * 100) / 100,
      rating: zScoreToRating(todayZScore),
    },
  };
}

/**
 * Generate a single almanac signal from a rating score.
 * 3 zones: add (>=6), hold (>=4), reduce (<4).
 */
function generateAlmanacSignal(rating: number, dimension: 'short_term' | 'swing'): AlmanacSignal {
  const isShort = dimension === 'short_term';
  if (rating >= 6) {
    return {
      action: 'add',
      label: '宜加仓',
      description: isShort
        ? '明日上涨概率偏大，今日适合逢低买入'
        : '下月上涨概率偏大，本月适合逐步加仓',
    };
  }
  if (rating >= 4) {
    return {
      action: 'hold',
      label: '宜观望',
      description: isShort
        ? '明日走势偏中性，建议持仓观望'
        : '下月方向不明，本月维持当前仓位',
    };
  }
  return {
    action: 'reduce',
    label: '宜减仓',
    description: isShort
      ? '明日下跌风险偏大，不宜加仓'
      : '下月下跌风险偏大，本月应逐步降低仓位',
  };
}

/**
 * Generate combined advice from short-term and swing signals.
 */
function generateAlmanacAdvice(short: AlmanacSignal, swing: AlmanacSignal): string {
  if (short.action === 'add' && swing.action === 'add') {
    return '短线和中周期均偏利好，可积极加仓';
  }
  if (short.action === 'reduce' && swing.action === 'reduce') {
    return '短线和中周期均偏利空，建议减仓或切换到债券/现金';
  }
  if (short.action === 'add' && swing.action === 'reduce') {
    return '短线可逢低买入，但中周期偏弱，建议轻仓快进快出';
  }
  if (short.action === 'reduce' && swing.action === 'add') {
    return '短线偏谨慎，但中周期偏强，可小仓位试错';
  }
  if (short.action === 'add') {
    return '短线偏利好，可适度买入，中周期方向不明注意仓位';
  }
  if (short.action === 'reduce') {
    return '短线偏谨慎，不宜加仓，中周期方向不明保持观望';
  }
  // short === hold
  if (swing.action === 'add') {
    return '中周期偏利好可布局，短线偏中性不必急于操作';
  }
  if (swing.action === 'reduce') {
    return '中周期偏弱应控制仓位，短线中性可持仓观望';
  }
  return '短线与中周期均中性，建议持仓观望，不急于操作';
}

/**
 * Compute almanac (黄历) with two independent dimensions:
 * - Short-term: next trading day rating → today's action
 * - Swing: next month rating → this month's action
 */
function computeAlmanac(nextDayRating: number, nextMonthRating: number): Almanac {
  const shortTermSignal = generateAlmanacSignal(nextDayRating, 'short_term');
  const swingSignal = generateAlmanacSignal(nextMonthRating, 'swing');
  const advice = generateAlmanacAdvice(shortTermSignal, swingSignal);

  return {
    short_term: {
      rating: nextDayRating,
      signal: shortTermSignal,
    },
    swing: {
      rating: nextMonthRating,
      signal: swingSignal,
    },
    advice,
  };
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

  // 6. Next trading day & action signal
  const nextDateStr = getNextTradingDayStr(dateStr);
  const nextEffects = getActiveCalendarEffectsInner(nextDateStr);
  const nextTradingDay = {
    date: nextDateStr,
    day_of_month: nextEffects.today.day_of_month,
    up_probability: nextEffects.today.up_probability,
    avg_change_pct: nextEffects.today.avg_change_pct,
    rating: nextEffects.today.rating ?? 5,
    sample_count: nextEffects.today.sample_count ?? 0,
  };
  const actionSignal = generateActionSignal(nextTradingDay.rating, nextDateStr);

  // 7. 黄历 — 组合评分（逢低买入逻辑）
  // 短线：明日评分 + 今日弱日的入场加分（今日弱=低价入场点，增强买入信号）
  // 波段：下月评分 + 本月弱势的入场加分
  const nextMonthNum = month % 12 + 1;
  const nextMonthStat = allMonths.find((m: any) => m.month === nextMonthNum);
  const nextMonthRating = nextMonthStat?.rating ?? thisMonth.rating ?? 5;

  const shortTermBase = nextTradingDay.rating ?? 5;
  const shortTermEntryBonus = Math.max(0, (5 - (today.rating ?? 5)) * 0.5);
  const shortTermScore = Math.round(Math.min(10, Math.max(0, shortTermBase + shortTermEntryBonus)) * 10) / 10;

  const swingBase = nextMonthRating;
  const swingEntryBonus = Math.max(0, (5 - (thisMonth.rating ?? 5)) * 0.5);
  const swingScore = Math.round(Math.min(10, Math.max(0, swingBase + swingEntryBonus)) * 10) / 10;

  const almanac = computeAlmanac(shortTermScore, swingScore);

  // 8. Almanac by index (三大指数各自的黄历)
  const almanacByIndex = buildAlmanacByIndex(dateStr, month, allIndicesData);

  return {
    today,
    this_month: thisMonth,
    next_trading_day: nextTradingDay,
    action_signal: actionSignal,
    almanac,
    almanac_by_index: almanacByIndex,
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
          sample_count: m.sample_count ?? 0,
          z_score: Math.round(z * 100) / 100,
          rating: zScoreToRating(z),
        };
      }),
    };
  }

  return result;
}

/**
 * Compute daily stats (today + next trading day) for a specific index.
 */
function getDailyStatsForIndex(dateStr: string, indexCode: string): {
  today: { up_probability: number; sample_count: number; rating: number };
  next_day: { up_probability: number; sample_count: number; rating: number };
} {
  const [year, month, dayOfMonth] = dateStr.split('-').map(Number);

  const dailyMonthData = (calendarData as any).daily_by_month?.[indexCode]?.data?.[String(month)] || [];

  // Today's stats
  const todayStat = dailyMonthData.find((d: CalendarDayStat) => d.day === dayOfMonth);
  const allDayProbs = dailyMonthData.map((d: CalendarDayStat) => d.up_probability);
  const dayMean = mean(allDayProbs);
  const dayStd = std(allDayProbs);
  const todayZ = todayStat ? zScore(todayStat.up_probability, dayMean, dayStd) : 0;

  // Next trading day's stats
  const nextDateStr = getNextTradingDayStr(dateStr);
  const [, nextMonth, nextDay] = nextDateStr.split('-').map(Number);
  const nextDailyMonthData = (calendarData as any).daily_by_month?.[indexCode]?.data?.[String(nextMonth)] || [];
  const nextStat = nextDailyMonthData.find((d: CalendarDayStat) => d.day === nextDay);
  const nextAllProbs = nextDailyMonthData.map((d: CalendarDayStat) => d.up_probability);
  const nextMean = mean(nextAllProbs);
  const nextStdVal = std(nextAllProbs);
  const nextZ = nextStat ? zScore(nextStat.up_probability, nextMean, nextStdVal) : 0;

  return {
    today: {
      up_probability: todayStat?.up_probability ?? 0.5,
      sample_count: todayStat?.sample_count ?? 0,
      rating: zScoreToRating(todayZ),
    },
    next_day: {
      up_probability: nextStat?.up_probability ?? 0.5,
      sample_count: nextStat?.sample_count ?? 0,
      rating: zScoreToRating(nextZ),
    },
  };
}

/**
 * Build almanac data for all three indices.
 */
function buildAlmanacByIndex(dateStr: string, currentMonth: number, allIndicesData: any): any {
  const indices = ['000001', '000300', '000905'];
  const nextMonthNum = currentMonth % 12 + 1;
  const result: any = {};

  for (const code of indices) {
    const indexInfo = (calendarData as any).indices?.find((i: any) => i.code === code);
    const indexMonthData = allIndicesData[code];
    if (!indexMonthData) continue;

    // Daily stats for this index
    const daily = getDailyStatsForIndex(dateStr, code);

    // Monthly stats for this index
    const thisMonthData = indexMonthData.data.find((m: any) => m.month === currentMonth);
    const nextMonthData = indexMonthData.data.find((m: any) => m.month === nextMonthNum);

    const thisMonthRating = thisMonthData?.rating ?? 5;
    const nextMonthRating = nextMonthData?.rating ?? 5;
    const thisMonthProb = thisMonthData?.up_probability ?? 0.5;
    const nextMonthProb = nextMonthData?.up_probability ?? 0.5;
    const thisMonthSampleCount = thisMonthData?.sample_count ?? 0;
    const nextMonthSampleCount = nextMonthData?.sample_count ?? 0;

    // Compute combined scores (dip-buying bonus)
    const shortTermBase = daily.next_day.rating;
    const shortTermEntryBonus = Math.max(0, (5 - daily.today.rating) * 0.5);
    const shortTermScore = Math.round(Math.min(10, Math.max(0, shortTermBase + shortTermEntryBonus)) * 10) / 10;

    const swingBase = nextMonthRating;
    const swingEntryBonus = Math.max(0, (5 - thisMonthRating) * 0.5);
    const swingScore = Math.round(Math.min(10, Math.max(0, swingBase + swingEntryBonus)) * 10) / 10;

    const almanac = computeAlmanac(shortTermScore, swingScore);

    result[code] = {
      name: indexInfo?.name ?? code,
      almanac,
      today_prob: daily.today.up_probability,
      today_sample_count: daily.today.sample_count,
      next_day_prob: daily.next_day.up_probability,
      next_day_sample_count: daily.next_day.sample_count,
      this_month_prob: thisMonthProb,
      this_month_sample_count: thisMonthSampleCount,
      next_month_prob: nextMonthProb,
      next_month_sample_count: nextMonthSampleCount,
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
