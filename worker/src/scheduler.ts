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
import { syncTradingCalendar } from './trading-calendar';
import { initializeInstrumentDaily } from './collectors/instrument-daily-init';
import { syncIndexValuationDaily } from './collectors/index-valuation';
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
  try {
    const endDate = getBeijingDate(0);
    const startDate = offsetDate(endDate, -15);
    const valuationResult = await syncIndexValuationDaily(env.DB, startDate, endDate);
    console.log(
      `[Scheduler] Valuation index sync complete: ` +
      `${valuationResult.valuationIndices} PE series, ` +
      `${valuationResult.rows} rows, ${startDate} -> ${endDate}`,
    );
  } catch (error) {
    console.warn(`[Scheduler] Valuation index sync failed (non-fatal): ${(error as Error).message}`);
  }

  console.log(
    `[Scheduler] Daily collection complete: ` +
    `${total_events} events, ${total_errors} errors, ` +
    `details: ${results.map(r => `${r.name}=${r.status}`).join(', ')}`
  );
}
