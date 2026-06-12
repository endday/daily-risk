/**
 * 采集调度器 - 协调所有 collector 的运行
 */

import { upsertEvents, logProviderRun } from './db';
import { collectFredData } from './collectors/fred';
import { collectChinaData } from './collectors/dbnomics';
import { collectEastMoneyData, collectNorthboundFlow } from './collectors/eastmoney';
import { fetchEarningsCalendar } from './collectors/alpha-vantage';
import { loadManualEvents } from './collectors/manual';

export interface CollectorEnv {
  DB: D1Database;
  FRED_API_KEY?: string;
  ALPHA_VANTAGE_KEY?: string;
  RISK_RULES: Record<string, any>;
  CHINA_EVENTS: any;
  EARNINGS_SYMBOLS: string[];
}

export async function runDailyCollection(env: CollectorEnv): Promise<void> {
  const startTime = new Date().toISOString();
  let totalUpserted = 0;
  const errors: string[] = [];

  // 1. FRED Data
  if (env.FRED_API_KEY) {
    try {
      const fredEvents = await collectFredData({
        apiKey: env.FRED_API_KEY,
      });
      const count = await upsertEvents(env.DB, fredEvents);
      totalUpserted += count;
    } catch (error) {
      errors.push(`FRED: ${(error as Error).message}`);
    }
  }

  // 2. China Data (DBnomics - PMI/M2)
  try {
    const chinaEvents = await collectChinaData();
    const count = await upsertEvents(env.DB, chinaEvents);
    totalUpserted += count;
  } catch (error) {
    errors.push(`China DBnomics: ${(error as Error).message}`);
  }

  // 3. China Data (EastMoney - CPI/PPI)
  try {
    const emEvents = await collectEastMoneyData();
    const count = await upsertEvents(env.DB, emEvents);
    totalUpserted += count;
  } catch (error) {
    errors.push(`EastMoney: ${(error as Error).message}`);
  }

  // 3.5 Northbound Flow (EastMoney - 北向资金)
  try {
    const nbEvents = await collectNorthboundFlow();
    const count = await upsertEvents(env.DB, nbEvents);
    totalUpserted += count;
  } catch (error) {
    errors.push(`NorthboundFlow: ${(error as Error).message}`);
  }

  // 4. Alpha Vantage Earnings
  if (env.ALPHA_VANTAGE_KEY) {
    try {
      const earningsEvents = await fetchEarningsCalendar({
        apiKey: env.ALPHA_VANTAGE_KEY,
        symbols: env.EARNINGS_SYMBOLS,
        rules: env.RISK_RULES,
      });
      const count = await upsertEvents(env.DB, earningsEvents);
      totalUpserted += count;
    } catch (error) {
      errors.push(`AlphaVantage: ${(error as Error).message}`);
    }
  }

  // 4. Manual Events (China) - 备用，DBnomics 失败时使用
  try {
    const manualEvents = await loadManualEvents({
      chinaEvents: env.CHINA_EVENTS,
      rules: env.RISK_RULES,
    });
    const count = await upsertEvents(env.DB, manualEvents);
    totalUpserted += count;
  } catch (error) {
    errors.push(`Manual: ${(error as Error).message}`);
  }

  // 记录运行日志
  await logProviderRun(env.DB, {
    provider: 'all',
    run_type: 'daily_collection',
    started_at: startTime,
    finished_at: new Date().toISOString(),
    status: errors.length > 0 ? 'partial_success' : 'success',
    events_upserted: totalUpserted,
    error: errors.length > 0 ? errors.join('; ') : undefined,
  });
}
