# `src/queries/` — TanStack Query queryOptions 工厂

> 跨 route loader / 组件 / 弹窗复用的 query 单元，统一 queryKey 命名空间。

## 何时进 `src/queries/`

queryOptions 工厂 **被 ≥ 2 处** 入口共用时（典型场景：route loader prefetch + 列表组件 + 跨页弹窗里的选择器），抽进本目录；只被单文件用的 inline `useQuery({ queryKey, queryFn })` 留在调用点。

## 写作约定

### 文件分组

按 domain 一文件一域：`src/queries/<domain>.ts`，如 `users.ts` / `menus.ts` / `organizations.ts`。每个文件导出 `<domain>QueryOptions(input)` / `<domain>ListQueryOptions(input)` 等工厂函数。

### queryFn 数据源

只有两种合法来源：

1. **oRPC client**：`orpc.<domain>.<op>.call(input)` —— 业务动作（跨 model 事务、batch、外部系统调用）
2. **ZenStack hooks**：通过 `useZenStackQueries()` 拿到的 model query —— 单 model CRUD（`/api/model/**` 自动派生）

不要在 queryFn 里直接 `fetch()` / `authClient.admin.xxx()` —— 那些走相应 client，避开本层。

### queryKey 命名空间

```ts
queryKey: ["<domain>", "<op>", ...input]
```

例：

```ts
// src/queries/users.ts
export function usersListQueryOptions(input: { limit?: number } = {}) {
  return queryOptions({
    queryKey: ["users", "list", input],
    queryFn: () => orpc.users.list.call(input),
  });
}

export function userSessionsQueryOptions(input: { userId: string }) {
  return queryOptions({
    queryKey: ["users", "sessions", input.userId],
    queryFn: () => authClient.admin.listUserSessions(input).then(unwrap),
  });
}
```

第一段（domain）必须与文件名一致，让 invalidate 的 prefix 匹配可预测。

### Mutate 后失效

```ts
queryClient.invalidateQueries({ queryKey: ["users"] });
```

按 domain prefix 一刀切失效；细粒度（`["users", "list"]`）只在性能瓶颈出现时再做。

## 当前状态

PR2 阶段本目录仅落骨架，**不**迁移现有 route 文件里的 inline queryOptions。具体业务接入时按本约定逐步迁入。
