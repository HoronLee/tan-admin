# Directory Structure

> Frontend code organization and placement rules for this TanStack Start codebase. Reflects post-reorg layout (PR1 + PR2, 04-26 task).

---

## Overview

Frontend and backend share `src/`; placement is by runtime role. For backend role (routes API, oRPC, ZenStack, MCP) see `backend/directory-structure.md`. This spec covers browser UI, client helpers, route trees, and the four horizontal layers (`server` / `middleware` / `orpc` / `queries`).

## Top-Level Layout (`src/`)

10 一级目录 + 入口文件 + 生成产物。布局如下：

```text
src/
├── components/        # UI（含 ui/ data-table/ layout/ settings/ user/ auth/ email/）
├── routes/            # TanStack Router 文件路由
├── server/            # createServerFn 业务（按 domain 组织，含 seed.ts）
├── middleware/        # TanStack Start createMiddleware（auth / error / logging）
├── orpc/              # oRPC routers + 自身 middleware（domain 分组）
├── queries/           # queryOptions 工厂（按 domain 组织，跨 route+组件复用）
├── lib/               # 第三方实例 + 配置 + 业务 helpers
├── stores/            # @tanstack/store 全局状态（menu / tabbar 等）
├── emails/            # 项目自定义邮件模板（R2 区，参 backend/email-infrastructure.md）
├── hooks/             # 自定义 hook 工厂 / context（demo.form-* 等）
├── integrations/      # 第三方 UI 集成（tanstack-query/ + zenstack-query/）
├── paraglide/         # i18n 生成产物（do not edit）
├── generated/         # 其他生成产物（do not edit）
├── polyfill.ts        # oRPC 路由 Node 18 垫片
├── router.tsx         # router + SSR query integration
├── routeTree.gen.ts   # 生成产物（do not edit）
├── server.ts          # TanStack Start server entry
├── start.ts           # bootstrap shim
└── styles.css         # Tailwind entry + CSS tokens
```

`lib/` 子目录 + 根文件：

```text
src/lib/
├── auth/              # Better Auth 模块（config / server / codegen / client / session / errors / guards / plan / db）
├── email/             # 邮件 transport + templates + localization
├── errors/            # error-report / zenstack-error-map（含测试）
├── mcp/               # MCP handler（lib/mcp/handler.ts）
├── menu/              # menu-label
├── observability/     # logger / sentry.client
├── db.ts              # 全局 pg.Pool + ZenStackClient + authDb（server-only）
├── env.ts             # T3Env zod schema
├── config.ts          # client-safe brandConfig（仅 VITE_BRAND_*）
├── config.server.ts   # server-only appConfig + logConfig + telemetryConfig
└── utils.ts           # cn helper
```

PR1/PR2 后**已消失**的旧路径：`src/utils/`、`src/data/`、`src/modules/`、`src/zenstack/`、`src/config/`、`src/db.ts`、`src/env.ts`、`src/seed.ts`、`src/lib/server-fn-middleware.ts`、`src/lib/error-report.ts`（旧位置）、`src/lib/logger.ts`（旧位置）、`src/lib/menu-label.ts`（旧位置）、`src/utils/mcp-handler.ts`、`src/lib/demo-store.ts`、`src/data/demo-table-data.ts`。

## 四目录边界：server / middleware / orpc / queries

水平四层把所有"业务侧 server-side & 数据访问"代码切干净。**写一个新业务时按下表选目录**：

| 目录 | 工具 | 职责 | 示例（光伏电站平台） |
|------|------|------|------|
| `src/server/` | `createServerFn` | 路由 loader / action 紧耦合的业务 server functions | dashboard route 的 prefetch、工单提交表单 action、seed |
| `src/middleware/` | `createMiddleware`（TanStack Start） | 跨 server function 复用的拦截器 | `auth.ts` / `error.ts` / `logging.ts` |
| `src/orpc/` | oRPC | 跨组件复用的 typed RPC 业务动作（含 oRPC 自己的 middleware 链） | 告警确认 / 派单 / 报表导出 / 复杂功率聚合查询 |
| `src/queries/` | `queryOptions` factory | 跨 route loader + 组件 + 弹窗复用的 query 单元，统一 queryKey 命名空间 | 电站列表、设备列表、告警列表的 queryOptions |

ZenStack RPC（`/api/model/**`）是底层 entity CRUD 通道，由 ZenStack 生成 + policy 兜底，**不在上述四个目录里写代码**——业务侧通过 `useZenStackQueries()` 间接使用，必要时用 `queries/` 包一层做缓存键统一。

类比：server fn = "Gin handler 紧绑路由"，oRPC = "纯 gRPC contract"，queries/ = "前端缓存键命名空间"——三者共存不互斥。决策树详见 [`guides/server-fn-vs-orpc-vs-queries.md`](../guides/server-fn-vs-orpc-vs-queries.md)。

## `lib/` 子目录化范式

`lib/<infra-domain>/` 收容第三方 SDK 胶水 + 跨切关注点。当前生效目录：

- `lib/auth/` — Better Auth 全部资产
- `lib/email/` — 邮件 transport / templates / localization
- `lib/errors/` — `error-report.ts`、`zenstack-error-map.ts`（含 colocated test）
- `lib/mcp/` — `handler.ts`（JSON-RPC ↔ MCP server 桥）
- `lib/menu/` — `menu-label.ts`
- `lib/observability/` — `logger.ts`、`sentry.client.ts`

`lib/` 根仅留 5 个文件：`db.ts` / `env.ts` / `config.ts` / `config.server.ts` / `utils.ts`。**`lib/` 不收业务域代码**——`lib/` 是基础设施定位，业务代码进 `server/` / `orpc/` / `queries/` / `components/` / `routes/`。

## `config.ts` 与 `config.server.ts` 分层契约

替代旧 `src/config/` barrel（曾经的 server/client 模块混 re-export 隐患，HIGH-1 修复）。两文件契约：

| 文件 | 顶部 marker | 内容 | 谁可以 import |
|------|------------|------|--------------|
| `lib/config.ts` | （无） | client-safe，仅 `VITE_*` 派生（`brandConfig`） | 任意文件 |
| `lib/config.server.ts` | `import "@tanstack/react-start/server-only"` | `appConfig`（含 `node:os.hostname()`）+ `logConfig` + `telemetryConfig` | 仅 server-only 模块（`lib/observability/logger.ts`、邮件 transport / templates 等） |

```ts
// src/lib/config.ts (client-safe)
import { env } from "#/lib/env"
export const brandConfig = {
  name: env.VITE_BRAND_NAME ?? "Tan Servora",
  logoURL: env.VITE_BRAND_LOGO_URL,
  logoDarkURL: env.VITE_BRAND_LOGO_DARK_URL,
} as const

// src/lib/config.server.ts (server-only)
import "@tanstack/react-start/server-only"
import { hostname } from "node:os"
import { brandConfig } from "#/lib/config"
export const appConfig = { ..., instanceId: env.APP_INSTANCE_ID ?? hostname(), brand: brandConfig }
```

Client 文件 `import { brandConfig } from "#/lib/config"`；server 文件按需 `import { appConfig } from "#/lib/config.server"`。任何 client 路径误 import server 文件 → Import Protection build-time 报错。

## 域边界（不预设 `domains/` 或 `modules/`）

水平四层（queries / server / orpc / components）已经把每个业务域天然横切到位。`src/modules/` 在 PR1 删除，**不**新建 `domains/` 或任何替代占位目录。

域私有代码（schema / 状态机 / 计算器 / 私有 hook）的归宿**留给具体业务接入时再决定**——本布局不预设规则、不当下回答，避免在没有真实业务样本的情况下硬编结构。`lib/` 保持基础设施定位，不收纳业务域代码。

## Import Alias (`#/*`)

用 `#/*` 跨模块 import。runtime 真源是 `package.json#imports`；TypeScript bundler resolution 对齐。

```json
// package.json
"imports": {
  "#/*": "./src/*"
}
```

```ts
// 调用方
import { db } from "#/lib/db"
import { brandConfig } from "#/lib/config"
import { appConfig } from "#/lib/config.server"
import router from "#/orpc/router"
```

不要用 `tsconfig.json#paths`——本项目刻意用 `package.json#imports` 让 Node.js（seed、tsx 脚本）和 bundler 一致解析。

## Route Naming Conventions

两种风格并存：

- **Flat dot style** 适合一组共享前缀的兄弟：`api.rpc.$.ts` → `/api/rpc/$`、`api.$.ts` → `/api/$`
- **Directory style** 适合特性深路由：如 `routes/site/_layout/users/index.tsx`

```ts
createFileRoute('/site/_layout/users/')
createFileRoute('/api/rpc/$')
```

**`_layout.tsx` nesting rule**：共享 `_layout.tsx` 的页面必须放进 `_layout/` 子目录——否则 `parentRoute` 解析为 `__root__`，共享 layout 不生效。

**路由内私有目录命名**：route 子目录隐藏写 `-<name>/`（如 `users/-components/`），TanStack Router 默认 `routeFileIgnorePrefix: "-"` 让整子树自动排除路由树。**禁止**用 `_<name>/`（会被路由树误扫并 warn）。

## Generated Artifacts (Do Not Edit)

- `src/routeTree.gen.ts` — TanStack Router
- `src/paraglide/**` — Paraglide i18n runtime
- `src/generated/**` — 其他生成产物
- `zenstack/{schema,models,input}.ts` — ZenStack（仓库根目录，git-ignored）

通过 tooling（`pnpm dev` / `pnpm build` / `pnpm db:generate`）重生成，永不手编。

## Concern-to-Directory Mapping

- **Auth**：runtime instance `src/lib/auth/server.ts`（消费 `src/lib/auth/config.ts`）；client hook `src/lib/auth/client.ts`；BA UI hooks 直接放在用它的 `components/auth/` `components/settings/` 文件里 import；error translator `src/lib/auth/errors.ts`。
- **Database**：schema `zenstack/schema.zmodel`（仓库根）；runtime singleton `src/lib/db.ts`；生成产物 `zenstack/*.ts`（git-ignored）。
- **i18n**：components/routes 从 `#/paraglide/messages`（编译消息函数）和 `#/paraglide/runtime`（`getLocale` / `setLocale`）import。
- **Class merging**：单一 helper `src/lib/utils.ts`（`cn`）——永不内联重复。

```ts
// src/lib/auth/client.ts
export const authClient = createAuthClient()
const { data: session, isPending } = authClient.useSession()

// src/components/LocaleSwitcher.tsx
import { getLocale, locales, setLocale } from '#/paraglide/runtime'
import * as m from '#/paraglide/messages'

// src/lib/utils.ts
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

## 决策记录 / Pitfalls

### `lib/auth/guards.ts` 不要加 server-only marker

不要给 `src/lib/auth/guards.ts` 加 `import "@tanstack/react-start/server-only"` marker——guards.ts 通过 `createServerFn` 导出的 `requireSiteAdmin` / `requireOrgMemberRole` 是同构 RPC 桥；TanStack Start 编译器在 client bundle 中会把 handler body 剥成 RPC 桩，所以 client route 的 `beforeLoad` import 它是预期使用模式，不是 leak。曾在 04-26 reorg 任务尝试加 marker，触发 5 处 import-protection denial。

真正的 server-only 模块是 `auth/server.ts`、`auth/session.ts`、`auth/config.ts`、`auth/db.ts` 这几个；guards.ts 只是它们的 RPC 桥工厂。
