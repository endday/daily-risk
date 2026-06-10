## 实施任务

### 1. Monorepo 初始化
- [x] 创建根目录 package.json（workspaces 配置）
- [x] 创建 .gitignore
- [x] 创建 shared/types.ts 并写入核心类型定义
- [x] 验证目录结构

### 2. Worker 项目初始化
- [x] 创建 worker 目录结构
- [x] 配置 wrangler.toml（D1 binding + Cron triggers）
- [x] 创建 D1 数据库：`wrangler d1 create daily-risk`
- [x] 编写迁移脚本 migrations/0001_init.sql
- [x] 执行迁移：`wrangler d1 execute daily-risk --file=migrations/0001_init.sql`
- [x] 配置 src/index.ts 基础路由
- [x] 配置 tsconfig.json
- [x] 验证 TypeScript 编译通过

### 3. 前端项目初始化
- [x] 创建 frontend 目录结构
- [x] 配置 package.json（vue, vant, vite 依赖）
- [x] 配置 vite.config.ts（Vant 按需导入 + API proxy）
- [x] 创建 public/sw.js（Service Worker）
- [x] 配置 Pages 部署（wrangler.pages.toml）
- [x] 创建基础组件：App.vue, main.ts, pages/Index.vue
- [x] 创建 API 服务层：services/api.ts
- [x] 验证 TypeScript 编译通过

### 4. 开发环境联调
- [x] 安装所有依赖
- [ ] 同时启动 frontend dev server 和 worker dev server
- [ ] 验证前端可调用后端 API
- [ ] 验证 D1 数据库读写
- [ ] 验证 Service Worker 注册

### 5. 部署配置
- [ ] 配置 Cloudflare Pages 部署（frontend/）
- [ ] 配置 Worker 部署（worker/）
- [ ] 配置自定义域名（可选）
- [ ] 验证生产环境可访问

### 6. 文档更新
- [x] 创建 README.md（项目说明、开发指南、部署说明）
- [ ] 更新 CLAUDE.md（如需要）

---

## 依赖关系

```
1. Monorepo 初始化
   ↓
2. Worker 项目初始化 ←→ 3. 前端项目初始化（可并行）
   ↓                        ↓
4. 开发环境联调 ←────────────┘
   ↓
5. 部署配置
   ↓
6. 文档更新
```

## 验收标准

- `npm run dev` 在根目录可同时启动前后端
- `npm run build` 在根目录可构建前端
- `wrangler deploy` 可部署 Worker
- Pages 自动部署（git push）
- 生产环境 API 和页面可访问
