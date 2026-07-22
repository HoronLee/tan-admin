# State Management

> Practical state-layer rules from this repository.

---

## Overview

Three layers, used intentionally:

- **Local component state** (`useState`) — single-component concerns.
- **Server state** (`useQuery` / `useMutation`, usually via oRPC query utils or ZenStack hooks) — remote source-of-truth data.
- **Global client state** (`@tanstack/store`) — app-wide client-only values.

## Layer 1: Local Component State

Default to local state unless multiple siblings must coordinate the same value.

```ts
// src/routes/(workspace)/_layout/settings/organization/menus.tsx
const [drawerOpen, setDrawerOpen] = useState(false)
const [form, setForm] = useState<MenuFormState>(EMPTY_FORM)
const [removeTarget, setRemoveTarget] = useState<MenuNode | null>(null)

// src/routes/site/_layout/users/index.tsx
const [createOpen, setCreateOpen] = useState(false)
const [editTarget, setEditTarget] = useState<AdminUser | null>(null)
const [banTarget, setBanTarget] = useState<AdminUser | null>(null)
```

## Layer 2: Server State (Cached)

Use TanStack Query for server-backed data. Prefer oRPC query utilities for end-to-end typed business actions; prefer ZenStack auto-generated hooks for single-model CRUD (see `frontend/hook-guidelines.md`).

```ts
// src/orpc/client.ts
export const client: RouterClient<typeof router> = getORPCClient()
export const orpc = createTanstackQueryUtils(client)

// oRPC business/action query
const { data, isPending } = useQuery(
  orpc.organizationsAdmin.list.queryOptions({ input: {} }),
)
const createMutation = useMutation({
  mutationFn: (input: CreateOrganizationInput) => orpc.organizationsAdmin.create.call(input),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.organizationsAdmin.key() }),
})

// Plain Query wrapping a non-oRPC SDK (src/routes/site/_layout/users/index.tsx)
useQuery({
  queryKey: ['admin', 'users'] as const,
  queryFn: async () => {
    const { data, error } = await authClient.admin.listUsers({ query: { limit: 100 } })
    if (error) throw new Error(error.message)
    return data
  },
})
```

## Layer 3: Global Client State

Use TanStack Store for lightweight shared client state and derived views.

```ts
// 概念示例（真实用法见 src/stores/menu.ts 与 src/stores/tabbar.ts）
export const store = new Store({ firstName: 'Jane', lastName: 'Smith' })
export const fullName = new Store(`${store.state.firstName} ${store.state.lastName}`)

store.subscribe(() => {
  fullName.setState(() => `${store.state.firstName} ${store.state.lastName}`)
})

// Immutable update（真实用法见 src/stores/tabbar.ts 的 addTab / removeTab）
store.setState((state) => ({ ...state, firstName: e.target.value }))
```

Real usage: `menuStore` (dynamic sidebar items from `navigation.get`), `tabbarStore` (tab navigation state). See `frontend/layout-guidelines.md`.

## SSR Prefetch + Hydration Contract

Route loaders can prefetch query cache on the server; router-level integration hydrates it.

```ts
// 概念示例：route loader 预热查询缓存
await context.queryClient.prefetchQuery(
  orpc.organizationsAdmin.list.queryOptions({ input: {} }),
)

// src/router.tsx
setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })
```

## Route-Level Invalidation

Match invalidation to data source:

- Server function routes: `router.invalidate()` after mutation.
- Query-managed routes: `refetch()` or `queryClient.invalidateQueries(...)`.
- ZenStack hooks: cache invalidation is automatic on successful mutation (including nested reads).

```ts
// Server function route
await createTodo({ data: { title } })
router.invalidate()

// Query route
onSuccess: () => {
  refetch()
  setTodo('')
}
```

## Decision Guide

- Put state in Query when server owns truth.
- Put state in Store for app-wide client state (theme/UI preferences, ephemeral shared values, cross-component derived data).
- Keep state local by default; lift only when multiple siblings need the same state.

## Better Auth Active-Org Cache Refresh

Better Auth 的 `authClient.useActiveOrganization()` 在客户端是独立缓存，**TanStack Query 的 `invalidateQueries` 不会让它失效**。当你在 settings 页保存了 `organization` 上的 `additionalFields`（如 `plan` / `industry` / `billingEmail` / `logo`），下游消费者（sidebar 的 `<PlanBadge>`、任何读 `useActiveOrganization()` 的组件）默认仍拿到旧值。

### 触发条件

mutation 调用了 `authClient.organization.update({ data: { ...additionalFields } })` 之后，UI 上**当前会话内**有组件依赖那条 org 的数据立即可见。

### Convention

`onSuccess` 里在 invalidate ReactQuery 之外，**额外**调一次 `setActive` 强制 BA 重拉 active-org 缓存：

```ts
// src/routes/(workspace)/_layout/settings/organization/index.tsx
const saveMutation = useMutation({
  mutationFn: async (data: OrgSettingsForm) => {
    const { error } = await authClient.organization.update({
      organizationId: orgId,
      data: { name: data.name, plan: data.plan, /* ... */ },
    });
    if (error) throw new Error(error.message);
  },
  onSuccess: async () => {
    queryClient.invalidateQueries({ queryKey: ["organization", "full", orgId] });
    // ↓ 让 useActiveOrganization 消费者（sidebar PlanBadge 等）立刻拿新值
    await authClient.organization.setActive({ organizationId: orgId });
  },
});
```

### 为什么用 setActive 而不是 reload

- `window.location.reload()` 会丢掉用户当前的滚动位置、表单未提交输入、tabbar 状态（`stores/tabbar.ts`），是最次方案
- `setActive` 对 same-id 调用是幂等的，BA 内部会重拉 active org → 比 reload 优雅
- 已实测验证：4 个 plan 切换后 sidebar `<PlanBadge>` 立刻反映新值（plan-gating-ui-stripe-stub task 实测）

### 其他 BA additionalField 也适用

任何 `organization.additionalFields` / `user.additionalFields` 的 mutation，只要 UI 有依赖该字段的客户端 hook 消费方，都要套这个 pattern。

```ts
// 反模式 ❌：只 invalidate ReactQuery
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ["organization", "full", orgId] });
  // ← 缺 setActive，sidebar 的 PlanBadge / 其他 useActiveOrganization 消费者拿到的是旧 plan
},
```

## Forbidden / Anti-Patterns

- Duplicating server query data into TanStack Store (creates invalidation drift).
- Mutating Store state directly instead of `setState` immutable updates.
- Using global store for one-component transient inputs.
- 改完 BA additionalField 只 invalidate ReactQuery、不调 `setActive` 刷 BA active-org 缓存（导致 sidebar / `useActiveOrganization` 消费者显示旧值）。
