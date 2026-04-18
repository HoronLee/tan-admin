# Hook Guidelines

> Hook design and usage patterns grounded in the current codebase.

---

## Hook File Placement and Naming

- Put custom hook factories and contexts in `src/hooks/`.
- Use dotted-flat file names for grouped hook modules (example: `demo.form.ts`, `demo.form-context.ts`).

### Evidence

Source: `src/hooks` file set.

```text
src/hooks/demo.form-context.ts
src/hooks/demo.form.ts
```

Source: context/hook exports in `src/hooks/demo.form-context.ts:3-4`.

```ts
export const { fieldContext, useFieldContext, formContext, useFormContext } =
  createFormHookContexts()
```

## TanStack Form Hook Factory Pattern

Build one project hook factory and consume it in routes.

- Define shared contexts with `createFormHookContexts()`.
- Build typed form hook with `createFormHook({ fieldComponents, formComponents, ... })`.

### Evidence

Source: `src/hooks/demo.form-context.ts:1-4`.

```ts
import { createFormHookContexts } from '@tanstack/react-form'
export const { fieldContext, useFieldContext, formContext, useFormContext } =
  createFormHookContexts()
```

Source: `src/hooks/demo.form.ts:11-22`.

```ts
export const { useAppForm } = createFormHook({
  fieldComponents: { TextField, Select, TextArea },
  formComponents: { SubscribeButton },
  fieldContext,
  formContext,
})
```

Source: `src/routes/demo/form.address.tsx:10`.

```ts
const form = useAppForm({ ... })
```

## External Session Hook Usage

`authClient.useSession()` returns `{ data, isPending }`. Always branch on pending/loading before reading `session.user`.

### Evidence

Source: `src/integrations/better-auth/header-user.tsx:5-13`.

```ts
const { data: session, isPending } = authClient.useSession()
if (isPending) {
  return <div className="... animate-pulse" />
}
if (session?.user) { ... }
```

Source: `src/routes/demo/better-auth.tsx:10,18,26`.

```ts
const { data: session, isPending } = authClient.useSession()
if (isPending) { ... }
if (session?.user) { ... }
```

## Store Subscription Hooks

For TanStack Store state, use selector-based subscriptions to keep rerenders scoped.

### Evidence

Source: `src/routes/demo/store.tsx:11,25,39`.

```ts
const firstName = useStore(store, (state) => state.firstName)
const lastName = useStore(store, (state) => state.lastName)
const fName = useStore(fullName, (state) => state)
```

Source: derived-store update in `src/lib/demo-store.ts:12-14`.

```ts
store.subscribe(() => {
  fullName.setState(() => `${store.state.firstName} ${store.state.lastName}`)
})
```

## Route and Data Hooks

Preferred data hooks in route components:

- `Route.useLoaderData()` for loader-returned route data.
- `useQuery` / `useMutation` for cached server state.
- `useRouter()` for route-level invalidation/navigation.

### Evidence

Source: `src/routes/demo/prisma.tsx:29-31,41`.

```ts
const router = useRouter()
const todos = Route.useLoaderData()
router.invalidate()
```

Source: `src/routes/demo/orpc-todo.tsx:19-23,26-29`.

```ts
const { data, refetch } = useQuery(orpc.listTodos.queryOptions({ input: {} }))
const { mutate: addTodo } = useMutation({
  mutationFn: orpc.addTodo.call,
  onSuccess: () => refetch(),
})
```

## React Compiler Implication for Hooks

Because React Compiler is enabled, avoid creating wrapper hooks only to memoize call sites. Start with direct hook usage and optimize only with measured bottlenecks.

### Evidence

Source: compiler plugin enabled in `vite.config.ts:21-24`.

```ts
viteReact({
  babel: { plugins: ['babel-plugin-react-compiler'] },
})
```

## Forbidden / Avoided Patterns

- Wrapper hooks that only rename one `useQuery` call without shared policy.
- Reading `session.user` before pending state is handled.
- Wide store subscriptions without selectors when field-level selectors are possible.

### Evidence

Source: direct, uncloaked query use in `src/routes/demo/orpc-todo.tsx:19-23`.

```ts
useQuery(orpc.listTodos.queryOptions({ input: {} }))
```

Source: pending-first auth session pattern in `src/integrations/better-auth/header-user.tsx:7-13`.

```ts
if (isPending) {
  return <div className="..." />
}
if (session?.user) { ... }
```
