# Daily Risk - 明日风险榜

每日自动采集全球宏观经济事件，计算风险指数，提供简洁的 Web 页面展示。

## 技术栈

- **前端**: Vue 3 + Vite (Cloudflare Pages)
- **后端**: Cloudflare Worker (TypeScript)
- **数据库**: Cloudflare D1 (SQLite)
- **数据源**: FRED, BLS, Alpha Vantage, DBnomics

## 项目结构

```
daily-risk/
├── frontend/          # Vue 3 前端
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── main.ts
│   ├── public/
│   │   ── sw.js      # Service Worker
│   ── package.json
│
├── worker/            # Cloudflare Worker 后端
│   ├── src/
│   │   ├── collectors/
│   │   └── index.ts
│   ├── migrations/
│   ── package.json
│
├── shared/            # 前后端共享类型
│   └── types.ts
│
└── package.json       # 根脚本
```

## 开发

```bash
# 安装依赖
npm install

# 启动开发环境（前端 + 后端）
npm run dev

# 单独启动
npm run dev:frontend   # http://localhost:5173
npm run dev:worker     # http://localhost:8787
```

## 部署

```bash
# 部署 Worker
npm run deploy:worker

# 前端通过 git push 自动部署到 Cloudflare Pages
```

## 数据源

| 数据源 | 用途 | 成本 |
|--------|------|------|
| FRED API | 美国宏观日历 + 前值 | 免费 |
| EastMoney | 中国 CPI/PPI 前值 | 免费 |
| Alpha Vantage | 财报日历 | 免费 (25 req/天) |
| DBnomics | 中国 PMI/M2 前值 | 免费 |

## 功能

- [x] 项目骨架搭建
- [x] D1 数据库设计
- [x] 共享类型定义
- [x] Worker 基础路由
- [x] 前端基础页面
- [x] 数据采集器实现 (FRED, EastMoney, DBnomics, Alpha Vantage, Manual)
- [x] 风险评分算法 (Z-Score 归一化 + 操作信号生成)
- [x] 完整前端页面 (日历热力图 + 历史统计 + 特殊窗口)
- [x] Service Worker 离线缓存

