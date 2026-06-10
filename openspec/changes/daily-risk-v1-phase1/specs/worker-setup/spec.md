## worker-setup

### 需求

- [ ] 初始化 Cloudflare Worker 项目（worker/）
- [ ] 配置 wrangler.toml（D1 绑定、Cron triggers）
- [ ] 创建 Worker 入口文件（src/index.ts）
- [ ] 配置路由（GET /api/events, POST /admin/collect）
- [ ] 配置 Cron handler（scheduled）
- [ ] 配置 D1 类型声明

### wrangler.toml 配置

```toml
name = "daily-risk-worker"
main = "src/index.ts"
compatibility_date = "2026-06-08"

[[d1_databases]]
binding = "DB"
database_name = "daily-risk"
database_id = "<D1_DATABASE_ID>"

[triggers]
crons = [
  "0 22 * * *",    # 06:00 CST 每日采集
  "0 * * * *"      # 每小时更新实际值
]
```

### Worker 入口结构

```typescript
// src/index.ts
export interface Env {
  DB: D1Database;
  ADMIN_TOKEN: string;
  FRED_API_KEY: string;
  // ... 其他 secrets
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    
    if (url.pathname === '/api/events') {
      return handleEvents(request, env);
    }
    
    if (url.pathname === '/admin/collect' && request.method === 'POST') {
      return handleCollect(request, env);
    }
    
    return new Response('Not Found', { status: 404 });
  },
  
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (controller.cron === '0 22 * * *') {
      await runDailyCollection(env);
    } else if (controller.cron === '0 * * * *') {
      await updateActualValues(env);
    }
  },
};
```

### 验收标准

- `wrangler dev` 启动本地开发服务器
- 可访问 localhost:8787/api/events
- D1 数据库可读写
- Cron triggers 配置正确
- TypeScript 编译通过
