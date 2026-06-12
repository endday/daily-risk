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
  const scores = events.map(e => e.importance || 0);
  const sumScore = scores.reduce((a, b) => a + b, 0);
  const sumScoreSquared = scores.reduce((a, b) => a + b * b, 0);
  if (sumScore === 0) return 0;
  return Math.round((sumScoreSquared / sumScore) * 10) / 10;
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

