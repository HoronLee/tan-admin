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

Use TanStack Query for server-backed data. Prefer oRPC query utilities for end-to-end typed options; prefer ZenStack auto-generated hooks for single-model CRUD (see `frontend/hook-guidelines.md`).

```ts
// src/orpc/client.ts
export const client: RouterClient<typeof router> = getORPCClient()
export const orpc = createTanstackQueryUtils(client)

// src/routes/(workspace)/_layout/settings/organization/menus.tsx
const { data, isPending } = useQuery(
  orpc.listMenus.queryOptions({ input: {} }),
)
const createMutation = useMutation({
  ...orpc.createMenu.mutationOptions(),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: MENUS_KEY }),
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

Real usage: `menuStore` (dynamic sidebar items from `getUserMenus`), `tabbarStore` (tab navigation state). See `frontend/layout-guidelines.md`.

## SSR Prefetch + Hydration Contract

Route loaders can prefetch query cache on the server; router-level integration hydrates it.

```ts
// 概念示例：route loader 预热查询缓存
await context.queryClient.prefetchQuery(
  orpc.listMenus.queryOptions({ input: {} }),
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

## Forbidden / Anti-Patterns

- Duplicating server query data into TanStack Store (creates invalidation drift).
- Mutating Store state directly instead of `setState` immutable updates.
- Using global store for one-component transient inputs.
