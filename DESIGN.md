# Daily Risk - 明日风险榜 V1 技术方案

> 最后更新: 2026-06-08
> 状态: 已修订待实现

---

## 一、项目目标

提供一个简洁的 Web 页面，展示按北京时间定义的“明日风险事件”。默认页面展示下一个自然日；API 支持查询指定日期，也支持查询今日 + 明日。

```
┌─────────────────────────────────────────────────┐
│  明日风险榜  2026-06-09                          │
│                                                  │
│  风险指数: 8.5 / 10  ████████░░                  │
│                                                  │
│  10  美国CPI          前值: 2.8%                  │
│      20:30  影响: 纳指/黄金/美元/美债             │
│                                                  │
│  10  FOMC利率决议     前值: --                    │
│      02:00  影响: 全市场                          │
│                                                  │
│   8  NVDA财报         盘后发布                    │
│      影响: 纳指/半导体                            │
│                                                  │
│   7  中国PMI          前值: 50.2                  │
│      09:30  影响: 上证/恒指/商品                  │
│                                                  │
│  共 4 个风险事件                                  │
└─────────────────────────────────────────────────┘
```

页面由 Cloudflare Worker 直接渲染，数据从 D1 读取。采集任务按 Cron 自动更新，失败时保留最近一次成功数据。

### V1 范围

- 定时采集事件日历
- 获取前值和发布后的实际值
- 规则评分和风险指数计算
- Web 页面展示
- JSON API
- 中国核心宏观事件官方发布时间维护
- 股指期货交割日、重点红利/宽基成分分红除权日作为扩展事件
- 不做 AI 分析
- 不做市场预期 consensus
- 不做页面爬虫型采集；可使用公开 API、开源数据接口库、官方静态公告/日程表

---

## 二、技术栈

| 组件 | 选型 | 理由 |
|------|------|------|
| 运行时 | Cloudflare Worker | 免费额度大，无需运维 |
| 定时 | Cloudflare Cron Trigger | Worker 原生 `scheduled()` handler |
| 存储 | Cloudflare D1 | SQLite，够用且部署简单 |
| 页面 | Worker SSR HTML | 一个 Worker 同时处理页面和 API |
| 语言 | TypeScript | 类型安全 |

工程约束：

- 所有采集任务必须幂等，重复运行不能产生重复事件。
- 所有外部数据必须落 `raw_json` 或 `raw_text`，便于复核。
- 页面和 API 只消费归一化后的 `events` 表，不直接访问外部 API。
- 所有用户可见文本必须 HTML escape。

---

## 三、开源项目参考

V1 不直接照搬单一项目，而是参考多个项目的数据组织方式：

| 项目/生态 | 可借鉴点 | 对本项目的结论 |
|-----------|----------|----------------|
| OpenBB | `economy.calendar` 把经济日历抽象为统一接口，底层可切换 FMP/FRED/Nasdaq/TradingEconomics 等 provider | 本项目也做 provider 层，页面只依赖统一 `NormalizedEvent` |
| AKShare | 中国市场和宏观数据覆盖面广，包含中国 CPI/PMI、股票分红配送、期货规则/交易日历等接口 | 中国数据不要只依赖 DBnomics；优先官方日程，AKShare 可作为补充数据源或离线维护工具 |
| Tushare Pro | 分红送股接口有 `ex_date` 等结构化字段，适合做 A 股除权除息事件 | 如果需要稳定分红日，Tushare 是比抓网页更合适的方案，但需要 token/积分 |
| FRED Python/R 客户端生态 | 通常把 release、series、source 分开建模，而不是只用标题字符串匹配 | 本项目必须存 `release_id`、`series_id` 和 `event_key` |
| Alpha Vantage MCP/SDK 项目 | 财报日历一般单独解析 CSV，并缓存结果以节省免费额度 | 财报 collector 必须按 CSV 解析，按 symbol 缓存 |

这些参考说明：数据采集不应写成一个“大函数”，而应拆成 provider adapters + normalizer + scorer。

---

## 四、数据源设计

### 4.1 日历层：什么时候发布什么

| 类别 | 主数据源 | 备用/补充 | V1 处理方式 |
|------|----------|-----------|-------------|
| 美国宏观发布时间 | FRED `releases/dates` | 手工规则补时间 | 使用 `release_id` 白名单 |
| 中国宏观发布时间 | 国家统计局年度主要统计信息发布日程表 | 手工 JSON | 每年导入 `china-events.json` |
| 中国货币/社融 | 中国人民银行发布日程/公告 | 手工 JSON | V1 手工维护日期，后续补 API |
| 财报日历 | Alpha Vantage `EARNINGS_CALENDAR` | Nasdaq/FMP 未来可选 | V1 跟踪核心 symbol |
| 股指期货交割 | CFFEX 合约规则 + 交易日历 | AKShare/手工规则 | 按规则生成，遇节假日顺延/提前需校验 |
| 股票分红除权 | Tushare `dividend` 或 AKShare 东方财富分红配送 | 交易所公告 | V1 只跟踪指数成分重点权重股 |

#### FRED releases/dates

```
GET https://api.stlouisfed.org/fred/releases/dates
    ?api_key={KEY}
    &file_type=json
    &include_release_dates_with_no_data=true
    &realtime_start={today}
    &realtime_end={today+30d}
```

注意：

- FRED 官方说明 release date 不一定等于数据在 FRED/ALFRED 可用时间。
- FRED 只有日期，没有具体北京时间；具体时间放在 `risk-rules.json`。
- 必须使用 `release_id` 白名单，不能只按 `release_name` 模糊匹配。

建议 V1 白名单：

| 事件 | FRED release_name | 处理 |
|------|-------------------|------|
| CPI | Consumer Price Index | 日历来自 FRED，前值优先 BLS/FRED |
| PPI | Producer Price Index | 日历来自 FRED，前值优先 BLS/FRED |
| 非农 | Employment Situation | 日历来自 FRED，前值优先 BLS |
| GDP | Gross Domestic Product | 日历来自 FRED，前值 FRED |
| FOMC | FOMC Press Release | 日期可来自 FRED，前值不要用 FEDFUNDS 冒充目标利率 |

#### 中国宏观事件

中国事件分两层：

1. 发布时间：以国家统计局年度《主要统计信息发布日程表》为主。国家统计局会列出 CPI/PPI、PMI、GDP、规模以上工业、投资、消费等发布时间。
2. 前值/实际值：优先用官方发布后的数据；V1 可用 AKShare/DBnomics 做二级来源，且必须保存来源字段。

`china-events.json` 示例：

```json
{
  "year": 2026,
  "source": "NBS release schedule",
  "timezone": "Asia/Shanghai",
  "events": [
    {
      "event_key": "CN_CPI",
      "title": "中国CPI",
      "date": "2026-06-10",
      "time": "09:30",
      "country": "CN",
      "importance": 8,
      "value_source": "akshare:macro_china_cpi",
      "official_source": "stats.gov.cn"
    },
    {
      "event_key": "CN_PMI",
      "title": "中国官方制造业PMI",
      "date": "2026-06-30",
      "time": "09:30",
      "country": "CN",
      "importance": 7,
      "value_source": "akshare:macro_china_pmi",
      "official_source": "stats.gov.cn"
    }
  ]
}
```

补充说明：

- 国家统计局数据发布库通常在数据发布后约 3 个工作日更新全部进度指标数据，因此“实际值”不能只等数据发布库。
- AKShare 是 Python 库，不适合在 Worker 内直接运行。V1 有两种选择：
  - 手动/CI 运行 AKShare 脚本生成 `data/china-values.json`，Worker 只读取静态 JSON。
  - 仅 Worker 采集 DBnomics，接受延迟。
- 如果需要“当天发布后尽快更新实际值”，建议后续增加一个 GitHub Actions/本地脚本跑 AKShare，把结果写入 D1 或 JSON。

#### Alpha Vantage 财报日历

```
GET https://www.alphavantage.co/query
    ?function=EARNINGS_CALENDAR
    &symbol=NVDA
    &horizon=3month
    &apikey={KEY}
```

注意：

- `horizon` 是 `3month` / `6month` / `12month`，不是 `3_month`。
- 返回是 CSV，不是 JSON。
- CSV 字段包括 `symbol,name,reportDate,fiscalDateEnding,estimate,currency`。
- 免费额度紧，V1 每天只对 watchlist 跑一次，并缓存 raw CSV。

V1 watchlist：

```
NVDA, AAPL, MSFT, META, GOOGL, AMZN, TSLA, TSM
```

### 4.2 前值/实际值层

| 指标 | 主来源 | 备用 | 备注 |
|------|--------|------|------|
| 美国 CPI YoY | BLS CPI series 或 FRED `units=pc1` | FRED level 自算 | 不要 `limit=2` 自算 YoY |
| 美国 PPI YoY | BLS/PPI 或 FRED `units=pc1` | FRED level 自算 | 同上 |
| 非农 | BLS CES/PAYEMS | FRED PAYEMS | 显示新增就业变化值更有意义 |
| 失业率 | BLS/CPS 或 FRED UNRATE | FRED | 可直接显示百分比 |
| GDP | FRED GDP 或 BEA | FRED | 可显示 annualized QoQ 或 level，需固定格式 |
| FOMC 利率 | 手工维护目标区间 | 付费/官方文本解析 V2 | 不使用 FEDFUNDS 当作决议前值 |
| 中国 CPI/PPI/PMI | 官方发布 + AKShare 离线导入 | DBnomics | 标注来源和更新时间 |
| 社融/M2 | 中国人民银行公告 + AKShare 离线导入 | 手工 JSON | 发布日不固定，V1 手工维护 |

FRED YoY 推荐请求：

```
GET https://api.stlouisfed.org/fred/series/observations
    ?api_key={KEY}
    &series_id=CPIAUCSL
    &units=pc1
    &sort_order=desc
    &limit=2
    &file_type=json
```

这样拿到的是同比百分比变化，不需要本地拿 13 个月数据自算。

### 4.3 发布后实际值更新

实际值更新不能只每天 22:00 跑一次。V1 改为每小时跑：

1. 找出 `status IN ('scheduled', 'released_pending_actual')` 的事件。
2. 过滤 `event_datetime_utc <= now - 2h`。
3. 按 `value_source` 拉最新值。
4. 如果值仍未更新，记录 `last_fetch_error` 或 `last_checked_at`，不覆盖前值。
5. 成功后写 `actual_value`、`actual_updated_at`、`status='actual_available'`。

---

## 五、衍生事件：期货交割日与分红日

### 5.1 期货交割日

有。股指期货这类数据可以纳入风险事件，但来源和处理方式不同于宏观日历。

中国股指期货：

- 中金所股指期货合约通常最后交易日为合约到期月份第三个周五，交割日同最后交易日；若遇国家法定假日，按交易所规则调整。
- 可覆盖 IF、IH、IC、IM 四类股指期货。
- V1 不需要每天外部拉取，可用规则生成未来 12 个月候选日，再用交易日历校验。

建议事件：

| event_key | 名称 | 分数 | 影响 |
|-----------|------|------|------|
| CFFEX_IF_EXPIRY | 沪深300股指期货交割 | 6 | 沪深300/上证/期指基差 |
| CFFEX_IH_EXPIRY | 上证50股指期货交割 | 5 | 上证50/权重股 |
| CFFEX_IC_EXPIRY | 中证500股指期货交割 | 5 | 中证500/中小盘 |
| CFFEX_IM_EXPIRY | 中证1000股指期货交割 | 5 | 中证1000/小盘 |

商品期货交割日：

- 有数据，但品种多、规则复杂，V1 不建议全量纳入。
- 如果后续要做商品风险榜，可按交易所和品种拆独立模块。

### 5.2 红利指数和股票分红日

有，但要区分“指数本身”和“成分股”：

- 价格指数会在成分股除息日受到自然回落影响。
- 全收益指数/净收益指数会按指数规则处理分红再投资，不会像价格指数一样简单回落。
- 红利指数没有一个统一的“指数分红日”；真正发生现金分红的是成分股或 ETF/基金。

V1 可做的是“重点成分股除权除息事件”：

| 数据 | 可用来源 | 处理 |
|------|----------|------|
| A 股上市公司分红除权除息日 | Tushare `dividend`、AKShare 东方财富分红配送 | 只跟踪核心指数/红利指数前 N 大权重股 |
| ETF/基金分红日 | 基金公告、AKShare 基金分红接口 | V2 再做，V1 不纳入 |
| 中证/上证指数全收益处理 | 指数编制规则 | 用于解释，不作为事件采集 |

建议 V1 只增加低权重提示：

- 如果某天沪深300/中证红利/红利低波等指数的前 20 大成分中有多只除息，生成一个聚合事件。
- 单只股票分红除息默认不显示，避免噪音。

---

## 六、规则引擎

`risk-rules.json` 不只存标题，还要存 provider 绑定和格式化策略。

```json
{
  "rules": {
    "US_CPI": {
      "display_name": "美国CPI",
      "score": 10,
      "country": "US",
      "time": "20:30",
      "timezone": "Asia/Shanghai",
      "market_impact": ["NASDAQ", "GOLD", "USD", "US10Y"],
      "calendar_source": "fred",
      "fred_release_id": 46,
      "value_source": "fred",
      "fred_series": "CPIAUCSL",
      "fred_units": "pc1",
      "display_format": "percent"
    },
    "US_FOMC_RATE": {
      "display_name": "FOMC利率决议",
      "score": 10,
      "country": "US",
      "time": "02:00",
      "timezone": "Asia/Shanghai",
      "market_impact": ["NASDAQ", "GOLD", "USD", "US10Y", "全市场"],
      "calendar_source": "fred",
      "value_source": "manual",
      "display_format": "rate_range"
    },
    "CN_CPI": {
      "display_name": "中国CPI",
      "score": 8,
      "country": "CN",
      "time": "09:30",
      "timezone": "Asia/Shanghai",
      "market_impact": ["上证", "恒指", "CNY"],
      "calendar_source": "manual_nbs_schedule",
      "value_source": "akshare_offline",
      "display_format": "percent"
    },
    "NVDA_EARNINGS": {
      "display_name": "NVDA财报",
      "score": 8,
      "country": "US",
      "time": "after_market",
      "timezone": "America/New_York",
      "market_impact": ["NASDAQ", "半导体", "TSM"],
      "calendar_source": "alpha_vantage",
      "symbol": "NVDA",
      "display_format": "eps"
    },
    "CFFEX_IF_EXPIRY": {
      "display_name": "沪深300股指期货交割",
      "score": 6,
      "country": "CN",
      "time": "15:00",
      "timezone": "Asia/Shanghai",
      "market_impact": ["沪深300", "期指基差"],
      "calendar_source": "cffex_rule",
      "display_format": "text"
    }
  }
}
```

### 评分体系

| 分数 | 颜色 | 默认显示 |
|------|------|----------|
| 9-10 | 红色 | 显示 |
| 7-8 | 橙色 | 显示 |
| 5-6 | 黄色 | 显示 |
| 1-4 | 灰色 | 默认折叠 |

风险指数：

```
risk_index = sum(score * score for visible events) / sum(score for visible events)
```

如果当日无事件，`risk_index = 0`。

---

## 七、数据库设计

### D1 Schema

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  display_name TEXT NOT NULL,

  event_date TEXT NOT NULL,
  event_time TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  event_datetime_utc TEXT,

  country TEXT NOT NULL,
  importance INTEGER NOT NULL,
  market_impact TEXT,

  release_id INTEGER,
  series_id TEXT,
  symbol TEXT,
  period TEXT,
  display_format TEXT,

  previous_value TEXT,
  actual_value TEXT,
  actual_updated_at TEXT,

  status TEXT NOT NULL DEFAULT 'scheduled',
  last_checked_at TEXT,
  last_fetch_error TEXT,

  raw_json TEXT,
  raw_text TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE provider_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  run_type TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  events_upserted INTEGER DEFAULT 0,
  error TEXT
);

CREATE TABLE earnings_watchlist (
  symbol TEXT PRIMARY KEY,
  company TEXT,
  importance INTEGER DEFAULT 5,
  active INTEGER DEFAULT 1
);

CREATE TABLE manual_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  event_time TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  country TEXT NOT NULL,
  importance INTEGER NOT NULL,
  market_impact TEXT,
  value_source TEXT,
  active INTEGER DEFAULT 1,
  UNIQUE(event_key, event_date)
);
```

### 索引

```sql
CREATE INDEX idx_events_date_importance ON events(event_date, importance DESC);
CREATE INDEX idx_events_status_time ON events(status, event_datetime_utc);
CREATE INDEX idx_events_key_date ON events(event_key, event_date);
CREATE UNIQUE INDEX idx_events_unique
  ON events(event_key, event_date, IFNULL(symbol, ''), IFNULL(period, ''));
```

注意：D1/SQLite 的 `updated_at DEFAULT` 不会在 UPDATE 时自动变化，代码层每次 upsert 必须设置 `updated_at = datetime('now')`。

---

## 八、系统架构

```
Cloudflare Worker
├─ fetch()
│  ├─ GET /                         -> HTML 页面
│  ├─ GET /api/events?date=YYYY-MM-DD
│  ├─ GET /api/events?range=today_tomorrow
│  └─ POST /admin/collect           -> 手动触发，需要 ADMIN_TOKEN
│
└─ scheduled(controller, env, ctx)
   ├─ controller.cron == "0 22 * * *" -> 生成/更新未来 30 天事件
   └─ controller.cron == "0 * * * *"  -> 更新已发布事件实际值

D1
├─ events
├─ provider_runs
├─ manual_events
└─ earnings_watchlist
```

Provider 分层：

```
collectors/
├─ fred.ts             # FRED release calendar + observations
├─ alpha-vantage.ts    # earnings CSV
├─ manual.ts           # china-events / manual-events
├─ cffex.ts            # 股指期货交割日规则生成
├─ dividends.ts        # 分红除权日聚合，V1 可先留接口
└─ normalizer.ts       # provider output -> NormalizedEvent
```

---

## 九、Cron 调度

Cloudflare Cron 使用 UTC 表达式，注释统一写北京时间 UTC+8。

```toml
[triggers]
crons = [
  "0 22 * * *",    # 北京时间 06:00，每日采集未来 30 天日历
  "0 * * * *"      # 每小时检查已发布事件实际值
]
```

生产 Cron 由 Worker `scheduled()` handler 处理。`/__scheduled` 只用于 Wrangler/Cloudflare 测试，不作为正式业务路由。

### 容错策略

| 场景 | 处理 |
|------|------|
| 单 provider 失败 | 记录 `provider_runs.error`，不影响其他 provider |
| 前值缺失 | 显示 `--`，事件仍显示 |
| 实际值未更新 | 写 `last_checked_at`，状态保持 `released_pending_actual` |
| D1 写入失败 | 重试 3 次；仍失败则记录运行失败 |
| D1 查询失败 | 页面返回错误页，API 返回 500 JSON |
| 外部 API 返回空 | 不删除旧数据，记录 warning |

---

## 十、API Key 和额度

| 服务 | 用途 | 免费额度/限制 | 备注 |
|------|------|---------------|------|
| FRED API | 美国日历、宏观前值 | 免费，合理使用 | 需要 key |
| BLS API v2 | 美国劳工/CPI/PPI | 注册用户 500 queries/day，50 series/query | 不是 500,000/day |
| Alpha Vantage | 财报日历 | 免费额度较低，常见为 25 requests/day | CSV 输出，必须缓存 |
| DBnomics | 中国/全球宏观补充 | 免费公开 | 可能有更新延迟 |
| Tushare Pro | A 股分红除息日 | 需要 token/积分 | V1 可选 |
| AKShare | 中国宏观/分红/期货辅助 | 免费 Python 库 | 不在 Worker 内直接运行 |

---

## 十一、页面和 API

### HTML 页面

包含：

- 标题 + 日期
- 风险指数进度条
- 事件列表
- 前值/实际值
- 时间和影响市场
- 数据更新时间
- 数据来源提示

### API

单日：

```http
GET /api/events?date=2026-06-09
```

```json
{
  "date": "2026-06-09",
  "timezone": "Asia/Shanghai",
  "risk_index": 8.5,
  "events": [
    {
      "event_key": "US_CPI",
      "score": 10,
      "display_name": "美国CPI",
      "previous_value": "2.8%",
      "actual_value": null,
      "event_time": "20:30",
      "timezone": "Asia/Shanghai",
      "country": "US",
      "market_impact": ["NASDAQ", "GOLD", "USD", "US10Y"],
      "status": "scheduled",
      "source": "fred"
    }
  ],
  "updated_at": "2026-06-08T22:00:00Z"
}
```

今日 + 明日：

```http
GET /api/events?range=today_tomorrow
```

```json
{
  "timezone": "Asia/Shanghai",
  "days": [
    { "date": "2026-06-08", "risk_index": 3.0, "events": [] },
    { "date": "2026-06-09", "risk_index": 8.5, "events": [] }
  ]
}
```

### 缓存

- HTML：`Cache-Control: public, max-age=300`
- API：`Cache-Control: no-store`
- 采集任务成功后不需要主动刷新页面缓存，5 分钟内自然过期即可。

---

## 十二、项目结构

```
daily-risk/
├── src/
│   ├── index.ts
│   ├── collectors/
│   │   ├── fred.ts
│   │   ├── alpha-vantage.ts
│   │   ├── manual.ts
│   │   ├── cffex.ts
│   │   ├── dividends.ts
│   │   └── normalizer.ts
│   ├── db.ts
│   ├── page.ts
│   ├── scoring.ts
│   ├── scheduler.ts
│   ├── time.ts
│   └── types.ts
├── data/
│   ├── risk-rules.json
│   ├── china-events.json
│   ├── earnings-watchlist.json
│   └── index-watchlist.json
├── scripts/
│   ├── import-china-events.ts
│   └── refresh-akshare-values.py
├── migrations/
│   └── 0001_init.sql
├── wrangler.toml
├── package.json
├── tsconfig.json
└── README.md
```

---

## 十三、开发计划

### Phase 1: 基础设施（2 天）

- `wrangler init` + TypeScript Worker
- D1 migration
- 环境变量和 secrets
- 类型定义
- 本地 dev 和测试脚本

### Phase 2: 核心事件采集（3 天）

- FRED calendar collector
- FRED observations collector
- Alpha Vantage CSV collector
- Manual China events loader
- CFFEX 股指期货交割日规则生成
- D1 upsert 和 provider run 日志

### Phase 3: 风险榜逻辑（2 天）

- `risk-rules.json` 加载和校验
- 事件归一化
- 评分和风险指数
- 单日 API 和 today_tomorrow API

### Phase 4: 页面和联调（2 天）

- HTML 页面渲染
- 移动端样式
- 错误页
- Cron 分流
- 手动触发接口

### Phase 5: 验证（1 天）

- 单元测试：风险指数、日期转换、格式化、upsert
- Mock provider 测试
- 手动触发全流程
- 部署到 Cloudflare

总计：约 10 个工作日。

---

## 十四、测试计划

必须覆盖：

- 北京时间日期和 UTC 转换。
- Alpha Vantage CSV 解析。
- FRED `units=pc1` 格式化。
- 空事件风险指数为 0。
- 重复采集不会重复插入。
- HTML escape。
- `range=today_tomorrow` 返回两个 day bucket。
- CFFEX 第三个周五规则和节假日修正。

---

## 十五、V2 路线图

- 市场预期 consensus。
- AI 风险解释。
- 发布后 actual vs previous 快讯。
- 历史风险榜归档。
- 事件影响复盘。
- 商品期货交割日全量支持。
- ETF/基金分红日。
- GitHub Actions 跑 AKShare 并写入 D1。

---

## 十六、成本估算

| 项目 | V1 成本 |
|------|--------|
| Cloudflare Worker | 免费额度可覆盖 V1 |
| Cloudflare D1 | 免费 5GB 足够 |
| FRED API | 免费 |
| BLS API | 免费注册 |
| Alpha Vantage | 免费额度可覆盖 8 个 symbol 的低频采集 |
| DBnomics | 免费 |
| AKShare | 免费，但需要离线脚本环境 |
| Tushare Pro | 可选，可能需要积分/维护 token |

V1 可做到 $0/月；如果要稳定分红日和更完整财报/预期数据，后续可能需要付费数据源。

---

## 十七、风险与限制

| 风险 | 影响 | 缓解 |
|------|------|------|
| FRED release date 不等于实际可用时间 | 实际值更新延迟 | 每小时 updater + 状态机 |
| 中国数据官方库延迟 | 实际值慢 | AKShare 离线脚本或手工补值 |
| Alpha Vantage CSV/额度限制 | 财报采集失败 | CSV parser + 缓存 + watchlist |
| FOMC 前值不准确 | 页面误导 | V1 不显示或手工维护目标区间 |
| 股指期货节假日调整 | 交割日错误 | 用交易日历校验 |
| 分红事件噪音大 | 页面可读性下降 | 只聚合指数前 N 大权重股 |
| Worker 不能跑 Python | AKShare 无法直接用 | CI/本地脚本生成 JSON |

---

## 十八、待决策

1. 中国实际值更新方式：
   - 推荐 V1：`china-events.json` 管发布时间，实际值先手工/DBnomics，后续加 AKShare 离线脚本。

2. 分红日是否进 V1：
   - 推荐：只做“指数前 N 大成分股除息聚合事件”，不显示单股明细。

3. Tushare 是否使用：
   - 如果你已有 token，分红日优先 Tushare。
   - 如果没有，先用 AKShare/东方财富分红配送作为辅助。

4. 股指期货覆盖范围：
   - 推荐 V1 覆盖 CFFEX 的 IF/IH/IC/IM。
   - 商品期货交割日放 V2。

5. 页面访问权限：
   - 推荐 V1 公开页面，管理接口用 `ADMIN_TOKEN`。

---

## 十九、参考资料

- FRED `releases/dates`: https://fred.stlouisfed.org/docs/api/fred/releases_dates.html
- FRED `series/observations`: https://fred.stlouisfed.org/docs/api/fred/series_observations.html
- Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Alpha Vantage Earnings Calendar: https://www.alphavantage.co/documentation/
- BLS Public Data API FAQ: https://www.bls.gov/developers/api_faqs.htm
- 国家统计局主要统计信息发布日程表: https://www.stats.gov.cn/
- AKShare: https://github.com/akfamily/akshare
- OpenBB economy calendar: https://docs.openbb.co/odp/python/reference/economy/calendar
- Tushare dividend: https://tushare.pro/document/2?doc_id=103
- 中国金融期货交易所: https://www.cffex.com.cn/
