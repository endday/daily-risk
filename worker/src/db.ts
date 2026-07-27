/**
 * D1 数据库操作封装
 */

import { format, addDays, startOfWeek } from 'date-fns';
import { getBeijingDate } from '../../shared/date-utils';

// ============================================
// Event 操作
// ============================================

// UPSERT SQL：使用 ON CONFLICT DO UPDATE 而非 INSERT OR REPLACE，
// 用 COALESCE 保护已有字段（actual_value、status 等）不被 null 覆盖。
const UPSERT_COLUMNS = `
  event_key, source, title, display_name, description,
  event_date, event_time, timezone, event_datetime_utc,
  country, importance, market_impact,
  release_id, series_id, symbol, period, display_format,
  previous_value, actual_value, forecast_value, actual_updated_at,
  confidence, source_url,
  status, last_checked_at, last_fetch_error,
  raw_json, raw_text
`;
const UPSERT_PLACEHOLDERS = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
const UPSERT_CONFLICT = `
  ON CONFLICT(event_key, event_date, IFNULL(symbol, ''), IFNULL(period, ''))
  DO UPDATE SET
    source = excluded.source,
    title = excluded.title,
    display_name = excluded.display_name,
    description = COALESCE(excluded.description, events.description),
    event_time = excluded.event_time,
    timezone = excluded.timezone,
    event_datetime_utc = excluded.event_datetime_utc,
    country = excluded.country,
    importance = excluded.importance,
    market_impact = excluded.market_impact,
    release_id = excluded.release_id,
    series_id = excluded.series_id,
    display_format = excluded.display_format,
    previous_value = COALESCE(excluded.previous_value, events.previous_value),
    actual_value = COALESCE(excluded.actual_value, events.actual_value),
    forecast_value = COALESCE(excluded.forecast_value, events.forecast_value),
    actual_updated_at = COALESCE(excluded.actual_updated_at, events.actual_updated_at),
    confidence = excluded.confidence,
    source_url = COALESCE(excluded.source_url, events.source_url),
    status = CASE
      WHEN events.actual_value IS NOT NULL AND excluded.actual_value IS NULL
      THEN events.status
      ELSE excluded.status
    END,
    last_checked_at = excluded.last_checked_at,
    last_fetch_error = excluded.last_fetch_error,
    raw_json = excluded.raw_json,
    raw_text = excluded.raw_text,
    updated_at = datetime('now')
`;

function bindUpsert(stmt: D1PreparedStatement, event: any): D1PreparedStatement {
  return stmt.bind(
    event.event_key, event.source, event.title, event.display_name, event.description || null,
    event.event_date, event.event_time || null, event.timezone || 'Asia/Shanghai',
    event.event_datetime_utc || null, event.country, event.importance,
    JSON.stringify(event.market_impact || []),
    event.release_id || null, event.series_id || null, event.symbol || null,
    event.period || null, event.display_format || null,
    event.previous_value || null, event.actual_value || null,
    event.forecast_value || null, event.actual_updated_at || null,
    event.confidence || 'estimated', event.source_url || null,
    event.status || 'scheduled',
    event.last_checked_at || null, event.last_fetch_error || null,
    event.raw_json || null, event.raw_text || null
  );
}

export async function upsertEvent(db: D1Database, event: any): Promise<void> {
  await bindUpsert(
    db.prepare(`INSERT INTO events (${UPSERT_COLUMNS}) VALUES ${UPSERT_PLACEHOLDERS} ${UPSERT_CONFLICT}`),
    event
  ).run();
}

export async function upsertEvents(db: D1Database, events: any[]): Promise<number> {
  if (events.length === 0) return 0;

  const stmts = events.map(event =>
    bindUpsert(
      db.prepare(`INSERT INTO events (${UPSERT_COLUMNS}) VALUES ${UPSERT_PLACEHOLDERS} ${UPSERT_CONFLICT}`),
      event
    )
  );

  await db.batch(stmts);
  return events.length;
}

export async function getEventsByDate(db: D1Database, date: string): Promise<any[]> {
  const result = await db.prepare(`
    SELECT * FROM events WHERE event_date = ?
    ORDER BY importance DESC, event_time ASC
  `).bind(date).all();
  return result.results.map(parseEventRow);
}

export async function getTodayTomorrowEvents(db: D1Database): Promise<{ date: string; events: any[] }[]> {
  const today = getBeijingDate(0);
  const tomorrow = getBeijingDate(1);
  const result = await db.prepare(`
    SELECT * FROM events WHERE event_date IN (?, ?)
    ORDER BY event_date ASC, importance DESC, event_time ASC
  `).bind(today, tomorrow).all();

  const grouped: Record<string, any[]> = {};
  for (const row of result.results) {
    const event = parseEventRow(row);
    if (!grouped[event.event_date]) grouped[event.event_date] = [];
    grouped[event.event_date].push(event);
  }
  return [
    { date: today, events: grouped[today] || [] },
    { date: tomorrow, events: grouped[tomorrow] || [] },
  ];
}

/**
 * 获取指定日期所在周的周一
 */
function getMonday(anyDate: string): string {
  const date = new Date(anyDate + 'T00:00:00Z');
  return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

/**
 * 获取指定周（周一到周日）的所有事件，按日期分组
 * @param db D1 数据库
 * @param anyDate 该周任意一天 YYYY-MM-DD（会自动找到周一）
 */
export async function getWeekEvents(db: D1Database, anyDate: string): Promise<{ date: string; dayLabel: string; events: any[]; risk_index: number }[]> {
  const mondayStr = getMonday(anyDate);
  const monday = new Date(mondayStr + 'T00:00:00Z');
  const sunday = addDays(monday, 6);
  const sundayStr = format(sunday, 'yyyy-MM-dd');

  const result = await db.prepare(`
    SELECT * FROM events
    WHERE event_date BETWEEN ? AND ?
    ORDER BY event_date ASC, importance DESC, event_time ASC
  `).bind(mondayStr, sundayStr).all();

  const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const days: { date: string; dayLabel: string; events: any[]; risk_index: number }[] = [];

  // 初始化 7 天
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const dateStr = format(d, 'yyyy-MM-dd');
    days.push({ date: dateStr, dayLabel: dayLabels[i], events: [], risk_index: 0 });
  }

  // 填充事件
  for (const row of result.results) {
    const event = parseEventRow(row);
    const day = days.find(d => d.date === event.event_date);
    if (day) day.events.push(event);
  }

  // 计算每天的风险指数
  for (const day of days) {
    day.risk_index = calculateRiskIndex(day.events);
  }

  return days;
}

export function calculateRiskIndex(events: any[]): number {
  if (events.length === 0) return 0;
  const scores = events.map(e => e.importance || 0).filter(s => s > 0);
  if (scores.length === 0) return 0;

  // 单事件直接使用其评分
  if (scores.length === 1) return Math.round(scores[0] * 10) / 10;

  // 多事件：最高分主导(70%) + 其余衰减叠加(30%)
  const sorted = [...scores].sort((a, b) => b - a);
  const maxScore = sorted[0];
  const restSum = sorted.slice(1).reduce((a, b) => a + b, 0);
  const index = maxScore * 0.7 + Math.min(restSum * 0.3, maxScore * 0.3);
  return Math.round(Math.min(10, index) * 10) / 10;
}

export async function getEventsForActualValueUpdate(db: D1Database, replayWindowDays: number = 7): Promise<any[]> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - replayWindowDays * 24 * 60 * 60 * 1000);
  const result = await db.prepare(`
    SELECT * FROM events
    WHERE status IN ('scheduled', 'released_pending_actual')
      AND event_datetime_utc <= datetime('now', '-2 hours')
      AND event_datetime_utc >= ?
    ORDER BY event_datetime_utc ASC
  `).bind(windowStart.toISOString()).all();
  return result.results.map(parseEventRow);
}

export async function updateEventActualValue(db: D1Database, eventId: number, actualValue: string, updatedAt: string): Promise<void> {
  await db.prepare(`
    UPDATE events SET actual_value = ?, actual_updated_at = ?, status = 'actual_available', updated_at = datetime('now')
    WHERE id = ?
  `).bind(actualValue, updatedAt, eventId).run();
}

export async function updateEventCheckStatus(db: D1Database, eventId: number, checkedAt: string, error?: string): Promise<void> {
  await db.prepare(`
    UPDATE events SET last_checked_at = ?, last_fetch_error = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(checkedAt, error || null, eventId).run();
}

// ============================================
// Provider Run 日志
// ============================================

export async function logProviderRun(db: D1Database, run: any): Promise<void> {
  await db.prepare(`
    INSERT INTO provider_runs (provider, run_type, started_at, finished_at, status, events_upserted, error)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(run.provider, run.run_type, run.started_at, run.finished_at || null, run.status, run.events_upserted, run.error || null).run();
}

// ============================================
// 缺口监控
// ============================================

export async function checkDataGaps(db: D1Database): Promise<any[]> {
  const result = await db.prepare(`
    SELECT event_key, display_name, event_date, source
    FROM events WHERE previous_value IS NULL AND status = 'scheduled' AND event_datetime_utc < datetime('now')
  `).all();
  return result.results;
}

// ============================================
// 工具
// ============================================

function parseEventRow(row: any): any {
  let marketImpact = row.market_impact || [];
  if (typeof row.market_impact === 'string') {
    try {
      marketImpact = JSON.parse(row.market_impact);
    } catch {
      marketImpact = [];
    }
  }
  return {
    ...row,
    market_impact: marketImpact,
  };
}

// ============================================
// Market Snapshots
// ============================================

import type { IndustryFundFlowRow, InstrumentDailyRow, MarketSnapshotRow, SwIndustryDailyRow } from './collectors/base';

const SNAPSHOT_COLUMNS = `
  trade_date, index_code,
  close_price, change_pct,
  rise_count, fall_count, flat_count,
  turnover_amount, turnover_rate,
  volatility_20d,
  northbound_amt, northbound_num,
  pe_ttm, pb,
  margin_balance, bond_yield_10y,
  us_2y_yield, fed_funds_rate, usd_index, oil_wti, us_yield_spread, total_market_cap
`;

const SNAPSHOT_PLACEHOLDERS = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

const SNAPSHOT_CONFLICT = `
  ON CONFLICT(trade_date, index_code) DO UPDATE SET
    close_price = COALESCE(excluded.close_price, market_snapshots.close_price),
    change_pct = COALESCE(excluded.change_pct, market_snapshots.change_pct),
    rise_count = COALESCE(excluded.rise_count, market_snapshots.rise_count),
    fall_count = COALESCE(excluded.fall_count, market_snapshots.fall_count),
    flat_count = COALESCE(excluded.flat_count, market_snapshots.flat_count),
    turnover_amount = COALESCE(excluded.turnover_amount, market_snapshots.turnover_amount),
    turnover_rate = COALESCE(excluded.turnover_rate, market_snapshots.turnover_rate),
    volatility_20d = COALESCE(excluded.volatility_20d, market_snapshots.volatility_20d),
    northbound_amt = COALESCE(excluded.northbound_amt, market_snapshots.northbound_amt),
    northbound_num = COALESCE(excluded.northbound_num, market_snapshots.northbound_num),
    pe_ttm = COALESCE(excluded.pe_ttm, market_snapshots.pe_ttm),
    pb = COALESCE(excluded.pb, market_snapshots.pb),
    margin_balance = COALESCE(excluded.margin_balance, market_snapshots.margin_balance),
    bond_yield_10y = COALESCE(excluded.bond_yield_10y, market_snapshots.bond_yield_10y),
    us_2y_yield = COALESCE(excluded.us_2y_yield, market_snapshots.us_2y_yield),
    fed_funds_rate = COALESCE(excluded.fed_funds_rate, market_snapshots.fed_funds_rate),
    usd_index = COALESCE(excluded.usd_index, market_snapshots.usd_index),
    oil_wti = COALESCE(excluded.oil_wti, market_snapshots.oil_wti),
    us_yield_spread = COALESCE(excluded.us_yield_spread, market_snapshots.us_yield_spread),
    total_market_cap = COALESCE(excluded.total_market_cap, market_snapshots.total_market_cap),
    created_at = datetime('now')
`;

function bindSnapshot(stmt: D1PreparedStatement, row: MarketSnapshotRow): D1PreparedStatement {
  return stmt.bind(
    row.trade_date, row.index_code,
    row.close_price, row.change_pct,
    row.rise_count, row.fall_count, row.flat_count,
    row.turnover_amount, row.turnover_rate,
    row.volatility_20d,
    row.northbound_amt, row.northbound_num,
    row.pe_ttm, row.pb,
    row.margin_balance, row.bond_yield_10y,
    row.us_2y_yield, row.fed_funds_rate, row.usd_index, row.oil_wti, row.us_yield_spread, row.total_market_cap,
  );
}

/**
 * 批量 upsert 市场快照
 */
export async function upsertSnapshots(db: D1Database, rows: MarketSnapshotRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  const stmts = rows.map(row =>
    bindSnapshot(
      db.prepare(`INSERT INTO market_snapshots (${SNAPSHOT_COLUMNS}) VALUES ${SNAPSHOT_PLACEHOLDERS} ${SNAPSHOT_CONFLICT}`),
      row,
    )
  );

  await db.batch(stmts);
  return rows.length;
}

/**
 * 按日期范围查询快照
 */
export async function getSnapshotsByDateRange(
  db: D1Database,
  startDate: string,
  endDate: string,
): Promise<MarketSnapshotRow[]> {
  const result = await db.prepare(`
    SELECT * FROM market_snapshots
    WHERE trade_date BETWEEN ? AND ?
    ORDER BY trade_date DESC, index_code ASC
  `).bind(startDate, endDate).all();
  return result.results as MarketSnapshotRow[];
}

export async function getSnapshotsByDateRangeAndIndex(
  db: D1Database,
  indexCode: string,
  startDate: string,
  endDate: string,
): Promise<MarketSnapshotRow[]> {
  const result = await db.prepare(`
    SELECT * FROM market_snapshots
    WHERE index_code = ? AND trade_date BETWEEN ? AND ?
    ORDER BY trade_date DESC
  `).bind(indexCode, startDate, endDate).all();
  return result.results as MarketSnapshotRow[];
}

/**
 * 获取最新一天的快照（所有指数）
 */
export async function getLatestSnapshots(db: D1Database): Promise<MarketSnapshotRow[]> {
  const result = await db.prepare(`
    SELECT * FROM market_snapshots
    WHERE trade_date = (
      SELECT MAX(trade_date)
      FROM market_snapshots
      WHERE close_price IS NOT NULL
    )
    ORDER BY index_code ASC
  `).all();
  return result.results as MarketSnapshotRow[];
}

// ============================================
// Instrument Daily
// ============================================

const INSTRUMENT_DAILY_COLUMNS = `
  trade_date, instrument_code, instrument_name, instrument_type, provider,
  open_price, high_price, low_price, close_price, pre_close_price,
  change_pct, change_amount, amplitude, volume, amount, turnover_rate,
  pe_ttm, pb, total_market_cap, float_market_cap, is_st, source_updated_at
`;

const INSTRUMENT_DAILY_PLACEHOLDERS = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

const INSTRUMENT_DAILY_CONFLICT = `
  ON CONFLICT(trade_date, instrument_code) DO UPDATE SET
    instrument_name = excluded.instrument_name,
    instrument_type = excluded.instrument_type,
    provider = excluded.provider,
    open_price = COALESCE(excluded.open_price, instrument_daily.open_price),
    high_price = COALESCE(excluded.high_price, instrument_daily.high_price),
    low_price = COALESCE(excluded.low_price, instrument_daily.low_price),
    close_price = COALESCE(excluded.close_price, instrument_daily.close_price),
    pre_close_price = COALESCE(excluded.pre_close_price, instrument_daily.pre_close_price),
    change_pct = COALESCE(excluded.change_pct, instrument_daily.change_pct),
    change_amount = COALESCE(excluded.change_amount, instrument_daily.change_amount),
    amplitude = COALESCE(excluded.amplitude, instrument_daily.amplitude),
    volume = COALESCE(excluded.volume, instrument_daily.volume),
    amount = COALESCE(excluded.amount, instrument_daily.amount),
    turnover_rate = COALESCE(excluded.turnover_rate, instrument_daily.turnover_rate),
    pe_ttm = COALESCE(excluded.pe_ttm, instrument_daily.pe_ttm),
    pb = COALESCE(excluded.pb, instrument_daily.pb),
    total_market_cap = COALESCE(excluded.total_market_cap, instrument_daily.total_market_cap),
    float_market_cap = COALESCE(excluded.float_market_cap, instrument_daily.float_market_cap),
    is_st = COALESCE(excluded.is_st, instrument_daily.is_st),
    source_updated_at = COALESCE(excluded.source_updated_at, instrument_daily.source_updated_at),
    updated_at = datetime('now')
`;

function bindInstrumentDaily(stmt: D1PreparedStatement, row: InstrumentDailyRow): D1PreparedStatement {
  return stmt.bind(
    row.trade_date,
    row.instrument_code,
    row.instrument_name,
    row.instrument_type,
    row.provider,
    row.open_price,
    row.high_price,
    row.low_price,
    row.close_price,
    row.pre_close_price,
    row.change_pct,
    row.change_amount,
    row.amplitude,
    row.volume,
    row.amount,
    row.turnover_rate,
    row.pe_ttm,
    row.pb,
    row.total_market_cap,
    row.float_market_cap,
    row.is_st,
    row.source_updated_at,
  );
}

export async function upsertInstrumentDailyRows(db: D1Database, rows: InstrumentDailyRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const stmts = chunk.map((row) =>
      bindInstrumentDaily(
        db.prepare(
          `INSERT INTO instrument_daily (${INSTRUMENT_DAILY_COLUMNS}) VALUES ${INSTRUMENT_DAILY_PLACEHOLDERS} ${INSTRUMENT_DAILY_CONFLICT}`,
        ),
        row,
      ),
    );
    await db.batch(stmts);
  }

  return rows.length;
}

export async function getInstrumentDailyCoverage(
  db: D1Database,
  instrumentCode: string,
): Promise<{ count: number; min_date: string | null; max_date: string | null }> {
  const result = await db.prepare(`
    SELECT
      COUNT(*) AS count,
      MIN(trade_date) AS min_date,
      MAX(trade_date) AS max_date
    FROM instrument_daily
    WHERE instrument_code = ?
  `).bind(instrumentCode).first<{ count: number; min_date: string | null; max_date: string | null }>();

  return result ?? { count: 0, min_date: null, max_date: null };
}

export async function getInstrumentDailyByDateRange(
  db: D1Database,
  instrumentCode: string,
  startDate: string,
  endDate: string,
): Promise<InstrumentDailyRow[]> {
  const result = await db.prepare(`
    SELECT
      trade_date, instrument_code, instrument_name, instrument_type, provider,
      open_price, high_price, low_price, close_price, pre_close_price,
      change_pct, change_amount, amplitude, volume, amount, turnover_rate,
      pe_ttm, pb, total_market_cap, float_market_cap, is_st, source_updated_at
    FROM instrument_daily
    WHERE instrument_code = ? AND trade_date BETWEEN ? AND ?
    ORDER BY trade_date DESC
  `).bind(instrumentCode, startDate, endDate).all();

  return result.results as InstrumentDailyRow[];
}

export async function getInstrumentDailyClosesByDateRange(
  db: D1Database,
  instrumentCode: string,
  startDate: string,
  endDate: string,
): Promise<Array<{ trade_date: string; close_price: number | null }>> {
  const result = await db.prepare(`
    SELECT trade_date, close_price
    FROM instrument_daily
    WHERE instrument_code = ? AND trade_date BETWEEN ? AND ?
    ORDER BY trade_date ASC
  `).bind(instrumentCode, startDate, endDate).all();

  return result.results as Array<{ trade_date: string; close_price: number | null }>;
}

// ============================================
// Industry Fund Flow Daily
// ============================================

const INDUSTRY_FLOW_COLUMNS = `
  trade_date, board_code, board_name, provider, close_price, change_pct,
  main_net_inflow, small_net_inflow, medium_net_inflow, large_net_inflow,
  super_large_net_inflow, main_net_inflow_ratio, small_net_inflow_ratio,
  medium_net_inflow_ratio, large_net_inflow_ratio, super_large_net_inflow_ratio,
  source_updated_at
`;

const INDUSTRY_FLOW_PLACEHOLDERS = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

function bindIndustryFundFlow(stmt: D1PreparedStatement, row: IndustryFundFlowRow): D1PreparedStatement {
  return stmt.bind(
    row.trade_date,
    row.board_code,
    row.board_name,
    row.provider,
    row.close_price,
    row.change_pct,
    row.main_net_inflow,
    row.small_net_inflow,
    row.medium_net_inflow,
    row.large_net_inflow,
    row.super_large_net_inflow,
    row.main_net_inflow_ratio,
    row.small_net_inflow_ratio,
    row.medium_net_inflow_ratio,
    row.large_net_inflow_ratio,
    row.super_large_net_inflow_ratio,
    row.source_updated_at,
  );
}

export async function upsertIndustryFundFlowRows(
  db: D1Database,
  rows: IndustryFundFlowRow[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const sql = `
    INSERT INTO industry_fund_flow_daily (${INDUSTRY_FLOW_COLUMNS})
    VALUES ${INDUSTRY_FLOW_PLACEHOLDERS}
    ON CONFLICT(trade_date, board_code) DO UPDATE SET
      board_name = excluded.board_name,
      provider = excluded.provider,
      close_price = excluded.close_price,
      change_pct = excluded.change_pct,
      main_net_inflow = excluded.main_net_inflow,
      small_net_inflow = excluded.small_net_inflow,
      medium_net_inflow = excluded.medium_net_inflow,
      large_net_inflow = excluded.large_net_inflow,
      super_large_net_inflow = excluded.super_large_net_inflow,
      main_net_inflow_ratio = excluded.main_net_inflow_ratio,
      small_net_inflow_ratio = excluded.small_net_inflow_ratio,
      medium_net_inflow_ratio = excluded.medium_net_inflow_ratio,
      large_net_inflow_ratio = excluded.large_net_inflow_ratio,
      super_large_net_inflow_ratio = excluded.super_large_net_inflow_ratio,
      source_updated_at = excluded.source_updated_at,
      updated_at = CURRENT_TIMESTAMP
  `;

  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const statements = rows.slice(i, i + chunkSize).map((row) =>
      bindIndustryFundFlow(db.prepare(sql), row),
    );
    await db.batch(statements);
  }
  return rows.length;
}

export async function getIndustryFundFlowRows(
  db: D1Database,
  startDate: string,
  endDate: string,
): Promise<IndustryFundFlowRow[]> {
  const result = await db.prepare(`
    SELECT ${INDUSTRY_FLOW_COLUMNS}
    FROM industry_fund_flow_daily
    WHERE trade_date BETWEEN ? AND ?
    ORDER BY trade_date ASC, board_code ASC
  `).bind(startDate, endDate).all();
  return result.results as unknown as IndustryFundFlowRow[];
}

export async function getIndustryFundFlowRange(db: D1Database): Promise<{
  count: number;
  min_date: string | null;
  max_date: string | null;
}> {
  const result = await db.prepare(`
    SELECT COUNT(*) AS count, MIN(trade_date) AS min_date, MAX(trade_date) AS max_date
    FROM industry_fund_flow_daily
  `).first<{ count: number; min_date: string | null; max_date: string | null }>();
  return result ?? { count: 0, min_date: null, max_date: null };
}

// ============================================
// Complete Shenwan level-1 industry daily data
// ============================================

const SW_INDUSTRY_COLUMNS = `
  trade_date, industry_code, industry_name, provider, open_price, high_price,
  low_price, close_price, change_pct, volume, amount, member_count, source_updated_at
`;

const SW_INDUSTRY_PLACEHOLDERS = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

function bindSwIndustry(stmt: D1PreparedStatement, row: SwIndustryDailyRow): D1PreparedStatement {
  return stmt.bind(
    row.trade_date, row.industry_code, row.industry_name, row.provider,
    row.open_price, row.high_price, row.low_price, row.close_price,
    row.change_pct, row.volume, row.amount, row.member_count, row.source_updated_at,
  );
}

export async function upsertSwIndustryDailyRows(
  database: D1Database,
  rows: SwIndustryDailyRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const sql = `
    INSERT INTO sw_industry_daily (${SW_INDUSTRY_COLUMNS})
    VALUES ${SW_INDUSTRY_PLACEHOLDERS}
    ON CONFLICT(trade_date, industry_code) DO UPDATE SET
      industry_name = excluded.industry_name,
      provider = excluded.provider,
      open_price = excluded.open_price,
      high_price = excluded.high_price,
      low_price = excluded.low_price,
      close_price = excluded.close_price,
      change_pct = excluded.change_pct,
      volume = excluded.volume,
      amount = excluded.amount,
      member_count = excluded.member_count,
      source_updated_at = excluded.source_updated_at,
      updated_at = CURRENT_TIMESTAMP
  `;
  for (let i = 0; i < rows.length; i += 100) {
    await database.batch(rows.slice(i, i + 100).map((row) => bindSwIndustry(database.prepare(sql), row)));
  }
  return rows.length;
}

export async function getSwIndustryDailyRows(
  database: D1Database,
  startDate: string,
  endDate: string,
): Promise<SwIndustryDailyRow[]> {
  const result = await database.prepare(`
    SELECT ${SW_INDUSTRY_COLUMNS}
    FROM sw_industry_daily
    WHERE trade_date BETWEEN ? AND ?
    ORDER BY trade_date ASC, industry_code ASC
  `).bind(startDate, endDate).all();
  return result.results as unknown as SwIndustryDailyRow[];
}

export async function getSwIndustryDailyRange(database: D1Database): Promise<{
  count: number;
  industries: number;
  min_date: string | null;
  max_date: string | null;
}> {
  const result = await database.prepare(`
    SELECT COUNT(*) AS count, COUNT(DISTINCT industry_code) AS industries,
      MIN(trade_date) AS min_date, MAX(trade_date) AS max_date
    FROM sw_industry_daily
  `).first<{ count: number; industries: number; min_date: string | null; max_date: string | null }>();
  return result ?? { count: 0, industries: 0, min_date: null, max_date: null };
}

export async function getSwIndustryCodes(database: D1Database): Promise<string[]> {
  const result = await database.prepare(`
    SELECT DISTINCT industry_code
    FROM sw_industry_daily
    ORDER BY industry_code
  `).all<{ industry_code: string }>();
  return result.results.map((row) => row.industry_code);
}

export interface SwIndustryImportRun {
  run_id: string;
  trade_date: string;
  mode: 'daily' | 'backfill';
  expected_industries: number;
  expected_rows: number;
  checksum: string;
  status: 'staging' | 'completed' | 'failed';
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function beginSwIndustryImport(
  database: D1Database,
  run: Pick<SwIndustryImportRun, 'run_id' | 'trade_date' | 'mode' | 'expected_industries' | 'expected_rows' | 'checksum'>,
): Promise<void> {
  await database.prepare(`
    INSERT INTO sw_industry_import_runs (
      run_id, trade_date, mode, expected_industries, expected_rows, checksum, status
    ) VALUES (?, ?, ?, ?, ?, ?, 'staging')
    ON CONFLICT(run_id) DO NOTHING
  `).bind(
    run.run_id, run.trade_date, run.mode, run.expected_industries, run.expected_rows, run.checksum,
  ).run();
}

export async function stageSwIndustryDailyRows(
  database: D1Database,
  runId: string,
  rows: SwIndustryDailyRow[],
): Promise<number> {
  const sql = `
    INSERT INTO sw_industry_daily_staging (
      run_id, ${SW_INDUSTRY_COLUMNS}
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id, trade_date, industry_code) DO UPDATE SET
      industry_name = excluded.industry_name, provider = excluded.provider,
      open_price = excluded.open_price, high_price = excluded.high_price,
      low_price = excluded.low_price, close_price = excluded.close_price,
      change_pct = excluded.change_pct, volume = excluded.volume, amount = excluded.amount,
      member_count = excluded.member_count, source_updated_at = excluded.source_updated_at
  `;
  await database.batch(rows.map((row) => database.prepare(sql).bind(
    runId, row.trade_date, row.industry_code, row.industry_name, row.provider,
    row.open_price, row.high_price, row.low_price, row.close_price, row.change_pct,
    row.volume, row.amount, row.member_count, row.source_updated_at,
  )));
  return rows.length;
}

export async function commitSwIndustryImport(database: D1Database, runId: string): Promise<{
  rows: number;
  industries: number;
  trade_date: string;
}> {
  const run = await database.prepare(`
    SELECT * FROM sw_industry_import_runs WHERE run_id = ?
  `).bind(runId).first<SwIndustryImportRun>();
  if (!run) throw new Error('import run not found');
  if (run.status === 'completed') {
    return { rows: run.expected_rows, industries: run.expected_industries, trade_date: run.trade_date };
  }
  if (run.status !== 'staging') throw new Error(`import run is ${run.status}`);

  const staged = await database.prepare(`
    SELECT COUNT(*) AS rows,
      COUNT(DISTINCT CASE WHEN trade_date = ? THEN industry_code END) AS industries
    FROM sw_industry_daily_staging WHERE run_id = ?
  `).bind(run.trade_date, runId).first<{ rows: number; industries: number }>();
  if (!staged || staged.rows !== run.expected_rows || staged.industries !== run.expected_industries) {
    throw new Error(
      `incomplete import: expected ${run.expected_rows}/${run.expected_industries}, ` +
      `received ${staged?.rows ?? 0}/${staged?.industries ?? 0}`,
    );
  }

  await database.batch([
    database.prepare(`
      INSERT INTO sw_industry_daily (${SW_INDUSTRY_COLUMNS})
      SELECT ${SW_INDUSTRY_COLUMNS}
      FROM sw_industry_daily_staging WHERE run_id = ?
      ON CONFLICT(trade_date, industry_code) DO UPDATE SET
        industry_name = excluded.industry_name, provider = excluded.provider,
        open_price = excluded.open_price, high_price = excluded.high_price,
        low_price = excluded.low_price, close_price = excluded.close_price,
        change_pct = excluded.change_pct, volume = excluded.volume, amount = excluded.amount,
        member_count = excluded.member_count, source_updated_at = excluded.source_updated_at,
        updated_at = CURRENT_TIMESTAMP
    `).bind(runId),
    database.prepare(`
      UPDATE sw_industry_import_runs
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP, error = NULL
      WHERE run_id = ?
    `).bind(runId),
    database.prepare('DELETE FROM sw_industry_daily_staging WHERE run_id = ?').bind(runId),
  ]);
  return { rows: staged.rows, industries: staged.industries, trade_date: run.trade_date };
}

export async function failSwIndustryImport(database: D1Database, runId: string, error: string): Promise<void> {
  await database.batch([
    database.prepare(`
      UPDATE sw_industry_import_runs SET status = 'failed', error = ? WHERE run_id = ? AND status = 'staging'
    `).bind(error.slice(0, 500), runId),
    database.prepare('DELETE FROM sw_industry_daily_staging WHERE run_id = ?').bind(runId),
  ]);
}

export async function getLatestSwIndustryImportRun(database: D1Database): Promise<SwIndustryImportRun | null> {
  return database.prepare(`
    SELECT * FROM sw_industry_import_runs
    WHERE status = 'completed'
    ORDER BY completed_at DESC LIMIT 1
  `).first<SwIndustryImportRun>();
}
