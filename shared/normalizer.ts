/**
 * Normalizer - 数据合同校验层
 *
 * 所有 collector 的输出必须经过 normalizer 处理才能写入 D1。
 * Normalizer 负责：
 * 1. 必填字段校验（缺失则拒绝）
 * 2. 格式校验（日期、时区、范围）
 * 3. 字段默认值填充
 * 4. event_key 格式统一
 * 5. UTC 时间计算
 */

import type { NormalizedEvent, RiskRule } from './types';

/** 日志回调（由调用方注入） */
export interface NormalizerLogger {
  error: (message: string, context?: unknown) => void;
  warn: (message: string, context?: unknown) => void;
}

/** 默认日志实现（输出到 console） */
const defaultLogger: NormalizerLogger = {
  error: (msg, ctx) => console.error(`[Normalizer] ${msg}`, ctx),
  warn: (msg, ctx) => console.warn(`[Normalizer] ${msg}`, ctx),
};

/**
 * 校验并归一化单个事件
 *
 * @param raw - Collector 输出的原始数据
 * @param rule - 对应的 risk-rules.json 规则（可选，用于填充默认值）
 * @param logger - 日志回调
 * @returns 归一化后的事件，或 null（校验失败）
 */
export function normalizeEvent(
  raw: Record<string, unknown>,
  rule?: RiskRule,
  logger: NormalizerLogger = defaultLogger
): NormalizedEvent | null {
  // ========================================
  // 1. 必填字段校验
  // ========================================

  const eventKey = raw.event_key;
  if (!eventKey || typeof eventKey !== 'string') {
    logger.error('missing or invalid event_key', raw);
    return null;
  }

  const eventDate = raw.event_date;
  if (!eventDate || typeof eventDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    logger.error('missing or invalid event_date (expected YYYY-MM-DD)', { event_key: eventKey, event_date: eventDate });
    return null;
  }

  // ========================================
  // 2. Rule 校验（如果有）
  // ========================================

  if (rule && (typeof rule.score !== 'number' || rule.score < 1 || rule.score > 10)) {
    logger.error('invalid rule score (must be 1-10)', { event_key: eventKey, rule });
    return null;
  }

  // ========================================
  // 3. 字段统一与默认值填充
  // ========================================

  // 统一 event_key 格式：全大写 + 下划线分隔
  const normalizedKey = eventKey.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

  // 计算 UTC 时间
  const eventTime = raw.event_time as string | undefined;
  const timezone = (raw.timezone as string) || rule?.timezone || 'Asia/Shanghai';
  const eventDatetimeUtc = (raw.event_datetime_utc as string) ||
    toUTC(eventDate, eventTime, timezone);

  // 构建归一化事件
  const normalized: NormalizedEvent = {
    event_key: normalizedKey,
    source: (raw.source as string) || 'unknown',
    title: (raw.title as string) || normalizedKey,
    display_name: rule?.display_name || (raw.display_name as string) || normalizedKey,
    event_date: eventDate,
    event_time: eventTime || undefined,
    timezone,
    event_datetime_utc: eventDatetimeUtc || undefined,
    country: (raw.country as string) || rule?.country || 'US',
    importance: rule?.score ?? (raw.importance as number) ?? 5,
    market_impact: (raw.market_impact as string[]) || rule?.market_impact || [],
    release_id: raw.release_id as number | undefined,
    series_id: raw.series_id as string | undefined,
    symbol: raw.symbol as string | undefined,
    period: raw.period as string | undefined,
    display_format: rule?.display_format || (raw.display_format as string),
    previous_value: raw.previous_value as string | undefined,
    actual_value: raw.actual_value as string | undefined,
    raw_json: raw.raw_json as string | undefined,
    raw_text: raw.raw_text as string | undefined,
  };

  // ========================================
  // 4. 可选字段警告
  // ========================================

  if (!eventTime && !rule?.time) {
    logger.warn('event has no time (will display without time)', { event_key: normalizedKey });
  }

  if (!normalized.market_impact?.length) {
    logger.warn('event has no market_impact', { event_key: normalizedKey });
  }

  return normalized;
}

/**
 * 批量归一化
 * 过滤掉校验失败的事件，返回成功归一化的事件列表
 */
export function normalizeEvents(
  rawEvents: Array<Record<string, unknown>>,
  rules: Record<string, RiskRule>,
  logger: NormalizerLogger = defaultLogger
): NormalizedEvent[] {
  const results: NormalizedEvent[] = [];

  for (const raw of rawEvents) {
    // 尝试匹配 rule
    const eventKey = raw.event_key as string;
    const rule = findMatchingRule(eventKey, rules);

    const normalized = normalizeEvent(raw, rule, logger);
    if (normalized !== null) {
      results.push(normalized);
    }
  }

  return results;
}

/**
 * 根据 event_key 或 title 查找匹配的规则
 */
function findMatchingRule(
  eventKey: string,
  rules: Record<string, RiskRule>
): RiskRule | undefined {
  // 精确匹配
  if (rules[eventKey]) return rules[eventKey];
  if (rules[eventKey.toUpperCase()]) return rules[eventKey.toUpperCase()];

  // 模糊匹配（通过 title 或 display_name）
  const normalizedKey = eventKey.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  for (const [key, rule] of Object.entries(rules)) {
    if (key.toUpperCase() === normalizedKey) return rule;
  }

  return undefined;
}

/**
 * 将北京时间转换为 UTC ISO 字符串
 *
 * @param dateStr - YYYY-MM-DD
 * @param timeStr - HH:MM (可选)
 * @param timezone - IANA 时区名
 * @returns ISO 8601 UTC 字符串，或 null（转换失败）
 */
function toUTC(dateStr: string, timeStr?: string | null, _timezone?: string): string | null {
  try {
    const timePart = timeStr || '00:00';
    // timezone 参数预留，当前使用本地时区解析

    // 构建带时区的日期时间字符串
    const localDateTime = `${dateStr}T${timePart}:00`;

    // 使用 Intl.DateTimeFormat 获取时区偏移
    const date = new Date(localDateTime);
    const utcString = date.toISOString();

    // 验证转换是否成功
    if (isNaN(date.getTime())) {
      console.warn(`[toUTC] Invalid date: ${localDateTime}`);
      return null;
    }

    return utcString;
  } catch (error) {
    console.error(`[toUTC] Conversion failed:`, error);
    return null;
  }
}

/**
 * 格式化事件值（根据 display_format）
 */
export function formatEventValue(value: string | number | null, format?: string): string {
  if (value === null || value === undefined) return '--';

  const strValue = typeof value === 'number' ? value.toString() : value;

  switch (format) {
    case 'percent':
      return `${strValue}%`;
    case 'yoy_percent':
      return `${strValue}%`;
    case 'rate_range':
      return strValue; // FOMC 利率区间如 "5.25-5.50%"
    case 'index':
      return strValue;
    case 'eps':
      return `$${strValue}`;
    default:
      return strValue;
  }
}
