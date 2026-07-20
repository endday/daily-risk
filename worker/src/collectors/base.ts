/**
 * Collector Base — 统一采集器接口
 *
 * 所有采集器必须实现 CollectorConfig 接口。
 * scheduler 通过 runner.ts 统一调度，不再逐个硬编码调用。
 */

import type { NormalizedEvent, RiskRule, ChinaEventsConfig } from '../../shared/types';

// ============================================
// 运行环境（由 scheduler 注入）
// ============================================

export interface CollectorEnv {
  DB: D1Database;
  FRED_API_KEY?: string;
  ALPHA_VANTAGE_KEY?: string;
  RISK_RULES: Record<string, RiskRule>;
  CHINA_EVENTS: ChinaEventsConfig;
  EARNINGS_SYMBOLS: string[];
}

// ============================================
// 采集器结果
// ============================================

export interface CollectorResult {
  /** 事件数据，写入 events 表 */
  events: NormalizedEvent[];
  /** 市场快照数据，写入 market_snapshots 表（可选） */
  snapshots?: MarketSnapshotRow[];
  instrumentDailyRows?: InstrumentDailyRow[];
  /** 运行元数据 */
  meta: {
    /** 调用了多少个外部数据源 */
    source_count: number;
    /** 非致命问题（如某个 series 拉取失败但不影响整体） */
    warnings: string[];
  };
}

// ============================================
// 采集器接口
// ============================================

export interface CollectorConfig {
  /** 采集器唯一名称，用于日志和 provider_runs 表 */
  name: string;
  /**
   * 是否满足运行条件（如 API Key 是否配置）。
   * 返回 false 时 scheduler 跳过该采集器。
   * 默认返回 true。
   */
  canRun?(env: CollectorEnv): boolean;
  /** 执行采集 */
  collect(env: CollectorEnv): Promise<CollectorResult>;
}

// ============================================
// 市场快照表行类型
// ============================================

export interface MarketSnapshotRow {
  trade_date: string;
  index_code: string;
  close_price: number | null;
  change_pct: number | null;
  rise_count: number | null;
  fall_count: number | null;
  flat_count: number | null;
  turnover_amount: number | null;
  turnover_rate: number | null;
  volatility_20d: number | null;
  northbound_amt: number | null;
  northbound_num: number | null;
  pe_ttm: number | null;
  pb: number | null;
  margin_balance: number | null;
  bond_yield_10y: number | null;
  // 全球宏观指标
  us_2y_yield: number | null;
  fed_funds_rate: number | null;
  usd_index: number | null;
  oil_wti: number | null;
  us_yield_spread: number | null;
  total_market_cap: number | null;
}

export interface InstrumentDailyRow {
  trade_date: string;
  instrument_code: string;
  instrument_name: string;
  instrument_type: string;
  provider: string;
  open_price: number | null;
  high_price: number | null;
  low_price: number | null;
  close_price: number | null;
  pre_close_price: number | null;
  change_pct: number | null;
  change_amount: number | null;
  amplitude: number | null;
  volume: number | null;
  amount: number | null;
  turnover_rate: number | null;
  pe_ttm: number | null;
  pb: number | null;
  total_market_cap: number | null;
  float_market_cap: number | null;
  is_st: number | null;
  source_updated_at: string | null;
}

export interface IndustryFundFlowRow {
  trade_date: string;
  board_code: string;
  board_name: string;
  provider: string;
  close_price: number | null;
  change_pct: number | null;
  main_net_inflow: number | null;
  small_net_inflow: number | null;
  medium_net_inflow: number | null;
  large_net_inflow: number | null;
  super_large_net_inflow: number | null;
  main_net_inflow_ratio: number | null;
  small_net_inflow_ratio: number | null;
  medium_net_inflow_ratio: number | null;
  large_net_inflow_ratio: number | null;
  super_large_net_inflow_ratio: number | null;
  source_updated_at: string | null;
}

// ============================================
// 辅助：快速构建空结果
// ============================================

export function emptyResult(warnings: string[] = []): CollectorResult {
  return {
    events: [],
    meta: { source_count: 0, warnings },
  };
}
