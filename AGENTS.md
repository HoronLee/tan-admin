# AGENTS.md
## 项目定位
全 TypeScript 栈的后台管理系统，对标 [go-wind-admin](https://github.com/tx7do/go-wind-admin) 的 TS 版本。强调前后端一体化、类型安全、可私有化部署。
## 技术栈
### 核心框架
- TanStack Start — 全栈 React 框架（SSR + server functions）
- TanStack Router — 文件式路由，100% 类型安全
- React 19 + React Compiler — 自动优化
- Vite 8 — 构建工具
### 数据层
- Prisma 7 — ORM（schema-first，对 ent 用户友好）
- PostgreSQL 17 — 数据库
- oRPC — 端到端类型安全 RPC，自动生成标准 OpenAPI（未来可给 Go/移动端用）
- TanStack Query — 客户端数据缓存
- TanStack Store — 轻量全局状态
### UI 层
- shadcn/ui — 组件库（组件代码复制到仓库，非 npm 依赖）
- Tailwind CSS 4 — 样式
- Radix UI — 无样式组件底座
- TanStack Table — 表格
- TanStack Form — 表单
### 工具链
- pnpm — 唯一，不允许用 npm/yarn
- Better Auth — 认证
- Sentry — 错误监控
- Paraglide — i18n
- T3Env — 环境变量类型安全校验（zod）
- Biome — Lint + Format（代替 ESLint + Prettier）
- Vitest — 测试
- MCP — 项目本身暴露 MCP server（`/mcp`），供外部 AI 工具调用
## 目录结构
```
admin/
├── prisma/
│   ├── schema.prisma       # 数据库 schema
│   └── seed.ts             # 种子数据
├── messages/               # Paraglide i18n 翻译
├── project.inlang/         # Paraglide 配置
├── src/
│   ├── components/         # 通用组件（含 shadcn 落地的 ui/）
│   ├── data/               # 静态数据/mock
│   ├── generated/prisma/   # Prisma Client 生成产物（勿手改）
│   ├── hooks/              # 自定义 hooks
│   ├── integrations/       # 第三方库集成
│   │   ├── better-auth/    # 认证客户端
│   │   └── tanstack-query/ # Query Provider
│   ├── lib/
│   │   ├── auth.ts         # Better Auth 服务端实例
│   │   ├── auth-client.ts  # Better Auth 客户端实例
│   │   ├── demo-store.ts   # TanStack Store demo
│   │   └── utils.ts        # shadcn cn() 等
│   ├── orpc/
│   │   ├── router/         # oRPC 路由定义
│   │   ├── api/            # HTTP/REST 适配层
│   │   ├── client.ts       # oRPC 客户端
│   │   └── schema.ts       # 共享 schema
│   ├── paraglide/          # Paraglide i18n 生成产物（dev/build 时生成）
│   ├── routes/             # TanStack Router 文件式路由（flat + 目录混用）
│   │   ├── __root.tsx      # 根布局
│   │   ├── index.tsx       # 首页
│   │   ├── about.tsx       # About 页
│   │   ├── demo.i18n.tsx   # flat 命名：Paraglide demo 页
│   │   ├── api.$.ts        # HTTP API 入口（catch-all）
│   │   ├── api.rpc.$.ts    # oRPC API 入口
│   │   ├── api/auth/$.ts   # Better Auth handler
│   │   ├── mcp.ts          # MCP server 入口
│   │   └── demo/           # 各 add-on demo 页（学习用，可删）
│   │       ├── better-auth.tsx   # 登录/注册 demo
│   │       ├── prisma.tsx        # Prisma CRUD demo
│   │       ├── orpc-todo.tsx     # oRPC demo
│   │       ├── tanstack-query.tsx
│   │       ├── table.tsx         # TanStack Table demo
│   │       ├── form.simple.tsx / form.address.tsx  # TanStack Form demo
│   │       ├── store.tsx         # TanStack Store demo
│   │       ├── mcp-todos.tsx     # MCP todos demo
│   │       ├── api.mcp-todos.ts  # MCP todos HTTP 入口
│   │       └── sentry.testing.tsx # Sentry 触发测试
│   ├── utils/              # 工具函数
│   ├── db.ts               # Prisma client 单例
│   ├── env.ts              # T3Env 环境变量 schema
│   ├── mcp-todos.ts        # MCP Todos 工具实现
│   ├── polyfill.ts         # 运行时 polyfill
│   ├── routeTree.gen.ts    # TanStack Router 生成的路由树（勿手改）
│   ├── router.tsx          # Router 实例
│   └── styles.css          # Tailwind 入口
├── instrument.server.mjs   # Sentry 服务端初始化（NODE_OPTIONS 预加载）
├── biome.json              # Biome 配置
├── components.json         # shadcn 配置
├── prisma.config.ts        # Prisma 配置
├── vite.config.ts          # Vite 配置
└── docker-compose.yml      # 本地 Postgres
```
## 常用命令
> 所有 `pnpm dev` / `db:*` 脚本都通过 `dotenv -e .env.local` 注入环境变量——**没 `.env.local` 会直接启动失败**。
```bash
# 开发
pnpm dev                   # 启动 dev server (http://localhost:3000)，会 --import instrument.server.mjs 预加载 Sentry
pnpm build                 # 构建生产版本（产物到 .output/server/）
pnpm preview               # 预览生产构建
pnpm start                 # 跑 .output/server/index.mjs —— 必须先 pnpm build
# 质量检查
pnpm check                 # Biome 全检查（lint + format）
pnpm lint                  # 仅 lint
pnpm format                # 仅格式化
pnpm test                  # Vitest 跑全部测试
pnpm test -- path/to/foo.test.ts   # 跑单个文件
pnpm test -- -t "case name"        # 按用例名过滤
# 数据库
pnpm db:push               # 同步 schema 到 DB（开发期快速迭代）
pnpm db:migrate            # 生成 migration（生产期规范迁移）
pnpm db:generate           # 生成 Prisma Client
pnpm db:studio             # 打开 Prisma Studio GUI
pnpm db:seed               # 跑种子数据
# shadcn 组件添加
pnpm dlx shadcn@latest add button card table dialog
```
## 环境变量
见 `.env.local`（每个开发者各自维护，已 gitignore）：
**⚠️ 注意**：
- `.env.local` 永不提交 git
- 所有变量要在 `src/env.ts` 里声明 schema，未声明的变量运行时会报错
- 前端可读变量必须以 `VITE_` 开头
## 数据库（本地开发）
```bash
# 启动 PG
docker compose up -d
# 初次同步 schema
pnpm db:push
# 生成 client
pnpm db:generate
# 查看数据
pnpm db:studio
```
Prisma Client 生成到 `src/generated/prisma/`（非默认的 `node_modules/.prisma`）。导入时用：
```ts
import { PrismaClient } from '#/generated/prisma'
```
### Prisma Client 生成路径
- 本项目生成到 `src/generated/prisma/`（见 `prisma/schema.prisma` 的 `output`）
- 不是默认的 `node_modules/.prisma`
- Import 用 `#/generated/prisma`（`#/` 是 `package.json` 定义的 `./src/*` 别名）
## 编码约定
### 导入别名
```ts
import { db } from '#/db'              // ✅
import { auth } from '#/lib/auth'       // ✅
import { db } from '../../db'          // ❌ 不用相对路径穿越多层
```
> `#/*` 别名由 **`package.json` 的 `imports` 字段**声明（`"#/*": "./src/*"`），不是 `tsconfig.json` 的 `paths`。TS 通过 `moduleResolution: bundler` 识别它。调试 import 失败时优先检查 package.json。
### 错误处理
- 系统边界（API / 外部调用 / 用户输入）必须显式处理
- 用 Zod 校验所有外部输入
- 不要静默吞异常
## 开发流程
### 新功能流程
1. **研究已有方案**：先搜 GitHub / 官方 docs 是否有类似实现可借鉴
2. **改 Prisma schema**（如需）→ `pnpm db:migrate`
3. **写 oRPC 路由** (`src/orpc/router/*`) — server 端逻辑
4. **写前端页面** (`src/routes/*`) — 调用 oRPC client
5. **类型会自动端到端打通**，前端改 shape 后端立刻红
6. **测试**：Vitest 跑单元测试，必要时开浏览器手测
### 添加 shadcn 组件
```bash
pnpm dlx shadcn@latest add button input form
```
组件落到 `src/components/ui/`，可以随意改。
<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

Use the `/trellis:start` command when starting a new session to:
- Initialize your developer identity
- Understand current project context
- Read relevant guidelines

Use `@/.trellis/` to learn:
- Development workflow (`workflow.md`)
- Project structure guidelines (`spec/`)
- Developer workspace (`workspace/`)

If you're using Codex, project-scoped helpers may also live in:
- `.agents/skills/` for reusable Trellis skills
- `.codex/agents/` for optional custom subagents

Keep this managed block so 'trellis update' can refresh the instructions.

<!-- TRELLIS:END -->
