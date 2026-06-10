# Daily Risk - 明日风险榜 V1 技术方案

> 最后更新: 2026-06-08
> 状态: V1 终稿，待实现

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

页面由 Vue 3 SPA 渲染，数据从 Worker API 读取。采集任务按 Cron 自动更新，失败时保留最近一次成功数据。

### V1 范围

**做：**
- 定时采集事件日历（美国 FRED + 中国手工维护）
- 获取前值和发布后的实际值
- 规则评分和风险指数计算
- Web 页面展示（Vue 3 SPA）
- JSON API
- 中国核心宏观事件官方发布时间手工维护
- 财报日历（Alpha Vantage，8 个核心 symbol）

**不做：**
- AI 分析
- 市场预期 consensus
- 页面爬虫型采集
- 股指期货交割日（V1.5）
- 分红除权事件（V1.5）
- AKShare 离线脚本（V1.5）
- Tushare Pro（V1.5）

---

## 二、技术栈

| 组件 | 选型 | 理由 |
|------|------|------|
| 运行时 | Cloudflare Worker | 免费额度大，无需运维 |
| 定时 | Cloudflare Cron Trigger | Worker 原生 `scheduled()` handler |
| 存储 | Cloudflare D1 | SQLite，够用且部署简单 |
| 页面 | Vue 3 SPA (Cloudflare Pages) | 前后端分离，独立部署 |
| 语言 | TypeScript | 类型安全 |

工程约束：

- 所有采集任务必须幂等，重复运行不能产生重复事件。
- 所有外部数据必须落 `raw_json` 或 `raw_text`，便于复核。
- 页面和 API 只消费归一化后的 `events` 表，不直接访问外部 API。
- 所有用户可见文本必须 HTML escape。

---

## 三、开源项目参考

V1 参考多个项目的数据组织方式，但不直接依赖任何单一项目：

| 项目/生态 | 可借鉴点 | 对本项目的结论 |
|-----------|----------|----------------|
| OpenBB | `economy.calendar` 把经济日历抽象为统一接口，底层可切换 provider | 本项目也做 provider 层，页面只依赖统一 `NormalizedEvent` |
| FRED Python/R 客户端生态 | 通常把 release、series、source 分开建模 | 本项目必须存 `release_id`、`series_id` 和 `event_key` |
| Alpha Vantage SDK 项目 | 财报日历一般单独解析 CSV，并缓存结果 | 财报 collector 必须按 CSV 解析，按 symbol 缓存 |
| DBnomics | 聚合 90+ 官方数据源的免费 API | V1 中国宏观前值的主要数据源 |
| AKShare | 中国宏观数据覆盖面广（CPI/PMI/分红/期货等） | **V1 不用**（Python 库，Worker 无法直接调用）；V1.5 可用作离线脚本补充 |

这些参考说明：数据采集不应写成一个”大函数”，而应拆成 provider adapters + normalizer + scorer。

---

## 四、数据源设计

### 4.1 日历层：什么时候发布什么

| 类别 | 主数据源 | 备用/补充 | V1 处理方式 |
|------|----------|-----------|-------------|
| 美国宏观发布时间 | FRED `releases/dates` | 手工规则补时间 | 使用 `release_id` 白名单 |
| 中国宏观发布时间 | 国家统计局年度主要统计信息发布日程表 | 手工 JSON | 每年导入 `china-events.json` |
| 中国货币/社融 | 中国人民银行发布日程/公告 | 手工 JSON | V1 手工维护日期，后续补 API |
| 财报日历 | Alpha Vantage `EARNINGS_CALENDAR` | Nasdaq/FMP 未来可选 | V1 跟踪核心 symbol |
| ~~股指期货交割~~ | — | — | **V1.5**：CFFEX 规则 + 交易日历校验 |
| ~~股票分红除权~~ | — | — | **V1.5**：AKShare/Tushare 离线获取 |

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
      "value_source": "dbnomics:NBS",
      "official_source": "stats.gov.cn"
    },
    {
      "event_key": "CN_PMI",
      "title": "中国官方制造业PMI",
      "date": "2026-06-30",
      "time": "09:30",
      "country": "CN",
      "importance": 7,
      "value_source": "dbnomics:NBS",
      "official_source": "stats.gov.cn"
    }
  ]
}
```

补充说明：

- 国家统计局数据发布库通常在数据发布后约 3 个工作日更新全部进度指标数据，因此”实际值”不能只等数据发布库。
- **V1 中国数据值来源**：DBnomics（`api.db.nomics.world`），聚合了国家统计局数据，免费公开，Worker 可直接调用。更新延迟约 1-3 个工作日，V1 可接受。
- **V1.5 升级路径**：如果 DBnomics 延迟不可接受，引入 AKShare 离线脚本（本地/GitHub Actions），发布当天跑一次写入 D1 或 JSON，实现当日实际值更新。

**数据源职责边界**：

| 数据源 | 日历层（什么时候发） | 数据值层（前值/实际值） |
|--------|---------------------|----------------------|
| FRED | `releases/dates` API | `series/observations` API |
| BLS | ❌ 不提供日历 | CPI/PPI/NFP 历史值 |
| DBnomics | ❌ 不提供日历 | 中国宏观前值/实际值 |
| Alpha Vantage | `EARNINGS_CALENDAR` CSV | CSV 本身含财报日期 |
| china-events.json | 手工年度配置 | ❌ 不提供数值 |

DBnomics 的 `series` 接口返回的是**时间序列历史值**，不是"下次发布时间"。日历必须来自 `china-events.json`。

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
| 中国 CPI/PPI/PMI | DBnomics（免费，Worker 直接调用） | 手工维护 | V1.5 加 AKShare 离线脚本加速 |
| 社融/M2 | DBnomics + 手工补充 | 手工 JSON | 发布日不固定，V1 手工维护日期 |

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

### 4.4 时区处理

所有事件时间在 **collector 写入时**完成 UTC 转换，页面/API 层不做任何时区计算。

**责任分工**：

| 层 | 职责 |
|---|------|
| collector | 从数据源拿到日期 → 结合 `risk-rules.json` 的 `time` + `timezone` → 用 `Intl.DateTimeFormat` 转 UTC → 写入 `event_datetime_utc` |
| normalizer | 从 `risk-rules.json` 读取 `time`（如 "20:30"）写入 `event_time` 字段，纯粹展示用 |
| API/页面 | 只读 `event_datetime_utc`（排序/过滤）和 `event_time`（展示），不做转换 |

**Cloudflare Worker 环境**：
- 支持 `Intl.DateTimeFormat` 和 IANA timezone（如 `Asia/Shanghai`）
- 不需要额外库

**示例**：
```
risk-rules.json: { "time": "20:30", "timezone": "Asia/Shanghai" }
FRED 返回日期: "2026-06-11"

collector 计算:
  new Date("2026-06-11T20:30:00+08:00").toISOString()
  = "2026-06-11T12:30:00.000Z"

写入 events 表:
  event_time = "20:30"        ← 展示用
  event_datetime_utc = "2026-06-11T12:30:00Z"  ← 计算用
  timezone = "Asia/Shanghai"  ← 记录原始时区
```

### 4.5 数据管道可靠性机制

把 Cron 定时器跑成可靠数据管道，需要三个核心机制：

#### 机制一：幂等写入（Idempotent Writes）

**目标**：重复执行不产生重复数据。

```
┌─────────────────────────────────────────────────────────┐
│  防线 1：D1 UNIQUE 索引（数据库层）                        │
│  ─────────────────────────────────────────────────────── │
│  idx_events_unique ON (event_key, event_date, symbol, period)│
│                                                          │
│  → 同一 (key, date, symbol, period) 永远只有一条记录       │
│  → INSERT OR REPLACE 语义，重复 upsert 不会翻倍             │
│                                                          │
│  防线 2：Normalizer 统一 event_key 格式（应用层）            │
│  ─────────────────────────────────────────────────────── │
│  → event_key 必须统一格式（如全大写、下划线分隔）            │
│  → 避免"大小写不一致"导致看起来重复但 key 不同的脏数据        │
│  → 示例："US_CPI" 而非 "us_cpi" 或 "UsCpi"                │
└─────────────────────────────────────────────────────────┘
```

#### 机制二：合同校验（Contract Validation）

**目标**：坏数据在入库前被拒绝。

```
┌─────────────────────────────────────────────────────────┐
│  NormalizedEvent 接口 = 合同                               │
│  Normalizer = 校验器                                      │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  Required（缺失则拒绝，记录 error）                         │
│  • event_key: 非空字符串，格式统一                          │
│  • event_date: 必须匹配 /^\d{4}-\d{2}-\d{2}$/            │
│  • source: fred|bls|manual|alpha_vantage|dbnomics         │
│  • display_name: 非空字符串                                │
│  • importance: 1-10 整数                                   │
│                                                          │
│  Optional（缺失用默认值，记录 warning）                      │
│  • event_time: 无 → null                                   │
│  • market_impact: 无 → []                                  │
│  • previous_value: 无 → null                               │
│  • event_datetime_utc: 无 → 根据 date+time+timezone 计算   │
│                                                          │
│  格式约束                                                  │
│  • event_datetime_utc 必须是有效 ISO 8601                   │
│  • timezone 必须是有效 IANA 时区名                          │
│                                                          │
│  校验失败处理：                                             │
│  → 不写入 D1                                               │
│  → 记录到 provider_runs.error（含具体字段和原因）            │
│  → 继续处理其他事件，不因一条脏数据中断整个采集               │
└─────────────────────────────────────────────────────────┘
```

**Normalizer 伪代码**：

```typescript
function normalizeEvent(raw: any, rule: RiskRule): NormalizedEvent | null {
  // 1. 必填字段校验
  if (!raw.event_key || typeof raw.event_key !== 'string') {
    logError('missing event_key', raw);
    return null;
  }
  if (!raw.event_date || !/^\d{4}-\d{2}-\d{2}$/.test(raw.event_date)) {
    logError('invalid event_date', raw);
    return null;
  }
  if (!rule || typeof rule.score !== 'number' || rule.score < 1 || rule.score > 10) {
    logError('invalid rule score', { raw, rule });
    return null;
  }

  // 2. 统一 event_key 格式
  const eventKey = raw.event_key.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

  // 3. 填充 Optional 字段默认值
  return {
    event_key: eventKey,
    source: raw.source || 'unknown',
    title: raw.title || eventKey,
    display_name: rule.display_name || eventKey,
    event_date: raw.event_date,
    event_time: raw.event_time || null,
    timezone: raw.timezone || 'Asia/Shanghai',
    event_datetime_utc: raw.event_datetime_utc || 
      toUTC(raw.event_date, raw.event_time, raw.timezone),
    country: raw.country || rule.country,
    importance: rule.score,
    market_impact: rule.market_impact || [],
    // ... 其他字段
  };
}
```

#### 机制三：有界重放（Bounded Replay）

**目标**：最近窗口内的数据可以被重复拉取并覆盖修正；窗口外缺口需要独立监控与 backfill。

```
─────────────────────────────────────────────────────────┐
│                                                          │
│  今天                                                     │
│    │                                                     │
│    ├── 最近 7 天：可重放窗口                                │
│    │   • 每小时 updater 可以重新拉取                        │
│    │   • upsert 覆盖旧数据（修正 revision、延迟数据）        │
│    │   • 适用场景：FRED 修正、DBnomics 延迟更新             │
│    │                                                     │
│    ├── 7-30 天：只读窗口                                   │
│    │   • 不再主动拉取                                      │
│    │   • 只在发现数据缺失时触发 backfill                    │
│    │                                                     │
│    └── 30+ 天：归档                                       │
│        • 不拉取                                            │
│        • 可选择清理或保留（D1 5GB 够用多年）                 │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**每小时 updater 实现**：

```typescript
async function updateActualValues(env: Env) {
  const now = new Date();
  const replayWindowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 只处理窗口内 + 已发布超 2 小时的事件
  const events = await env.DB.prepare(`
    SELECT * FROM events
    WHERE status IN ('scheduled', 'released_pending_actual')
      AND event_datetime_utc <= datetime('now', '-2 hours')
      AND event_datetime_utc >= ?
    ORDER BY event_datetime_utc ASC
  `).bind(replayWindowStart.toISOString()).all();

  for (const event of events.results) {
    try {
      const newValue = await fetchLatestValue(event); // 按 value_source 调用对应 API
      
      if (newValue !== null && newValue !== event.previous_value) {
        // 有界重放：覆盖写入
        await upsertEvent(env.DB, {
          ...event,
          actual_value: newValue,
          actual_updated_at: now.toISOString(),
          status: 'actual_available',
        });
      } else {
        // 值未变化，只更新检查时间
        await env.DB.prepare(`
          UPDATE events SET last_checked_at = ? WHERE id = ?
        `).bind(now.toISOString(), event.id).run();
      }
    } catch (error) {
      // 记录失败，不覆盖旧数据
      await env.DB.prepare(`
        UPDATE events 
        SET last_fetch_error = ?, last_checked_at = ?
        WHERE id = ?
      `).bind(error.message, now.toISOString(), event.id).run();
    }
  }
}
```

#### 缺口监控与 Backfill

```typescript
// 每日检查：哪些事件缺少前值？
async function checkDataGaps(env: Env) {
  const gaps = await env.DB.prepare(`
    SELECT event_key, display_name, event_date, source
    FROM events
    WHERE previous_value IS NULL
      AND status = 'scheduled'
      AND event_datetime_utc < datetime('now')
  `).all();

  if (gaps.results.length > 0) {
    console.warn(`[Gap Monitor] ${gaps.results.length} events missing previous_value`);
    // 可选：自动触发 backfill 或发送告警
  }
}

// 手动触发：补拉指定日期范围的数据
async function backfill(env: Env, startDate: string, endDate: string) {
  const gaps = await env.DB.prepare(`
    SELECT * FROM events
    WHERE event_date BETWEEN ? AND ?
      AND (previous_value IS NULL OR source IS NULL)
  `).bind(startDate, endDate).all();

  // 按 source 分组，分别调用对应 collector 重新拉取
  // upsert 覆盖旧数据
}
```

#### 数据流全景

```
外部 API (FRED/BLS/AlphaVantage/DBnomics)
        │
        ▼
─────────────────┐
│   Collector     │  ← 拉取原始数据，保存 raw_json
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Normalizer    │  ← 合同校验：必填字段、格式、范围
│                 │  → 校验失败：丢弃 + 记录 error
│                 │  → 校验通过：输出 NormalizedEvent
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  D1 Upsert      │  ← 幂等写入：UNIQUE 索引兜底
│  (events 表)    │  → INSERT OR REPLACE
└────────────────┘
         │
         ▼
─────────────────┐
│  每小时 Updater │  ← 有界重放：7 天窗口内可覆盖修正
│  (Cron)         │  → 更新 actual_value
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  缺口监控        │  ← 每日检查缺失数据
│  (Gap Monitor)  │  → 触发 backfill 或告警
└─────────────────┘
```

---

## 五、V1.5 扩展事件（V1 不做）

以下事件已调研确认可行，但不在 V1 实现范围内。V1 验证核心流程跑通后再加入。

### 5.1 股指期货交割日

- 中金所 IF/IH/IC/IM 合约最后交易日 = 交割日，通常为到期月份第三个周五，遇节假日顺延。
- 不需要外部 API，按规则生成未来 12 个月候选日，用交易日历校验。
- 需要引入 AKShare（交易日历）或手工维护交易日历。

建议事件和分数：

| event_key | 名称 | 分数 | 影响 |
|-----------|------|------|------|
| CFFEX_IF_EXPIRY | 沪深300股指期货交割 | 6 | 沪深300/上证/期指基差 |
| CFFEX_IH_EXPIRY | 上证50股指期货交割 | 5 | 上证50/权重股 |
| CFFEX_IC_EXPIRY | 中证500股指期货交割 | 5 | 中证500/中小盘 |
| CFFEX_IM_EXPIRY | 中证1000股指期货交割 | 5 | 中证1000/小盘 |

商品期货交割日品种多、规则复杂，放 V2。

### 5.2 分红除权事件

- 红利指数没有统一的”指数分红日”，真正发生分红的是成分股。
- 建议只做”指数前 N 大成分股除息聚合事件”，单只股票不显示。
- 数据来源：AKShare `stock_fhps_em`（东方财富分红配送）或 Tushare `dividend`（需 token）。
- 需要 Python 离线脚本环境（Worker 不能跑 Python）。

### 5.3 AKShare 离线脚本

AKShare 有本项目需要的中国宏观数据值接口（`macro_china_cpi`、`macro_china_pmi`、`macro_china_m2` 等），但：
- 没有经济日历接口（不知道”下次什么时候发布”）
- 是 Python 库，Worker 无法直接调用

V1.5 方案：本地或 GitHub Actions 定时运行 AKShare 脚本，输出 JSON，Worker 读取写入 D1。可作为 DBnomics 的补充加速通道。

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
      "value_source": "dbnomics",
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
    "CFFEX_IF_EXPIRY (V1.5)": {
      "display_name": "沪深300股指期货交割",
      "score": 6,
      "country": "CN",
      "time": "15:00",
      "timezone": "Asia/Shanghai",
      "market_impact": ["沪深300", "期指基差"],
      "calendar_source": "cffex_rule",
      "display_format": "text",
      "_comment": "V1 不实现，V1.5 加入"
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

### 实现注意事项

- **除零保护**：计算时先判断 `events.length === 0`，直接返回 0，不套用公式。
- **1-4 分事件折叠**：默认不显示，前端提供"展开全部"按钮可查看。

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
```

注意：不需要 `manual_events` 表。中国年度事件配置在 `china-events.json`（放 repo），manual collector 读取后直接 upsert 到 `events` 表（`source='manual'`）。`events` 表已能通过 `source` 字段区分数据来源，无需独立表。

### 索引

```sql
CREATE INDEX idx_events_date_importance ON events(event_date, importance DESC);
CREATE INDEX idx_events_status_time ON events(status, event_datetime_utc);
CREATE INDEX idx_events_key_date ON events(event_key, event_date);
CREATE UNIQUE INDEX idx_events_unique
  ON events(event_key, event_date, IFNULL(symbol, ''), IFNULL(period, ''));
```

注意：D1/SQLite 的 `updated_at DEFAULT` 不会在 UPDATE 时自动变化，代码层每次 upsert 必须设置 `updated_at = datetime('now')`。

### 数据流

```
china-events.json (年度配置, 放 repo)
     │
     ▼
manual.ts collector ──→ upsert → events 表 (source='manual')

FRED API ──→ fred.ts collector ─→ upsert → events 表 (source='fred')

Alpha Vantage CSV ──→ alpha-vantage.ts ──→ upsert → events 表 (source='alpha_vantage')

DBnomics API ──→ dbnomics.ts ──→ 更新已有 events 的 previous_value/actual_value

页面/API ──→ 只读 events 表，不直接访问任何外部 API
```

所有数据最终汇聚到 `events` 一张表，页面只消费这一张表。

```
Cloudflare Pages (前端)
├─ Vue 3 SPA
├─ Service Worker (缓存 API)
└─ 静态资源 CDN

Cloudflare Worker (后端 API)
├─ GET /api/events?date=YYYY-MM-DD
├─ GET /api/events?range=today_tomorrow
├─ POST /admin/collect           -> 手动触发，需要 ADMIN_TOKEN
│
└─ scheduled(controller, env, ctx)
   ├─ controller.cron == "0 22 * * *" -> 生成/更新未来 30 天事件
   └─ controller.cron == "0 * * * *"  -> 更新已发布事件实际值

D1
├─ events
─ provider_runs
└─ earnings_watchlist
```

Provider 分层：

```
collectors/
├─ fred.ts             # FRED release calendar + observations
├─ alpha-vantage.ts    # earnings CSV
├─ manual.ts           # 读取 china-events.json → upsert 到 events 表 (source='manual')
├─ dbnomics.ts         # 中国宏观前值
└─ normalizer.ts       # provider output -> NormalizedEvent
```

V1.5 再新增：
- `cffex.ts` — 股指期货交割日规则生成
- `dividends.ts` — 分红除权日聚合

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
| FRED API | 美国日历、宏观前值 | 免费，合理使用 | 需要 key，5 分钟申请 |
| BLS API v2 | 美国劳工/CPI/PPI 前值 | 注册 500 queries/day，50 series/query | 注意：不是 500,000/day |
| Alpha Vantage | 财报日历 | 25 requests/day | CSV 输出，必须缓存 raw CSV |
| DBnomics | 中国宏观前值 | 免费公开 | 更新延迟 1-3 工作日 |

---


## 十一、前端页面设计

### 11.1 技术栈

| 组件 | 选型 | 理由 |
|------|------|------|
| 前端框架 | Vue 3 + Vite | 轻量，响应式，生态成熟 |
| UI 组件库（移动端） | Vant 4 | Vue 3 移动端王者，日期选择器开箱即用，按需加载 |
| UI 样式（PC 端） | 纯 CSS / Tailwind | 表格结构简单，不需要重型 UI 库 |
| 渲染模式 | SPA（单页应用） | 配合 SW 缓存后体验不差，开发简单 |
| 托管 | Cloudflare Pages | 全球 CDN，git push 自动构建部署 |
| 后端 API | Cloudflare Worker | 跑采集逻辑 + 读写 D1 |
| 缓存 | Service Worker | API 缓存 + 离线兜底 |
| 部署 | 前后端分离 | Pages 托管前端，Worker 跑后端，同一个域名 |

### 11.2 页面布局

移动端优先，PC 端适配。同一套 Vue 应用，通过 CSS 响应式切换布局。

#### 日期导航（横向滚条）

手指左右滑动切换日期，默认选中"明天"（下一个自然日），可回看过去也可预览未来。

#### 风险指数

进度条颜色跟随数值：≥8 红色，≥6 橙色，<6 绿色。

#### 事件列表（移动端：卡片）

每个事件卡片布局：
- 第一行：事件名（左）+ 分数（右，颜色标识）
- 第二行：时间（小字）
- 第三行：影响市场（小字）
- 分隔线
- 前值 | 实际值（两列，空值显示 \`--\`）

分数颜色：9-10 红色，7-8 橙色，5-6 黄色，1-4 灰色。
按分数从高到低排序。
影响市场数据来自 \`risk-rules.json\`，手工维护。

#### 事件列表（PC 端：宽表格）

PC 端使用宽表格，列：时间 | 事件 | 影响市场 | 分数 | 前值 | 实际。
最大宽度 960px，居中。响应式断点 768px。

### 11.3 Service Worker 缓存策略

| 资源 | 策略 | 说明 |
|------|------|------|
| \`/api/events?*\` | Stale-while-revalidate, 5 分钟 | API 缓存，用户秒开，后台刷新 |
| Vue 静态资源（hash 文件名） | Cache-first, 永久 | 文件名含 hash，安全永久缓存 |
| \`index.html\` | Network-first, fallback to cache | 始终尝试拿最新版本 |
| \`/admin/collect\` | 不缓存 | 手动触发接口 |

### 11.4 部署架构

\`\`\`
用户浏览器
     │
     ├── risk.yourdomain.com
     │    ↓ Cloudflare Pages（静态前端）
     │    Vue 3 SPA + Service Worker
     │
     └── api.risk.yourdomain.com
          ↓ Cloudflare Worker（后端 API）
          D1 Database
\`\`\`

- 前端：git push → Cloudflare Pages 自动构建部署
- 后端：\`wrangler deploy\` 到 Worker
- 同一仓库，分离部署

---

## 十二、JSON API

单日查询 \`GET /api/events?date=YYYY-MM-DD\`，返回 date, timezone, risk_index, events[], updated_at。

今日 + 明日 \`GET /api/events?range=today_tomorrow\`，返回 timezone, days[]（含 date, risk_index, events）。

API 响应头 \`Cache-Control: no-store\`（由 Service Worker 层处理缓存）。

### API 查询注意事项

- **必须加 date 过滤**：`SELECT * FROM events WHERE event_date = ? ORDER BY importance DESC`。禁止无过滤条件的全表扫描。
- **数据清理策略**：V1 不主动清理历史数据。估算：每天 ~10 事件 × 365 天 × 1KB ≈ 3.6MB/年，D1 免费 5GB 可用 1000+ 年。如需清理，可定期删除 `event_date < now - 365d` 的旧记录。

### 前后端通信

- **开发环境**：Vite `proxy` 配置将 `/api` 请求代理到 Worker 本地端口（`localhost:8787`）
- **生产环境**：前端 `baseURL` 指向 `api.risk.yourdomain.com`，通过环境变量配置
- **CORS**：Worker 需在响应头加 `Access-Control-Allow-Origin` 允许前端域名

---

## 十三、项目结构

Monorepo 结构，前后端代码在同一仓库，部署分离。

\`\`\`
daily-risk/
├── frontend/                  ← Vue 3 前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── RiskTable.vue  # PC 端宽表格（纯 CSS）
│   │   │   ├── RiskCard.vue   # 移动端卡片（Vant Cell/Card）
│   │   │   ├── DateNav.vue    # 日期导航滚条（CSS scroll-snap）
│   │   │   └── DatePicker.vue # 日期选择器（Vant DatePicker）
│   │   ├── pages/
│   │   │   └── Index.vue      # 首页
│   │   ├── services/
│   │   │   └── api.ts         # API 调用封装
│   │   ├── App.vue
│   │   └── main.ts
│   ├── public/
│   │   └── sw.js              # Service Worker
│   ├── index.html
│   ├── vite.config.ts
│   ── package.json
│
├── worker/                    ← Cloudflare Worker 后端
│   ├── src/
│   │   ├── collectors/
│   │   │   ├── fred.ts            # FRED releases/dates + observations
│   │   │   ├── alpha-vantage.ts   # 财报日历 CSV 解析
│   │   │   ├── manual.ts          # 读取 china-events.json → events 表
│   │   │   ├── dbnomics.ts        # DBnomics 中国宏观前值（只取值，不取日历）
│   │   │   └── normalizer.ts      # provider output → NormalizedEvent
│   │   ├── db.ts
│   │   ├── scoring.ts
│   │   ├── scheduler.ts
│   │   ├── time.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── data/
│   │   ├── risk-rules.json
│   │   ├── china-events.json
│   │   └── earnings-watchlist.json
│   ├── migrations/
│   │   └── 0001_init.sql
│   ├── package.json
│   ├── tsconfig.json
│   └── wrangler.toml
│
├── shared/                    ← 前后端共享类型
│   └── types.ts
│
├── package.json               ← 根脚本
├── README.md
└── .gitignore
\`\`\`

V1.5 新增：
- \`worker/src/collectors/cffex.ts\` — 股指期货交割日
- \`worker/src/collectors/dividends.ts\` — 分红除权日
- \`scripts/refresh-akshare-values.py\` — AKShare 离线脚本
- \`worker/data/index-watchlist.json\` — 指数成分股权重配置

---

## 十三、开发计划

### Phase 1: 基础设施（2 天）

- Monorepo 初始化（frontend/ + worker/ + shared/）
- `wrangler init` + TypeScript Worker
- `vite create` + Vue 3 前端
- D1 migration
- 环境变量和 secrets
- 类型定义（shared/types.ts）
- 本地 dev 和测试脚本

### Phase 2: 核心事件采集（3 天）

- FRED calendar collector（releases/dates + observations）
- FRED observations collector（前值/实际值，`units=pc1`）
- Alpha Vantage CSV collector（财报日历）
- Manual China events loader（china-events.json）
- DBnomics collector（中国宏观前值）
- D1 upsert 和 provider run 日志
- Normalizer（统一 NormalizedEvent 格式）

### Phase 3: API + 风险榜逻辑（2 天）

- `risk-rules.json` 加载和校验
- 事件归一化
- 评分和风险指数
- JSON API 接口（单日 + today_tomorrow）
- `/admin/collect` 手动触发接口

### Phase 4: 前端页面（2 天）

- Vue 3 组件开发（DateNav + RiskCard + RiskTable）
- 日期导航（横向滚条）
- 响应式布局（移动端卡片 / PC 表格）
- Service Worker 缓存
- Cloudflare Pages 部署配置

### Phase 5: 联调 + 验证（2 天）

- Cron 调度联调
- 错误处理 + 重试
- 单元测试：风险指数、日期转换、格式化、upsert
- Mock provider 测试
- 手动触发全流程
- 部署到 Cloudflare（Pages + Worker）

总计：约 11 个工作日。

---

## 十四、测试计划

### 14.1 基础功能测试

必须覆盖：

- 北京时间日期和 UTC 转换。
- Alpha Vantage CSV 解析。
- FRED `units=pc1` 格式化。
- 空事件风险指数为 0。
- 重复采集不会重复插入（幂等性）。
- HTML escape（所有用户可见文本）。
- `range=today_tomorrow` 返回两个 day bucket。
- DBnomics 返回空或超时时不覆盖已有前值。

### 14.2 数据管道可靠性测试

#### 合同校验测试（Normalizer）

```typescript
describe('normalizer contract validation', () => {
  // 测试 1: 必填字段缺失 → 拒绝
  it('should reject events with missing required fields', () => {
    const raw = { event_date: '2026-06-11' }; // 缺少 event_key
    const result = normalizeEvent(raw, rule);
    expect(result).toBeNull();
  });

  // 测试 2: event_date 格式错误 → 拒绝
  it('should reject invalid date formats', () => {
    const raw = { event_key: 'US_CPI', event_date: '06/11/2026' };
    const result = normalizeEvent(raw, rule);
    expect(result).toBeNull();
  });

  // 测试 3: importance 超出范围 → 拒绝
  it('should reject importance outside 1-10 range', () => {
    const ruleWithBadScore = { ...rule, score: 15 };
    const result = normalizeEvent(raw, ruleWithBadScore);
    expect(result).toBeNull();
  });

  // 测试 4: event_key 格式统一 → 全大写+下划线
  it('should normalize event_key format', () => {
    const raw = { event_key: 'us-cpi', event_date: '2026-06-11' };
    const result = normalizeEvent(raw, rule);
    expect(result.event_key).toBe('US_CPI');
  });

  // 测试 5: Optional 字段缺失 → 用默认值填充
  it('should fill defaults for optional fields', () => {
    const raw = { event_key: 'US_CPI', event_date: '2026-06-11' };
    const result = normalizeEvent(raw, rule);
    expect(result.market_impact).toEqual([]);
    expect(result.previous_value).toBeNull();
  });
});
```

#### 幂等写入测试

```typescript
describe('idempotent writes', () => {
  // 测试 6: 重复 upsert 不产生重复记录
  it('should not create duplicates on repeated upsert', async () => {
    const event = createTestEvent('US_CPI', '2026-06-11');
    await upsertEvent(db, event);
    await upsertEvent(db, event); // 再次 upsert

    const count = await db.query(
      'SELECT COUNT(*) as c FROM events WHERE event_key = ? AND event_date = ?',
      ['US_CPI', '2026-06-11']
    );
    expect(count.c).toBe(1);
  });

  // 测试 7: event_key 大小写统一后幂等
  it('should be idempotent after event_key normalization', async () => {
    await upsertEvent(db, { ...event, event_key: 'us_cpi' });
    await upsertEvent(db, { ...event, event_key: 'US_CPI' });

    const count = await db.query(
      'SELECT COUNT(*) as c FROM events WHERE event_date = ?',
      ['2026-06-11']
    );
    expect(count.c).toBe(1);
  });
});
```

#### 有界重放测试

```typescript
describe('bounded replay', () => {
  // 测试 8: 7 天窗口内的事件可被重新拉取
  it('should replay events within 7-day window', async () => {
    const recentEvent = createEventWithDate(daysAgo(3)); // 3 天前
    await upsertEvent(db, recentEvent);

    const events = await getReplayWindowEvents(db, 7);
    expect(events).toContain(recentEvent);
  });

  // 测试 9: 7 天窗口外的事件不被重放
  it('should not replay events outside 7-day window', async () => {
    const oldEvent = createEventWithDate(daysAgo(10)); // 10 天前
    await upsertEvent(db, oldEvent);

    const events = await getReplayWindowEvents(db, 7);
    expect(events).not.toContain(oldEvent);
  });

  // 测试 10: 重放时 actual_value 可被覆盖修正
  it('should allow actual_value to be overwritten during replay', async () => {
    const event = { ...createTestEvent(), actual_value: '2.8%', status: 'actual_available' };
    await upsertEvent(db, event);

    // 模拟 FRED revision：新值 2.9%
    await updateActualValue(db, event.id, '2.9%');

    const updated = await getEventById(db, event.id);
    expect(updated.actual_value).toBe('2.9%');
  });
});
```

#### 缺口监控测试

```typescript
describe('gap monitoring', () => {
  // 测试 11: 检测缺少前值的事件
  it('should detect events missing previous_value', async () => {
    const eventWithoutPrevious = { ...createTestEvent(), previous_value: null };
    await upsertEvent(db, eventWithoutPrevious);

    const gaps = await checkDataGaps(db);
    expect(gaps).toContain(eventWithoutPrevious);
  });

  // 测试 12: 已发布但无前值的事件应被标记
  it('should flag published events without previous_value', async () => {
    const publishedEvent = {
      ...createTestEvent(),
      previous_value: null,
      event_datetime_utc: hoursAgo(3), // 已发布超 2 小时
    };
    await upsertEvent(db, publishedEvent);

    const gaps = await checkDataGaps(db);
    expect(gaps).toContain(publishedEvent);
  });
});
```

### 14.3 集成测试

```typescript
describe('collection pipeline integration', () => {
  // 测试 13: 完整流程 mock API → normalizer → D1 写入
  it('should collect → normalize → upsert without errors', async () => {
    mockFredAPI(releasesResponse);
    await runCollection(env);

    const events = await env.DB.prepare(
      'SELECT * FROM events WHERE source = ?'
    ).bind('fred').all();

    expect(events.results.length).toBeGreaterThan(0);
    expect(events.results[0].event_datetime_utc).toBeDefined();
    expect(events.results[0].importance).toBeGreaterThan(0);
  });

  // 测试 14: API 异常时记录 error，不中断其他 collector
  it('should handle API errors gracefully', async () => {
    mockFredAPIError(500);
    await runCollection(env);

    const run = await env.DB.prepare(
      'SELECT * FROM provider_runs WHERE provider = ? ORDER BY started_at DESC LIMIT 1'
    ).bind('fred').first();

    expect(run.status).toBe('error');
    expect(run.error).toBeDefined();
  });
});
```

---

## 十五、路线图

### V1.5（V1 上线后 2-4 周）

- 股指期货交割日（CFFEX IF/IH/IC/IM，规则生成 + 交易日历校验）
- 重点成分股分红除权聚合事件
- AKShare 离线脚本（加速中国实际值更新）
- 发布后 actual vs previous 快讯

### V2（V1.5 稳定后）

- 市场预期 consensus（FMP/Finnworlds 付费 API）
- AI 风险解释（Gemini Flash / DeepSeek）
- 历史风险榜归档
- 事件影响复盘（事后标注市场实际走势）
- 商品期货交割日全量支持
- ETF/基金分红日

---

## 十六、成本估算

| 项目 | V1 成本 |
|------|--------|
| Cloudflare Pages | 免费（无限带宽） |
| Cloudflare Worker | 免费（100k req/天） |
| Cloudflare D1 | 免费（5GB） |
| FRED API | 免费 |
| BLS API v2 | 免费注册 |
| Alpha Vantage | 免费（25 req/天，覆盖 8 个 symbol） |
| DBnomics | 免费 |
| **总计** | **$0/月** |

V1.5 如需 AKShare 离线脚本或 Tushare Pro，可能产生少量费用（Python CI 环境 / 积分）。

---

## 十七、风险与限制

| 风险 | 影响 | 缓解 |
|------|------|------|
| FRED release date 不等于实际数据可用时间 | 实际值更新延迟 | 每小时 updater + 状态机 |
| DBnomics 中国数据延迟 1-3 工作日 | 实际值慢 | V1 可接受；V1.5 加 AKShare 离线脚本加速 |
| Alpha Vantage 25 req/天限制 | 只能覆盖 8 个 symbol | 精选核心 symbol + 缓存 raw CSV |
| FOMC 前值不准确 | 页面误导 | V1 手工维护目标区间，不用 FEDFUNDS 冒充 |
| 中国事件发布时间变动 | 时间不准 | 每年从国家统计局日程更新一次 |
| Cloudflare 每小时 Cron 额度 | 24 次/天调用 | 免费计划足够；如超则改为每 2 小时 |

---

## 十八、待决策

1. **页面访问权限**：
   - 公开访问（简单）vs 简单认证（加 query param token）
   - 建议：V1 公开，管理接口 `/admin/collect` 用 `ADMIN_TOKEN`

2. **自定义域名**：
   - 是：更专业，如 `risk.yourdomain.com`
   - 否：直接用 `*.workers.dev`
   - 建议：V1 先用 workers.dev，验证后再绑域名

3. **中国事件维护方式**：
   - 放 D1（可远程更新）vs 放 repo JSON（简单）
   - 建议：V1 用 JSON，事件少且稳定

---

## 十九、参考资料

### V1 数据源

- FRED `releases/dates`: https://fred.stlouisfed.org/docs/api/fred/releases_dates.html
- FRED `series/observations`: https://fred.stlouisfed.org/docs/api/fred/series_observations.html
- BLS Public Data API: https://www.bls.gov/developers/api_faqs.htm
- Alpha Vantage Earnings Calendar: https://www.alphavantage.co/documentation/
- DBnomics API: https://docs.db.nomics.world/
- 国家统计局主要统计信息发布日程表: https://www.stats.gov.cn/

### V1 基础设施

- Cloudflare Workers: https://developers.cloudflare.com/workers/
- Cloudflare D1: https://developers.cloudflare.com/d1/
- Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/

### V1.5 参考（暂不使用）

- AKShare: https://github.com/akfamily/akshare
- Tushare dividend: https://tushare.pro/document/2?doc_id=103
- 中国金融期货交易所: https://www.cffex.com.cn/
- OpenBB economy calendar: https://docs.openbb.co/odp/python/reference/economy/calendar
