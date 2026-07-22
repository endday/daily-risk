/**
 * Daily Risk Worker - Cloudflare Worker Entry Point
 */

import * as db from './db';
import * as scheduler from './scheduler';
import { handleEvents } from './api/events';
import { handleMarketTemperature } from './api/market-temperature';
import { handleIndustryRotation } from './api/industry-rotation';
import { handleRelativeStrength } from './api/relative-strength';
import { syncIndustryFundFlows } from './collectors/industry-fund-flow';
import { backfillSnapshots } from './collectors/backfill';
import type { InstrumentDailyRow, SwIndustryDailyRow } from './collectors/base';
import { syncTradingCalendar } from './trading-calendar';
import { isIsoDate, validateBackfillWindow } from './backfill-audit';
import { getBeijingDate } from '../../shared/date-utils';
import calendarEffectsData from '../data/calendar-effects.json';
import chinaGdpData from '../data/china-gdp.json';
import { CHINA_EVENTS, EARNINGS_SYMBOLS, Env, RISK_RULES } from './env';

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
      if (request.method !== 'GET') return methodNotAllowed(corsHeaders, 'GET');
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (url.pathname === '/api/events') {
      if (request.method !== 'GET') return methodNotAllowed(corsHeaders, 'GET');
      return handleEvents(request, env, corsHeaders);
    }

    if (url.pathname === '/api/market-temperature') {
      if (request.method !== 'GET') return methodNotAllowed(corsHeaders, 'GET');
      return handleMarketTemperature(request, env, corsHeaders, chinaGdpData);
    }

    if (url.pathname === '/api/industry-rotation') {
      if (request.method !== 'GET') return methodNotAllowed(corsHeaders, 'GET');
      return handleIndustryRotation(request, env, corsHeaders);
    }

    if (url.pathname === '/api/relative-strength') {
      if (request.method !== 'GET') return methodNotAllowed(corsHeaders, 'GET');
      return handleRelativeStrength(request, env, corsHeaders);
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

    if (url.pathname === '/admin/init-instrument-daily' && request.method === 'POST') {
      return handleInitInstrumentDaily(request, env, corsHeaders);
    }

    if (url.pathname === '/admin/sync-industry-flow' && request.method === 'POST') {
      return handleSyncIndustryFlow(request, env, corsHeaders);
    }

    if (url.pathname === '/admin/import-sw-industries' && request.method === 'POST') {
      return handleImportSwIndustries(request, env, corsHeaders);
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

    if (controller.cron === '0 10 * * *') {
      ctx.waitUntil(scheduler.runDailyCollection(collectorEnv));
    } else if (controller.cron === '30 * * * *') {
      ctx.waitUntil(runActualValueUpdater(env));
    }
  },
};

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

function methodNotAllowed(headers: Record<string, string>, allow: string): Response {
  return Response.json(
    { error: 'Method Not Allowed' },
    { status: 405, headers: { Allow: allow, ...headers } },
  );
}

async function handleSyncIndustryFlow(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  const authError = assertAdminToken(request, env, headers);
  if (authError) return authError;

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get('days') ?? 140);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 250)
    : 140;

  try {
    const result = await syncIndustryFundFlows(env.DB, limit);
    return new Response(JSON.stringify({ status: 'ok', limit, ...result }), {
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Industry fund flow sync failed',
      detail: error instanceof Error ? error.message : String(error),
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }
}

type SwIndustryImportPayload = {
  action?: 'begin' | 'append' | 'commit' | 'abort';
  run_id?: string;
  trade_date?: string;
  mode?: 'daily' | 'backfill';
  expected_industries?: number;
  expected_rows?: number;
  checksum?: string;
  error?: string;
  rows?: SwIndustryDailyRow[];
};

function normalizeSwIndustryRow(raw: SwIndustryDailyRow): SwIndustryDailyRow | null {
  if (!isIsoDate(raw.trade_date ?? '')) return null;
  if (!/^801\d{3}\.SL$/.test(raw.industry_code ?? '')) return null;
  if (!raw.industry_name || raw.industry_name.length > 32) return null;
  const nullableNumber = (value: unknown): number | null => {
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const row = {
    trade_date: raw.trade_date,
    industry_code: raw.industry_code,
    industry_name: raw.industry_name,
    provider: 'swsresearch',
    open_price: nullableNumber(raw.open_price),
    high_price: nullableNumber(raw.high_price),
    low_price: nullableNumber(raw.low_price),
    close_price: nullableNumber(raw.close_price),
    change_pct: nullableNumber(raw.change_pct),
    volume: nullableNumber(raw.volume),
    amount: nullableNumber(raw.amount),
    member_count: nullableNumber(raw.member_count),
    source_updated_at: raw.source_updated_at ?? new Date().toISOString(),
  };
  if (row.close_price == null || row.close_price <= 0) return null;
  if (row.open_price != null && row.open_price <= 0) return null;
  if (row.high_price != null && row.high_price < Math.max(row.open_price ?? 0, row.close_price)) return null;
  if (row.low_price != null && row.low_price > Math.min(row.open_price ?? row.close_price, row.close_price)) return null;
  if ((row.volume ?? 0) < 0 || (row.amount ?? 0) < 0) return null;
  return row;
}

async function handleImportSwIndustries(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  if (!env.SW_SYNC_TOKEN) {
    return new Response(JSON.stringify({ error: 'Industry sync endpoint not available' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }
  if (request.headers.get('Authorization') !== `Bearer ${env.SW_SYNC_TOKEN}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }

  let payload: SwIndustryImportPayload;
  try {
    payload = await request.json<SwIndustryImportPayload>();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }
  if (
    !payload.action ||
    !['begin', 'append', 'commit', 'abort'].includes(payload.action) ||
    !payload.run_id ||
    !/^[0-9a-f-]{36}$/.test(payload.run_id)
  ) {
    return new Response(JSON.stringify({ error: 'Valid action and run_id are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }

  if (payload.action === 'begin') {
    if (!isIsoDate(payload.trade_date ?? '') ||
        !['daily', 'backfill'].includes(payload.mode ?? '') ||
        payload.expected_industries !== 31 ||
        !Number.isInteger(payload.expected_rows) || (payload.expected_rows ?? 0) < 31 ||
        !/^[0-9a-f]{64}$/.test(payload.checksum ?? '')) {
      return new Response(JSON.stringify({ error: 'Invalid import manifest' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...headers },
      });
    }
    await db.beginSwIndustryImport(env.DB, {
      run_id: payload.run_id,
      trade_date: payload.trade_date!,
      mode: payload.mode!,
      expected_industries: payload.expected_industries!,
      expected_rows: payload.expected_rows!,
      checksum: payload.checksum!,
    });
    return Response.json({ status: 'staging', run_id: payload.run_id }, { headers });
  }

  if (payload.action === 'append') {
    if (!payload.rows?.length || payload.rows.length > 100) {
      return new Response(JSON.stringify({ error: 'rows must contain 1 to 100 items' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...headers },
      });
    }
    const rows = payload.rows.map(normalizeSwIndustryRow);
    if (rows.some((row) => row == null)) {
      return new Response(JSON.stringify({ error: 'Invalid industry row' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...headers },
      });
    }
    const staged = await db.stageSwIndustryDailyRows(env.DB, payload.run_id, rows as SwIndustryDailyRow[]);
    return Response.json({ status: 'staging', run_id: payload.run_id, staged }, { headers });
  }

  if (payload.action === 'abort') {
    await db.failSwIndustryImport(env.DB, payload.run_id, payload.error ?? 'collector aborted');
    return Response.json({ status: 'failed', run_id: payload.run_id }, { headers });
  }

  try {
    const result = await db.commitSwIndustryImport(env.DB, payload.run_id);
    const coverage = await db.getSwIndustryDailyRange(env.DB);
    return Response.json({ status: 'completed', run_id: payload.run_id, ...result, coverage }, { headers });
  } catch (error) {
    return Response.json({
      error: 'Import commit rejected',
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 409, headers });
  }
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
  const authError = assertAdminToken(request, env, headers);
  if (authError) return authError;

  const url = new URL(request.url);
  const startDate = url.searchParams.get('startDate') || '2025-01-01';
  const endDate = url.searchParams.get('endDate') || getBeijingDate(0);
  const syncMode = url.searchParams.get('sync') === '1';
  const window = validateBackfillWindow(startDate, endDate);
  if (!window.ok) {
    return Response.json({ error: window.error }, { status: 400, headers });
  }

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

type InitInstrumentDailyPayload = {
  rows?: InstrumentDailyRow[];
};

function assertAdminToken(request: Request, env: Env, headers: Record<string, string>): Response | null {
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

  return null;
}

function normalizeInstrumentDailyRow(raw: InstrumentDailyRow): InstrumentDailyRow {
  return {
    trade_date: raw.trade_date,
    instrument_code: raw.instrument_code,
    instrument_name: raw.instrument_name,
    instrument_type: raw.instrument_type,
    provider: raw.provider || 'free-stockdb',
    open_price: raw.open_price ?? null,
    high_price: raw.high_price ?? null,
    low_price: raw.low_price ?? null,
    close_price: raw.close_price ?? null,
    pre_close_price: raw.pre_close_price ?? null,
    change_pct: raw.change_pct ?? null,
    change_amount: raw.change_amount ?? null,
    amplitude: raw.amplitude ?? null,
    volume: raw.volume ?? null,
    amount: raw.amount ?? null,
    turnover_rate: raw.turnover_rate ?? null,
    pe_ttm: raw.pe_ttm ?? null,
    pb: raw.pb ?? null,
    total_market_cap: raw.total_market_cap ?? null,
    float_market_cap: raw.float_market_cap ?? null,
    is_st: raw.is_st ?? null,
    source_updated_at: raw.source_updated_at ?? null,
  };
}

async function handleInitInstrumentDaily(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  const authError = assertAdminToken(request, env, headers);
  if (authError) return authError;

  let payload: InitInstrumentDailyPayload;
  try {
    payload = await request.json<InitInstrumentDailyPayload>();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }

  const rows = (payload.rows || []).map(normalizeInstrumentDailyRow);
  if (rows.length === 0) {
    return new Response(JSON.stringify({ error: 'rows is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }

  const upserted = await db.upsertInstrumentDailyRows(env.DB, rows);
  const coverage = await db.getInstrumentDailyCoverage(env.DB, rows[0].instrument_code);

  return new Response(JSON.stringify({
    status: 'completed',
    mode: 'idempotent_init',
    upserted,
    first_instrument: rows[0].instrument_code,
    coverage,
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
  const authError = assertAdminToken(request, env, headers);
  if (authError) return authError;

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
  const authError = assertAdminToken(request, env, headers);
  if (authError) return authError;

  const url = new URL(request.url);
  const yearParam = url.searchParams.get('year');
  const currentYear = new Date().getFullYear();
  const year = yearParam ? Number(yearParam) : currentYear;
  if (!Number.isInteger(year) || year < 2000 || year > currentYear + 1) {
    return Response.json({ error: 'year must be between 2000 and next year' }, { status: 400, headers });
  }

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
