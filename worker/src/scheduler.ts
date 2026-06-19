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

  console.log(
    `[Scheduler] Daily collection complete: ` +
    `${total_events} events, ${total_errors} errors, ` +
    `details: ${results.map(r => `${r.name}=${r.status}`).join(', ')}`
  );
}
