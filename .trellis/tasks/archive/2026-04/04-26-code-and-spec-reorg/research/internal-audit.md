# 内部架构审计

> 范围：`src/` 全树深扫；剔除 PRD 已知（dead dirs / 单文件目录 / lib 散文件 / emails 双区 / better-auth 路径漂移）。
> 目的：列出 PRD 没覆盖到的、真正需要新决策的问题。
> 工具：Glob / Grep / madge / find / wc。

---

## 数据维度（量化）

### 文件数

| 范围 | 文件数 |
|---|---|
| `src/**/*.{ts,tsx}`（不含 paraglide / routeTree.gen） | 165 |
| 其中 madge 实际处理（去掉 22 个外部 deps refs） | 173 raw → 151 inscope |
| 测试文件（`*.test.ts(x)`） | **4**（覆盖率盲点） |

### 文件长度 Top 10（不含生成产物）

| 行数 | 文件 |
|---|---|
| 1079 | `src/routes/site/_layout/users/index.tsx` |
| 760 | `src/routes/(workspace)/_layout/organization/index.tsx` |
| 699 | `src/components/ui/sidebar.tsx`（shadcn vendor，可豁免） |
| 565 | `src/routes/(workspace)/_layout/teams/index.tsx` |
| 552 | `src/routes/site/_layout/organizations/index.tsx` |
| 537 | `src/seed.ts` |
| 525 | `src/routes/(workspace)/_layout/settings/organization/menus.tsx` |
| 522 | `src/routes/(workspace)/_layout/settings/organization/index.tsx` |
| 522 | `src/lib/auth/config.ts` |
| 521 | `src/components/auth/sign-up.tsx` |

> CLAUDE 规则：单文件 800 max。**1079 行的 `users/index.tsx` 已破线**；其余 522–760 行都在"需拆但还能忍"的灰区。

### 函数长度 Top（粗略 awk 计数，仅供参考）

| 行 | 函数 | 文件 |
|---|---|---|
| ≈328 | `UsersPage` | `src/routes/site/_layout/users/index.tsx:81` |
| 90  | `seedMenus` | `src/seed.ts` |
| 62  | `bootstrapSuperAdmin` | `src/seed.ts` |

> CLAUDE 规则：单函数 50 行 max；`UsersPage` 严重超标。

### madge 循环依赖

仅检测到 **1 处循环**，且来自生成产物：`routeTree.gen.ts ↔ router.tsx`（TanStack 框架自身环，无害）。
**业务代码无循环** ✓

### madge 孤立模块（orphan，无消费者）

新发现（PRD 未列）：

- `src/components/ui/breadcrumb.tsx`
- `src/components/ui/form.tsx`
- `src/components/ui/slider.tsx`
- `src/components/ui/switch.tsx`
- `src/config/index.ts`（barrel，0 引用）

PRD 已列：`zenstack/client.ts` / `data/demo-table-data.ts` / `lib/demo-store.ts`。

### 空目录（git 不可见，find 看到）

```
src/generated
src/orpc/router/organizations-admin
src/lib/server
src/lib/mcp
src/lib/observability
src/lib/menu
src/lib/errors
src/modules
```

> PRD 已知 `modules/`。其余 7 个均未列出——尤其 `src/lib/{errors,menu,mcp,observability,server}/` 是"按 PRD 决议要归位的目标位置"——目前**目录已建好但空着**，散文件还在 `src/lib/` 根。要么迁文件要么删空目录，二选一不能放任。

---

## 发现 1：`src/config/app.ts` 是 server-only，但 `src/config/index.ts` barrel 把它和前端可读 `telemetryConfig` 混 re-export

**位置**：
- `src/config/app.ts:1` — `import { hostname } from "node:os"`
- `src/config/index.ts:1-3` — `export { appConfig } ... export { logConfig } ... export { telemetryConfig }`

**证据**：

```ts
// src/config/app.ts
import { hostname } from "node:os";
// ...
export const appConfig = {
  // ...
  instanceId: env.APP_INSTANCE_ID ?? hostname(),
  // ...
} as const;

// src/config/index.ts
export { appConfig } from "#/config/app";
export { logConfig } from "#/config/log";
export { telemetryConfig } from "#/config/telemetry";
```

`src/lib/auth/config.ts:14-26` 的注释**明文承认**这条传染链：

> `Don't import appConfig here — it pulls node:os transitively and taints the client bundle whenever a route file imports a serverFn from this tree (see auth/session.ts).`

也就是说：`config/app.ts` 没标 `"@tanstack/react-start/server-only"`，barrel 又把它和前端可读模块混在一起——任何前端文件 `import { telemetryConfig } from "#/config"` 都会顺藤把 `node:os` 拉进客户端 bundle。当前 grep 显示**无人 barrel-import**（全部直 import 子模块），所以是埋雷未爆。

**严重度**：HIGH

**建议**：
- 给 `src/config/app.ts` 顶部加 `import "@tanstack/react-start/server-only"` 让 TanStack Start Import Protection 在 build-time 报错
- 拆分 barrel：`src/config/index.ts` 只 re-export 客户端可读的（`brand` / `telemetry`），server-only 的（`app` / `log`）由 server 路径直 import
- 或干脆删 barrel，强制全部具体路径 import（与现状一致）

---

## 发现 2：`src/routes/site/_layout/users/index.tsx` 单文件 1079 行，`UsersPage` 单函数 ≈328 行

**位置**：`src/routes/site/_layout/users/index.tsx:81-409`

**证据**：

- 文件总长 1079 行（CLAUDE 规则上限 800）
- `UsersPage` 函数从行 81 起约 328 行
- 内含 8 个子组件：`CreateUserDrawer`(411) `ChangeRoleDrawer`(511) `BanUserDrawer`(558) `EditUserDrawer`(600) `ResetPasswordDrawer`(705) `UserSessionsDialog`(781) `AddToOrganizationDrawer`(965)
- 1 个 util `formatDateTime`(941)

**严重度**：HIGH

**建议**：
- 抽 `src/routes/site/_layout/users/_components/{create-user-drawer,change-role-drawer,ban-user-drawer,edit-user-drawer,reset-password-drawer,user-sessions-dialog,add-to-organization-drawer}.tsx`——TanStack Router 下划线前缀目录不会被识别为路由
- `formatDateTime` 抽进通用 `src/lib/date.ts`（与发现 9 合并）

---

## 发现 3：`src/lib/auth/guards.ts` 没标 server-only，却 static import 了 server-only 的 `auth` / `getSessionUser`

**位置**：`src/lib/auth/guards.ts:1-5`

**证据**：

```ts
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "#/lib/auth/server";        // server-only 文件
import { getSessionUser } from "#/lib/auth/session"; // server-only 文件
```

文件自身**没有** `import "@tanstack/react-start/server-only"` 顶部 marker，注释解释依靠 TanStack Start compiler 把 `createServerFn(...).handler(...)` 体 strip 掉。前端 route（`(workspace)/_layout/settings/organization/index.tsx` 等）大量 `import { requireOrgMemberRole } from "#/lib/auth/guards"`。

**结论**：当前依靠 TanStack 编译器 + 注释惯例维持边界，没有静态 lint 把关。一旦 guards.ts 增加非 `createServerFn` 的顶层 export（比如 helper 常量），同样的 import 链可能让 `auth` 实例进客户端 bundle。

**严重度**：MEDIUM

**建议**：
- guards.ts 顶加 `import "@tanstack/react-start/server-only"`，与 `config.ts` / `server.ts` / `session.ts` 对齐
- 或在 spec `authorization-boundary.md` 写明："仅 `createServerFn` 包裹的导出可在路由文件 import；任何非 server-only marker 文件不得 import `#/lib/auth/{server,session}`"
- 加 Biome 自定义规则或 ESLint rule（`no-restricted-imports`）防止 client 路径直 import server-only 模块

---

## 发现 4：`src/components/` 命名风格三派混用（kebab / Pascal / 单词无连字符）

**位置**：全 components/ 树

**证据**（按风格分类）：

| 风格 | 数量 | 例子 |
|---|---|---|
| kebab-case | ~50 | `auth/sign-in.tsx` `email/email-styles.tsx` `settings/account/user-profile.tsx` |
| PascalCase | 8 | `layout/AppSidebar.tsx` `layout/OrganizationSwitcher.tsx` `LocaleSwitcher.tsx` `ThemeToggle.tsx` `UserPickerCombobox.tsx` |
| 单词无分隔 | ~30 | `ui/button.tsx`（shadcn）`auth/auth.tsx` `settings/settings.tsx` `settings/security/passkey.tsx` |

`src/components/layout/` 8 个文件**全部** PascalCase；其它子目录全是 kebab。`src/components/` 根下 PascalCase 与 kebab 混杂。

CLAUDE 规则要求"naming: 风格混用 = 不一致"——目前**没有 spec 明文裁定**（`frontend/component-guidelines.md` 与 `directory-structure.md` 均无 naming 条款）。

**严重度**：MEDIUM

**建议**：
- 在 `frontend/component-guidelines.md` 写入 naming 契约：默认 kebab-case，shadcn primitives 单词无分隔属 vendor 豁免
- 把 layout/ 8 个 PascalCase + 根下 4 个 PascalCase 改 kebab，import 一次性改完

---

## 发现 5：spec ↔ 实现漂移（除 PRD 已知 better-auth 路径外，至少 6 处）

PRD 已知：`frontend/directory-structure.md` 提 `src/integrations/better-auth/*` 实际不存在。

补充发现：

| spec 文件:行 | 写的是 | 实际 |
|---|---|---|
| `frontend/directory-structure.md:35` | `src/routes/demo.i18n.tsx` | 不存在 |
| `frontend/directory-structure.md:36` | `src/routes/demo/orpc-todo.tsx` | 不存在 |
| `frontend/directory-structure.md:44` | `src/components/Header.tsx` | 不存在 |
| `frontend/directory-structure.md:13-30` 顶层布局 | 漏了 `config/` `emails/` `stores/`；提了 `data/`（PRD 已删） | 漂 |
| `backend/directory-structure.md:18` | `src/routes/demo/api.mcp-todos.ts` | 不存在 |
| `backend/directory-structure.md:119` | `src/mcp-todos.ts` | 不存在 |

**严重度**：MEDIUM（spec 失真累积，新人 / AI 跟着 spec 走会犯迷糊）

**建议**：
- 移除所有 `demo.*` / `orpc-todo` / `Header.tsx` / `mcp-todos.ts` 引用
- 顶层布局图加上 `config/` `emails/` `stores/`，删掉 `data/`
- spec PR2 同步时一起改

---

## 发现 6：`src/components/email/` 与 `src/emails/` 共享 `email-styles.tsx`，但 R2 模板没 import EmailStyles

**位置**：

- `src/emails/invite-member.tsx`、`src/emails/transfer-ownership.tsx` —— 仅 import `cn`，**未** import `EmailStyles`
- `src/components/email/*.tsx` —— 全部 `import { EmailStyles, ... } from "./email-styles"`

**证据**：

```ts
// src/components/email/email-verification.tsx
import {
  EmailStyles,
  type EmailClassNames,
  type EmailColors,
  defaultColors,
} from "./email-styles";

// src/emails/invite-member.tsx — 看不到 EmailStyles，仍是 react-email，没注入 CSS shell
```

PRD 决议 R1 / R2 双区契约把 `email-styles.tsx` 视为 R1 区资产；R2 模板按设计应通过 `#/components/email/email-styles` 引用。**当前 R2 两个模板（invite-member / transfer-ownership）根本没 import `EmailStyles`**——没注入颜色 / 排版的统一 shell。视觉风格可能与 BA UI 模板不一致。

**严重度**：MEDIUM（用户感知风险：邀请邮件视觉与其他系统邮件不一致）

**建议**：
- R2 两个模板补 `import { EmailStyles, ... } from "#/components/email/email-styles"` 并在 `<Head>` 注入
- 写 spec 把"R2 必须 import EmailStyles"列为契约
- 可能与 PRD Out of Scope 的"品牌色统一注入"任务合并

---

## 发现 7：测试覆盖盲点（关键 module 完全无测试）

**位置**：现有 4 个 test 文件：

```
src/lib/error-report.test.ts
src/lib/zenstack-error-map.test.ts
src/orpc/middleware/orm-error.test.ts
src/orpc/middleware/rbac-policy.test.ts
```

**缺测试的关键模块**：

| 模块 | 关键性原因 |
|---|---|
| `src/lib/auth/config.ts`（522 行） | BA 全部 hooks（personal org provisioning、dev auto-verify、session.create.before 兜底）都在这里——BA upgrade / 业务改 plan 时回归首选 |
| `src/lib/auth/session.ts` | RBAC 认证抽取 + ZenStack policy 注入参数构造，oRPC + serverFn 都依赖 |
| `src/lib/auth/guards.ts` | UX-only 路由守卫，redirect 行为分支密 |
| `src/lib/email/templates.tsx`（298 行） | 9 模板的 discriminated union 分发；改邮件结构最容易回归 |
| `src/lib/email/transport.ts` | console / smtp / resend 三 driver 选择 + `APP_ENV=prod && EMAIL_TRANSPORT=console` boot 失败 guardrail |
| `src/lib/email/localization.ts` | 9 模板的 i18n key 工厂，paraglide 串接 |
| `src/lib/server-fn-middleware.ts` | DB unavailable 检测正则 + Sentry flush + process.exit 协同——错过会让生产 hang 而不是 fail-fast |
| `src/lib/logger.ts` | 多 transport（dev pretty / prod stdout / pino-roll file）+ OTel trace 注入 |
| `src/utils/mcp-handler.ts` | InMemoryTransport 桥接，handler 内部错误返回结构 |
| `src/stores/menu.ts` | `parseMenuMeta` 类型守卫（13 个 boolean / string 字段）—— ZenStack JsonValue 进 store 之前 |

**严重度**：MEDIUM（不属于 reorg 任务范围，但顺手记录）

**建议**：reorg PR 完成后另开 task 补 transport / templates / config / server-fn-middleware 的单元测试。

---

## 发现 8：`src/components/auth/` 多个文件 import `"../ui/label"` 而非别名

**位置**：

- `src/components/auth/magic-link.tsx:17`
- `src/components/auth/reset-password.tsx:24`
- `src/components/auth/forgot-password.tsx:18`
- `src/components/auth/sign-up.tsx:30`

**证据**：

```ts
import { Label } from "../ui/label";
```

而 `auth/sign-in.tsx`（同目录、同上下文）则全用 `#/components/ui/...` 别名。同目录内部不一致。

**严重度**：LOW

**建议**：统一改成 `#/components/ui/label`，与项目"`#/*` 别名是单一正路"约定对齐（CLAUDE.md 明文）。

---

## 发现 9：`src/router.tsx` / `src/routes/__root.tsx` 用相对路径 import integrations

**位置**：

- `src/router.tsx:3` — `from "./integrations/tanstack-query/root-provider"`
- `src/router.tsx:4` — `from "./routeTree.gen"`
- `src/routes/__root.tsx:17` — `from "../integrations/tanstack-query/devtools"`
- `src/routes/__root.tsx:18` — `from "../styles.css?url"`
- `src/db.ts:7` — `from "../zenstack/schema"`

**证据**：项目其它地方一律 `#/*` 别名，仅这几处保留相对路径。`db.ts` 引用 `../zenstack/schema` 是因为 `zenstack/` 在 src 外、`#/` 别名指向 `src/`，所以无法用别名——可豁免；其余 4 处可改别名。

**严重度**：LOW

**建议**：四处改成 `#/integrations/...` `#/styles.css?url` `#/routeTree.gen`；`zenstack/` 那一处保留相对路径（约定 `#/` = `src/`）。

---

## 发现 10：`src/integrations/tanstack-query/root-provider.tsx` 含一个空函数死 export

**位置**：`src/integrations/tanstack-query/root-provider.tsx:10`

**证据**：

```ts
export function getContext() { /* 真在用 */ }
export default function TanstackQueryProvider() {} // ← 空函数 default export
```

`grep -rn TanstackQueryProvider src` 仅返回声明本身，**0 处 import**。看起来是 TanStack Start scaffold 留下的空壳。

**严重度**：LOW

**建议**：删掉 default export 那一行；保留 `getContext()`。

---

## 发现 11：`src/components/ui/{breadcrumb,form,slider,switch}.tsx` 是死代码

**位置**：见 madge orphan 列表

**证据**：`grep` 只在自身文件出现。不属于业务调用链。

**严重度**：LOW（shadcn 习惯：先安装再用）

**建议**：
- 选 A：删掉，将来再 `pnpm dlx shadcn@latest add` 拉回
- 选 B：保留作为 vendor 库存

无论如何，PR1 的"清理 demo / 死文件"清单可顺手覆盖。

---

## 发现 12：`src/polyfill.ts` 是 Node 18 兼容垫片，注释说仅 Stackblitz 需要

**位置**：`src/polyfill.ts` 全文 + `src/routes/api.$.ts:1` `src/routes/api.rpc.$.ts:1`

**证据**：

```ts
/**
 * This file aims to polyfill missing APIs in Node.js 18 that oRPC depends on.
 * Since Stackblitz runs on Node.js 18, these polyfills ensure oRPC works in that environment.
 * If you're running oRPC locally, please use Node.js 20 or later for full compatibility.
 */
import { File } from "node:buffer";
if (typeof globalThis.File === "undefined") {
  globalThis.File = File as unknown as typeof globalThis.File;
}
```

`package.json` 没有 `engines.node` 字段——没有强制 Node 版本。如果生产部署 Node 20+（`globalThis.File` 自带），polyfill 是 noop；如果还可能在 Node 18 跑（CI / Stackblitz demo），保留有意义。但 oRPC 路由强行 import，污染冷启动时间。

**严重度**：LOW

**建议**：
- 在 `package.json` 加 `engines: { node: ">=20" }` 强制版本约束
- 删除 `src/polyfill.ts` + 两处 import；或保留并在 spec `backend/directory-structure.md` 写明"Stackblitz 兼容垫片"是有意保留

---

## 发现 13：`new Date(...).toLocaleString()` / `toLocaleDateString()` 在 9 个地方独立写

**位置**：

- `src/routes/site/_layout/users/index.tsx:221, 943`
- `src/routes/site/_layout/organizations/index.tsx:173`
- `src/routes/(workspace)/_layout/organization/index.tsx:444, 721`
- `src/routes/(workspace)/_layout/teams/index.tsx:205, 477`
- `src/routes/(workspace)/_layout/invitations/index.tsx:100`
- `src/components/settings/security/passkey.tsx:33`
- `src/components/settings/security/active-session.tsx:11`（`timeAgo` 自己用 `Intl.RelativeTimeFormat`）

**证据**：每个 cell 自己 `{new Date(row.original.createdAt).toLocaleString()}`，无共享 helper。`active-session.tsx:11` 单独实现 `timeAgo`，`users/index.tsx:941` 单独实现 `formatDateTime`。

**严重度**：LOW

**建议**：抽 `src/lib/date.ts`：`formatDateTime(value)` / `formatDate(value)` / `timeAgo(date)`，全部 `try/catch` 包装。改 9 处。

---

## 发现 14：`APP_ERROR_MESSAGES`（`src/lib/zenstack-error-map.ts`）与 `base.errors`（`src/orpc/errors.ts`）文案重复

**位置**：

- `src/orpc/errors.ts:6-58`（oRPC `os.errors({...})` 8 个 code → message）
- `src/lib/zenstack-error-map.ts:4-13`（`APP_ERROR_MESSAGES` 同 8 个 code → 同样英文）

**证据**：

```ts
// orpc/errors.ts
BAD_REQUEST: { status: 400, message: "Bad request." },
UNAUTHORIZED: { status: 401, message: "Authentication required." },
// ...

// lib/zenstack-error-map.ts
export const APP_ERROR_MESSAGES = {
  BAD_REQUEST: "Bad request.",
  UNAUTHORIZED: "Authentication required.",
  // ... 完全同样的字符串
};
```

8 行字符串文案两处独立维护。两份同步靠人工。

**严重度**：LOW

**建议**：提取常量 `APP_ERROR_MESSAGES` 为单一真相源，`base.errors({})` 引用之。

---

## 发现 15：`src/components/ui/sidebar.tsx` import `#/hooks/use-mobile`——`useIsMobile` 仅 1 处使用

**位置**：

- `src/hooks/use-mobile.ts`（22 行）
- `src/components/ui/sidebar.tsx:21,65`（唯一消费者）

**证据**：`grep -rn 'useIsMobile' src` 共 3 行：1 声明 + 1 import + 1 调用。

**严重度**：LOW

**说明**：PRD 已说"hooks/ 单文件目录暂留"。我补充一条信息：唯一消费者也是 shadcn vendor，hooks/ 目录到目前为止 **零自家业务消费**——是否真有"将来会增长"的把握需要主人判断。

**建议**：维持 PRD 决议（暂留），但 spec `frontend/hook-guidelines.md` 写明现状。

---

## 发现 16：`src/zenstack/` 目录除了 0 引用的 `client.ts`，整目录没业务文件

**位置**：

- `src/zenstack/client.ts`（PRD 已知，要删）
- `src/zenstack/` 目录除此**没别的文件**——确认是孤目录

**证据**：`ls src/zenstack/ → client.ts`。

**严重度**：LOW（PRD 已经处理）

**建议**：PR1 删 `client.ts` 的同时，让 `src/zenstack/` 目录一并消失（与 `src/modules/` 同处理）。**注意区分** `src/zenstack/`（src 内）与项目根的 `zenstack/`（schema 工件目录）——同名但完全不同物。

---

## 严重度汇总

| 严重度 | 计数 | 编号 |
|---|---|---|
| HIGH | 2 | 1, 2 |
| MEDIUM | 5 | 3, 4, 5, 6, 7 |
| LOW | 9 | 8, 9, 10, 11, 12, 13, 14, 15, 16 |

> PRD 范围内 reorg 应优先吃 HIGH（发现 1 server-only 边界 + 发现 2 拆 users/index.tsx）+ MEDIUM 中"低成本同步项"（发现 5 spec drift / 发现 4 命名 / 发现 6 R2 邮件 styles）。
> 发现 7（测试盲点）建议另开 task。

---

## 修订记录

### 发现 3（MED-3）撤回：`lib/auth/guards.ts` 不要加 server-only marker

**原建议**：给 `src/lib/auth/guards.ts` 顶部加 `import "@tanstack/react-start/server-only"`，与 `auth/{config,server,session,db}.ts` 对齐。

**根因（错判）**：审计当时把 guards.ts 当成"普通 server module"——它 static import 了 server-only 的 `#/lib/auth/server` + `#/lib/auth/session`，在普通模块里这就是 leak。但 guards.ts 的实际语义是 **`createServerFn` RPC 桥工厂**：它的所有 export 都是 `createServerFn(...).handler(async () => ...)` 包裹的产物，TanStack Start 编译器会在 client bundle 里把 handler body 剥成 RPC 桩，留下"调用桩 → server endpoint"的薄壳——这是同构 RPC 桥的预期工作模式，**不是** server-only 模块。

PR2 阶段实测加 marker 后触发 **5 处** import-protection denial：

- `routes/(workspace)/_layout/settings/organization/index.tsx`
- `routes/(workspace)/_layout/organization/index.tsx`
- `routes/(workspace)/_layout/teams/index.tsx`
- `routes/(workspace)/_layout/invitations/index.tsx`
- `routes/site/_layout/users/index.tsx`

正因为 client route 的 `beforeLoad` 里 import guards.ts 是预期使用模式，加 marker 反而把 RPC 桥本身 break 了。

**正确做法**：在 spec `frontend/directory-structure.md` § "决策记录 / Pitfalls" 写明此反范式警告，让后续 AI / 新人看到该文件不要轻易加 marker。真正的 server-only 模块清单：`auth/server.ts`、`auth/session.ts`、`auth/config.ts`、`auth/db.ts`。

**经验规则**：判断"该不该加 server-only marker"的关键不是"它 import 了什么 server-only"，而是"它的所有顶层 export 是不是 createServerFn 包裹"。前者是 module-level 防火墙，后者是 RPC 桥——两种语义不能混。

