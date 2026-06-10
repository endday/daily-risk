/**
 * FRED Collector - 美联储经济数据（修复版）
 *
 * 直接用 series/observations 拉取我们关心的指标，
 * 不用 releases/dates（那个 API 返回的数据不符合预期）。
 */

import type { NormalizedEvent } from '../../../shared/types';

/** 我们关心的 FRED 系列 */
const FRED_SERIES = [
  { series_id: 'CPIAUCSL', event_key: 'US_CPI', display_name: '美国 CPI', units: 'pc1', display_format: 'percent' },
  { series_id: 'PPIACO', event_key: 'US_PPI', display_name: '美国 PPI', units: 'pc1', display_format: 'percent' },
  { series_id: 'UNRATE', event_key: 'US_UNEMPLOYMENT', display_name: '美国失业率', units: '', display_format: 'percent' },
  { series_id: 'GDP', event_key: 'US_GDP', display_name: '美国 GDP', units: '', display_format: 'trillion' },
  { series_id: 'PAYEMS', event_key: 'US_NONFARM', display_name: '美国非农就业', units: '', display_format: 'change_k' },
];

export interface FredCollectorConfig {
  apiKey: string;
}

/**
 * 从 FRED 获取指定系列的最新观测值
 */
async function fetchObservations(seriesId: string, apiKey: string, units?: string) {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: 'json',
    sort_order: 'desc',
    limit: '2',
  });
  if (units) params.set('units', units);

  const url = `https://api.stlouisfed.org/fred/series/observations?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED API error: ${res.status}`);
  return res.json();
}

/**
 * 计算 YoY 变化（如果 units=pc1 已经是 YoY，直接用）
 */
function formatValue(value: string, units: string, display_format: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;

  if (units === 'pc1') {
    // 已经是百分比变化
    return `${num.toFixed(1)}%`;
  }
  if (display_format === 'percent') {
    return `${num.toFixed(1)}%`;
  }
  if (display_format === 'trillion') {
    return `${(num / 1000).toFixed(2)}T`;
  }
  if (display_format === 'change_k') {
    return `${Math.round(num)}K`;
  }
  return value;
}

/**
 * 获取未来 30 天内该指标的下一个发布日期
 *
 * 简化规则（实际发布日可能因节假日调整）：
 * - CPI/PPI：每月 10-15 日之间
 * - 失业率/非农：每月第一个周五
 * - GDP：每季度末后一个月 25-30 日
 */
function getNextReleaseDate(seriesId: string, fromDate: Date): string | null {
  const year = fromDate.getFullYear();
  const month = fromDate.getMonth(); // 0-based

  if (seriesId === 'CPIAUCSL') {
    // CPI：每月第二周周三（通常是 10-14 日之间）
    const firstDay = new Date(year, month, 1);
    const dayOfWeek = firstDay.getDay();
    // 找到第二个周三
    const daysToFirstWed = dayOfWeek <= 3 ? 3 - dayOfWeek : 3 - dayOfWeek + 7;
    const secondWed = new Date(year, month, 1 + daysToFirstWed + 7);
    if (secondWed < fromDate) secondWed.setMonth(month + 1);
    return secondWed.toISOString().split('T')[0];
  }

  if (seriesId === 'PPIACO') {
    // PPI：CPI 后一天
    const firstDay = new Date(year, month, 1);
    const dayOfWeek = firstDay.getDay();
    const daysToFirstWed = dayOfWeek <= 3 ? 3 - dayOfWeek : 3 - dayOfWeek + 7;
    const secondWed = new Date(year, month, 1 + daysToFirstWed + 7);
    const ppiDate = new Date(secondWed.getTime() + 24 * 60 * 60 * 1000);
    if (ppiDate < fromDate) ppiDate.setMonth(ppiDate.getMonth() + 1);
    return ppiDate.toISOString().split('T')[0];
  }

  if (seriesId === 'UNRATE' || seriesId === 'PAYEMS') {
    // 失业率/非农：每月第一个周五
    const firstDay = new Date(year, month, 1);
    const dayOfWeek = firstDay.getDay(); // 0=Sun, 5=Fri
    const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 5 - dayOfWeek + 7;
    const releaseDate = new Date(year, month, 1 + daysUntilFriday);
    if (releaseDate < fromDate) {
      releaseDate.setMonth(month + 1);
      const firstDayNext = new Date(releaseDate.getFullYear(), releaseDate.getMonth(), 1);
      const dowNext = firstDayNext.getDay();
      const daysUntilFriNext = dowNext <= 5 ? 5 - dowNext : 5 - dowNext + 7;
      releaseDate.setDate(1 + daysUntilFriNext);
    }
    return releaseDate.toISOString().split('T')[0];
  }

  if (seriesId === 'GDP') {
    // GDP：每季度末后一个月 25-30 日（1/4/7/10 月的 25 日）
    const quarterMonths = [1, 4, 7, 10]; // 1 月、4 月、7 月、10 月
    let releaseMonth = quarterMonths.find(m => m > month) || quarterMonths[0];
    let releaseYear = year;
    if (releaseMonth <= month) releaseYear++;
    const releaseDate = new Date(releaseYear, releaseMonth - 1, 25);
    return releaseDate.toISOString().split('T')[0];
  }

  return null;
}

/**
 * FRED 主采集函数
 */
export async function collectFredData(config: FredCollectorConfig): Promise<NormalizedEvent[]> {
  const { apiKey } = config;
  const events: NormalizedEvent[] = [];
  const today = new Date();

  for (const series of FRED_SERIES) {
    try {
      const data = await fetchObservations(series.series_id, apiKey, series.units || undefined);
      const observations = data.observations?.filter((o: any) => o.value !== '.') || [];

      if (observations.length === 0) continue;

      // 最新值 = actual_value，前一个值 = previous_value
      const latest = observations[0];
      const previous = observations.length > 1 ? observations[1] : null;

      // 只生成下一个发布日期的事件
      const releaseDate = getNextReleaseDate(series.series_id, today);
      if (!releaseDate) continue;

      events.push({
        event_key: `${series.event_key}_${releaseDate}`,
        source: 'fred',
        title: series.display_name,
        display_name: series.display_name,
        event_date: releaseDate,
        event_time: '20:30',
        timezone: 'Asia/Shanghai',
        event_datetime_utc: new Date(`${releaseDate}T12:30:00Z`).toISOString(),
        country: 'US',
        importance: series.event_key === 'US_CPI' || series.event_key === 'US_NONFARM' ? 10 : 7,
        market_impact: ['NASDAQ', 'GOLD', 'USD'],
        series_id: series.series_id,
        display_format: series.display_format,
        previous_value: previous ? formatValue(previous.value, series.units, series.display_format) : null,
        actual_value: formatValue(latest.value, series.units, series.display_format),
        raw_json: JSON.stringify({ latest, previous }),
      });
    } catch (error) {
      console.error(`[FRED] Failed to fetch ${series.series_id}:`, error);
    }
  }

  return events;
}
