import riskRulesData from '../data/risk-rules.json';
import chinaEventsData from '../data/china-events.json';

export interface Env {
  DB: D1Database;
  ADMIN_TOKEN?: string;
  SW_SYNC_TOKEN?: string;
  FRED_API_KEY?: string;
  BLS_API_KEY?: string;
  ALPHA_VANTAGE_KEY?: string;
}

export const EARNINGS_SYMBOLS = ['NVDA', 'AAPL', 'MSFT', 'META', 'GOOGL', 'AMZN', 'TSLA', 'TSM'];

// 从 JSON 文件加载风险规则（唯一数据源）
export const RISK_RULES: Record<string, any> = (riskRulesData as any).rules;

// 从 JSON 文件加载中国宏观事件日历（按年份自动选择）
export const CHINA_EVENTS: any = chinaEventsData;
