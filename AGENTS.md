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

## 首次部署 seed 流程

### 产品形态开关（两对 env，必须成对维护）

```bash
# 服务端（运行时真源）
TENANCY_MODE=single      # single=交付单租户 / multi=多租户 SaaS
TEAM_ENABLED=false       # 用 z.stringbool()，别写 z.coerce.boolean()

# 客户端 UI 门控（必须跟服务端同值，UI 用它避免 loader 往返）
VITE_TENANCY_MODE=single
VITE_TEAM_ENABLED=false
```

不同步就会出现"服务端允许、UI 不开"或反过来——先查 env，再查代码。

### 何时跑 seed

- **首次部署必须跑**：`pnpm db:seed`。建菜单骨架 + super-admin + （single 模式下）default org。
- **后续部署可选**：seed 默认幂等 safe，菜单走 upsert，不删运营在 UI 新建的条目；user / organization / member 也都 upsert。
- **`pnpm db:seed -- --reset-menus`**：仅开发或重大菜单迁移时用，会 `TRUNCATE Menu` —— 生产**永远别加**。

### 邮件传输按部署目标选 driver

| 目标 | EMAIL_TRANSPORT | 必需 env |
|---|---|---|
| 开发 | `console` | 无（URL 打 log） |
| 国内生产 | `smtp` | `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS`（阿里云邮件推送首选） |
| 海外生产 | `resend` | `RESEND_API_KEY` |

`APP_ENV=prod` + `EMAIL_TRANSPORT=console` 会**直接 boot 失败**——这是有意的 guardrail。

### super-admin 凭据

```bash
SEED_SUPER_ADMIN_EMAIL=admin@acme.com
SEED_SUPER_ADMIN_PASSWORD=...
```

seed 走 `internalAdapter.createUser`（绕过 signUpEmail 的 verification hook），直接 `emailVerified=true` 落库，首次启动即可登录。

dev 测试账号免验证：`APP_ENV=dev` 时以 `@dev.com` 结尾的邮箱注册后自动标 verified、不发验证邮件（`src/lib/auth.ts` 里硬编码约定）。

详见 `.trellis/spec/backend/tenancy-modes.md` 和 `.trellis/spec/backend/email-infrastructure.md`。

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
  - ⚠️ **授权分层契约** 单独列出：[`backend/authorization-boundary.md`](./.trellis/spec/backend/authorization-boundary.md) — 身份层归 Better Auth、业务层归 ZenStack policy，是所有业务表设计的前提
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
