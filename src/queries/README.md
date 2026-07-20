# `src/queries/` — TanStack Query queryOptions 工厂

> 跨 route loader / 组件 / 弹窗复用的 query 单元，统一 queryKey 命名空间。

## 何时进 `src/queries/`

queryOptions 工厂 **被 ≥ 2 处** 入口共用时（典型场景：route loader prefetch + 列表组件 + 跨页弹窗里的选择器），抽进本目录；只被单文件用的 inline `useQuery({ queryKey, queryFn })` 留在调用点。

## 写作约定

### 文件分组

按 domain 一文件一域：`src/queries/<domain>.ts`，如 `users.ts` / `menus.ts` / `organizations.ts`。每个文件导出 `<domain>QueryOptions(input)` / `<domain>ListQueryOptions(input)` 等工厂函数。

### queryFn 数据源

合法来源必须是普通函数调用，不能是 React hook：

1. **oRPC client / helpers**：`orpc.<domain>.<op>.queryOptions({ input })` 或 `orpc.<domain>.<op>.call(input)` —— 业务动作、跨 model 事务、batch、外部系统调用、BA `@@ignore` 表包装
2. **Better Auth client**：少数管理面板查询可以走 `authClient.admin.xxx(input).then(unwrap)`
3. **server function wrapper**：只暴露 safe-to-import 的 server function，不导入 server-only helper

不要在 `queryFn` 里直接 `fetch()`，也不要调用 `useZenStackQueries()`。`useZenStackQueries()` 是 React hook，只能在组件 / 自定义 hook 中使用；单 model CRUD 优先直接用 ZenStack generated hooks。如果 entity 查询确实需要 route loader + 多组件共用的纯 `queryOptions`，新增显式 oRPC read procedure 后再放进本目录。

### queryKey 命名空间

优先使用底层 client 自带的 key helper。oRPC 查询用 `.key()` / `.queryKey()` / `.queryOptions()`，避免手写会漂移的宽泛 key。

例：

```ts
// src/queries/organizations-admin.ts
export function organizationsAdminListQueryOptions() {
  return orpc.organizationsAdmin.list.queryOptions({ input: {} });
}

export function organizationsAdminKey() {
  return orpc.organizationsAdmin.key();
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
queryClient.invalidateQueries({ queryKey: organizationsAdminKey() });
```

按 domain prefix 失效；细粒度只在性能瓶颈出现时再做。oRPC 场景优先用 `.key()` helper。

## 当前状态

本目录已经开始承载跨入口复用查询。新增查询前先确认至少两个调用入口，或存在 route loader prefetch + component reuse 的明确需求。
