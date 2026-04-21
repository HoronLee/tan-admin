# AGENTS.md

## 项目定位

全 TypeScript 栈后台管理系统，以 **Better Auth 开源插件生态**（admin / organization / SSO / ...）为身份层基础设施；前后端一体、类型安全、可私有化部署。目标形态是现代 IAM 驱动的业务后台底座。

## 技术栈

- **框架**：TanStack Start（SSR + server functions）、TanStack Router、React 19 + React Compiler、Vite 8
- **数据**：ZenStack v3（Kysely 运行时）+ PostgreSQL 17、oRPC、TanStack Query、TanStack Store
- **UI**：shadcn/ui、Tailwind CSS 4、Radix UI、TanStack Table / Form
- **工具**：pnpm（唯一）、Better Auth、Sentry、Paraglide、T3Env、Biome、Vitest、MCP（`/mcp` 自曝 server）

## 常用命令

> 所有 `pnpm dev` / `db:*` 通过 `dotenv -e .env.local` 注入环境变量——**没 `.env.local` 会直接启动失败**。

```bash
pnpm dev                     # dev server @ :3000（预加载 instrument.server.mjs）
pnpm build && pnpm start     # 生产构建 + 启动
pnpm check                   # Biome lint+format
pnpm test                    # Vitest
pnpm db:push | db:migrate | db:generate | db:studio | db:seed | auth:migrate
pnpm dlx shadcn@latest add button card ...
```

## 关键约束（读 spec 前也要知道）

- **包管理器只用 pnpm**，不接受 npm/yarn
- **`#/*` 别名**由 `package.json` 的 `imports` 字段声明（不是 `tsconfig.json#paths`）；调 import 先看 package.json
- **ZenStack schema** 放在 `zenstack/schema.zmodel`；`zen generate` 产出 `zenstack/{schema,models,input}.ts`，导入走 bare path `zenstack/schema`
- **Better Auth 表**由 `@better-auth/cli migrate` 建 + Better Auth 内置 Kysely 管理，**不写入 zmodel**；业务代码与 auth 共享同一 `pg.Pool`（`src/db.ts` 导出 `pool` + `db`）
- **环境变量**必须在 `src/env.ts` 声明 schema；前端可读变量必须 `VITE_` 前缀；`.env.local` 永不入库
- **生成产物勿手改**：`src/routeTree.gen.ts`、`zenstack/{schema,models,input}.ts`、`src/paraglide/*`

## 深度规范与工作流

详细前后端约定、目录职责、错误处理、state 分层、反模式见 `.trellis/spec/`：

- [backend](./.trellis/spec/backend/index.md) — oRPC / ZenStack / Better Auth / MCP / 日志 / 错误
- [frontend](./.trellis/spec/frontend/index.md) — 组件 / hook / state / 类型 / 质量
- [guides](./.trellis/spec/guides/index.md) — 跨层 & 复用思维

AI 进任务前先跑 `/trellis:before-dev` 让对应 spec 载入上下文。

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
