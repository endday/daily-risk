## shared-types

### 需求

- [ ] 创建 shared/types.ts
- [ ] 定义 NormalizedEvent 接口（collector 输出）
- [ ] 定义 RiskEvent 接口（API 响应）
- [ ] 定义 RiskRule 接口（risk-rules.json）
- [ ] 定义 ProviderRun 接口（采集日志）

### 核心类型

```typescript
// Collector 输出的归一化事件
interface NormalizedEvent {
  event_key: string;
  source: string;
  title: string;
  display_name: string;
  event_date: string;      // YYYY-MM-DD
  event_time?: string;     // HH:MM
  timezone: string;        // IANA timezone
  event_datetime_utc?: string;
  country: string;
  importance: number;      // 1-10
  market_impact?: string[];
  release_id?: number;
  series_id?: string;
  symbol?: string;
  period?: string;
  display_format?: string;
  previous_value?: string;
  actual_value?: string;
  raw_json?: string;
  raw_text?: string;
}

// API 响应的事件格式
interface RiskEvent {
  event_key: string;
  score: number;
  display_name: string;
  previous_value: string | null;
  actual_value: string | null;
  event_time: string | null;
  timezone: string;
  country: string;
  market_impact: string[];
  status: string;
  source: string;
}

// 规则配置
interface RiskRule {
  display_name: string;
  score: number;
  country: string;
  time?: string;
  timezone: string;
  market_impact: string[];
  calendar_source: string;
  value_source: string;
  fred_release_id?: number;
  fred_series?: string;
  fred_units?: string;
  symbol?: string;
  display_format: string;
}

// 采集运行日志
interface ProviderRun {
  provider: string;
  run_type: string;
  started_at: string;
  finished_at?: string;
  status: string;
  events_upserted: number;
  error?: string;
}
```

### 验收标准

- 前后端都能 import 这些类型
- TypeScript 编译通过
- 类型定义覆盖 DESIGN.md 中所有数据结构
