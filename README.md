# Daily Risk - 明日风险榜

基于历史统计的 A 股日历效应分析工具。每日自动采集全球宏观经济事件，结合近 20 年上证/沪深 300/中证 500 历史涨跌数据，生成每日风险评分和操作信号。

在线地址：https://daily-risk.endday.top

## 核心功能

### 事件风险榜
- 自动采集 FRED（美国 CPI/PPI/非农等）、东方财富（中国 CPI/PPI）、DBnomics（中国 PMI/M2）、Alpha Vantage（财报日历）数据
- 每日 22:00 定时采集，每小时更新公布值
- 风险指数 0-10 分，按事件重要性加权计算

### 日历效应分析
- 基于近 20 年历史数据，统计每月/每日的上涨概率和平均涨跌幅
- Z-Score 归一化评分（0-10 分），5 级热力图可视化
- 三大指数独立分析：上证（000001）、沪深 300（000300）、中证 500（000905）

### 特殊窗口效应
- 春节效应：节前/节后 5 日上涨概率
- 两会效应：会前/会中/会后分段统计
- 月末效应：窗口期 vs 非窗口期溢价
- 财报季效应：4 月/8 月/10 月统计

### 操作信号
- 短线信号：基于明日评分生成今日操作建议（强买/买入/持有/谨慎/卖出）
- 波段信号：基于下月评分生成本月操作建议
- 黄历卡片：综合短线 + 波段维度，给出加仓/持有/减仓建议

## 技术架构

```
┌─────────────────────────────────────────────┐
│  Cloudflare Pages (Vue 3 + Vite)            │
│  - Service Worker 离线缓存                    │
│  - Vant 4 移动端组件                          │
└──────────────┬──────────────────────────────┘
               │ HTTP API
┌──────────────▼──────────────────────────────┐
│  Cloudflare Worker (TypeScript)             │
│  - /api/events?date=YYYY-MM-DD             │
│  - /admin/collect (手动触发采集)              │
│  - Cron: 每日 22:00 采集 + 每小时更新公布值    │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Cloudflare D1 (SQLite)                     │
│  - events: 宏观经济事件                       │
│  - 近 20 年历史数据（预计算 calendar-effects） │
└─────────────────────────────────────────────┘
```

## 项目结构

```
daily-risk/
├── frontend/              # Vue 3 前端
│   ├── src/
│   │   ├── components/    # CalendarStatsView, MonthlyCalendarGrid, AlmanacCard...
│   │   ├── pages/         # Index.vue (单页应用)
│   │   ├── services/      # API 客户端
│   │   └── styles/        # CSS 变量
│   └── public/sw.js       # Service Worker
│
├── worker/                # Cloudflare Worker 后端
│   ├── src/
│   │   ├── collectors/    # FRED, EastMoney, DBnomics 数据采集器
│   │   ├── calendar.ts    # 日历效应计算（Z-Score, 操作信号）
│   │   ├── scheduler.ts   # 定时采集调度
│   │   └── db.ts          # D1 数据库操作
│   ├── data/
│   │   ├── risk-rules.json      # 风险规则配置（事件→评分映射）
│   │   ├── china-events.json    # 中国宏观事件日历
│   │   └── calendar-effects.json # 近 20 年历史统计数据
│   └── seed.sql           # 数据库初始数据
│
├── shared/                # 前后端共享
│   ├── types.ts           # TypeScript 类型定义
│   └── date-utils.ts      # 日期工具函数
│
└── package.json           # 根脚本（dev, build, deploy）
```

## 开发

```bash
# 安装依赖
npm install

# 启动开发环境（前端 + 后端同时启动）
npm run dev

# 单独启动
npm run dev:frontend   # http://localhost:5173
npm run dev:worker     # http://localhost:8787

# 运行测试
npm run test
```

## 部署

```bash
# 部署 Worker 后端（需要配置 D1 数据库和 API Keys）
npm run deploy:worker

# 前端通过 git push 自动部署到 Cloudflare Pages
```

### 环境变量

| 变量 | 用途 | 必需 |
|------|------|------|
| `FRED_API_KEY` | FRED 经济数据 API | 是 |
| `ALPHA_VANTAGE_KEY` | Alpha Vantage 财报日历 | 是 |
| `ADMIN_TOKEN` | 手动触发采集的认证 Token | 是 |

## 数据源

| 数据源 | 用途 | 成本 |
|--------|------|------|
| FRED API | 美国宏观日历 + 前值（CPI/PPI/非农等） | 免费 |
| 东方财富 | 中国 CPI/PPI 前值 | 免费 |
| DBnomics | 中国 PMI/M2 前值 | 免费 |
| Alpha Vantage | 美股财报日历 | 免费（25 req/天）|

## 风险评分算法

1. **基础分**：每个事件在 `risk-rules.json` 中配置基础分（0-10）
2. **日历效应**：基于近 20 年历史，计算当日/当月的上涨概率 Z-Score
3. **综合评分**：`rating = 5 + Z * 2.5`，映射到 0-10 分
4. **操作信号**：根据评分阈值生成强买/买入/持有/谨慎/卖出建议

## License

MIT
