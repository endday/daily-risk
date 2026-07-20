import * as db from '../db';
import { getActiveCalendarEffects } from '../calendar';
import { getBeijingDate } from '../../../shared/date-utils';
import type { Env } from '../env';
import type { RiskEvent } from '../../../shared/types';

export interface HolidayEntry {
  date: string;
  name: string;
  is_trading_day: boolean;
}

interface EventRow {
  event_key: string;
  importance: number;
  display_name: string;
  description?: string | null;
  previous_value?: string | null;
  actual_value?: string | null;
  forecast_value?: string | null;
  confidence?: 'confirmed' | 'estimated';
  source_url?: string | null;
  event_time?: string | null;
  timezone?: string | null;
  country: string;
  market_impact?: string[] | string | null;
  status?: string | null;
  source: string;
}

/**
 * 从 D1 加载假日数据
 * 返回：{ set: 仅休市日集合（给日历计算用）, list: 全部条目（给前端展示用） }
 * 查不到表时 set=undefined → 回退"只跳周末"
 */
async function loadHolidayData(dbConn: D1Database, year: number): Promise<{
  set: Set<string> | undefined;
  list: HolidayEntry[];
}> {
  try {
    const { results } = await dbConn
      .prepare(`SELECT date, name, is_holiday FROM trading_holidays WHERE date LIKE ?1 ORDER BY date`)
      .bind(`${year}-%`)
      .all<{ date: string; name: string; is_holiday: number }>();

    if (results.length === 0) return { set: undefined, list: [] };

    const set = new Set<string>();
    const list: HolidayEntry[] = [];
    for (const row of results) {
      list.push({ date: row.date, name: row.name, is_trading_day: row.is_holiday === 0 });
      if (row.is_holiday === 1) set.add(row.date);
    }

    return { set, list };
  } catch {
    return { set: undefined, list: [] };
  }
}

function formatEventForAPI(event: EventRow): RiskEvent {
  return {
    event_key: event.event_key,
    score: event.importance,
    display_name: event.display_name,
    description: event.description || null,
    previous_value: event.previous_value || null,
    actual_value: event.actual_value || null,
    forecast_value: event.forecast_value || null,
    confidence: event.confidence || 'estimated',
    source_url: event.source_url || null,
    event_time: event.event_time || null,
    timezone: event.timezone || 'Asia/Shanghai',
    country: event.country,
    market_impact: typeof event.market_impact === 'string' ? JSON.parse(event.market_impact) : (event.market_impact || []),
    status: event.status || 'scheduled',
    source: event.source,
  };
}

export async function handleEvents(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const range = url.searchParams.get('range');
  const week = url.searchParams.get('week');

  try {
    const currentYear = new Date().getFullYear();
    const holidayData = await loadHolidayData(env.DB, currentYear);
    const holidays = holidayData.set;

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(JSON.stringify({ error: 'Invalid date format, expected YYYY-MM-DD' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...headers },
      });
    }

    if (week) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) {
        return new Response(JSON.stringify({ error: 'Invalid week format, expected YYYY-MM-DD' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...headers },
        });
      }

      const days = await db.getWeekEvents(env.DB, week);
      return new Response(JSON.stringify({
        timezone: 'Asia/Shanghai',
        week_start: days[0]?.date || week,
        days: days.map((day) => ({
          date: day.date,
          day_label: day.dayLabel,
          risk_index: day.risk_index,
          events: day.events.map(formatEventForAPI),
          calendar_effects: getActiveCalendarEffects(day.date, holidays),
        })),
        holidays: holidayData.list,
      }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', ...headers },
      });
    }

    if (range === 'today_tomorrow') {
      const groups = await db.getTodayTomorrowEvents(env.DB);
      return new Response(JSON.stringify({
        timezone: 'Asia/Shanghai',
        days: groups.map((group) => ({
          date: group.date,
          risk_index: db.calculateRiskIndex(group.events),
          events: group.events.map(formatEventForAPI),
          calendar_effects: getActiveCalendarEffects(group.date, holidays),
        })),
        holidays: holidayData.list,
      }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', ...headers },
      });
    }

    const targetDate = date || getBeijingDate(1);
    const results = await db.getEventsByDate(env.DB, targetDate);

    return new Response(JSON.stringify({
      date: targetDate,
      timezone: 'Asia/Shanghai',
      risk_index: db.calculateRiskIndex(results),
      events: results.map(formatEventForAPI),
      updated_at: new Date().toISOString(),
      calendar_effects: getActiveCalendarEffects(targetDate, holidays),
      holidays: holidayData.list,
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', ...headers },
    });
  } catch (error) {
    console.error('[API] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }
}
