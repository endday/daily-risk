/**
 * Collector Runner — 统一调度、重试、日志
 *
 * 所有采集器通过 runCollector 运行，保证：
 * 1. 单个采集器失败不阻断其他采集器
 * 2. 统一计时和日志
 * 3. 自动重试 transient 错误
 * 4. 结果写入 DB（events / snapshots）
 */

import type { CollectorConfig, CollectorEnv, CollectorResult } from './base';
import { upsertEvents, upsertSnapshots, logProviderRun } from '../db';

// ============================================
// 重试
// ============================================

interface RetryOptions {
  maxRetries: number;
  backoffMs: number;
}

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 2,
  backoffMs: 1000,
};

/**
 * 带指数退避的重试包装
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = DEFAULT_RETRY,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;

      if (attempt < opts.maxRetries) {
        const delay = opts.backoffMs * Math.pow(2, attempt);
        console.warn(`[Runner] Attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message}`);
        await sleep(delay);
      }
    }
  }

  throw lastError!;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// 单个采集器运行
// ============================================

export interface RunResult {
  name: string;
  status: 'success' | 'skipped' | 'failed';
  events_upserted: number;
  snapshots_upserted: number;
  duration_ms: number;
  error?: string;
}

/**
 * 运行单个采集器：检查条件 → 执行 → 写 DB → 记日志
 */
export async function runCollector(
  collector: CollectorConfig,
  env: CollectorEnv,
): Promise<RunResult> {
  const startTime = Date.now();

  // 检查运行条件
  if (collector.canRun && !collector.canRun(env)) {
    console.log(`[Runner] ${collector.name}: skipped (condition not met)`);
    return {
      name: collector.name,
      status: 'skipped',
      events_upserted: 0,
      snapshots_upserted: 0,
      duration_ms: Date.now() - startTime,
    };
  }

  try {
    // 执行采集（带重试）
    const result = await withRetry(() => collector.collect(env));

    // 写入 events 表
    let eventsUpserted = 0;
    if (result.events.length > 0) {
      eventsUpserted = await upsertEvents(env.DB, result.events);
    }

    // 写入 snapshots 表
    let snapshotsUpserted = 0;
    if (result.snapshots && result.snapshots.length > 0) {
      try {
        snapshotsUpserted = await upsertSnapshots(env.DB, result.snapshots);
      } catch (snapErr) {
        console.warn(`[Runner] ${collector.name}: snapshot upsert failed (table may not exist yet): ${(snapErr as Error).message}`);
      }
    }

    const duration = Date.now() - startTime;

    // 记录成功日志
    await logProviderRun(env.DB, {
      provider: collector.name,
      run_type: 'daily_collection',
      started_at: new Date(startTime).toISOString(),
      finished_at: new Date().toISOString(),
      status: result.meta.warnings.length > 0 ? 'partial_success' : 'success',
      events_upserted: eventsUpserted,
      error: result.meta.warnings.length > 0 ? result.meta.warnings.join('; ') : undefined,
    });

    console.log(
      `[Runner] ${collector.name}: ${eventsUpserted} events, ` +
      `${result.snapshots?.length ?? 0} snapshots, ${duration}ms` +
      (result.meta.warnings.length ? ` (${result.meta.warnings.length} warnings)` : '')
    );

    return {
      name: collector.name,
      status: 'success',
      events_upserted: eventsUpserted,
      snapshots_upserted: snapshotsUpserted,
      duration_ms: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = (error as Error).message;

    console.error(`[Runner] ${collector.name}: FAILED after ${duration}ms — ${message}`);

    // 记录失败日志
    try {
      await logProviderRun(env.DB, {
        provider: collector.name,
        run_type: 'daily_collection',
        started_at: new Date(startTime).toISOString(),
        finished_at: new Date().toISOString(),
        status: 'failed',
        events_upserted: 0,
        error: message,
      });
    } catch (logError) {
      console.error(`[Runner] Failed to log error for ${collector.name}:`, logError);
    }

    return {
      name: collector.name,
      status: 'failed',
      events_upserted: 0,
      snapshots_upserted: 0,
      duration_ms: duration,
      error: message,
    };
  }
}

// ============================================
// 批量运行所有采集器
// ============================================

/**
 * 按顺序运行所有采集器，返回汇总结果
 */
export async function runAllCollectors(
  collectors: CollectorConfig[],
  env: CollectorEnv,
): Promise<{ results: RunResult[]; total_events: number; total_errors: number }> {
  const results: RunResult[] = [];

  for (const collector of collectors) {
    const result = await runCollector(collector, env);
    results.push(result);
  }

  const totalEvents = results.reduce((sum, r) => sum + r.events_upserted, 0);
  const totalErrors = results.filter(r => r.status === 'failed').length;

  console.log(
    `[Runner] All collectors done: ${results.length} ran, ` +
    `${totalEvents} events, ${totalErrors} failed`
  );

  return { results, total_events: totalEvents, total_errors: totalErrors };
}
