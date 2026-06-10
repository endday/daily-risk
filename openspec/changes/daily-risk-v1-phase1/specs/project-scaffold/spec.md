## project-scaffold

### 需求

- [ ] 创建 Monorepo 根目录结构
- [ ] 配置根 package.json（workspaces 或脚本）
- [ ] 配置 .gitignore（node_modules, dist, .wrangler 等）
- [ ] 配置 TypeScript 根配置（tsconfig.json）

### 验收标准

- `npm install` 在根目录可执行
- `frontend/` 和 `worker/` 是独立可运行的项目
- `shared/` 目录包含共享类型文件
