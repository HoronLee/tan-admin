# 架构分层整理与项目状态完善

## Goal

把当前 tan-servora 从“基础设施型脚手架已搭好”推进到“分层边界可复制、可作为业务接入样板”的状态。

本任务要同时交付三类结果：

1. 用当前代码和外部文档证据说明项目进行到哪一步。
2. 识别并修复会影响后续业务接入的分层问题，尤其是 oRPC、ZenStack CRUD、数据库操作、server functions、queries、route/view 的职责边界。
3. 同步项目 spec，使未来新业务按同一套边界落地，而不是继续把查询、业务逻辑、表单映射和视图混在 route 文件里。

## Confirmed Facts

- 当前 Trellis 无 active task，本任务创建前工作树只有 `.codegraph/daemon.pid` 未跟踪；`main` 比 `origin/main` ahead 6。
- 2026-06-19 验证结果：
  - `pnpm check` 通过。
  - `pnpm test` 通过，6 个测试文件、40 个测试。
  - `pnpm exec tsc --noEmit` 通过。
  - `pnpm build` 通过。
- 本任务前 `pnpm build` 有架构警告：client build 期间 Vite 提示 `src/lib/observability/logger.ts` import 的 `node:module` 被 browser compatibility externalize。当前已通过 server-only logger 标记、server error path 动态导入、oRPC client runtime router import 移除和 ZenStack client shim 清理；最新 `pnpm build` 不再出现该 logger/server-only 边界警告，只剩 chunk-size 提示。
- 当前业务表基本只有 `Menu`：`zenstack/schema.zmodel` 只有 `Menu` 作为业务模型，Better Auth 表通过 `_better-auth.zmodel` shadow 且 `@@ignore`。
- 当前双栈已经存在：
  - ZenStack CRUD：`src/routes/api/model/$.ts` + `useZenStackQueries()`。
  - oRPC：`src/orpc/router/*` + `src/routes/api.rpc.$.ts`。
  - Better Auth：`src/routes/api/auth/$.ts`。
- `organizations-admin` 留在 oRPC 是合理的：它操作 Better Auth 管理的 `organization/member/team/invitation` 表，这些表在 ZenStack 中 `@@ignore`，并且需要 super-admin guard、产品模式 guard、事务删除和 BA API 错误归一。
- 本任务前 `src/orpc/router/menus.ts` 里的 `list/get/create/update/delete` 是单模型 CRUD，却放在 oRPC；当前已删除该 CRUD router，菜单管理页改为 ZenStack generated hooks，oRPC 只保留 `getUserMenus` 派生查询。
- 本任务前菜单管理页存在权限不一致：
  - route gate 允许 workspace owner 进入。
  - `Menu` policy 只允许 `auth().isAdmin == true` 写入。
  - `policyAuth` 当前只传 `userId/isAdmin`，没有 active org / member role，因此 org owner 无法在 ZenStack policy 中被表达。
- 当前已把 active org id / role 桥接进 `policyAuth`，`Menu` policy 允许 site-admin 写入，也允许 active workspace owner 写入本 org scoped menu；owner 不能写全局 menu。
- 收尾 review 补了两个 policy 漏洞：(1) ZenStack v3 `update` 规则只看更新前状态且 `'all'` 不展开到 `post-update`，owner 原本可把 org 菜单 `organizationId` 改成 null/别的 org 逃逸作用域——已补 `post-update` 规则（admin 可 re-scope，owner 更新后必须留在本 org）；(2) `Menu` 读规则原为 `auth() != null` 全放行，org-scoped 菜单会泄漏到其他 org 的 `getUserMenus`/侧边栏——读规则收紧为"全局行人人可读，org 行仅本 org 可读，admin 全读"。两者均有 RBAC 集成测试覆盖。
- 收尾 review 同时落地：客户端改用 `zenstack/schema-lite`（`db:generate` 加 `--lite`，浏览器 bundle 不再携带 policy 表达式）；`vite.config.ts` 的 `@zenstackhq/orm` client shim 常量抽到 `src/integrations/zenstack-query/orm-client-shim.ts` 并加漂移对照测试；`requireOrgMemberRole` 复用 `getSessionUser` 已解析的 `activeOrganizationRole`，消除重复 `getActiveMember` 调用。
- 本任务前 `src/queries/` 只有 README，没有实际 queryOptions 工厂；当前已有 `src/queries/organizations-admin.ts`，并被组织管理 route 和用户加组织 drawer 复用。
- route/view 文件承担逻辑过重：
  - `src/routes/(workspace)/_layout/organization/index.tsx` 825 行。
  - `src/routes/site/_layout/organizations/index.tsx` 原为 552 行；已拆出 route-private 组织创建和成员添加组件，当前为 279 行。
  - `src/routes/(workspace)/_layout/settings/organization/menus.tsx` 525 行。
  - `src/components/layout/app-sidebar.tsx` 372 行。
- 部分 spec 已漂移：
  - `server-fn-vs-orpc-vs-queries.md` 和 backend/error/quality spec 仍提 `.inputValidator(...)`，当前 TanStack Start 和本地代码应使用 `.validator(...)`。
  - `src/queries/README.md` 写“queryFn 数据源可以是 ZenStack hooks”，但 React hooks 不能在普通 `queryOptions` 工厂中调用。

## External Research Notes

- Detailed source notes are recorded in `research/online-best-practices.md`.
- ZenStack 3.x TanStack Start adapter 文档把 `TanStackStartHandler + RPCApiHandler` 定位为安装一整套 CRUD API，并强调 `getClient` 应返回带 access policy 且绑定用户身份的 client。
- ZenStack TanStack Query 文档说明生成 hooks `useFindMany/useUpdate/useDelete` 等，并提供 mutation 后自动 query invalidation。
- oRPC TanStack Query 文档提供 `.queryOptions()`、`.mutationOptions()`、`.key()` / `.queryKey()`，适合 typed business actions 和显式 cache key 管理。
- TanStack Start Server Functions 文档建议大型应用拆分为 `.functions.ts` server function wrapper、`.server.ts` server-only helper、普通 `.ts` client-safe schema/constant；当前文档使用 `.validator(...)`。
- TanStack Start Import Protection 文档说明 server-only/client-only 泄漏的核心风险，并建议拆分 entrypoint，避免 mixed barrel 或 server-only helper 被 client 可达代码引用。
- Better Auth organization 文档确认 active organization、organization hooks、`hasPermission`、custom access control 是组织权限的主要入口。BA 组织表仍由 Better Auth 管理，业务表 row-level policy 仍归 ZenStack。

## Requirements

### R1. 项目状态报告要代码背书

- 最终说明必须明确当前阶段：基础身份/组织/产品模式/邮件/i18n/组件/构建质量门已成型；真实业务域模型和可复制 CRUD/action 样板仍不足。
- 状态判断必须引用当前文件、命令输出和架构证据，不只给抽象判断。

### R2. 明确分层契约

必须把以下边界写入 design/spec，并让第一批代码改动朝这个方向靠拢：

- ZenStack `/api/model/**`：policy-protected 单模型 CRUD。
- oRPC `/api/rpc/**`：跨模型事务、BA `@@ignore` 表管理、派生查询、导出/批处理/外部系统动作。
- `src/server/` server functions：route loader/action 紧耦合、只被本 Start app 调用的逻辑。
- `src/queries/`：跨 route/component 复用的 TanStack Query option factories；不能直接调用 React hooks。
- `src/routes/**`：路由装配、loader/beforeLoad、页面组合和少量 view state。
- `src/components/**`：纯视图/交互组件，不能直接导入 server-only DB/logger/auth server 模块。
- `src/lib/**`：基础设施胶水，不收业务域逻辑。

### R3. 修复菜单权限与 CRUD 边界

- 先决定并落地 `Menu` 写权限的真实产品语义：
  - private / site-admin 交付排障需要 site admin 可写。
  - workspace owner 当前 UI 已允许进入，若保留则 ZenStack policy 必须能表达并允许。
- `Menu` 普通 CRUD 不应继续作为 oRPC 主要样板。迁移方向是使用 ZenStack generated hooks；oRPC 保留 `getUserMenus` 这种需要 BA permission 过滤的派生查询。
- 迁移后需要保证 sidebar 与菜单管理页的缓存失效可预测。

### R4. 抽出 queryOptions 和 route 私有逻辑

- 建立至少一个真实 queryOptions 工厂样板，优先覆盖 `organizationsAdmin.list` / 用户列表这类跨组件复用查询。
- route 文件中可复用的数据查询、mutation key、表单 payload mapping、错误处理 helper 应下沉到 route-private component/helper 或 `queries/`。
- 不能为只有单消费者的简单查询制造过度抽象；抽取必须服务明确复用或边界清晰。

### R5. 清理 server/client import 边界

- 分析 `logger.ts` 的 `node:module` build warning，确认是哪条 client build 路径让它被解析。
- 按 TanStack Start 文档推荐拆分 server function wrapper / server-only helper / client-safe types，或用更明确的 server-only entrypoint 清理边界。
- 清理后 `pnpm build` 不应再出现该 `node:module` browser externalized warning。

### R6. 同步 spec

- 修正 `.inputValidator(...)` 为 `.validator(...)`。
- 修正 `src/queries/README.md` / `server-fn-vs-orpc-vs-queries.md` 对 ZenStack hooks 与 queryOptions 的边界描述。
- 补充一份“首个业务域接入”检查清单：模型进 ZenStack、动作进 oRPC、查询复用进 `queries/`、页面只组合视图。

## Acceptance Criteria

- [x] `prd.md` / `design.md` / `implement.md` 记录当前状态、研究依据、分层契约、执行顺序和验证命令。
- [x] 第一批代码改动至少解决一个真实分层问题，而不是只写文档。
- [x] `Menu` route gate 与 ZenStack policy 不再互相矛盾。
- [x] 至少一个实际查询从 route/component inline 迁入 `src/queries/`，并使用官方 oRPC key/queryOptions 能力。
- [x] `src/routes/site/_layout/organizations/index.tsx` 已拆出 route-private 表单组件，route 文件只保留路由 gate、query/table 组合和 dissolve action。
- [x] `src/queries/README.md` 与 `.trellis/spec/guides/server-fn-vs-orpc-vs-queries.md` 不再鼓励在普通 queryOptions 工厂里调用 React hooks。
- [x] spec 中不再出现过时的 `.inputValidator(...)` 示例。
- [x] `pnpm check` 通过。
- [x] `pnpm test` 通过。
- [x] `pnpm exec tsc --noEmit` 通过。
- [x] `pnpm build` 通过；若仍有 chunk-size warning 可记录为性能后续项，但不能有 logger/server-only 边界 warning。

## Out of Scope

- 不在本任务内接入完整 Stripe 计费；当前 billing 仍是 stub。
- 不在本任务内创建光伏/ERP/MES 等真实业务域模型。
- 不迁移 Better Auth 管理表到 ZenStack 可写模型；BA 表继续 `@@ignore`。
- 不做大规模 UI 重设计。
- 不升级所有 outdated 依赖；依赖升级另开任务处理。

## Resolved Decision

菜单管理采用“site-admin 可写全局/全部菜单，active workspace owner 可写本 workspace org-scoped 菜单”的语义。这个决策已落地到 `policyAuth` 和 `Menu` policy，并由 RBAC integration test 覆盖。收尾 review 补强：post-update 规则防 owner 改 `organizationId` 逃逸；读规则按 org 隔离（全局菜单人人可见）。

已知后续项（不在本任务修）：
- 菜单管理页 create 固定写 `organizationId = activeOrganizationId`，super-admin 在有 active org 时无法从 UI 创建全局菜单（编辑不受影响）；将来给 super-admin 加 scope 选择器。
- oRPC SSR 走 HTTP self-call（`serverOrigin()` 回环），是为守住 client import 边界的有意取舍；若 SSR 压力大，可按 oRPC "Optimizing SSR" 文档改 server-only `globalThis.$client = createRouterClient(router)` + client fallback。
- `getSessionUser` 对每个带 active org 的请求多一次 `auth.api.getActiveMember` 调用；量大时可用 BA customSession/session hook 把 role 缓存进 session。
