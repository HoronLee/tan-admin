# 接入 ZenStack v3 + Better Auth（Kysely 模式）

## Goal

把数据层从 Prisma 7 直用模式迁移到 **ZenStack v3**（基于 Kysely 的全新 ORM），同时接入 **Better Auth** 的原生 Kysely 后端（共享同一个 `pg Pool`），让登录后的用户可以管理自己的 Todo。本轮**暂不引入访问控制策略**（`@@allow/@@deny`），登录后所有已认证用户共享 Todo 操作权限——RBAC 留给后续 task。

保留现有错误处理契约（oRPC 类型化错误 + 全局 server-fn 中间件 + Sentry + pino），仅把 Prisma 错误映射中间件改写为 ZenStack `ORMError` 映射。

## Task 路线图（本 task 在大局中的位置）

后续要落地 **admin 服务 + 光伏电站管理平台**等多业务域（合计 20+ 模型），API 协议栈会从"纯 oRPC 单栈"渐进升级为"**oRPC + ZenStack 双栈**"。分 3 步走：

| 阶段 | Task | 范围 | 协议栈 |
|---|---|---|---|
| **T1（本 task）** | `04-20-zenstack-v3-bootstrap` | **ORM 地基**：Prisma → ZenStack v3、Better Auth 接 DB、Todo demo 接真 DB、登录页 | 单栈 oRPC（**不变**） |
| **T2** | `04-20-rbac-modeling-policy` | **RBAC 建模 + PolicyPlugin**：zmodel 加 User/Role/Permission/Menu；挂 `@zenstackhq/plugin-policy`；authed middleware 改为 `db.$setAuth(user)` | 单栈 oRPC（**不变**） |
| **T3** | `04-20-crud-autogen-hooks` | **单栈 → 双栈**：挂 `@zenstackhq/server/tanstack-start` 到 `/api/model/**`；装 `@zenstackhq/tanstack-query`；错误契约融合（前端 `reportError` 同时识别 `ORPCError` 和 `ORMError`）；admin 第一个页面用 ZenStack hooks | **双栈** |
| **T4+** | 业务域各自独立 task | admin 各域 / 光伏各域按双栈模式落地 | 双栈 |

**设计原则**（在 T3 及之后固化）：
- **CRUD 流量**（list/get/create/update/delete）→ ZenStack Server Adapter + `@zenstackhq/tanstack-query` hooks
- **业务动作流量**（批量操作、跨模型事务、下发设备指令、触发任务）→ oRPC + `@orpc/tanstack-query` hooks
- 两者共享：ZenStackClient（同一 ORM）、Better Auth session（同一鉴权源）、pino logger、Sentry、reportError 通道

## What I already know

### 当前状态

- 项目用 Prisma 7.4.2（`@prisma/client` + `@prisma/adapter-pg`），schema 位于 `prisma/schema.prisma`，只有 `Todo { id, title, createdAt }` demo 表
- `src/db.ts` 创建 `PrismaClient + PrismaPg` adapter，module-load 时 `await prisma.$connect()` fail-fast
- `src/lib/auth.ts` 有 `betterAuth(...)` 实例但 **未配 `database`**，因此 sign-in/sign-up 不可用
- `src/orpc/middleware/prisma-error.ts` 映射 `P2002 → CONFLICT` / `P2025 → NOT_FOUND`
- `src/orpc/router/todos.ts` 是**内存数组 mock**，未接数据库
- `src/routes/api/auth/$.ts` 已挂 Better Auth handler（`/api/auth/**`）
- 全局错误处理（oRPC interceptors、server-fn middleware、`instrument.server.mjs` 进程级兜底、前端 Sentry、reportError）**全部已就绪**（上个 task `04-18-error-handling` 产出）
- shadcn/ui 17 个组件已装齐（含 form / dialog / table / sonner）

### 技术栈约束

- pnpm 唯一包管理器
- TanStack Start SSR + server functions；oRPC 1.13 作为主 API 传输
- `package.json#imports` 定义 `#/*` 别名；生成代码原路径 `src/generated/prisma/`
- Biome 作为 lint/format；Vitest 作为测试框架
- `.env.local` 注入 `DATABASE_URL`，不入库

### 权威文档（本 task 实现必须以此为准）

- **ZenStack v3 install**: https://zenstack.dev/docs/quick-start
- **ZenStack v3 从 Prisma 迁移**: https://zenstack.dev/docs/migrate-prisma
- **ZenStack v3 ZModel 参考**: https://zenstack.dev/docs/modeling/schema
- **ZenStack v3 错误类型**: https://zenstack.dev/docs/orm/errors
- **ZenStack v3 migrate 子命令**: https://zenstack.dev/docs/orm/migrate
- **Better Auth install**: https://better-auth.com/docs/installation
- **Better Auth PostgreSQL (Kysely 模式)**: https://better-auth.com/docs/adapters/postgresql
- **Better Auth basic-usage（email+password）**: https://better-auth.com/docs/basic-usage
- **Better Auth TanStack Start 集成**: https://better-auth.com/docs/integrations/tanstack
- **Better Auth CLI（auth migrate/generate）**: https://better-auth.com/docs/concepts/cli

> 实现过程中每遇到决策点，先检索上述文档对应章节；如果文档与本 PRD 冲突，以**文档为准**并在 journal 记录偏差。

## Research Notes

### ZenStack v3 关键特性（与 v2 区别）

1. **运行时脱离 Prisma**：v3 基于 Kysely 实现 ORM，Prisma 只作为 `@zenstackhq/cli` 的 peer dep 用于 migration
2. 新包名：`@zenstackhq/schema`（运行时 schema 对象）、`@zenstackhq/orm`（运行时 ORM，对标旧 `@zenstackhq/runtime`）、`@zenstackhq/cli`（CLI）
3. `ZenStackClient` API 与 Prisma Client 兼容（`db.todo.findMany({ where })` 等），业务代码零学习成本
4. 访问控制移入独立 plugin：`@zenstackhq/plugin-policy`，通过 `db.$use(new PolicyPlugin()).$setAuth(user)` 启用——**本 task 不启用**
5. 错误类型统一为 `ORMError` + `ORMErrorReason` 枚举（见下方错误映射）
6. 数据库驱动独立装（我们用 `pg` + `@types/pg`）

### Better Auth "Kysely 模式" = 官方推荐默认路径

- 直接把 `new Pool({ connectionString })` 实例传给 `database` 字段即可，**无需 adapter 包**
- `npx @better-auth/cli@latest migrate` 在这条路径下可直接建表（prismaAdapter 只能 generate 不能 migrate）
- 所有必需表（`user` / `session` / `account` / `verification`）由 Better Auth CLI 生成，**不需要我们在 zmodel 手写**

### 与 ZenStack 共享 Pool 的拓扑

```
new pg.Pool(DATABASE_URL)
   ├─ ZenStackClient(schema, { dialect: PostgresDialect({ pool }) })
   │     → 业务表（Todo 等） + 业务查询
   │
   └─ betterAuth({ database: pool })
         → Better Auth 4 张表（user/session/account/verification）
         → Better Auth 自己用 Kysely 操作
```

**同一进程、同一连接池、两套 Kysely 实例**，互不干涉。

### ZenStack v3 错误类型映射（替换 Prisma P2xxx）

按 https://zenstack.dev/docs/orm/errors（以最终实现时文档为准）：

| `ORMErrorReason` | 含义 | 映射到 oRPC 错误 |
|---|---|---|
| `not-found` | 记录不存在；update/delete 目标行缺失 | `NOT_FOUND` |
| `rejected-by-policy` | 被 `@@allow/@@deny` 拒绝（本 task 不会出现，但提前埋点） | `FORBIDDEN` |
| `invalid-input` | ORM 参数校验失败 | `INPUT_VALIDATION_FAILED` |
| `db-query-error` | 底层驱动错误；Postgres SQLSTATE 在 `dbErrorCode` | 按 SQLSTATE 细分：`23505 → CONFLICT`, `23503 → BAD_REQUEST`, 其他 → `INTERNAL_ERROR` |
| `config-error` / `not-supported` / `internal-error` | 框架/配置问题 | `INTERNAL_ERROR` |

### Todo demo 的"登录后可用"语义

本 task 的目标是"注册用户可使用 Todo"，不是"每个用户只看到自己的 Todo"。实现方式：

- 在 oRPC `authed` middleware 里校验 session 存在
- Todo 过程挂在 `authed.use(ormError)` 链上
- Todo 表**不加** `ownerId`（保持 demo 简洁）；所有登录用户共享同一个 Todo 列表
- 未来引入 RBAC 时再加 `ownerId + @@allow('all', auth() == owner)`

## Decision (ADR-lite)

### Decision 1：ZenStack v3 一次性替换，不做 Prisma/ZenStack 并存

**Context**：v3 运行时完全脱离 Prisma，两者并存无意义且徒增混乱。

**Decision**：一次性移除 `@prisma/client` + `@prisma/adapter-pg` 运行时依赖；`prisma` 仅保留作为 `@zenstackhq/cli` 的 peer（供 migrate 用）。

**Consequences**：
- `src/generated/prisma/*` 整目录删除，ZenStack 产物改到 `src/zenstack/`（与业务代码一起编译）
- `package.json#imports` 中 `#/generated/prisma` 的用途被 ZenStack `schema.ts` + `models.ts` + `input.ts` 取代
- `db.ts`、`orpc/middleware/prisma-error.ts`、任何 `import { Prisma } from ...` 的文件都要改

### Decision 2：Better Auth 走 Kysely 原生模式（传 `Pool` 而非 adapter）

**Context**：`prismaAdapter` 在 1.4.7 起锁 `prisma ^5.22.0` 与我们 prisma 7 冲突；而且 prismaAdapter 的 CLI 只能 generate 不能 migrate。

**Decision**：`betterAuth({ database: pgPool })`，用 `npx @better-auth/cli migrate` 自动建表；Pool 与 ZenStack 共享。

**Consequences**：
- 无 Prisma peer dep 冲突
- Better Auth 表不写在 `zmodel` 里，由 CLI 管理；ZenStack 迁移时要 **忽略 public schema 下的 auth 表**（或让 Better Auth 用独立 schema——evaluate 之）
- 如果将来 Todo 需要 `owner User @relation`，要**在 zmodel 手写一个与 auth.user 同名/同键的 shadow model**（加 `@@map("user")` 和 `@@ignore` 或类似配置）或者接受"Todo.ownerId 存字符串，不做 DB-FK"

### Decision 3：Schema 布局——auth 表独立 PostgreSQL schema

**Context**：Better Auth 与 ZenStack 两者都要在同一 PG 实例里建表。如果都在 `public` 下，ZenStack 的 migration 可能会与 Better Auth 的 CLI 冲突。

**Decision**：让 Better Auth 使用独立 PostgreSQL schema `auth_schema`（参考 Better Auth PostgreSQL 文档 "Use a non-default schema" 章节），ZenStack 业务表继续在 `public`。

**Consequences**：
- `DATABASE_URL` 上加 `?options=-c%20search_path%3Dauth_schema` 传给 Better Auth Pool（或用专用连接字符串）
- ZenStack 的 Pool 不加 search_path，保持默认 `public`
- 上线前要在数据库里 `CREATE SCHEMA IF NOT EXISTS auth_schema`（在 seed 或 migration hook 里做）

> 如果实施时发现此方案导致 Pool 共享不可行（search_path 冲突），回退方案：两者都在 `public`，让 ZenStack 在 zmodel 用 `@@ignore` 忽略 Better Auth 管理的 4 张表。实施时再决定。

### Decision 4：本 task **不引入** PolicyPlugin

**Context**：用户明确说 RBAC 暂不做。

**Decision**：`src/db.ts` 只导出 `db = new ZenStackClient(schema, ...)`，不挂 `PolicyPlugin`；`orpc/middleware/auth.ts` 只做 authn（验证 session），不做 `$setAuth`。

**Consequences**：
- zmodel 里**不写** `@@allow` / `@@deny`
- 未来引入 RBAC 时，只需装 `@zenstackhq/plugin-policy`、加策略、在 middleware 里 `db.$use(PolicyPlugin()).$setAuth(user)`——不需重构业务代码

## Requirements

### 1. 依赖变更

- **移除**：`@prisma/client`、`@prisma/adapter-pg`（运行时依赖）
- **新增**：`@zenstackhq/schema`、`@zenstackhq/orm`、`pg`（运行时依赖）
- **新增 dev**：`@zenstackhq/cli`、`@types/pg`
- **保留**：`prisma`（作为 `@zenstackhq/cli` 的 peer dep，供 migrate 用）
- **保留**：`better-auth`（已在项目中）

### 2. Schema 迁移

- 新建 `zenstack/schema.zmodel`，复制现有 `prisma/schema.prisma` 内容（ZModel 是 Prisma Schema 超集）
- 调整 `datasource` 块：参考 https://zenstack.dev/docs/modeling/schema
- 暂时**只保留 `Todo` model**（Better Auth 表由其 CLI 独立管理）
- 删除 `prisma/schema.prisma`（或保留作为参考移到 `.backup`）
- 删除 `src/generated/prisma/` 目录
- 移除 `package.json#imports` 中 `#/generated/prisma`（如存在）

### 3. 生成与迁移脚本（`package.json#scripts`）

替换旧 prisma 脚本：

```json
{
  "db:generate": "dotenv -e .env.local -- zen generate",
  "db:push":     "dotenv -e .env.local -- zen db push",
  "db:migrate":  "dotenv -e .env.local -- zen migrate dev",
  "db:studio":   "dotenv -e .env.local -- zen studio",
  "db:seed":     "dotenv -e .env.local -- tsx src/seed.ts",
  "auth:migrate": "dotenv -e .env.local -- npx @better-auth/cli@latest migrate"
}
```

> 具体子命令名以 `zen --help` 实际输出为准（ZenStack v3 可能用 `zenstack` 或 `zen`——实施时查证）。

### 4. `src/db.ts` 重写

- 创建单例 `pg.Pool`
- 创建 `ZenStackClient(schema, { dialect: new PostgresDialect({ pool }) })`
- 保留 fail-fast 逻辑（模块加载时验证连接；使用 `db.$connect()` 或类似 API——以文档为准）
- `globalThis.__db` 避免 dev hot-reload 多实例
- 导出：`db`、`pool`

### 5. `src/lib/auth.ts` 接入 Kysely 原生模式

- 从 `#/db` 导入共享 `pool`
- `betterAuth({ database: pool, emailAndPassword: { enabled: true }, plugins: [tanstackStartCookies()] })`
- 保留现有 logger 桥接
- 保留 `tanstackStartCookies` 插件
- **参考**：https://better-auth.com/docs/integrations/tanstack（TanStack Start 专属注意事项）

### 6. 错误处理中间件迁移

- 文件重命名：`src/orpc/middleware/prisma-error.ts` → `src/orpc/middleware/orm-error.ts`
- 改用 `ORMError`（从 `@zenstackhq/orm` 导入）
- 映射规则：
  - `not-found` → `NOT_FOUND`
  - `rejected-by-policy` → `FORBIDDEN`（预埋，本 task 不会触发）
  - `invalid-input` → `INPUT_VALIDATION_FAILED`（复用现有 data schema；若形状不同则写 adapter）
  - `db-query-error`：按 `dbErrorCode`（Postgres SQLSTATE）：
    - `23505` (unique_violation) → `CONFLICT`
    - `23503` (foreign_key_violation) → `BAD_REQUEST`
    - 其他 → 透传到上游（由 boundary interceptor 转为 INTERNAL_ERROR）
  - 其他 reason → 透传
- 更新对应测试 `src/orpc/middleware/orm-error.test.ts`

### 7. 认证中间件（authn only）

- 新建 `src/orpc/middleware/auth.ts`
- 导出 `authed` procedure：复用现有 `pub`（已挂 ORM 错误映射）并加 session 校验
- 实现：
  ```ts
  import { headers } from ... // oRPC context 里拿 request headers
  import { auth } from '#/lib/auth'
  import { base } from '#/orpc/errors'
  
  export const authMiddleware = base.middleware(async ({ context, next, errors }) => {
    const session = await auth.api.getSession({ headers: context.headers })
    if (!session) throw errors.UNAUTHORIZED({ message: 'Sign in required.' })
    return next({ context: { ...context, user: session.user } })
  })
  
  export const authed = pub.use(authMiddleware)  // pub = base + ORM 错误映射
  ```
- 具体 `auth.api.getSession` 的调用签名**以 Better Auth 文档为准**（https://better-auth.com/docs/basic-usage#get-session）
- `context.headers` 的接法以 oRPC 文档 + 现有 `api.rpc.$.ts` 为准

### 8. Todo router 接入真数据库 + 登录保护

- `src/orpc/router/todos.ts`：
  - 把 mock 数组删除
  - `listTodos` / `addTodo` 改用 `authed.input(...).handler(({ context }) => context.db.todo.findMany(...))`
  - Todo schema：保持现状 `{ id, title, createdAt }`，**不加 ownerId**（本 task scope 内）
- 保留现有 `orpc/schema.ts` 里的 TodoSchema

### 9. 登录/注册页面（最小可用）

- 新建 `src/routes/login.tsx`（未登录用户页面）：
  - 用 shadcn `card` + `form` + `input` + `button`
  - email+password 登录 + 注册两个 tab
  - 调 `authClient.signIn.email(...)` / `authClient.signUp.email(...)`（参考 https://better-auth.com/docs/basic-usage）
  - 成功后 `router.navigate({ to: '/' })`
  - 错误走 `reportError(err)`（现有的 toast 通道）
- `src/lib/auth-client.ts` 更新（如现有实现不完整）：
  ```ts
  import { createAuthClient } from 'better-auth/react'
  export const authClient = createAuthClient({ baseURL: import.meta.env.VITE_APP_URL })
  ```
  - `VITE_APP_URL` 需加入 `src/env.ts`（或用 window.origin 兜底，浏览器侧）

### 10. Todo demo 页升级

- `src/routes/demo/prisma.tsx`（如有）或新建 `src/routes/demo/todos.tsx`：
  - 路由 `beforeLoad` 检查 session，无则跳 `/login`
  - 用 TanStack Query + oRPC 客户端调 `listTodos` / `addTodo`
  - UI 用 shadcn `card` / `input` / `button` / `table`
  - 验证"登录 → 创建 → 查询"链路通

### 11. 环境变量

- `src/env.ts` 新增：
  - `BETTER_AUTH_SECRET`（32+ 字符，用 `openssl rand -base64 32` 生成后写 `.env.local`）
  - `BETTER_AUTH_URL`（dev: `http://localhost:3000`）
  - `VITE_APP_URL`（dev: `http://localhost:3000`；前端侧 Better Auth baseURL）
- `.env.local.example` 同步更新（如存在）

### 12. Spec 更新

- `.trellis/spec/backend/database-guidelines.md`：把 Prisma 章节替换为 ZenStack v3 + Kysely；给出"共享 Pool"拓扑图
- `.trellis/spec/backend/error-handling.md`：Prisma 错误映射章节替换为 ORMError 映射表
- 其他 spec 文件里任何 `Prisma` 字样按需改为 `ZenStack`（先 grep 确认范围）

## Acceptance Criteria

- [ ] `pnpm install` 后 `pnpm dev` 能起来（`.env.local` 需齐备 `DATABASE_URL` / `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL`）
- [ ] `pnpm db:push` 成功创建 Todo 表；`pnpm auth:migrate` 成功创建 user/session/account/verification 表
- [ ] 未登录访问 `/demo/todos` 被重定向到 `/login`
- [ ] `/login` 能完成注册 + 登录流程，成功后跳到 `/`
- [ ] 登录态下 `/demo/todos` 可以列表 + 创建 Todo，数据持久到 Postgres
- [ ] 故意触发 UNIQUE 冲突（如手写 INSERT 同 id）→ 客户端收到 `CONFLICT`
- [ ] 故意触发 NOT_FOUND（`update` 一个不存在的 id）→ 客户端收到 `NOT_FOUND`
- [ ] `biome check` 全绿；`pnpm test` 全绿（含 orm-error 映射单测）
- [ ] `src/generated/prisma/` 已删除；全局无 `import ... from '@prisma/client'` 残留
- [ ] 相关 spec 更新到 ZenStack v3 + Better Auth Kysely 模式

## Definition of Done

- Biome check / tsc 无错
- `pnpm test` 绿
- 手动通过上述 AC 全部场景
- spec 已更新并通过 `/trellis:check` 扫描
- task 目录下有对应 `implement.jsonl` / `check.jsonl` 记录
- 创建对应 commit（`feat(data): migrate to ZenStack v3 + Better Auth Kysely mode`）

## Out of Scope (explicit)

- **访问控制策略**（`@@allow`/`@@deny`）：留给 `04-xx-rbac` task
- **RBAC 模型**（User / Role / Permission / Menu）：同上
- **社会登录**（GitHub / Google）：后续
- **密码找回 / 邮箱验证流**：后续
- **多租户 / 多部门**：远期
- **Better Auth 的高级 plugin**（organization / admin / 2FA）：后续
- **Todo 的 owner 过滤**：本 task 所有登录用户共享同一 Todo 列表；加 owner 留到 RBAC task
- **ZenStack 自动 CRUD API**（`@zenstackhq/server/tanstack-start`）：**已规划到 T3**（`.trellis/tasks/04-20-crud-autogen-hooks`）。本 task 继续手写 oRPC router。触发条件：T2 完成后即可启动 T3，届时 PolicyPlugin 联动缓存 invalidate 能释放全部价值。
- **ZenStack TanStack Query hooks**（`@zenstackhq/tanstack-query`）：同上，**已规划到 T3**。本 task 前端继续用 `@orpc/tanstack-query` 消费手写过程。

## Technical Notes

### 关键文件变更清单

**删除**：
- `prisma/schema.prisma`
- `src/generated/prisma/`（整目录）
- `src/orpc/middleware/prisma-error.ts` → 重命名为 `orm-error.ts`

**新建**：
- `zenstack/schema.zmodel`
- `src/orpc/middleware/orm-error.ts`（从 prisma-error.ts 改写）
- `src/orpc/middleware/auth.ts`
- `src/routes/login.tsx`
- `src/routes/demo/todos.tsx`（或升级现有 demo）

**修改**：
- `package.json`：deps + scripts + imports
- `src/db.ts`：PrismaClient → ZenStackClient
- `src/lib/auth.ts`：加 `database: pool`
- `src/lib/auth-client.ts`：补 baseURL
- `src/orpc/router/todos.ts`：真 DB + authed middleware
- `src/orpc/router/index.ts`：补 authMiddleware 注册（如果是集中注册模式）
- `src/env.ts`：加 3 个新变量
- `.trellis/spec/backend/database-guidelines.md`
- `.trellis/spec/backend/error-handling.md`

### 实施顺序（建议）

1. **依赖**：pnpm remove prisma 运行时依赖 + pnpm add ZenStack v3 + pg + dev deps
2. **Schema**：复制 schema.prisma → schema.zmodel，调整 datasource，`pnpm db:generate` 验证产物
3. **db.ts**：重写为 ZenStackClient；dev 启动验证 fail-fast
4. **错误映射**：orm-error.ts + 测试；跑 `pnpm test` 验证
5. **Better Auth 接 DB**：lib/auth.ts 加 `database: pool`；跑 `pnpm auth:migrate` 建表
6. **Auth middleware**：authed 过程 + getSession 集成
7. **Todo router 升级**：接 authed + 真 DB
8. **登录页 + Todo demo 页**：端到端联调
9. **spec 更新**：grep 残留 Prisma 字样；补写 ZenStack 章节
10. **手动验收**：跑完 AC 清单

### 参考链接（按出现顺序）

**ZenStack v3**：
- Quick Start: https://zenstack.dev/docs/quick-start
- 从 Prisma 迁移: https://zenstack.dev/docs/migrate-prisma
- ZModel 语法: https://zenstack.dev/docs/modeling/schema
- Multi-file Schema: https://zenstack.dev/docs/modeling/multi-file
- 错误类型: https://zenstack.dev/docs/orm/errors
- PostgreSQL multi-schema: https://zenstack.dev/docs/recipe/postgres-multi-schema
- Migrate 命令: https://zenstack.dev/docs/orm/migrate

**Better Auth**：
- Installation: https://better-auth.com/docs/installation
- PostgreSQL (Kysely 默认模式): https://better-auth.com/docs/adapters/postgresql
- Basic Usage (email/password): https://better-auth.com/docs/basic-usage
- CLI (migrate/generate): https://better-auth.com/docs/concepts/cli
- TanStack Start 集成: https://better-auth.com/docs/integrations/tanstack
- Reference / options: https://better-auth.com/docs/reference/options

**技术细节（Postgres SQLSTATE）**：
- https://www.postgresql.org/docs/current/errcodes-appendix.html

### 风险 / 待验证项

1. **ZenStack v3 CLI 子命令**：具体叫 `zen` 还是 `zenstack`？`zen db push` 还是 `zen migrate dev`？——以 `@zenstackhq/cli` 安装后 `--help` 为准
2. **ZenStack v3 fail-fast 连接 API**：是否有 `$connect()`？还是 lazy？如无则改用 "执行一次 SELECT 1" 作为启动自检
3. **Better Auth session 拿 headers 的方式**：Better Auth 1.5 对 TanStack Start 的 `headers` API 可能有更新——以官方 TanStack 集成文档为准
4. **两套 Kysely 实例**共享同一个 pg Pool 是否存在连接池耗尽风险——Pool size 需评估（默认 10，OK）
5. **Schema 布局**（Better Auth 是否用独立 PG schema）在实施开头先确认；参考 https://better-auth.com/docs/adapters/postgresql#use-a-non-default-schema
