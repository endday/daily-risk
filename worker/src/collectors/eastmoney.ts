/**
 * 东方财富 Collector - 中国宏观数据（CPI/PPI）
 *
 * 数据源：东方财富经济数据接口
 * 免费公开 API，无需 API Key。
 *
 * CPI 接口：RPT_ECONOMY_CPI
 * PPI 接口：RPT_ECONOMY_PPI
 */

import type { NormalizedEvent } from '../../../shared/types';

/** 东方财富宏观指标映射 */
const EM_SERIES = [
  {
    report_name: 'RPT_ECONOMY_CPI',
    event_key: 'CN_CPI',
    display_name: '中国 CPI',
    importance: 8,
    display_format: 'percent',
    market_impact: ['上证', '恒指', 'CNY'],
    value_field: 'NATIONAL_SAME', // 同比数据
  },
  {
    report_name: 'RPT_ECONOMY_PPI',
    event_key: 'CN_PPI',
    display_name: '中国 PPI',
    importance: 6,
    display_format: 'percent',
    market_impact: ['上证', '商品'],
    value_field: 'BASE_SAME', // 同比数据
  },
];

/**
 * 从东方财富获取最新宏观数据
 */
async function fetchEastMoneyData(reportName: string, valueField: string) {
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get` +
    `?reportName=${reportName}` +
    `&columns=ALL` +
    `&pageNumber=1` +
    `&pageSize=3` +
    `&sortTypes=-1` +
    `&sortColumns=REPORT_DATE` +
    `&source=WEB` +
    `&client=WEB`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`EastMoney API error: ${res.status}`);

  const data = await res.json();
  const records = data.result?.data || [];

  if (records.length === 0) return null;

  // 找最新的非 null 值
  let latest = records[0];
  let prev = null;

  for (let i = 0; i < records.length; i++) {
    if (records[i][valueField] !== null && records[i][valueField] !== undefined) {
      latest = records[i];
      prev = i + 1 < records.length ? records[i + 1] : null;
      break;
    }
  }

  return {
    latest: {
      period: latest.TIME,
      value: latest[valueField],
      date: latest.REPORT_DATE,
    },
    previous: prev ? {
      period: prev.TIME,
      value: prev[valueField],
    } : null,
  };
}

/**
 * 东方财富主采集函数
 */
export async function collectEastMoneyData(): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = [];
  const today = new Date();
  console.log('[EastMoney] Starting collection');

  for (const item of EM_SERIES) {
    try {
      console.log(`[EastMoney] Fetching ${item.report_name}...`);
      const data = await fetchEastMoneyData(item.report_name, item.value_field);

      if (!data) {
        console.warn(`[EastMoney] No data for ${item.report_name}`);
        continue;
      }
      console.log(`[EastMoney] Got data:`, data);

      // 计算下一个发布日期（每月 10 日）
      const year = today.getFullYear();
      const month = today.getMonth();
      const day = 10;

      const releaseDate = new Date(year, month, day);
      if (releaseDate < today) {
        releaseDate.setMonth(month + 1);
      }

      const dateStr = releaseDate.toISOString().split('T')[0];

      events.push({
        event_key: `${item.event_key}_${dateStr}`,
        source: 'eastmoney',
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
        previous_value: data.previous ? `${data.previous.value}%` : null,
        actual_value: `${data.latest.value}%`,
        raw_json: JSON.stringify(data),
      });
    } catch (error) {
      console.error(`[EastMoney] Failed to fetch ${item.report_name}:`, error);
    }
  }

  return events;
}
