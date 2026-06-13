/**
 * Daily Risk Worker - Cloudflare Worker Entry Point
 */

import * as db from './db';
import * as scheduler from './scheduler';
import { getActiveCalendarEffects } from './calendar';
import { getBeijingDate } from '../../shared/date-utils';
import riskRulesData from '../data/risk-rules.json';
import chinaEventsData from '../data/china-events.json';
import calendarEffectsData from '../data/calendar-effects.json';

export interface Env {
  DB: D1Database;
  ADMIN_TOKEN?: string;
  FRED_API_KEY?: string;
  BLS_API_KEY?: string;
  ALPHA_VANTAGE_KEY?: string;
}

const EARNINGS_SYMBOLS = ['NVDA', 'AAPL', 'MSFT', 'META', 'GOOGL', 'AMZN', 'TSLA', 'TSM'];

// 从 JSON 文件加载风险规则（唯一数据源）
const RISK_RULES: Record<string, any> = (riskRulesData as any).rules;

// 从 JSON 文件加载中国宏观事件日历（按年份自动选择）
const CHINA_EVENTS: any = chinaEventsData;

// ============================================
// HTTP Handler
// ============================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (url.pathname === '/api/events') {
      return handleEvents(request, env, corsHeaders);
    }

    if (url.pathname === '/admin/collect' && request.method === 'POST') {
      return handleCollect(request, env, ctx, corsHeaders);
    }

    if (url.pathname === '/admin/calendar-info' && request.method === 'GET') {
      return handleCalendarInfo(corsHeaders);
    }

    if (url.pathname === '/admin/recompute-calendar' && request.method === 'POST') {
      return handleRecomputeCalendar(request, env, corsHeaders);
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[Cron] ${controller.cron} @ ${controller.scheduledTime}`);

    const collectorEnv: scheduler.CollectorEnv = {
      DB: env.DB,
      FRED_API_KEY: env.FRED_API_KEY,
      ALPHA_VANTAGE_KEY: env.ALPHA_VANTAGE_KEY,
      RISK_RULES,
      CHINA_EVENTS,
      EARNINGS_SYMBOLS,
    };

    if (controller.cron === '0 22 * * *') {
      ctx.waitUntil(scheduler.runDailyCollection(collectorEnv));
    } else if (controller.cron === '30 * * * *') {
      ctx.waitUntil(runActualValueUpdater(env));
    }
  },
};

// ============================================
// Route Handlers
// ============================================

async function handleEvents(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const range = url.searchParams.get('range');
  const week = url.searchParams.get('week');

  try {
    // 参数校验
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(JSON.stringify({ error: 'Invalid date format, expected YYYY-MM-DD' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...headers },
      });
    }

    // 周批量查询：?week=YYYY-MM-DD (该周任意一天)
    // 预留接口：前端当前按天逐个请求 + 客户端预加载，未来可切换为周批量查询减少请求数
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
        days: days.map(d => ({
          date: d.date,
          day_label: d.dayLabel,
          risk_index: d.risk_index,
          events: d.events.map(formatEventForAPI),
          calendar_effects: getActiveCalendarEffects(d.date),
        })),
      }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', ...headers },
      });
    }

    // 今日+明日批量查询：?range=today_tomorrow
    // 预留接口：前端当前未使用，可用于"明日风险榜"首页同时展示今明两天
    if (range === 'today_tomorrow') {
      const groups = await db.getTodayTomorrowEvents(env.DB);
      return new Response(JSON.stringify({
        timezone: 'Asia/Shanghai',
        days: groups.map(g => ({
          date: g.date,
          risk_index: db.calculateRiskIndex(g.events),
          events: g.events.map(formatEventForAPI),
          calendar_effects: getActiveCalendarEffects(g.date),
        })),
      }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', ...headers },
      });
    }

    // 单日查询
    const targetDate = date || getBeijingDate(1);
    const results = await db.getEventsByDate(env.DB, targetDate);

    return new Response(JSON.stringify({
      date: targetDate,
      timezone: 'Asia/Shanghai',
      risk_index: db.calculateRiskIndex(results),
      events: results.map(formatEventForAPI),
      updated_at: new Date().toISOString(),
      calendar_effects: getActiveCalendarEffects(targetDate),
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

async function handleCollect(request: Request, env: Env, ctx: ExecutionContext, headers: Record<string, string>): Promise<Response> {
  // 安全底线：必须配置 ADMIN_TOKEN 且请求携带有效 token
  if (!env.ADMIN_TOKEN) {
    console.error('[Admin] ADMIN_TOKEN not configured, rejecting request');
    return new Response(JSON.stringify({ error: 'Admin endpoint not available' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }

  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (token !== env.ADMIN_TOKEN) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }

  const collectorEnv: scheduler.CollectorEnv = {
    DB: env.DB,
    FRED_API_KEY: env.FRED_API_KEY,
    ALPHA_VANTAGE_KEY: env.ALPHA_VANTAGE_KEY,
    RISK_RULES,
    CHINA_EVENTS,
    EARNINGS_SYMBOLS,
  };

  ctx.waitUntil(scheduler.runDailyCollection(collectorEnv));

  return new Response(JSON.stringify({ status: 'accepted', message: 'Collection started' }), {
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function runActualValueUpdater(env: Env): Promise<void> {
  if (!env.FRED_API_KEY) {
    console.log('[Updater] No FRED_API_KEY, skipping');
    return;
  }

  console.log('[Updater] Starting actual value update...');
  try {
    // 获取 7 天内需要更新的事件
    const events = await db.getEventsForActualValueUpdate(env.DB, 7);
    console.log(`[Updater] Found ${events.length} events to check`);

    // 按 series_id 分组，避免重复调用 API
    const seriesMap = new Map<string, typeof events>();
    for (const event of events) {
      if (event.series_id) {
        if (!seriesMap.has(event.series_id)) seriesMap.set(event.series_id, []);
        seriesMap.get(event.series_id)!.push(event);
      }
    }

    // 逐个 series 拉取最新值
    for (const [seriesId, seriesEvents] of seriesMap) {
      try {
        const url = `https://api.stlouisfed.org/fred/series/observations` +
          `?api_key=${env.FRED_API_KEY}` +
          `&series_id=${seriesId}` +
          `&file_type=json` +
          `&sort_order=desc` +
          `&limit=1`;
        const res = await fetch(url);
        if (!res.ok) {
          console.error(`[Updater] FRED API error for ${seriesId}: ${res.status}`);
          continue;
        }
        const data = await res.json();
        const latest = data.observations?.[0];
        if (!latest || latest.value === '.') continue;

        // 更新所有关联事件
        for (const event of seriesEvents) {
          await db.updateEventActualValue(env.DB, event.id, latest.value, new Date().toISOString());
          console.log(`[Updater] Updated ${event.event_key} with ${latest.value}`);
        }
      } catch (error) {
        console.error(`[Updater] Failed to update ${seriesId}:`, error);
      }
    }

    console.log('[Updater] Completed');
  } catch (error) {
    console.error('[Updater] Failed:', error);
  }
}

// ============================================
// Calendar Info & Recompute
// ============================================

function handleCalendarInfo(headers: Record<string, string>): Response {
  const calendarData = calendarEffectsData as any;
  return new Response(JSON.stringify({
    source: 'calendar-effects.json (static, precomputed)',
    indices: calendarData.indices?.map((i: any) => ({ code: i.code, name: i.name })) ?? [],
    data_year_range: calendarData.data_year_range ?? 'unknown',
    special_windows_count: calendarData.special_windows?.length ?? 0,
    note: '数据为静态预计算，如需更新请运行离线脚本或调用 /admin/recompute-calendar',
    last_updated: calendarData.last_updated ?? null,
  }), {
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function handleRecomputeCalendar(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  // 安全校验：复用 ADMIN_TOKEN
  if (!env.ADMIN_TOKEN) {
    return new Response(JSON.stringify({ error: 'Admin endpoint not available' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }

  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (token !== env.ADMIN_TOKEN) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }

  // 当前为 stub 实现：calendar-effects 需要离线脚本重新计算
  // 未来可在此处调用 D1 中存储的历史数据实时计算
  return new Response(JSON.stringify({
    status: 'not_implemented',
    message: 'calendar-effects 重算需要运行离线脚本。请在本地执行: node scripts/recompute-calendar.js',
    current_data_source: 'calendar-effects.json (static)',
  }), {
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// ============================================
// Utilities
// ============================================

function formatEventForAPI(event: any): any {
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

