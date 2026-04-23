# AGENTS.md

## 项目定位

**tan-servora** —— 全 TypeScript 栈**快速开发脚手架**，以 **Better Auth 开源插件生态**（admin / organization / SSO / ...）为身份层基础设施；前后端一体、类型安全。服务两类业务：

1. **甲方交付 / 私有化部署**（`PRODUCT_MODE=private`，默认）—— 一家公司一个后台，seed 默认组织 + 超管，新用户注册自动入伙默认 org。默认 org 的 `plan=enterprise`，所有 feature 门控自动放行
2. **公开 B2B SaaS workspace 模型**（`PRODUCT_MODE=saas`）—— Slack / Notion / Linear 那种。用户注册 → 验证邮箱 → 自动获得一个 personal workspace（`type=personal, plan=free, slug=personal-<userId>`）。想拉人协作时自己建 team workspace 或把 personal 改成 team

底层始终是 BA organization 的 **multi-workspace** 模型（共享表 + `organizationId` 过滤），**不是物理多租户**（schema/DB 隔离不在本项目范畴）。业务层数据隔离靠 ZenStack policy 自动注入 WHERE。

### 路由组织

```
src/routes/
├── auth/                # 登录注册（裸页）
├── (marketing)/         # 公开站（URL 不带前缀，欢迎页 + 未来 pricing/about）
├── site/                # 超管后台（URL 带 /site/ 前缀，用 BA admin plugin）
└── (workspace)/         # 业务面板（URL 不带前缀，org member 入口）
```

详见 `frontend/route-organization.md`。

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

### 产品形态开关（一对 env，必须成对维护）

```bash
# 服务端（运行时真源）
PRODUCT_MODE=private     # private=甲方交付 / saas=公开 B2B SaaS workspace 模型

# 客户端 UI 门控（必须跟服务端同值，UI 用它避免 loader 往返）
VITE_PRODUCT_MODE=private
```

`VITE_` 是 Vite 约定的"可暴露到浏览器端 bundle"前缀，与"产品"无关——默认所有 env 都只在服务端可见，只有带 `VITE_` 的才会注入到 `import.meta.env`（防 secrets 泄漏）。所以产品形态 flag 必须一式两份：`PRODUCT_MODE`（服务端真源）+ `VITE_PRODUCT_MODE`（客户端 UI 门控）。不同步就会出现"服务端允许、UI 不开"或反过来——先查 env，再查代码。

> ⚠️ **这个 flag 不改变隔离模型**——底层始终是 BA organization 的 multi-workspace（共享表 + `organizationId` 过滤），业务隔离靠 ZenStack policy。详见 `.trellis/spec/backend/product-modes.md`。

### Team / 邀请 / 成员数等 feature 由 plan 决定（不是 env）

每个 workspace 有 `organization.plan` 字段（`free | personal_pro | team_pro | enterprise`），驱动 feature 配额（team 数 / 是否能邀请 / 成员上限等）。`src/lib/plan.ts` 是单一真相源。

- seed 时 private 模式默认 org 写 `plan=enterprise`，所有门控放行
- saas 模式注册自动建的 personal org 写 `plan=free, type=personal`
- 升级 plan 通过 super-admin 手改 / Stripe plugin（将来做）
- **不要**再给"某个 feature 开不开"加新的 env flag——业务能力是每个 org 的订阅属性

详见 `.trellis/spec/backend/plan-gating.md` 和 `.trellis/spec/backend/personal-org.md`。

### 何时跑 seed

- **首次部署必须跑**：`pnpm db:seed`。建菜单骨架 + super-admin + （`private` 模式下）default org。
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

详见 `.trellis/spec/backend/product-modes.md` 和 `.trellis/spec/backend/email-infrastructure.md`。

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
