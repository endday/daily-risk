/**
 * Daily Risk Worker - Cloudflare Worker Entry Point
 */

import * as db from './db';
import * as scheduler from './scheduler';
import { addDays, format } from 'date-fns';

export interface Env {
  DB: D1Database;
  ADMIN_TOKEN?: string;
  FRED_API_KEY?: string;
  BLS_API_KEY?: string;
  ALPHA_VANTAGE_KEY?: string;
}

const EARNINGS_SYMBOLS = ['NVDA', 'AAPL', 'MSFT', 'META', 'GOOGL', 'AMZN', 'TSLA', 'TSM'];

// 内联配置（避免 JSON import 问题）
const RISK_RULES: Record<string, any> = {
  US_CPI: { display_name: '美国CPI', score: 10, country: 'US', time: '20:30', timezone: 'Asia/Shanghai', market_impact: ['NASDAQ','GOLD','USD','US10Y'], calendar_source: 'fred', fred_release_id: 46, value_source: 'fred', fred_series: 'CPIAUCSL', display_format: 'percent' },
  US_PPI: { display_name: '美国PPI', score: 7, country: 'US', time: '20:30', timezone: 'Asia/Shanghai', market_impact: ['NASDAQ','GOLD'], calendar_source: 'fred', fred_release_id: 130, value_source: 'fred', fred_series: 'PPIACO', display_format: 'percent' },
  US_NONFARM: { display_name: '美国非农就业', score: 10, country: 'US', time: '20:30', timezone: 'Asia/Shanghai', market_impact: ['NASDAQ','GOLD','USD'], calendar_source: 'fred', fred_release_id: 130, value_source: 'bls', fred_series: 'PAYEMS', display_format: 'change_k' },
  US_UNEMPLOYMENT: { display_name: '美国失业率', score: 9, country: 'US', time: '20:30', timezone: 'Asia/Shanghai', market_impact: ['NASDAQ','USD'], calendar_source: 'fred', fred_release_id: 130, value_source: 'fred', fred_series: 'UNRATE', display_format: 'percent' },
  US_GDP: { display_name: '美国GDP', score: 8, country: 'US', time: '20:30', timezone: 'Asia/Shanghai', market_impact: ['NASDAQ','USD'], calendar_source: 'fred', fred_release_id: 130, value_source: 'fred', fred_series: 'GDP', display_format: 'trillion' },
  US_FOMC_RATE: { display_name: 'FOMC利率决议', score: 10, country: 'US', time: '02:00', timezone: 'Asia/Shanghai', market_impact: ['NASDAQ','GOLD','USD','US10Y','全市场'], calendar_source: 'fred', fred_release_id: 130, value_source: 'manual', display_format: 'rate_range' },
  CN_CPI: { display_name: '中国CPI', score: 8, country: 'CN', time: '09:30', timezone: 'Asia/Shanghai', market_impact: ['上证','恒指','CNY'], calendar_source: 'manual_nbs_schedule', value_source: 'dbnomics', display_format: 'percent' },
  CN_PMI: { display_name: '中国PMI', score: 7, country: 'CN', time: '09:30', timezone: 'Asia/Shanghai', market_impact: ['上证','恒指','铁矿石'], calendar_source: 'manual_nbs_schedule', value_source: 'dbnomics', display_format: 'index' },
  CN_M2: { display_name: '中国M2货币供应', score: 6, country: 'CN', time: '10:00', timezone: 'Asia/Shanghai', market_impact: ['上证','CNY'], calendar_source: 'manual_pbc_schedule', value_source: 'dbnomics', display_format: 'yoy_percent' },
  CN_PPI: { display_name: '中国PPI', score: 6, country: 'CN', time: '09:30', timezone: 'Asia/Shanghai', market_impact: ['上证','商品'], calendar_source: 'manual_nbs_schedule', value_source: 'dbnomics', display_format: 'percent' },
};

const CHINA_EVENTS: any = {
  year: 2026,
  source: 'NBS release schedule',
  timezone: 'Asia/Shanghai',
  events: [
    { event_key: 'CN_CPI', title: '中国CPI', date: '2026-06-10', time: '09:30', country: 'CN', importance: 8, value_source: 'dbnomics:NBS', official_source: 'stats.gov.cn' },
    { event_key: 'CN_PMI', title: '中国官方制造业PMI', date: '2026-06-30', time: '09:30', country: 'CN', importance: 7, value_source: 'dbnomics:NBS', official_source: 'stats.gov.cn' },
    { event_key: 'CN_M2', title: '中国M2货币供应', date: '2026-06-14', time: '10:00', country: 'CN', importance: 6, value_source: 'dbnomics:PBC', official_source: 'pbc.gov.cn' },
    { event_key: 'CN_PPI', title: '中国PPI', date: '2026-06-10', time: '09:30', country: 'CN', importance: 6, value_source: 'dbnomics:NBS', official_source: 'stats.gov.cn' },
  ],
};

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

    // 周查询：?week=YYYY-MM-DD (该周任意一天)
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
        })),
      }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
      });
    }

    // 今日+明日
    if (range === 'today_tomorrow') {
      const groups = await db.getTodayTomorrowEvents(env.DB);
      return new Response(JSON.stringify({
        timezone: 'Asia/Shanghai',
        days: groups.map(g => ({
          date: g.date,
          risk_index: calculateRiskIndex(g.events),
          events: g.events.map(formatEventForAPI),
        })),
      }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
      });
    }

    // 单日查询
    const targetDate = date || getBeijingDate(1);
    const results = await db.getEventsByDate(env.DB, targetDate);

    return new Response(JSON.stringify({
      date: targetDate,
      timezone: 'Asia/Shanghai',
      risk_index: calculateRiskIndex(results),
      events: results.map(formatEventForAPI),
      updated_at: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
    });
  } catch (error) {
    console.error('[API] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error', detail: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }
}

async function handleCollect(request: Request, env: Env, ctx: ExecutionContext, headers: Record<string, string>): Promise<Response> {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');

  if (env.ADMIN_TOKEN && token !== env.ADMIN_TOKEN) {
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
// Utilities
// ============================================

function formatEventForAPI(event: any): any {
  return {
    event_key: event.event_key,
    score: event.importance,
    display_name: event.display_name,
    previous_value: event.previous_value || null,
    actual_value: event.actual_value || null,
    event_time: event.event_time || null,
    timezone: event.timezone || 'Asia/Shanghai',
    country: event.country,
    market_impact: typeof event.market_impact === 'string' ? JSON.parse(event.market_impact) : (event.market_impact || []),
    status: event.status || 'scheduled',
    source: event.source,
  };
}

function calculateRiskIndex(events: any[]): number {
  if (events.length === 0) return 0;
  const scores = events.map(e => e.importance || 0);
  const sumScore = scores.reduce((a, b) => a + b, 0);
  const sumScoreSquared = scores.reduce((a, b) => a + b * b, 0);
  if (sumScore === 0) return 0;
  return Math.round((sumScoreSquared / sumScore) * 10) / 10;
}

function getBeijingDate(offsetDays: number): string {
  const now = new Date();
  const beijing = addDays(now, offsetDays);
  return format(beijing, 'yyyy-MM-dd');
}
