# Design: 架构分层整理与项目状态完善

## Current Architecture State

tan-servora 当前更接近“可继续接业务的全栈脚手架底座”，不是业务系统中期：

- identity layer 已成型：Better Auth admin / organization / multi-session、产品模式、personal org、plan gating、邮件基础设施、BA UI 组件。
- data layer 已成型但业务样本很少：ZenStack v3 + PolicyPlugin + `/api/model/**` 已存在，但当前业务模型基本只有 `Menu`。
- action layer 已成型：oRPC + middleware + typed errors + TanStack Query utils 已存在。
- view layer 已有 site/workspace/auth/marketing 路由和 shadcn shell，但多个页面仍把 query/mutation/form mapping/view 混在一个 route 文件中。
- spec 体系已覆盖 backend/frontend/guides，但有升级后的 API 漂移。

## Target Layer Contract

### 1. ZenStack CRUD Layer

Owner: `zenstack/schema.zmodel`, `src/routes/api/model/$.ts`, `src/integrations/zenstack-query/client.ts`.

Responsibilities:

- 单模型 CRUD。
- row/field-level access control。
- 租户隔离和业务表状态约束。
- mutation 后由 ZenStack Query hooks 自动 invalidation。

Rules:

- 新业务表先进入 `zenstack/schema.zmodel` 并写 policy。
- 可由 policy 表达的 `findMany/create/update/delete` 不新建 oRPC procedure。
- `authDb.$setAuth(...)` 的字段必须足够表达 policy。

### 2. oRPC Business Action Layer

Owner: `src/orpc/router/*`, `src/orpc/middleware/*`, `src/orpc/client.ts`.

Responsibilities:

- BA `@@ignore` 表的管理包装，例如 `organizationsAdmin`。
- 跨模型事务、批处理、导出、外部服务动作。
- 派生查询，例如 `getUserMenus` 需要 BA `hasPermission` 与 menu tree 过滤。
- 统一 typed errors，供 `reportError` / mutation onError 使用。

Rules:

- oRPC 可以读写 ZenStack `context.db`，但不作为普通 CRUD 的默认入口。
- oRPC query/mutation 在前端用 `.queryOptions()` / `.mutationOptions()` / `.key()`，不要手写 `["orpc"]` 这种宽泛 key。
- 复杂领域规则先抽 handler-local helper；复用后再提升为 domain service/helper。

### 3. Server Function Layer

Owner: `src/server/*`, `src/lib/auth/guards.ts`, `src/middleware/*`.

Responsibilities:

- route loader / beforeLoad / action 紧耦合能力。
- 只由当前 TanStack Start app 调用的 server-side RPC。
- route UX gate，例如 `requireSiteAdmin`、`requireOrgMemberRole`。

Rules:

- 采用 TanStack Start 当前 `.validator(...)` API。
- 复杂 server function 文件按官方推荐拆成：
  - `*.functions.ts`：safe-to-import wrapper。
  - `*.server.ts`：server-only DB/helper。
  - 普通 `*.ts`：client-safe schema/types/constants。
- beforeLoad 只做 UX gate，真实数据边界仍在 BA API / ZenStack policy / oRPC middleware。

### 4. Query Factory Layer

Owner: `src/queries/*`.

Responsibilities:

- 跨 route/component/drawer 复用的 TanStack Query option factories。
- 统一 queryKey 和 invalidation prefix。
- oRPC/query client wrappers，不承载视图状态。

Rules:

- 普通 `queryOptions` 工厂不能调用 React hooks，包括 `useZenStackQueries()`。
- 合法数据源：
  - oRPC client `.call()` / `.queryOptions()` 包装。
  - Better Auth client SDK 包装。
  - server function wrapper。
- ZenStack generated hooks 只能在 component/custom hook 中调用。若需要跨入口 queryOptions 复用，应新增薄 oRPC read procedure 或保留组件直用 ZenStack hooks。

### 5. Route / View Layer

Owner: `src/routes/**`, `src/components/**`.

Responsibilities:

- route 文件：路由声明、loader/beforeLoad、页面级组合、少量本页 state。
- route-private components：表格、drawer/dialog、表单。
- pure components：无业务数据源的 UI 组件。

Rules:

- route 文件超过约 500 行并同时含 query/mutation/form/dialog/table 时，优先拆 route-private components。
- route 文件不直接 import `#/lib/db` / `#/lib/auth/server` / `#/lib/observability/logger`。
- client component 只 import client-safe config/types/helpers。

## Menu Boundary Design

### Problem

Before this task, menu management gate and data policy disagreed:

- UI gate: workspace owner can enter menus page.
- ZenStack policy: only site admin can write `Menu`.

### Recommended Direction

Allow both:

- site admin: for private deployment support / platform maintenance.
- active workspace owner: for workspace-owned menu customization.

Implementation shape:

1. Extend `type Auth` in `zenstack/schema.zmodel` with fields needed for menu policy, likely:
   - `activeOrganizationId String?`
   - `activeOrganizationRole String?` or `isOrgOwner Boolean?`
2. Extend `AuthSessionContext.policyAuth` in `src/lib/auth/session.ts`.
3. Resolve active member role once per request using Better Auth API or a direct BA-table read through shared pool.
4. Pass the expanded policyAuth through:
   - `src/orpc/middleware/auth.ts`
   - `src/routes/api/model/$.ts`
5. Update `Menu` policy:
   - read remains any authenticated user.
   - write allowed for site admin.
   - write allowed for active org owner when `organizationId == auth().activeOrganizationId` or global menu semantics are explicitly permitted.

Compatibility concern:

- Existing seed menus have `organizationId = null`. If owner edits global seed menu, the policy needs an explicit rule. Safer first rule: only site admin can edit global menus; org owner can edit org-scoped menus. The current UI may need to show global menus read-only for owner.

## Menu CRUD Migration Design

Before this task, oRPC `menus.ts` was plain CRUD. Target:

- Keep `getUserMenus` in oRPC.
- Move menu management page to `useZenStackQueries().menu.useFindMany/useCreate/useUpdate/useDelete`.
- Use ZenStack mutation auto invalidation for menu CRUD.
- After menu mutation, invalidate `orpc.getUserMenus.key()` so sidebar refetches filtered menu tree.

Applied migration:

1. Fixed policy/auth context first.
2. Changed menus page from oRPC CRUD to ZenStack hooks.
3. Removed `createMenu/updateMenu/deleteMenu/getMenu/listMenus` from oRPC router after callers were gone.
4. Kept `getUserMenus` in oRPC as the sidebar permission-filtered derived query.

## Query Extraction Design

First practical target: organizations admin list.

Current consumers:

- `src/routes/site/_layout/organizations/index.tsx`
- `src/routes/site/_layout/users/-components/add-to-organization-drawer.tsx`

Create:

```ts
src/queries/organizations-admin.ts
```

Exports:

- `organizationsAdminListQueryOptions()`
- `organizationsAdminKey()`

Uses official oRPC `.queryOptions()` / `.key()` to avoid drift.

## Import Boundary Design

The logger build warning likely comes from server-only modules being statically referenced by files that also produce client artifacts. TanStack Start may tree-shake the actual server code, but docs recommend eliminating unsafe edges where possible.

Preferred fixes:

1. Audit route/client-reachable files importing server-only modules.
2. Keep server-only imports inside `createServerFn().handler(...)` where compiler can prune them, or split wrappers and helpers.
3. Add `import "@tanstack/react-start/server-only"` to server-only logger if not already present; if that creates a build violation, use it to trace the surviving client path and split that file.

Actual boundary fixes applied:

- `src/middleware/error.ts` no longer statically imports the logger; the logger is loaded dynamically only on the server error path.
- `src/orpc/client.ts` no longer runtime-imports `#/orpc/router`; client/SSR callers use `RPCLink`, while API route files own the in-process router.
- `src/integrations/zenstack-query/client.ts` stays schema-only and does not import `#/lib/db` / `@zenstackhq/orm` for generic inference.
- `vite.config.ts` shims the bare `@zenstackhq/orm` entry only for client builds because ZenStack TanStack Query imports that barrel indirectly for operation constants; SSR/server imports still resolve to the real ORM.

## Spec Sync

Required spec updates:

- `guides/server-fn-vs-orpc-vs-queries.md`
- `frontend/hook-guidelines.md`
- `frontend/state-management.md`
- `backend/error-handling.md`
- `backend/quality-guidelines.md`
- `src/queries/README.md`

## Rollback Notes

- Auth context / zmodel changes can break generated policy evaluation. Keep this as one patch with tests and `pnpm db:generate` if schema generation is required.
- Menu CRUD migration can be reverted independently if route behavior regresses.
- Query extraction is low risk and can be reverted without DB impact.
- Import-boundary fix should be validated by `pnpm build` warning output.
