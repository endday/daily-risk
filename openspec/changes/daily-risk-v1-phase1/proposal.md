## Why

每日风险榜需要一个可靠的数据基础设施。当前项目从零开始，需要搭建 Monorepo 结构、Cloudflare Worker 后端、Vue 3 前端，打通从数据采集到页面展示的完整链路。这是 V1 的核心基础，后续所有功能都依赖于此。

## What Changes

- 创建 Monorepo 项目结构（frontend/ + worker/ + shared/）
- 初始化 Cloudflare Worker + D1 数据库
- 初始化 Vue 3 + Vite 前端项目
- 配置 Vant 4 UI 组件库（按需加载）
- 配置 Service Worker 缓存策略
- 配置前后端分离部署（Pages + Worker）
- 创建共享类型定义（shared/types.ts）
- 创建 D1 数据库迁移脚本（events + provider_runs + earnings_watchlist）
- 配置开发环境（Vite proxy + Wrangler 本地开发）

## Capabilities

### New Capabilities
- `project-scaffold`: Monorepo 项目结构、构建配置、开发环境
- `database-schema`: D1 数据库表结构、迁移脚本、索引设计
- `shared-types`: 前后端共享的 TypeScript 类型定义
- `frontend-setup`: Vue 3 SPA 基础框架、Vant 4 集成、Service Worker
- `worker-setup`: Cloudflare Worker 基础框架、路由、Cron 配置

### Modified Capabilities
（无，这是全新项目）

## Impact

- 新增 `frontend/` 目录（Vue 3 SPA）
- 新增 `worker/` 目录（Cloudflare Worker）
- 新增 `shared/` 目录（共享类型）
- 新增 `openspec/` 目录（项目管理）
- 新增根目录配置文件（package.json, tsconfig.json, .gitignore）
- 依赖：vue, vant, vite, wrangler, typescript
