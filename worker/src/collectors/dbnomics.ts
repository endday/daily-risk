/**
 * DBnomics Collector - 中国宏观数据
 *
 * 数据源：DBnomics NBS（中国国家统计局）
 * 免费公开 API，无需 API Key。
 *
 * 文档：https://docs.db.nomics.world/
 */

import type { NormalizedEvent } from '../../../shared/types';

/** 中国宏观指标映射（DBnomics NBS） */
const CN_SERIES = [
  {
    dataset_code: 'M_A010105',
    series_code: null, // 取第一个 series
    event_key: 'CN_CPI',
    display_name: '中国 CPI',
    importance: 8,
    display_format: 'percent',
    market_impact: ['上证', '恒指', 'CNY'],
  },
  {
    dataset_code: 'M_A0B01',
    series_code: null,
    event_key: 'CN_PMI',
    display_name: '中国 PMI',
    importance: 7,
    display_format: 'index',
    market_impact: ['上证', '恒指', '铁矿石'],
  },
  {
    dataset_code: 'M_A0D01',
    series_code: null,
    event_key: 'CN_M2',
    display_name: '中国 M2',
    importance: 6,
    display_format: 'yoy_percent',
    market_impact: ['上证', 'CNY'],
  },
  {
    dataset_code: 'M_A0B02',
    series_code: null,
    event_key: 'CN_PMI_NM',
    display_name: '中国非制造业PMI',
    importance: 6,
    display_format: 'index',
    market_impact: ['上证', '服务业'],
  },
];

/**
 * 从 DBnomics 获取中国宏观数据
 */
export async function collectChinaData(): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = [];
  const today = new Date();
  console.log('[DBnomics] Starting collection, today:', today.toISOString());

  for (const item of CN_SERIES) {
    try {
      const url = `https://api.db.nomics.world/v22/series/NBS/${item.dataset_code}?observations=true&limit=2`;
      console.log('[DBnomics] Fetching:', url);

      const res = await fetch(url);
      console.log('[DBnomics] Response status:', res.status);

      if (!res.ok) {
        console.error(`[DBnomics] API error for ${item.dataset_code}: ${res.status}`);
        continue;
      }

      const data = await res.json();
      const series = data.series?.docs?.[0];

      if (!series || !series.period || series.period.length === 0) {
        console.warn(`[DBnomics] No data for ${item.dataset_code}`);
        continue;
      }

      // DBnomics 格式：period[] 和 value[] 一一对应
      const periods = series.period;
      const values = series.value;

      // 找最新的非 NA 值
      let latestIdx = periods.length - 1;
      while (latestIdx >= 0 && (values[latestIdx] === 'NA' || !values[latestIdx])) {
        latestIdx--;
      }

      let prevIdx = latestIdx - 1;
      while (prevIdx >= 0 && (values[prevIdx] === 'NA' || !values[prevIdx])) {
        prevIdx--;
      }

      if (latestIdx < 0) {
        console.warn(`[DBnomics] All values are NA for ${item.dataset_code}`);
        continue;
      }

      const latestValue = values[latestIdx];
      const previousValue = prevIdx >= 0 ? values[prevIdx] : null;

      // 计算下一个发布日期
      // CPI/PPI: 每月 10 日左右
      // M2: 每月 10-15 日
      // PMI (制造业+非制造业): 每月最后一天
      const year = today.getFullYear();
      const month = today.getMonth();
      let releaseDate: Date;

      if (item.event_key === 'CN_PMI' || item.event_key === 'CN_PMI_NM') {
        // PMI: 月末最后一天
        releaseDate = new Date(year, month + 1, 0);
        if (releaseDate < today) {
          releaseDate = new Date(year, month + 2, 0);
        }
      } else if (item.event_key === 'CN_M2') {
        releaseDate = new Date(year, month, 15);
        if (releaseDate < today) {
          releaseDate.setMonth(month + 1);
        }
      } else {
        releaseDate = new Date(year, month, 10);
        if (releaseDate < today) {
          releaseDate.setMonth(month + 1);
        }
      }

      const dateStr = releaseDate.toISOString().split('T')[0];

      events.push({
        event_key: `${item.event_key}_${dateStr}`,
        source: 'dbnomics',
        title: item.display_name,
        display_name: item.display_name,
        event_date: dateStr,
        event_time: '09:30',
        timezone: 'Asia/Shanghai',
        event_datetime_utc: new Date(`${dateStr}T01:30:00Z`).toISOString(),
        country: 'CN',
        importance: item.importance,
        market_impact: item.market_impact,
        display_format: item.display_format,
        previous_value: previousValue,
        actual_value: latestValue,
        raw_json: JSON.stringify({ period: periods[latestIdx], value: latestValue, prev_value: previousValue }),
      });
    } catch (error) {
      console.error(`[DBnomics] Failed to fetch ${item.dataset_code}:`, error);
    }
  }

  return events;
}
