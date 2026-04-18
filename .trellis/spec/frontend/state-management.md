# State Management

> Practical state-layer rules from this repository.

---

## Overview

Use three layers intentionally:

- Local component state (`useState`) for single-component concerns.
- Server state (`useQuery` / `useMutation`, usually via oRPC query utils) for remote source-of-truth data.
- Global client state (`@tanstack/store`) for app-wide client-only values.

## Layer 1: Local Component State

Default to local state unless multiple siblings must coordinate the same value.

### Evidence

Source: `src/routes/demo/orpc-todo.tsx:25`.

```ts
const [todo, setTodo] = useState('')
```

Source: `src/routes/demo/better-auth.tsx:11-16`.

```ts
const [isSignUp, setIsSignUp] = useState(false)
const [email, setEmail] = useState('')
const [password, setPassword] = useState('')
```

## Layer 2: Server State (Cached)

Use TanStack Query for server-backed data. Prefer oRPC query utilities for end-to-end typed options.

### Evidence

Source: `src/orpc/client.ts:27-29`.

```ts
export const client: RouterClient<typeof router> = getORPCClient()
export const orpc = createTanstackQueryUtils(client)
```

Source: `src/routes/demo/orpc-todo.tsx:19-23,26-29`.

```ts
const { data, refetch } = useQuery(orpc.listTodos.queryOptions({ input: {} }))
const { mutate: addTodo } = useMutation({
  mutationFn: orpc.addTodo.call,
  onSuccess: () => refetch(),
})
```

Source: plain Query fallback in `src/routes/demo/tanstack-query.tsx:9-18`.

```ts
useQuery({
  queryKey: ['todos'],
  queryFn: () => Promise.resolve([...]),
  initialData: [],
})
```

## Layer 3: Global Client State

Use TanStack Store for lightweight shared client state and derived views.

### Evidence

Source: `src/lib/demo-store.ts:3-10`.

```ts
export const store = new Store({ firstName: 'Jane', lastName: 'Smith' })
export const fullName = new Store(`${store.state.firstName} ${store.state.lastName}`)
```

Source: derived-store subscription `src/lib/demo-store.ts:12-14`.

```ts
store.subscribe(() => {
  fullName.setState(() => `${store.state.firstName} ${store.state.lastName}`)
})
```

Source: immutable store update `src/routes/demo/store.tsx:16-18`.

```ts
store.setState((state) => ({ ...state, firstName: e.target.value }))
```

## SSR Prefetch + Hydration Contract

Route loaders can prefetch query cache on the server, and router-level integration hydrates it.

### Evidence

Source: `src/routes/demo/orpc-todo.tsx:9-15`.

```ts
await context.queryClient.prefetchQuery(
  orpc.listTodos.queryOptions({ input: {} }),
)
```

Source: `src/router.tsx:22`.

```ts
setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })
```

## Route-Level Invalidation Patterns

Use invalidation that matches the data source:

- Server function routes: `router.invalidate()` after mutation.
- Query-managed routes: `refetch()` or `queryClient.invalidateQueries(...)`.

### Evidence

Source: `src/routes/demo/prisma.tsx:40-42`.

```ts
await createTodo({ data: { title } })
router.invalidate()
```

Source: `src/routes/demo/orpc-todo.tsx:28-30`.

```ts
onSuccess: () => {
  refetch()
  setTodo('')
}
```

## Decision Guide

- Put state in Query when server owns truth.
- Put state in Store for app-wide client state (theme/UI preferences, ephemeral shared values).
- Keep state local by default; lift only when multiple siblings need the same state.

## Forbidden / Anti-Patterns

- Duplicating server query data into TanStack Store (creates invalidation drift).
- Mutating Store state directly instead of `setState` immutable updates.
- Using global store for one-component transient inputs.

### Evidence

Source: current store updates already use immutable spread in `src/routes/demo/store.tsx:17,31`.

```ts
store.setState((state) => ({ ...state, firstName: e.target.value }))
store.setState((state) => ({ ...state, lastName: e.target.value }))
```
