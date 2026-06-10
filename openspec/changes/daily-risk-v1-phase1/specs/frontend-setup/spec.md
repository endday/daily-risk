## frontend-setup

### 需求

- [ ] 初始化 Vue 3 + Vite 项目（frontend/）
- [ ] 配置 Vant 4 按需导入
- [ ] 配置 Vite proxy（/api → localhost:8787）
- [ ] 创建 Service Worker（public/sw.js）
- [ ] 配置 Pages 部署（wrangler.pages.toml 或 wrangler.toml）
- [ ] 创建基础页面结构（App.vue, main.ts, Index.vue）

### Vite 配置

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [
    vue(),
    importPlugin({
      libraryName: 'vant',
      libraryDirectory: 'es',
      style: true,
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
```

### Service Worker 缓存策略

```javascript
// public/sw.js
const CACHE_NAME = 'daily-risk-v1';
const API_CACHE_NAME = 'daily-risk-api';

// 安装时缓存静态资源
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll([
      '/',
      '/index.html',
    ]))
  );
});

// 请求拦截
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  
  // API 请求：Stale-while-revalidate
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      caches.open(API_CACHE_NAME).then(async cache => {
        const cached = await cache.match(e.request);
        const fetchPromise = fetch(e.request).then(response => {
          cache.put(e.request, response.clone());
          return response;
        });
        return cached || fetchPromise;
      })
    );
  }
  
  // 静态资源：Cache-first
  // HTML：Network-first
});
```

### 验收标准

- `npm run dev` 启动前端开发服务器
- Vant 组件可正常使用
- API 请求代理到 Worker
- Service Worker 注册成功
- `npm run build` 生成生产构建
