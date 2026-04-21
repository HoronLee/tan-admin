# oRPC 单栈升级为 oRPC + ZenStack 双栈（T3）

## Goal

把 API 协议栈从"纯 oRPC 单栈"升级为"**oRPC + ZenStack Server Adapter 双栈**"：
- **CRUD 流量**（`list` / `get` / `create` / `update` / `delete`）走 ZenStack Server Adapter（`/api/model/**`），前端用 `@zenstackhq/tanstack-query` 的自动派生 hooks + 自动缓存 invalidation
- **业务动作流量**（批量、跨模型事务、下发设备指令、触发后台任务）继续走 oRPC（`/api/rpc/**`）
- **错误契约融合**：前端 `reportError` 同时识别 oRPC `ORPCError` 和 ZenStack HTTP 错误响应，统一映射到现有 7 个标准错误码

## Why（业务上下文）

后续落地 admin 域（User/Role/Permission/Menu/Dept/Dict/Log 10+ 模型）与光伏业务域（Station/Inverter/DataPoint/Alarm/Task）规模下，手写每模型 5 个 CRUD procedure 是重复劳动；PolicyPlugin（T2 已启用）叠加 ZenStack hooks 还能提供**策略联动的自动缓存 invalidate**——oRPC 做不到。

## What I already know（仓库摸底 · 2026-04-21）

- `src/db.ts` 已导出 `pool` / `db`（raw）/ `authDb`（带 PolicyPlugin）。`authDb.$setAuth({ userId, isAdmin })` 已是既定模式
- `src/orpc/middleware/auth.ts` 里 session 验证 + `isAdmin` 判定 + `$setAuth` 绑定全部内联——ZenStack Adapter 需要同样逻辑，**必须抽出共享 util（`getSessionUser`）**
- `src/orpc/middleware/orm-error.ts` 已把 `ORMError.reason` → 7 个 oRPC 错误码映射完整（`not-found`→NOT_FOUND / `rejected-by-policy`→FORBIDDEN / `invalid-input`→INPUT_VALIDATION_FAILED / `db-query-error` 按 SQLSTATE 分派 23505→CONFLICT / 23503→BAD_REQUEST）。**但这只在 oRPC 服务端链路生效——Adapter 直接把 ORMError 转成 HTTP 响应，绕过此中间件**
- `src/lib/error-report.ts` 当前只认 oRPC `isDefinedError`；`INPUT_VALIDATION_FAILED` 被故意静音交给表单。需扩展一个 ZenStack HTTP 响应分支
- `src/routes/api/` 目前只有 `auth/$.ts`（Better Auth catch-all）；oRPC handler 和 ZenStack handler 还没建
- `src/modules/` 为空——**没有现成 User 管理页骨架，首个消费点需从零起**

## Research Notes（官方文档 · 验证过）

### ZenStack HTTP 错误响应的真实形状（与 PRD 简化版不同）

```json
{
  "body": {
    "error": {
      "status": 403,
      "message": "...",
      "reason": "rejected-by-policy",
      "model": "User",
      "rejectedByValidation": false,
      "rejectedByPolicy": true,
      "rejectReason": "no-access",
      "dbErrorCode": "23505"
    }
  }
}
```
- `reason` 枚举：`invalid-input` / `not-found` / `rejected-by-policy` / `db-query-error` / `not-supported` / `internal-error` / `config-error`
- 与后端 `orm-error.ts` 的 case 完全对齐——**前端可以直接镜像同一张映射表**

### TanStack Start Adapter 正式用法（v3）

```ts
// src/routes/api/model/$.ts
const handler = TanStackStartHandler({
  apiHandler: new RPCApiHandler({ schema }),
  getClient: (request) => authDb.$setAuth(getSessionUser(request)),
})
export const Route = createFileRoute('/api/model/$')({
  server: { handlers: { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler } }
})
```
- 官方示例用 `/api/$` catch-all 会吞掉 `/api/auth/**`、`/api/rpc/**`，**必须用 `/api/model/$` 子路径**
- `getClient` 可以不依赖 oRPC 的 context，但必须复用同一份 `getSessionUser`

### 前端 hooks API

```ts
const client = useClientQueries(schema, { endpoint: '/api/model' })
const { data } = client.user.useFindMany({ where: { active: true } })
const createUser = client.user.useCreate()       // 自动 invalidate useFindMany
createUser.mutate({ data: {...} }, { invalidateQueries: false }) // 也能手动关
```
- 自动缓存 invalidation 处理嵌套 read/write/delete
- 通过泛型 `useClientQueries<DbType>(schema)` 可让 hook 返回类型 = server 端 `authDb` 类型（保留 plugin 扩展字段）

## Feasible approaches（3 个方案，关键决策点：错误融合策略）

### Approach A：双适配（**推荐**）
**How**: `reportError` 增加一个分支，判断 `error?.body?.error?.reason` 存在即走 ZenStack 映射；oRPC 侧保留 `isDefinedError`。两条链路各自在"错误入口"做转换，错误码表是唯一事实来源（抽一个 `mapZenstackReasonToCode(reason, dbErrorCode)` 和后端 `orm-error.ts` 共用常量）。
- Pros: 改动小、对 TanStack Query `onError` 链路无侵入、与现有 `reportError` 语义一致
- Cons: 前端/后端有两处映射实现（虽然常量共用，逻辑仍需同步）

### Approach B：统一 response interceptor
**How**: 在 `useClientQueries` 的 `fetch` 层或 TanStack Query 的全局 `QueryCache.onError` 里把 ZenStack HTTP 响应"改造"成伪 `ORPCError` 对象，后续一律走 `isDefinedError` 分支。
- Pros: `reportError` 不需要新分支，单一错误形态
- Cons: 伪造 ORPCError 是 hack，未来 oRPC 升级容易破；在 hook 层拦截需额外 fetch 包装

### Approach C：后端统一代理
**How**: 把 ZenStack adapter 包一层自定义 handler，在 HTTP 响应出站前改写成 oRPC 标准错误格式。
- Pros: 前端 0 改动
- Cons: 改 adapter 返回格式会破坏官方契约，未来升级风险大；还要重做 status code

## Decision (ADR-lite)

### D4 · admin shell 范围：**L1 最小可用 shell 并入 T3**（2026-04-21）
- **Context**：`src/routes/` 无 admin shell，M2 页面无处安放；Vben 对标的完整 shell（多标签页、动态菜单、权限守卫）独立设计深度大。
- **Decision**：T3 内顺带做 L1 —— shadcn `sidebar`（`pnpm dlx shadcn@latest add sidebar`）+ 硬编码一级菜单 `{ Dashboard, Users }` + 复用现有 `Header.tsx` 的用户下拉与主题切换。
- **Out of scope（→ 独立 task）**：多级菜单、多标签页导航、面包屑联动 Router、动态菜单从 Menu/Permission 表渲染、路由权限守卫、dark mode 持久化精修、`ProTable` / `ProForm` 高级封装。
- **Consequences**：
  - 硬编码菜单是 T4 的替换目标，不是债务（整段换掉）
  - 动态菜单需要 ZenStack hook 可用——正好是 T3 产出，避免循环依赖
  - shadcn `sidebar` 组件本身成熟，L1 实现量不大（约 3-4 个组件文件）

### D3 · T3 范围：**S1 · 基建 + Role 样板**（2026-04-21，2026-04-21 修订）
- **Context**：T2 已落地 System 域 10+ 模型 schema + policy，存在"顺手做几个页面"的诱惑。
- **Decision**：S1 —— T3 只做双栈基建 + admin Role 一个模型页。Permission / Menu / Dept / Dict / Log 等在各自独立 task 按同一 pattern 落地。
- **Consequences**：
  - spec 先在单模型上验证通过再复制到 10+ 模型，避免早期 pattern 瑕疵被固化
  - T3 DoD 范围可控，不与 M2 决策（混合调用延到后续 task）冲突
  - 后续每个 admin 模型页 = 1 个独立 task（可能轻量）
- **修订说明（2026-04-21）**：原选 User 页作为首个 hooks 消费点，但 `BaUser` 在 zmodel 中 `@@ignore`（Better Auth 管理，不在 ZenStack ORM Client 内），hooks 生成不出来。改选 Role：纯业务 RBAC 模型，policy 已写，与"auth 基建走 oRPC / 业务模型走 ZenStack hooks"的双栈语义一致。

### D2 · 首个消费点 MVP 边界：**M2 · 基础可用**（2026-04-21，2026-04-21 修订）
- **Context**：`src/modules/` 为空，端到端验证需要一个新建页面。在"能证明契约通了"和"做完一个产品页"之间取舍。
- **Decision**：M2 —— admin Role 页覆盖 `useFindMany` + `useCreate` + `useUpdate` + `useDelete` + 分页，不做搜索、不做权限绑定，不做"ZenStack hook + oRPC 动作"混合调用。
- **Consequences**：
  - T3 DoD 能独立证明 CRUD hooks + 错误契约 + PolicyPlugin 联动
  - "双栈混合交互"的边界问题（oRPC 业务动作后手动 invalidate ZenStack 缓存）延到后续独立 task
  - M2 页面在后续 task 会被继续扩展（搜索、权限绑定、继承），不是一次性丢弃的样板
- **修订说明（2026-04-21）**：首个消费点从 User 改为 Role，理由同 D3。

### D1 · 错误融合策略：**Approach A — 前端双适配 + 共用映射表**（2026-04-21）
- **Context**：ZenStack Server Adapter 直接把 `ORMError` 转成 HTTP 响应 `{ body: { error: { reason, ... } } }`，绕过 oRPC `orm-error.ts`。前端必须能同时识别两种错误形态并映射到统一的 7 个错误码。
- **Decision**：A。`reportError` 增加一个 ZenStack HTTP 错误分支；抽 `src/lib/zenstack-error-map.ts` 存 `reason → code` 常量表（含 `dbErrorCode` 的 SQLSTATE 分派），前后端（后端 `orm-error.ts` 重构后）共用同一份常量。
- **Consequences**：
  - 改动局部、尊重两框架官方契约
  - 两处调用映射函数，但逻辑/常量唯一
  - 后端 `orm-error.ts` 需要小改造，引用共享常量而非内联 switch（同一 PR 内做掉）

## Open Questions

_全部已解决（D1/D2/D3）。_

## Requirements（evolving）

1. 后端
   - `src/lib/auth-session.ts`（新）：抽出 `getSessionUser(request)` 共享 util
   - `src/orpc/middleware/auth.ts`：改用新 util，行为不变
   - `src/routes/api/model/$.ts`（新）：挂 `TanStackStartHandler`
2. 前端
   - `src/zenstack/client.ts`（新）：`useClientQueries<typeof authDb>(schema, { endpoint: '/api/model' })`
   - `src/lib/zenstack-error-map.ts`（新）：`reason → code` 常量表 + `mapZenstackError` 函数；后端 `orm-error.ts` 同步引用
   - `src/lib/error-report.ts`：新增 ZenStack HTTP 错误分支（调用 `mapZenstackError`）
3. 最小 admin shell（L1）
   - `pnpm dlx shadcn@latest add sidebar breadcrumb`
   - `src/components/layout/AppSidebar.tsx` 硬编码菜单 `{ Dashboard, Roles }`
   - `src/routes/(admin)/_layout.tsx`（route group）：sidebar + outlet；Header 复用现有（用户下拉、主题切换）
   - `src/routes/(admin)/dashboard.tsx` 占位页
4. admin Role 页（M2）
   - `src/routes/(admin)/roles/index.tsx`：`useFindMany` + 分页
   - 新建/编辑抽屉：`useCreate` / `useUpdate` + TanStack Form + `INPUT_VALIDATION_FAILED` 字段级错误
   - 删除确认：`useDelete` + `AlertDialog`
5. Spec
   - `.trellis/spec/backend/index.md`：双栈拓扑 + CRUD vs 业务动作分工
   - `.trellis/spec/frontend/hook-guidelines.md`：CRUD 用 ZenStack hooks / 业务动作用 oRPC
   - `.trellis/spec/frontend/layout-guidelines.md`（新）：L1 shell 约定 + admin 路由组 `(admin)/` 规范

## Acceptance Criteria（evolving）

- [ ] `useFindMany` / `useCreate` / `useUpdate` / `useDelete` 在 admin Role 页跑通
- [ ] PolicyPlugin 生效：未授权用户通过 hooks 得到 FORBIDDEN toast，和 oRPC 侧一致
- [ ] 前端同一页面调 oRPC `signIn` 与 ZenStack `useFindMany`，两种错误都走 `reportError` 且 toast 文案一致
- [ ] reason→code 映射有 unit test 覆盖所有 7 个 ORMErrorReason 值
- [ ] `biome check` + `pnpm test` 全绿

## Definition of Done

- 测试：reason 映射的 unit test + Role 页的 e2e（若 Playwright 环境允许）
- Lint/typecheck CI 绿
- spec 两个文件更新
- `.env.local` 无新增变量（Adapter 不需要）

## Out of Scope

- 业务域具体模型（光伏各表）的落地 → 各自独立 task
- admin 域除 Role 外的模型页面（Permission / Menu / Dept / Dict / Log）→ 各自独立 task，按 T3 pattern 复制
- admin User 页（无论 oRPC 还是 ZenStack 栈）→ 独立 task；User 属于 auth 基建（Better Auth 管 + zmodel `@@ignore`），不走 ZenStack hooks，未来用 oRPC + Better Auth admin API 实现
- oRPC 自定义错误码迁移（保持现有契约）
- ZenStack RESTful 风格或其它 apiHandler 形态（只用 RPCApiHandler）
- admin Role 页的搜索、权限绑定、角色继承 → 延到后续独立 task
- "ZenStack hook + oRPC 动作混合调用后手动 invalidate" 的边界设计 → 同上延到后续 task
- 完整 admin shell（多级菜单 / 多标签页 / 面包屑联动 / 动态菜单 / 路由权限守卫 / dark mode 持久化 / `ProTable`/`ProForm`）→ 独立 task

## Technical Notes

- References:
  - https://zenstack.dev/docs/reference/server-adapters/tanstack-start
  - https://zenstack.dev/docs/service/api-handler/rpc（错误响应格式）
  - https://zenstack.dev/docs/service/client-sdk/tanstack-query
  - https://zenstack.dev/docs/orm/errors（ORMErrorReason / RejectedByPolicyReason 枚举）
- 关键约束：`/api/model/$` 必须错开 `/api/auth/$` 和 `/api/rpc/**`
- 类型共享：前端用 `useClientQueries<typeof authDb>(schema)` 泛型让 hooks 返回类型 = server 客户端
- 不要在 `.trellis/workspace/HoronLee/journal-*.md` 里写实现，journal 只记会话

---

> Brainstorm 完成（2026-04-21）。D1–D4 决策已固化。Task 状态转入 `in_progress`，按 PR1 → PR5 实施。
