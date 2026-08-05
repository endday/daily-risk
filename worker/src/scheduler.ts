/**
 * 采集调度器 — 编排所有 collector 的运行
 *
 * 职责：
 * 1. 注册所有采集器
 * 2. 委托 runner.ts 统一执行
 * 3. 保持 runDailyCollection 接口供 index.ts 调用
 */

import type { CollectorEnv } from './collectors/base';
import { runAllCollectors } from './collectors/runner';
import * as db from './db';
import { syncTradingCalendar } from './trading-calendar';
import { initializeInstrumentDaily } from './collectors/instrument-daily-init';
import { syncIndexValuationDaily } from './collectors/index-valuation';
import { syncIndustryFundFlows } from './collectors/industry-fund-flow';
import { getBeijingDate, offsetDate } from '../../shared/date-utils';

// 事件类采集器
import { fredCollector } from './collectors/fred';
import { dbnomicsCollector } from './collectors/dbnomics';
import { eastmoneyCpiCollector, northboundCollector } from './collectors/eastmoney';
import { alphaVantageCollector } from './collectors/alpha-vantage';
import { manualCollector } from './collectors/manual';

// 快照类采集器
import { marketSnapshotCollector } from './collectors/market-snapshot';
import { chinabondCollector } from './collectors/chinabond';
import { marginTradingCollector } from './collectors/margin-trading';
import { valuationCollector } from './collectors/valuation';
import { fredMacroCollector } from './collectors/fred-macro';
import { marketCapCollector } from './collectors/market-cap';
import { marketSentimentCollector } from './collectors/market-sentiment';

// 重新导出 CollectorEnv，供 index.ts 使用
export type { CollectorEnv } from './collectors/base';

// ============================================
// 采集器注册表
// ============================================

const collectors = [
  // 事件类（写 events 表）
  fredCollector,
  dbnomicsCollector,
  eastmoneyCpiCollector,
  northboundCollector,
  alphaVantageCollector,
  manualCollector,
  // 快照类（写 market_snapshots 表）
  marketSnapshotCollector,
  chinabondCollector,
  marginTradingCollector,
  valuationCollector,
  fredMacroCollector,
  marketCapCollector,
  marketSentimentCollector,
];

// ============================================
// 每日采集入口
// ============================================

export async function runDailyCollection(env: CollectorEnv): Promise<void> {
  console.log(`[Scheduler] Starting daily collection with ${collectors.length} collectors`);

  // 同步交易日历（幂等，每次采集前跑一遍保持最新）
  try {
    const year = new Date().getFullYear();
    await syncTradingCalendar(env.DB, year);
  } catch (e) {
    console.warn(`[Scheduler] Holiday sync failed (non-fatal): ${(e as Error).message}`);
  }

  const { results, total_events, total_errors } = await runAllCollectors(collectors, env);

  // 日线数据按最近 7 个自然日回补，覆盖周末和节假日后的首个交易日。
  try {
    const endDate = getBeijingDate(0);
    const startDate = offsetDate(endDate, -7);
    const instrumentResult = await initializeInstrumentDaily(env.DB, startDate, endDate);
    console.log(
      `[Scheduler] Instrument daily sync complete: ` +
      `${instrumentResult.instruments} instruments, ${instrumentResult.rows} rows, ` +
      `${startDate} -> ${endDate}`,
    );
  } catch (error) {
    console.warn(`[Scheduler] Instrument daily sync failed (non-fatal): ${(error as Error).message}`);
  }

  // 中证官网同时提供指数收盘价与滚动 PE；拉取较长窗口以覆盖交易日错位。
  await runTrackedDataSync(env.DB, 'index_valuation', async () => {
    const endDate = getBeijingDate(0);
    const startDate = offsetDate(endDate, -15);
    const valuationResult = await syncIndexValuationDaily(env.DB, startDate, endDate);
    console.log(
      `[Scheduler] Valuation index sync complete: ` +
      `${valuationResult.selectedIndices}/${valuationResult.valuationIndices} PE series, ` +
      `${valuationResult.rows} rows, ${startDate} -> ${endDate}`,
    );
    return {
      records: valuationResult.rows,
      warning: valuationResult.rows === 0 ? 'No valuation rows returned' : undefined,
    };
  });

  await runTrackedDataSync(env.DB, 'industry_fund_flow', async () => {
    const result = await syncIndustryFundFlows(env.DB);
    console.log(
      `[Scheduler] Industry fund flow sync complete: ` +
      `${result.rows} rows across ${result.boards} boards`,
    );
    return {
      records: result.rows,
      warning: result.failedBoards.length > 0
        ? `Failed boards: ${result.failedBoards.join(', ')}`
        : result.rows === 0 ? 'No industry fund flow rows returned' : undefined,
    };
  });

  console.log(
    `[Scheduler] Daily collection complete: ` +
    `${total_events} events, ${total_errors} errors, ` +
    `details: ${results.map(r => `${r.name}=${r.status}`).join(', ')}`
  );
}

type TrackedDataSyncResult = {
  records: number;
  warning?: string;
};

export async function runTrackedDataSync(
  database: D1Database,
  provider: string,
  sync: () => Promise<TrackedDataSyncResult>,
): Promise<void> {
  const startedAt = new Date().toISOString();
  try {
    const result = await sync();
    const finishedAt = new Date().toISOString();
    await logTrackedDataSync(database, {
      provider,
      run_type: 'daily_collection',
      started_at: startedAt,
      finished_at: finishedAt,
      status: result.records === 0 ? 'failed' : result.warning ? 'partial_success' : 'success',
      records_upserted: result.records,
      error: result.records === 0 ? result.warning ?? 'No records upserted' : result.warning,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Scheduler] ${provider} sync failed (non-fatal): ${message}`);
    await logTrackedDataSync(database, {
      provider,
      run_type: 'daily_collection',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: 'failed',
      records_upserted: 0,
      error: message,
    });
  }
}

async function logTrackedDataSync(database: D1Database, run: db.ProviderRunLog): Promise<void> {
  try {
    await db.logProviderRun(database, run);
  } catch (error) {
    console.warn(`[Scheduler] Failed to log ${run.provider} sync: ${error instanceof Error ? error.message : String(error)}`);
  }
}
