## Context

Daily Risk 项目需要一个完整的基础设施来支撑后续的数据采集、风险评分和页面展示功能。项目采用 Monorepo 结构，前后端分离部署，使用 Cloudflare 生态（Worker + Pages + D1）实现零成本运行。

当前状态：空项目，只有 DESIGN.md 技术方案文档。

## Goals / Non-Goals

**Goals:**
- 建立可运行的 Monorepo 项目骨架
- 完成 D1 数据库初始化和迁移
- 配置开发环境（前端热更新 + 后端本地调试）
- 实现前后端分离部署流程

**Non-Goals:**
- 不实现数据采集逻辑（Phase 2）
- 不实现风险评分算法（Phase 3）
- 不实现完整的 Vue 页面组件（Phase 4）
- 不配置 CI/CD 自动化部署

## Decisions

### 1. Monorepo 结构

**选择：** frontend/ + worker/ + shared/ 三目录结构

**理由：**
- 前后端代码在同一仓库，类型定义可共享
- 部署分离：Pages 托管前端，Worker 跑后端
- 开发独立：两个目录可独立运行 dev server

**替代方案：**
- 单一目录混合：部署复杂，前端后端构建配置冲突
- 多仓库：类型共享困难，开发体验差

### 2. 前端技术栈

**选择：** Vue 3 + Vite + Vant 4（按需加载）

**理由：**
- Vue 3 生态成熟，TypeScript 支持好
- Vite 构建快，HMR 体验好
- Vant 4 是 Vue 3 移动端组件库最佳选择
- 按需加载控制打包体积

**替代方案：**
- React：团队更熟悉 Vue
- Svelte：生态不够成熟

### 3. 后端运行时

**选择：** Cloudflare Worker (TypeScript)

**理由：**
- 免费额度大（100k req/天）
- 原生支持 Cron Trigger
- D1 数据库原生集成
- 全球边缘网络

**替代方案：**
- Vercel/Netlify Functions：冷启动慢，免费额度小
- 自建服务器：运维成本高

### 4. 数据库

**选择：** Cloudflare D1 (SQLite)

**理由：**
- 免费 5GB，足够 V1 使用
- SQLite 语法，学习成本低
- 与 Worker 原生集成

**替代方案：**
- PostgreSQL (Supabase/Neon)：免费额度小，延迟高
- Redis (Upstash)：不适合复杂查询

### 5. 类型共享策略

**选择：** shared/types.ts 文件，前后端共同引用

**理由：**
- 避免类型重复定义
- 修改类型时前后端同步更新
- Vite 和 Wrangler 都能解析 relative imports

**实现方式：**
```
shared/
  └── types.ts

frontend/src/
  └── services/
      └── api.ts  ← import { RiskEvent } from '../../shared/types'

worker/src/
  └── collectors/
      └── normalizer.ts  ← import { NormalizedEvent } from '../../shared/types'
```

### 6. Service Worker 缓存策略

**选择：** Workbox 或手写 SW

**决定：** 手写 SW（更简单，控制力强）

**缓存规则：**
| 资源 | 策略 | TTL |
|------|------|-----|
| /api/events?* | Stale-while-revalidate | 5 分钟 |
| Vue assets (hash) | Cache-first | 永久 |
| index.html | Network-first | fallback to cache |
| /admin/collect | No cache | - |

## Risks / Trade-offs

### [Risk] Cloudflare Worker 冷启动
**影响：** 首次请求延迟可能达 50-100ms
**缓解：** Worker 免费计划有保持活跃的额度；V1 流量小，可接受

### [Risk] D1 数据库写入限制
**影响：** 批量 upsert 可能遇到速率限制
**缓解：** 分批写入，每批 100 条，间隔 100ms

### [Risk] Vant 4 按需加载配置复杂
**影响：** 可能打包体积过大
**缓解：** 使用 vite-plugin-imp 自动按需导入

### [Trade-off] Monorepo vs 多仓库
**选择 Monorepo 的代价：** 构建配置稍复杂
**收益：** 类型共享、开发体验好、单一仓库管理

### [Trade-off] 手写 Service Worker vs Workbox
**选择手写的代价：** 需要自己处理缓存更新逻辑
**收益：** 无额外依赖，体积更小，控制力强
