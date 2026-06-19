/**
 * Runner 测试 — 验证统一调度、重试、错误隔离
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry, runCollector, runAllCollectors } from '../collectors/runner';
import type { CollectorConfig, CollectorEnv, CollectorResult } from '../collectors/base';

// Mock db 模块
vi.mock('../db', () => ({
  upsertEvents: vi.fn().mockImplementation((_: unknown, events: unknown[]) => Promise.resolve(events.length)),
  logProviderRun: vi.fn().mockResolvedValue(undefined),
}));

// 构造最小 CollectorEnv
function makeEnv(): CollectorEnv {
  return {
    DB: {} as D1Database,
    RISK_RULES: {},
    CHINA_EVENTS: { year: 2026, source: 'test', timezone: 'Asia/Shanghai', events: [] },
    EARNINGS_SYMBOLS: [],
  };
}

// 构造成功采集器
function makeSuccessCollector(name = 'test', eventCount = 2): CollectorConfig {
  return {
    name,
    async collect(): Promise<CollectorResult> {
      return {
        events: Array.from({ length: eventCount }, (_, i) => ({
          event_key: `TEST_${i}`,
          source: 'test',
          title: 'Test',
          display_name: 'Test',
          event_date: '2026-06-16',
          timezone: 'Asia/Shanghai',
          country: 'CN',
          importance: 5,
        })),
        meta: { source_count: 1, warnings: [] },
      };
    },
  };
}

// 构造失败采集器
function makeFailCollector(name = 'failing'): CollectorConfig {
  return {
    name,
    async collect(): Promise<CollectorResult> {
      throw new Error('Network timeout');
    },
  };
}

// 构造条件不满足的采集器
function makeSkippedCollector(name = 'skipped'): CollectorConfig {
  return {
    name,
    canRun: () => false,
    async collect(): Promise<CollectorResult> {
      throw new Error('Should not be called');
    },
  };
}

describe('withRetry', () => {
  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 2, backoffMs: 10 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 2, backoffMs: 10 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after all retries exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('permanent fail'));
    await expect(withRetry(fn, { maxRetries: 2, backoffMs: 10 }))
      .rejects.toThrow('permanent fail');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});

describe('runCollector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should run a successful collector and upsert events', async () => {
    const result = await runCollector(makeSuccessCollector(), makeEnv());

    expect(result.status).toBe('success');
    expect(result.events_upserted).toBe(2);
    expect(result.name).toBe('test');
  });

  it('should skip collector when canRun returns false', async () => {
    const result = await runCollector(makeSkippedCollector(), makeEnv());

    expect(result.status).toBe('skipped');
    expect(result.events_upserted).toBe(0);
  });

  it('should catch errors and return failed status', async () => {
    const result = await runCollector(makeFailCollector(), makeEnv());

    expect(result.status).toBe('failed');
    expect(result.error).toBe('Network timeout');
    expect(result.events_upserted).toBe(0);
  }, 10000);
});

describe('runAllCollectors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should run all collectors and aggregate results', async () => {
    const collectors = [
      makeSuccessCollector('a', 3),
      makeSuccessCollector('b', 2),
      makeFailCollector('c'),
    ];

    const { results, total_events, total_errors } = await runAllCollectors(collectors, makeEnv());

    expect(results).toHaveLength(3);
    expect(total_events).toBe(5);
    expect(total_errors).toBe(1);
  }, 10000);

  it('should not stop on failure — all collectors run', async () => {
    const collectors = [
      makeFailCollector('first'),
      makeSuccessCollector('second'),
      makeFailCollector('third'),
    ];

    const { results, total_events, total_errors } = await runAllCollectors(collectors, makeEnv());

    expect(results).toHaveLength(3);
    expect(total_events).toBe(2); // only 'second' succeeded
    expect(total_errors).toBe(2);
  }, 20000);

  it('should handle skipped collectors', async () => {
    const collectors = [
      makeSkippedCollector(),
      makeSuccessCollector('active'),
    ];

    const { results, total_events, total_errors } = await runAllCollectors(collectors, makeEnv());

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('skipped');
    expect(results[1].status).toBe('success');
    expect(total_events).toBe(2);
    expect(total_errors).toBe(0);
  });
});
