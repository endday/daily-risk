## database-schema

### 需求

- [ ] 创建 D1 数据库实例
- [ ] 编写迁移脚本 0001_init.sql
- [ ] 创建 events 表（含所有字段和索引）
- [ ] 创建 provider_runs 表
- [ ] 创建 earnings_watchlist 表
- [ ] 配置 wrangler.toml 的 D1 绑定

### events 表字段

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY | 自增 ID |
| event_key | TEXT NOT NULL | 事件唯一标识 |
| source | TEXT NOT NULL | 数据来源 (fred/bls/manual/alpha_vantage) |
| title | TEXT NOT NULL | 原始标题 |
| display_name | TEXT NOT NULL | 显示名称 |
| event_date | TEXT NOT NULL | 日期 YYYY-MM-DD |
| event_time | TEXT | 时间 HH:MM |
| timezone | TEXT DEFAULT 'Asia/Shanghai' | 时区 |
| event_datetime_utc | TEXT | UTC 时间戳 |
| country | TEXT NOT NULL | US/CN |
| importance | INTEGER NOT NULL | 1-10 分数 |
| market_impact | TEXT | 影响市场 JSON 数组 |
| release_id | INTEGER | FRED release ID |
| series_id | TEXT | FRED series ID |
| symbol | TEXT | 股票代码 |
| period | TEXT | 数据周期 |
| display_format | TEXT | 显示格式 |
| previous_value | TEXT | 前值 |
| actual_value | TEXT | 实际值 |
| actual_updated_at | TEXT | 实际值更新时间 |
| status | TEXT DEFAULT 'scheduled' | 状态 |
| last_checked_at | TEXT | 最后检查时间 |
| last_fetch_error | TEXT | 最后错误信息 |
| raw_json | TEXT | 原始 JSON |
| raw_text | TEXT | 原始文本 |
| created_at | TEXT DEFAULT (datetime('now')) | 创建时间 |
| updated_at | TEXT DEFAULT (datetime('now')) | 更新时间 |

### 索引

- `idx_events_date_importance` ON events(event_date, importance DESC)
- `idx_events_status_time` ON events(status, event_datetime_utc)
- `idx_events_key_date` ON events(event_key, event_date)
- `idx_events_unique` UNIQUE ON events(event_key, event_date, IFNULL(symbol,''), IFNULL(period,''))

### 验收标准

- `wrangler d1 execute` 可执行迁移脚本
- 所有表和索引创建成功
- 可插入和查询测试数据
