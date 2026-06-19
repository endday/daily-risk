/**
 * Manual Events Loader - 手工维护的事件
 *
 * 读取 china-events.json 等静态配置文件，
 * 将手工维护的事件写入 events 表。
 */

import type { NormalizedEvent, RiskRule, ChinaEventsConfig } from '../../../shared/types';
import { normalizeEvent, type NormalizerLogger } from '../../../shared/normalizer';
import type { CollectorConfig, CollectorEnv, CollectorResult } from './base';

export interface ManualEventsConfig {
  chinaEvents: ChinaEventsConfig;
  rules: Record<string, RiskRule>;
  logger?: NormalizerLogger;
}

/**
 * 加载手工维护的中国宏观事件
 */
export async function loadManualEvents(config: ManualEventsConfig): Promise<NormalizedEvent[]> {
  const { chinaEvents, rules, logger } = config;
  const events: NormalizedEvent[] = [];

  for (const rawEvent of chinaEvents.events) {
    // 查找匹配的规则
    const rule = rules[rawEvent.event_key];

    const normalized = normalizeEvent(
      {
        ...rawEvent,
        source: 'manual',
      },
      rule,
      logger
    );

    if (normalized) {
      events.push(normalized);
    }
  }

  return events;
}

// ============================================
// Collector 接口包装
// ============================================

export const manualCollector: CollectorConfig = {
  name: 'manual',
  async collect(env: CollectorEnv): Promise<CollectorResult> {
    const events = await loadManualEvents({
      chinaEvents: env.CHINA_EVENTS,
      rules: env.RISK_RULES,
    });
    return { events, meta: { source_count: 1, warnings: [] } };
  },
};
