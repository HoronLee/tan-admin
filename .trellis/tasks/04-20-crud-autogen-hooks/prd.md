# oRPC 单栈升级为 oRPC + ZenStack 双栈（T3）

> 状态：**占位**（stub PRD）。等 T2 `04-20-rbac-modeling-policy` 完成、进入本 task 时再补全。

## Goal

把 API 协议栈从"纯 oRPC 单栈"升级为"**oRPC + ZenStack Server Adapter 双栈**"，释放 admin 后台和光伏业务规模下的开发速度：

- **CRUD 流量**（`list` / `get` / `create` / `update` / `delete`）走 ZenStack Server Adapter（`/api/model/**`），前端用 `@zenstackhq/tanstack-query` 的自动派生 hooks
- **业务动作流量**（批量操作、跨模型事务、下发设备指令、触发后台任务等）继续走 oRPC（`/api/rpc/**`），前端用 `@orpc/tanstack-query`
- **错误契约融合**：前端 `reportError` 同时识别 oRPC `ORPCError` 和 ZenStack `ORMError` HTTP 响应，统一映射到现有的 7 个标准错误码 + toast 通道

## 为什么升级（业务上下文）

后续落地：
- admin 服务（System 域：User / Role / Permission / Menu / Dept / Dict / Log 等 10+ 模型）
- 光伏电站管理平台（Station / Inverter / DataPoint / Alarm / Task 等业务域）

在这种规模下，手写每个模型的 `listXxx` / `getXxx` / `createXxx` 会变成重复劳动；且 PolicyPlugin 开启后（T2 已做），ZenStack hooks 还能提供**策略联动的自动缓存 invalidate**——这是 oRPC 做不到的核心杀手级能力。

## Prerequisites

- ✅ T1 `04-20-zenstack-v3-bootstrap`（ZenStack 地基）
- ✅ T2 `04-20-rbac-modeling-policy`（PolicyPlugin 启用 + `$setAuth` 在 middleware 接入）
- 决策要点：
  - **两个协议栈的 URL 空间分配**：当前 oRPC 挂在 `/api/rpc/**` + `/api/**`（OpenAPI）；ZenStack 挂在 `/api/model/**`
  - **错误融合策略**：是在前端 `reportError` 里做两套响应适配，还是写一个统一错误响应的 response interceptor
  - **首个 hooks 消费点**：建议选 admin User 管理页作为端到端验证场景
  - **后续业务域是否一上来就 ZenStack-first**：确定 guideline

## References（以官方为准）

- TanStack Start Adapter: https://zenstack.dev/docs/reference/server-adapters/tanstack-start
- RPC API Handler: https://zenstack.dev/docs/service/api-handler/rpc
- TanStack Query 集成: https://zenstack.dev/docs/service/client-sdk/tanstack-query
- 错误类型: https://zenstack.dev/docs/orm/errors
- 客户端 `useClientQueries`: https://zenstack.dev/docs/service/client-sdk/tanstack-query#using-the-query-hooks

## 关键落地点（提纲）

1. **后端**
   - 装 `@zenstackhq/server` + `@zenstackhq/server/tanstack-start`
   - 新建 `src/routes/api/model/$.ts`，挂 `TanStackStartHandler({ apiHandler: new RPCApiHandler({ schema }), getClient: req => authDb.$setAuth(await getSessionUser(req)) })`
   - 把 `getSessionUser` 从 authed middleware 抽成共享 util（oRPC 和 ZenStack handler 共用）
2. **前端**
   - 装 `@zenstackhq/tanstack-query`
   - `src/orpc/client.ts` 旁边新建 `src/zenstack/client.ts`：`useClientQueries(schema, { endpoint: '/api/model' })`
   - admin 首个模型页（比如 User 列表）用 hooks 实现端到端
3. **错误契约融合**
   - `src/lib/error-report.ts` 扩展：识别 ZenStack HTTP 错误响应（`{ error: { reason: ..., message: ... } }`）
   - 映射到现有 7 个错误码（not-found → NOT_FOUND，rejected-by-policy → FORBIDDEN，invalid-input → INPUT_VALIDATION_FAILED，db-query-error → CONFLICT/BAD_REQUEST/INTERNAL_ERROR）
4. **Spec 更新**
   - `.trellis/spec/backend/index.md`：记录双栈拓扑图与 CRUD-vs-业务动作分工原则
   - `.trellis/spec/frontend/hook-guidelines.md`：CRUD 用 ZenStack hooks / 业务动作用 oRPC hooks

## Out of Scope

- 业务域具体模型（光伏各表）的落地：在各自独立 task 中按双栈模式实施
- oRPC 自定义错误码的迁移：保持现有契约不变
- RESTful API Handler（JSON:API 风格）：只用 RPCApiHandler

## Definition of Done

- ZenStack hooks 的 `useFindMany` / `useCreate` / `useUpdate` / `useDelete` 在 admin User 页跑通
- PolicyPlugin 生效：未授权请求通过 hooks 得到正确错误码
- 前端同时调 oRPC `signIn` 和 ZenStack `useFindMany`，两种错误都走 `reportError`
- `biome check` + `pnpm test` 全绿

---

> **详细 Requirements 待 T3 启动时补全。**
