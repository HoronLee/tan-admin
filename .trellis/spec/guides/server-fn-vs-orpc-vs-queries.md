# Server Fn vs oRPC vs queries/ vs ZenStack RPC — 决策树

> **目的**：写新业务前 30 秒决定"代码该放哪个目录"。四个工具职责互不重叠，但选错一次就会拉出一串 import 改造。
>
> **范围**：业务侧 server-side & 数据访问层；不涉及 UI 组件、middleware、auth 边界。

---

## 1. 四工具回顾

| 工具 | 目录 | 暴露形式 | 调用方 |
|------|------|---------|--------|
| TanStack Start `createServerFn` | `src/server/` | `xxxFn({ data })` | 同进程 SSR / 路由 loader / action |
| oRPC | `src/orpc/` | `orpc.<domain>.<op>.call(input)` / `useQuery(orpc.xxx.queryOptions(...))` | 同进程 SSR + 浏览器 RPC，跨组件复用 |
| TanStack Query `queryOptions` 工厂 | `src/queries/` | `xxxQueryOptions(input)` | 路由 loader prefetch + 组件 `useQuery` + 跨页弹窗 |
| ZenStack TanStack Query | `/api/model/**` 自动派生 | `useZenStackQueries().<model>.useFindMany(...)` | 浏览器组件（policy 兜底） |

ZenStack RPC（`/api/model/**`）是底层 entity CRUD 通道，由 `zenstack/schema.zmodel` 自动生成 + PolicyPlugin 兜底，**不在四目录里写代码**。业务侧通过 `useZenStackQueries()` 间接使用，必要时用 `queries/` 包一层做缓存键统一。

类比心法：

- `server fn` = "Gin handler 紧绑路由"
- `oRPC` = "纯 gRPC contract"
- `queries/` = "前端缓存键命名空间"
- `ZenStack RPC` = "ORM Active Record 直通车"

四者共存不互斥。

---

## 2. 决策心法（30 秒选目录）

```
┌─ 数据形状是 entity？(单 model CRUD，policy 能表达访问控制)
│    └─ Yes → ZenStack RPC（不写代码，加 @@allow / @@deny 即可）
│         └─ 缓存键要跨 route 复用？→ queries/<domain>.ts 包一层
│
├─ 是动作 / 跨组件复用 / 复杂聚合？
│    └─ Yes → oRPC（src/orpc/router/<domain>.ts）
│         └─ 缓存键要跨 route 复用？→ queries/<domain>.ts 引用 orpc client
│
├─ 只在一个 route 用 / 跟 loader 链路紧耦合？
│    └─ Yes → server fn（src/server/<feature>.ts）
│
└─ 跨 route + 组件复用的查询缓存键？
     └─ Yes → queries/<domain>.ts（queryFn 调 oRPC client）
```

### 1) 数据形状是 entity？→ ZenStack RPC

如果操作能映射成单 model 的 `findMany` / `findUnique` / `create` / `update` / `delete`，且权限边界能用 `@@allow` / `@@deny` 表达——加 model + policy 即可，**不写一行业务代码**。

**例**：组织成员列表（policy：`organizationId == auth().memberOf`）；菜单 CRUD（policy：`auth().isAdmin`）。

### 2) 是动作 / 跨组件复用 / 复杂聚合？→ oRPC

需要显式 handler 逻辑、自定义输入输出形状、跨 model 事务、调外部系统、自定义错误码——进 oRPC。

**例**：批量派单（事务跨 `WorkOrder` + `Device` + `User`）；告警确认（写日志 + 推送）；报表 CSV 导出（动态聚合）；功率曲线查询（窗口聚合 + 缓存）。

### 3) 只在一个 route 用 / 跟 loader 链路咬合？→ server fn

只这一个 route 用、跟 loader 紧耦合（headers / context 直传）、不需要客户端复用——`createServerFn` 最轻。

**例**：dashboard route 的 SSR prefetch；表单提交 action（`router.invalidate()` 后立刻刷新）；route loader 里要读 cookie + redirect。

### 4) 跨 route + 组件复用的查询缓存键？→ queries/<domain>.ts

被 ≥ 2 处入口共用（典型：route loader prefetch + 列表组件 + 跨页弹窗里的选择器）——抽进 `src/queries/`。

**例**：电站列表（dashboard prefetch + 设备页选择器 + 工单弹窗下拉）；告警列表（首页角标 + 告警列表页 + 设备详情侧栏）。

---

## 3. 业务示例表（光伏电站管理平台）

| 业务场景 | 主存储 | 工具 | 路径示例 |
|---------|-------|------|---------|
| 电站列表（CRUD） | `Plant` model + policy | ZenStack RPC（包 `queries/plants.ts` 复用缓存键） | `useZenStackQueries().plant.useFindMany(...)` |
| 设备列表 | `Device` model + policy | ZenStack RPC（包 `queries/devices.ts`） | `useZenStackQueries().device.useFindMany(...)` |
| 告警列表（首页角标 + 告警页 + 设备侧栏） | `Alert` model + policy | ZenStack + `queries/alerts.ts` 缓存键 | `alertsListQueryOptions({ status: "open" })` |
| 告警确认（写日志 + 推送） | 跨 `Alert` + `AuditLog` 事务 | oRPC | `orpc.alerts.acknowledge.call({ id })` |
| 派单（跨 `WorkOrder` + `Device` + `User`） | 跨 model 事务 | oRPC | `orpc.workOrders.dispatch.call(...)` |
| 报表 CSV 导出 | 动态聚合 + 流式 | oRPC | `orpc.reports.exportCsv.call(...)` |
| 实时功率聚合（窗口聚合） | 复杂聚合 + 缓存 | oRPC + `queries/power.ts` | `powerCurveQueryOptions({ plantId, range })` |
| 工单提交表单 action | 单 route 紧耦合 | server fn | `submitWorkOrderFn({ data })` |
| dashboard prefetch（SSR） | 路由 loader | server fn or `ensureQueryData(queries/<domain>)` | `loader: async ({ context }) => context.queryClient.ensureQueryData(plantsListQueryOptions())` |
| 用户邀请（跨 BA + 业务表） | BA `organization.invite` API | oRPC（包一层） | `orpc.organizations.inviteMember.call(...)` |
| seed（首次部署 bootstrap） | tsx 脚本 | server fn-like（直接 `tsx src/server/seed.ts`） | `pnpm db:seed` |

---

## 4. 反例 / FAQ

### 4.1 什么时候**不**该全迁 oRPC？

**Loader 链路紧耦合的场景应留 server fn**：

- 路由 loader 里要直接读 `getRequestHeaders()` + 决定 redirect。
- 表单 action 后立刻 `router.invalidate()` 刷新——server fn 走同进程返回快、不需 oRPC 序列化。
- 单文件用、不跨组件复用、不需要 OpenAPI 文档导出。

强行迁 oRPC 会引入：

1. 不必要的 `os.input(z.object(...))` 模板代码；
2. 类型推断从"loader 上下文直拿"变成"oRPC client 桩往返"；
3. 测试要走 `createRouterClient` 而不是直接调 server fn。

### 4.2 什么时候**不**该开 queries/？

**一次性、不跨 route 的查询不进 `queries/`**：

- 单个组件的 inline `useQuery({ queryKey, queryFn })` 写两行就够。
- queryKey 没有命名空间冲突风险。
- 没有 prefetch 需求（loader 里不会调）。

`queries/` 的价值是"统一 queryKey 命名空间避免漂移 + 跨入口复用"。只有一个消费点的查询硬抽进去反而增加 import 路径长度，调试时多跳一次。

### 4.3 ZenStack RPC vs oRPC 边界？

**Decision rule**：操作能 1:1 映射到单 model mutation + policy 表达访问控制 → 选 ZenStack。

跨 model 事务 / 调外部系统 / 自定义返回形状 / 需要 OpenAPI 文档 → 选 oRPC。

灰色地带：单 model 但需要"插入前先校验另一表" / "更新后发邮件" / "返回额外的派生字段"——这些都跨出 ZenStack policy 能表达的边界，迁 oRPC。

### 4.4 queries/ 里能直接调 ZenStack hooks 吗？

不能。`useZenStackQueries()` 是 React hook，只能在组件 / 自定义 hook 内调用。`queries/<domain>.ts` 里的 `queryOptions` 工厂是纯函数，`queryFn` 只能调：

1. **oRPC client**：`orpc.<domain>.<op>.call(input)`
2. **Better Auth client**：`authClient.admin.xxx(input).then(unwrap)`（少数管理面板查询）

如果想给单 model entity 做 queryKey 统一，**用 oRPC 包一层薄业务 procedure**，再放 `queries/`。或者接受"组件直调 `useZenStackQueries()`"——ZenStack 自己的 invalidate 机制已经够好，不强求统一命名空间。

### 4.5 server fn 和 oRPC 都能在 SSR 跑——选哪个？

如果只在一个 route 文件里用、不会被组件复用、不需要 OpenAPI 暴露——**server fn**（更轻、更直接）。

只要"将来可能被另一个组件 / 弹窗 / 第三方 API 调用方"——**oRPC**（一开始就 typed contract，迁移成本低）。

迁移代价：server fn → oRPC 可逐步进行（保留 server fn handler 作为 oRPC procedure 的 body 即可）；反向迁移（oRPC → server fn）几乎从来不发生，因为 oRPC 定义已经是 server fn 的超集。

---

## 5. 生效路径（写代码顺序）

### A. 单 entity（电站列表）

1. `zenstack/schema.zmodel` 加 `Plant` model + `@@allow` policy。
2. `pnpm db:push` + `pnpm db:generate`。
3. 业务页面 `useZenStackQueries().plant.useFindMany(...)` 直接用。
4. 跨 route 复用？→ 在 `src/queries/plants.ts` 写 `plantsListQueryOptions(input)`，`queryFn` 用 oRPC 包一层（或保留组件直调 ZenStack hook，两条路）。

### B. 业务动作（告警确认）

1. `src/orpc/router/alerts.ts` 加 `acknowledge` procedure（`os.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {...})`）。
2. `src/orpc/router/index.ts` 加 export。
3. 客户端调 `orpc.alerts.acknowledge.call({ id })` 或 `useMutation({ mutationFn: orpc.alerts.acknowledge.call })`。
4. mutation `onSuccess` → `queryClient.invalidateQueries({ queryKey: ["alerts"] })`。

### C. 跨 route 缓存键（告警列表）

```ts
// src/queries/alerts.ts
import { queryOptions } from "@tanstack/react-query"
import { orpc } from "#/orpc/client"

export function alertsListQueryOptions(input: { status?: "open" | "closed" } = {}) {
  return queryOptions({
    queryKey: ["alerts", "list", input],
    queryFn: () => orpc.alerts.list.call(input),
  })
}
```

```ts
// route loader
loader: async ({ context }) => {
  await context.queryClient.ensureQueryData(alertsListQueryOptions({ status: "open" }))
}

// 组件
const { data } = useQuery(alertsListQueryOptions({ status: "open" }))

// mutation 后失效
queryClient.invalidateQueries({ queryKey: ["alerts"] })
```

### D. SSR prefetch + 表单 action（工单提交）

```ts
// src/server/work-orders.ts
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

export const submitWorkOrderFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ deviceId: z.string(), title: z.string() }))
  .handler(async ({ data }) => { /* ... */ })

// route action
const submit = useServerFn(submitWorkOrderFn)
await submit({ data })
router.invalidate()
```

---

## 6. 速查清单

写新业务前对自己问：

- [ ] 单 model CRUD + policy 可表达？→ ZenStack
- [ ] 跨 model / 跨系统 / 自定义形状？→ oRPC
- [ ] 仅本 route 用 + loader 紧耦合？→ server fn
- [ ] ≥ 2 处入口共用同一查询？→ queries/<domain>.ts
- [ ] queryKey 第一段 = 文件名 = domain（让 invalidate prefix 可预测）
- [ ] mutation 后 `invalidateQueries({ queryKey: ["<domain>"] })`
- [ ] server-only 模块（`#/lib/db` / `#/lib/auth/server` / `#/lib/email/*`）只在 server fn / oRPC handler / middleware 里 import，不能进客户端组件

---

## 相关 spec

- [`frontend/directory-structure.md`](../frontend/directory-structure.md) — 顶层布局 + 四目录边界总览
- [`backend/directory-structure.md`](../backend/directory-structure.md) — backend role 视角的四目录 + ZenStack 双栈拓扑
- [`frontend/hook-guidelines.md`](../frontend/hook-guidelines.md) — ZenStack hook vs oRPC hook 选型
- `src/queries/README.md` — queryOptions 工厂写作约定
