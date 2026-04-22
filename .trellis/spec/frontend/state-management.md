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
// src/routes/demo/orpc-todo.tsx
const [todo, setTodo] = useState('')

// src/routes/demo/better-auth.tsx
const [isSignUp, setIsSignUp] = useState(false)
const [email, setEmail] = useState('')
const [password, setPassword] = useState('')
```

## Layer 2: Server State (Cached)

Use TanStack Query for server-backed data. Prefer oRPC query utilities for end-to-end typed options; prefer ZenStack auto-generated hooks for single-model CRUD (see `frontend/hook-guidelines.md`).

```ts
// src/orpc/client.ts
export const client: RouterClient<typeof router> = getORPCClient()
export const orpc = createTanstackQueryUtils(client)

// src/routes/demo/orpc-todo.tsx
const { data, refetch } = useQuery(orpc.listTodos.queryOptions({ input: {} }))
const { mutate: addTodo } = useMutation({
  mutationFn: orpc.addTodo.call,
  onSuccess: () => refetch(),
})

// Plain Query fallback (src/routes/demo/tanstack-query.tsx)
useQuery({
  queryKey: ['todos'],
  queryFn: () => Promise.resolve([...]),
  initialData: [],
})
```

## Layer 3: Global Client State

Use TanStack Store for lightweight shared client state and derived views.

```ts
// src/lib/demo-store.ts
export const store = new Store({ firstName: 'Jane', lastName: 'Smith' })
export const fullName = new Store(`${store.state.firstName} ${store.state.lastName}`)

store.subscribe(() => {
  fullName.setState(() => `${store.state.firstName} ${store.state.lastName}`)
})

// Immutable update (src/routes/demo/store.tsx)
store.setState((state) => ({ ...state, firstName: e.target.value }))
```

Real usage: `menuStore` (dynamic sidebar items from `getUserMenus`), `tabbarStore` (tab navigation state). See `frontend/layout-guidelines.md`.

## SSR Prefetch + Hydration Contract

Route loaders can prefetch query cache on the server; router-level integration hydrates it.

```ts
// src/routes/demo/orpc-todo.tsx
await context.queryClient.prefetchQuery(
  orpc.listTodos.queryOptions({ input: {} }),
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
