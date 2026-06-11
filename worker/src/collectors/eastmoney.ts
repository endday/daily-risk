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
    description: '居民消费价格指数，衡量居民购买的消费品和服务价格水平的变动，是衡量通胀和购买力变化的关键指标',
    importance: 8,
    display_format: 'percent',
    market_impact: ['上证', '恒指', 'CNY'],
    value_field: 'NATIONAL_SAME', // 同比数据
  },
  {
    report_name: 'RPT_ECONOMY_PPI',
    event_key: 'CN_PPI',
    display_name: '中国 PPI',
    description: '工业生产者出厂价格指数，衡量生产者在生产过程中所需采购品的物价状况，是衡量商品通胀压力的重要指标',
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
 *
 * 注意：东方财富 API 返回的是已公布数据，不是未来事件。
 * 我们不生成"今日事件"来避免陈旧数据包装，只记录最新已公布值。
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

      // 从 period 字段提取月份（如"2026年05月份" → "五月"）
      let monthName = '';
      let dataPeriod = '';
      if (data.latest.period) {
        dataPeriod = data.latest.period;
        const match = data.latest.period.match(/(\d{2})月/);
        if (match) {
          const months = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
          monthName = ` (${months[parseInt(match[1]) - 1]}月)`;
        }
      }

      // 使用数据实际发布日期（从 API 获取），而非推算日期
      // 如果没有确切日期，标记为 estimated
      let eventDate: string;
      let confidence: 'confirmed' | 'estimated';

      if (data.latest.date) {
        // API 返回的 REPORT_DATE 是实际公布日期
        eventDate = data.latest.date.split(' ')[0]; // "2026-06-10 00:00:00" → "2026-06-10"
        confidence = 'confirmed';
      } else {
        // 没有确切日期，使用推算（本月 10 号）
        const year = today.getFullYear();
        const month = today.getMonth();
        eventDate = new Date(Date.UTC(year, month, 10)).toISOString().split('T')[0];
        confidence = 'estimated';
      }

      events.push({
        event_key: `${item.event_key}_${eventDate}`,
        source: 'eastmoney',
        title: item.display_name,
        display_name: `${item.display_name}${monthName}`,
        description: item.description,
        event_date: eventDate,
        event_time: '09:30',
        timezone: 'Asia/Shanghai',
        event_datetime_utc: new Date(`${eventDate}T01:30:00Z`).toISOString(),
        country: 'CN',
        importance: item.importance,
        market_impact: item.market_impact,
        display_format: item.display_format,
        // 已公布数据：前值 = previous，本次公布值 = actual
        previous_value: data.previous ? `${data.previous.value}%` : null,
        actual_value: `${data.latest.value}%`,
        confidence,
        period: dataPeriod,
        raw_json: JSON.stringify(data),
      });
    } catch (error) {
      console.error(`[EastMoney] Failed to fetch ${item.report_name}:`, error);
    }
  }

  return events;
}
