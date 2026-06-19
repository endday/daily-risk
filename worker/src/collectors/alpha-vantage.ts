/**
 * Alpha Vantage Collector - 财报日历
 *
 * API: EARNINGS_CALENDAR
 * 返回 CSV 格式，包含 symbol, name, reportDate 等
 *
 * 文档：https://www.alphavantage.co/documentation/
 */

import type { NormalizedEvent, RiskRule } from '../../../shared/types';
import { normalizeEvent, type NormalizerLogger } from '../../../shared/normalizer';
import type { CollectorConfig, CollectorEnv, CollectorResult } from './base';
import { http } from './http';

export interface AlphaVantageConfig {
  apiKey: string;
  symbols: string[];
  rules: Record<string, RiskRule>;
  logger?: NormalizerLogger;
}

/**
 * 获取财报日历（CSV 格式）
 */
export async function fetchEarningsCalendar(config: AlphaVantageConfig): Promise<NormalizedEvent[]> {
  const { apiKey, symbols, rules, logger } = config;
  const events: NormalizedEvent[] = [];

  for (const symbol of symbols) {
    const url = `https://www.alphavantage.co/query` +
      `?function=EARNINGS_CALENDAR` +
      `&symbol=${symbol}` +
      `&horizon=3month` +
      `&apikey=${apiKey}`;

    try {
      const csvText = await http.get(url).text();
      const parsed = parseEarningsCSV(csvText, symbol);

      for (const rawEvent of parsed) {
        // 查找匹配的规则
        const ruleKey = `${symbol}_EARNINGS`;
        const rule = rules[ruleKey];

        if (rule) {
          const normalized = normalizeEvent(rawEvent, rule, logger);
          if (normalized) {
            events.push(normalized);
          }
        }
      }
    } catch (error) {
      logger?.error(`Failed to fetch earnings for ${symbol}`, error);
    }
  }

  return events;
}

/**
 * 解析 Alpha Vantage CSV 响应
 *
 * CSV 格式：
 * symbol,name,reportDate,fiscalDateEnding,estimate,currency
 * NVDA,NVIDIA Corporation,2026-08-28,2026-07-31,0.64,USD
 */
function parseEarningsCSV(csvText: string, symbol: string): Array<Record<string, unknown>> {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',');
  const events: Array<Record<string, unknown>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length < headers.length) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header.trim()] = values[idx]?.trim() || '';
    });

    if (row.reportDate) {
      events.push({
        event_key: `${symbol}_EARNINGS_${row.reportDate}`.replace(/[^A-Z0-9_]/g, '_'),
        source: 'alpha_vantage',
        title: `${symbol} Earnings`,
        display_name: `${symbol}财报`,
        event_date: row.reportDate,
        event_time: 'after_market',
        timezone: 'America/New_York',
        country: 'US',
        symbol: row.symbol || symbol,
        raw_text: csvText, // 缓存原始 CSV
      });
    }
  }

  return events;
}

// ============================================
// Collector 接口包装
// ============================================

export const alphaVantageCollector: CollectorConfig = {
  name: 'alpha_vantage',
  canRun: (env: CollectorEnv) => !!env.ALPHA_VANTAGE_KEY,
  async collect(env: CollectorEnv): Promise<CollectorResult> {
    const events = await fetchEarningsCalendar({
      apiKey: env.ALPHA_VANTAGE_KEY!,
      symbols: env.EARNINGS_SYMBOLS,
      rules: env.RISK_RULES,
    });
    return { events, meta: { source_count: env.EARNINGS_SYMBOLS.length, warnings: [] } };
  },
};
