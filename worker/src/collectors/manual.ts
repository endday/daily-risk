/**
 * Manual Events Loader - 手工维护的事件
 *
 * 读取 china-events.json 等静态配置文件，
 * 将手工维护的事件写入 events 表。
 */

import type { NormalizedEvent, RiskRule, ChinaEventsConfig } from '../../../shared/types';
import { normalizeEvent, type NormalizerLogger } from '../../../shared/normalizer';

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
