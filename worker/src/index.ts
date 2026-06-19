/**
 * Daily Risk Worker - Cloudflare Worker Entry Point
 */

import * as db from './db';
import * as scheduler from './scheduler';
import { backfillSnapshots } from './collectors/backfill';
import { getActiveCalendarEffects } from './calendar';
import { syncTradingCalendar } from './trading-calendar';
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

/** 假日条目（返回给前端） */
interface HolidayEntry { date: string; name: string; is_trading_day: boolean }

/**
 * 从 D1 加载假日数据
 * 返回：{ set: 仅休市日集合（给日历计算用）, list: 全部条目（给前端展示用） }
 * 查不到表时 set=undefined → 回退"只跳周末"
 */
async function loadHolidayData(db: D1Database, year: number): Promise<{
  set: Set<string> | undefined;
  list: HolidayEntry[];
}> {
  try {
    const { results } = await db
      .prepare(`SELECT date, name, is_holiday FROM trading_holidays WHERE date LIKE ?1 ORDER BY date`)
      .bind(`${year}-%`)
      .all<{ date: string; name: string; is_holiday: number }>();

    if (results.length === 0) return { set: undefined, list: [] };

    const set = new Set<string>();
    const list: HolidayEntry[] = [];
    for (const r of results) {
      list.push({ date: r.date, name: r.name, is_trading_day: r.is_holiday === 0 });
      if (r.is_holiday === 1) set.add(r.date);
    }
    return { set, list };
  } catch {
    return { set: undefined, list: [] };
  }
}

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

    if (url.pathname === '/api/market-temperature') {
      return handleMarketTemperature(request, env, corsHeaders);
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

    if (url.pathname === '/admin/backfill' && request.method === 'POST') {
      return handleBackfill(request, env, ctx, corsHeaders);
    }

    if (url.pathname === '/admin/debug-chinabond' && request.method === 'GET') {
      return handleDebugChinabond(request, env, corsHeaders);
    }

    if (url.pathname === '/admin/sync-holidays' && request.method === 'POST') {
      return handleSyncHolidays(request, env, corsHeaders);
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
    // 加载假日表（查不到表时回退到"只跳周末"）
    const currentYear = new Date().getFullYear();
    const holidayData = await loadHolidayData(env.DB, currentYear);
    const holidays = holidayData.set;

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
          calendar_effects: getActiveCalendarEffects(d.date, holidays),
        })),
        holidays: holidayData.list,
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
          calendar_effects: getActiveCalendarEffects(g.date, holidays),
        })),
        holidays: holidayData.list,
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
// Backfill Historical Data
// ============================================

async function handleBackfill(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  headers: Record<string, string>,
): Promise<Response> {
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

  const url = new URL(request.url);
  const startDate = url.searchParams.get('startDate') || '2025-01-01';
  const endDate = url.searchParams.get('endDate') || getBeijingDate(0);
  const syncMode = url.searchParams.get('sync') === '1';

  const runBackfill = async () => {
    try {
      const result = await backfillSnapshots(env.DB, startDate, endDate);
      console.log(`[Backfill] Complete: ${JSON.stringify(result)}`);
      return result;
    } catch (err) {
      console.error(`[Backfill] Fatal error:`, err);
      throw err;
    }
  };

  // sync=1 同步执行（调试用），默认异步
  if (syncMode) {
    const result = await runBackfill();
    return new Response(JSON.stringify({
      status: 'completed',
      ...result,
    }), {
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }

  ctx.waitUntil(runBackfill());

  return new Response(JSON.stringify({
    status: 'accepted',
    message: `Backfill started for ${startDate} → ${endDate}. Append &sync=1 for synchronous mode.`,
  }), {
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// ============================================
// Debug: chinabond HTML
// ============================================

async function handleDebugChinabond(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  const url = new URL(request.url);
  const startDate = url.searchParams.get('startDate') || '2026-06-01';
  const endDate = url.searchParams.get('endDate') || '2026-06-17';

  const params = new URLSearchParams({
    startDate, endDate,
    gjqx: '0', qxId: 'ycqx', locale: 'cn_ZH',
  });
  const apiUrl = `https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/historyQuery?${params}`;

  let html: string;
  try {
    const resp = await fetch(apiUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    html = await resp.text();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'fetch failed', message: (e as Error).message }), {
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }

  const cleaned = html.replace(/&nbsp/g, '');
  const trs = cleaned.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const matched = trs.filter(r => r.includes('中债国债收益率曲线'));

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const parsed: any[] = [];
  for (const row of matched.slice(0, 10)) {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    const values = cells.map(c => c.replace(/<[^>]+>/g, '').trim());
    parsed.push({
      cellCount: values.length,
      date: values[1] || '',
      dateValid: DATE_RE.test(values[1] || ''),
      yield10y: values[8] || '',
    });
  }

  return new Response(JSON.stringify({
    htmlLength: html.length,
    totalTr: trs.length,
    matchedTr: matched.length,
    first5: parsed,
    htmlPreview: html.substring(0, 500),
  }), {
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// ============================================
// Sync Trading Holidays
// ============================================

async function handleSyncHolidays(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  // ADMIN_TOKEN 校验
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

  const url = new URL(request.url);
  const yearParam = url.searchParams.get('year');
  const currentYear = new Date().getFullYear();
  const year = yearParam ? parseInt(yearParam, 10) : currentYear;

  try {
    const count = await syncTradingCalendar(env.DB, year);
    return new Response(JSON.stringify({
      status: 'ok',
      year,
      synced_entries: count,
    }), {
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'sync failed',
      message: (e as Error).message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
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

// ============================================
// Market Temperature API
// ============================================

async function handleMarketTemperature(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  const url = new URL(request.url);
  const daysParam = url.searchParams.get('days') || '20';
  const days = Math.min(parseInt(daysParam) || 20, 365);

  try {
    // 获取最新快照
    const latest = await db.getLatestSnapshots(env.DB);

    if (latest.length === 0) {
      return new Response(JSON.stringify({
        error: 'No market temperature data available yet. Run /admin/collect first.',
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...headers },
      });
    }

    // 获取历史数据
    const latestDate = latest[0].trade_date;
    const startDate = new Date(latestDate + 'T00:00:00Z');
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    const history = await db.getSnapshotsByDateRange(env.DB, startDateStr, latestDate);

    // 按指数分组历史数据
    const historyByIndex: Record<string, typeof history> = {};
    for (const row of history) {
      if (!historyByIndex[row.index_code]) historyByIndex[row.index_code] = [];
      historyByIndex[row.index_code].push(row);
    }

    // 计算衍生指标
    const shHistory = historyByIndex['000001'] || [];
    const hs300History = historyByIndex['000300'] || [];
    const latest300 = hs300History[0] || latest.find(r => r.index_code === '000300') || latest[0];
    const derived = computeDerivedMetrics(shHistory, hs300History, latest300);

    return new Response(JSON.stringify({
      trade_date: latestDate,
      latest: latest.map(formatSnapshotForAPI),
      derived,
      history: history.map(formatSnapshotForAPI),
      history_days: days,
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', ...headers },
    });
  } catch (error) {
    console.error('[MarketTemp] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }
}

function formatSnapshotForAPI(row: any): any {
  return {
    trade_date: row.trade_date,
    index_code: row.index_code,
    close_price: row.close_price,
    change_pct: row.change_pct,
    rise_count: row.rise_count,
    fall_count: row.fall_count,
    flat_count: row.flat_count,
    turnover_amount: row.turnover_amount,
    turnover_rate: row.turnover_rate,
    volatility_20d: row.volatility_20d,
    northbound_amt: row.northbound_amt,
    pe_ttm: row.pe_ttm,
    pb: row.pb,
    margin_balance: row.margin_balance,
    bond_yield_10y: row.bond_yield_10y,
  };
}

function computeDerivedMetrics(history: any[], hs300History: any[], latest300: any): any {
  const latest = history[0]; // history 按日期倒序
  const result: Record<string, any> = {};

  if (!latest) return result;

  // 涨跌比
  if (latest.rise_count != null && latest.fall_count != null) {
    const total = latest.rise_count + latest.fall_count;
    result.advance_decline_ratio = total > 0
      ? Math.round(latest.rise_count / total * 1000) / 10
      : null;
    result.advance_decline_label =
      result.advance_decline_ratio >= 60 ? '赚钱效应强' :
      result.advance_decline_ratio >= 45 ? '涨跌互现' :
      '亏钱效应明显';
  }

  // 成交额趋势（5日均值 vs 20日均值）
  const turnover5 = avgField(history.slice(0, 5), 'turnover_amount');
  const turnover20 = avgField(history.slice(0, 20), 'turnover_amount');
  if (turnover5 && turnover20 && turnover20 > 0) {
    result.turnover_5d_avg = Math.round(turnover5 / 1e8);     // 亿元
    result.turnover_20d_avg = Math.round(turnover20 / 1e8);   // 亿元
    result.turnover_trend = turnover5 > turnover20 * 1.1 ? '放量' :
                            turnover5 < turnover20 * 0.9 ? '缩量' : '平稳';
  }

  // 北向资金趋势
  const nb5 = avgField(hs300History.slice(0, 5), 'northbound_amt');
  const nb20 = avgField(hs300History.slice(0, 20), 'northbound_amt');
  if (nb5 && nb20 && nb20 > 0) {
    result.northbound_5d_avg = Math.round(nb5 / 10000);        // 亿元 (from 万元)
    result.northbound_20d_avg = Math.round(nb20 / 10000);      // 亿元
    result.northbound_trend = nb5 > nb20 * 1.2 ? '外资放量' :
                              nb5 < nb20 * 0.8 ? '外资缩量' : '外资平稳';
  }

  // 波动率状态
  if (latest.volatility_20d != null) {
    result.volatility_label =
      latest.volatility_20d > 25 ? '高波动' :
      latest.volatility_20d > 15 ? '正常波动' : '低波动';
  }

  // 融资融券状态
  if (latest.margin_balance != null) {
    result.margin_balance_yi = Math.round(latest.margin_balance); // 亿元
  }

  // === 估值指标（基于沪深300数据）===
  const pe = latest300?.pe_ttm;
  const bondYield = latest300?.bond_yield_10y;

  if (pe != null && pe > 0) {
    result.pe_ttm = pe;

    // PE 百分位：当前 PE 在历史区间中的位置
    const peValues = hs300History
      .map(h => h.pe_ttm)
      .filter((v): v is number => v != null && v > 0)
      .sort((a, b) => a - b);
    if (peValues.length >= 5) {
      const rank = peValues.filter(v => v <= pe).length;
      result.pe_percentile = Math.round(rank / peValues.length * 100);
      result.pe_label =
        result.pe_percentile <= 20 ? '极低估' :
        result.pe_percentile <= 40 ? '偏低估' :
        result.pe_percentile <= 60 ? '合理' :
        result.pe_percentile <= 80 ? '偏高估' : '极度高估';
    }
  }

  // ERP（股权风险溢价）= 1/PE - 10Y 国债收益率
  // ERP 越高 → 股票相对债券越便宜 → 市场温度越低
  if (pe != null && pe > 0 && bondYield != null) {
    const earningsYield = 1 / pe * 100; // 盈利收益率（%）
    result.erp = Math.round((earningsYield - bondYield) * 100) / 100; // 百分点
    result.erp_label =
      result.erp > 8 ? '股票极便宜' :
      result.erp > 5 ? '股票偏低估' :
      result.erp > 2 ? '合理' :
      result.erp > 0 ? '偏高估' : '极度高估';
  }

  return result;
}

function avgField(rows: any[], field: string): number | null {
  const values = rows.map(r => r[field]).filter((v): v is number => v != null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

