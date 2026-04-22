# Hook Guidelines

> Hook design and usage patterns grounded in the current codebase.

---

## Hook File Placement and Naming

- Custom hook factories and contexts live in `src/hooks/`.
- Use dotted-flat file names for grouped modules (e.g. `demo.form.ts`, `demo.form-context.ts`).

```ts
// src/hooks/demo.form-context.ts
export const { fieldContext, useFieldContext, formContext, useFormContext } =
  createFormHookContexts()
```

## TanStack Form Hook Factory Pattern

Build one project hook factory and consume it in routes.

```ts
// src/hooks/demo.form-context.ts
import { createFormHookContexts } from '@tanstack/react-form'
export const { fieldContext, useFieldContext, formContext, useFormContext } =
  createFormHookContexts()

// src/hooks/demo.form.ts
export const { useAppForm } = createFormHook({
  fieldComponents: { TextField, Select, TextArea },
  formComponents: { SubscribeButton },
  fieldContext,
  formContext,
})

// src/routes/demo/form.address.tsx
const form = useAppForm({ ... })
```

## External Session Hook Usage

`authClient.useSession()` returns `{ data, isPending }`. Always branch on pending before reading `session.user`:

```ts
// src/integrations/better-auth/header-user.tsx
const { data: session, isPending } = authClient.useSession()
if (isPending) {
  return <div className="... animate-pulse" />
}
if (session?.user) { ... }
```

## Store Subscription Hooks

For TanStack Store state, use selector-based subscriptions to keep rerenders scoped:

```ts
// src/routes/demo/store.tsx
const firstName = useStore(store, (state) => state.firstName)
const lastName  = useStore(store, (state) => state.lastName)
const fName     = useStore(fullName, (state) => state)

// Derived store via subscribe
store.subscribe(() => {
  fullName.setState(() => `${store.state.firstName} ${store.state.lastName}`)
})
```

## ZenStack Auto-Generated CRUD Hooks

Model CRUD goes through ZenStack's TanStack Query client, not hand-written oRPC procedures. Call `useZenStackQueries()` to get a model-keyed client with fully-typed `useFindMany` / `useFindUnique` / `useCount` / `useCreate` / `useUpdate` / `useDelete`. Cache invalidation on successful mutations is automatic (including nested reads).

```ts
// src/zenstack/client.ts
import { schema } from "zenstack/schema"
import { useClientQueries } from "@zenstackhq/tanstack-query/runtime-v5/react"
import type { authDb } from "#/db"

export function useZenStackQueries() {
  return useClientQueries<typeof authDb>(schema, { endpoint: "/api/model" })
}

// src/routes/(admin)/roles/index.tsx
const client = useZenStackQueries()
const rolesQuery  = client.role.useFindMany({ orderBy: [{ order: "asc" }], skip, take: PAGE_SIZE })
const countQuery  = client.role.useCount()
const createRole  = client.role.useCreate()
const updateRole  = client.role.useUpdate()
const deleteRole  = client.role.useDelete()
```

### When to use ZenStack hooks vs oRPC

| Concern | Stack | Hook |
|---------|-------|------|
| Single-model CRUD on a policy-protected model | ZenStack | `client.<model>.useFindMany` / `useCreate` / `useUpdate` / `useDelete` |
| Cross-model tx, batch ops, device commands, jobs | oRPC | `useQuery(orpc.<proc>.queryOptions(...))`, `useMutation({ mutationFn: orpc.<proc>.call })` |
| Auth (sign in/up/out, session reads) | Better Auth | `authClient.useSession()` |
| Models with `@@ignore` in zmodel (e.g. `BaUser`) | **oRPC only** | ZenStack won't generate hooks for ignored models |

- **Why ZenStack for CRUD**: zero per-model procedures; auto cache invalidation includes related reads; PolicyPlugin enforces row-level policies identically.
- **Why oRPC for actions**: explicit input/output + typed errors; arbitrary server logic, external calls, multi-model tx.

### Passing field-level validation errors from ZenStack into forms

`INPUT_VALIDATION_FAILED` must stay silent from `reportError`'s toast path and surface as field errors. Inspect via `getZenStackHttpError(error)` inside mutation's `catch` before delegating to `reportError`:

```ts
// src/routes/(admin)/roles/index.tsx
function setServerValidation(error: unknown): boolean {
  const zenStackError = getZenStackHttpError(error)
  if (!zenStackError) return false
  const code = mapZenStackReasonToCode(zenStackError.reason, zenStackError.dbErrorCode)
  if (code !== "INPUT_VALIDATION_FAILED") return false
  // ... set field errors
  return true
}

try { await createRole.mutateAsync({ data }) }
catch (error) {
  if (setServerValidation(error)) return // swallow — handled at field level
  reportError(error)
}
```

### Gotcha: typing the client

Pass `typeof authDb` as the generic so return types include plugin extensions (PolicyPlugin-attached fields). Bare `useClientQueries(schema, ...)` loses plugin typings.

### Don't: hand-write oRPC for plain CRUD

```ts
// ❌ Don't
export const listRoles = authed.handler(async ({ context }) =>
  context.authDb.role.findMany(...)
)

// ✅ Add @@allow policies to Role in zenstack/schema.zmodel;
//    hooks are generated automatically.
```

## Route and Data Hooks

Preferred data hooks in route components: `Route.useLoaderData()` · `useQuery` / `useMutation` · `useRouter()`.

```ts
// src/routes/demo/prisma.tsx
const router = useRouter()
const todos  = Route.useLoaderData()
router.invalidate()

// src/routes/demo/orpc-todo.tsx
const { data, refetch } = useQuery(orpc.listTodos.queryOptions({ input: {} }))
const { mutate: addTodo } = useMutation({
  mutationFn: orpc.addTodo.call,
  onSuccess: () => refetch(),
})
```

## React Compiler Implication for Hooks

React Compiler is enabled (`babel-plugin-react-compiler`). Avoid wrapper hooks that exist only to memoize; start with direct hook usage and optimize on measured bottlenecks.

## Forbidden / Avoided Patterns

- Wrapper hooks that only rename one `useQuery` without shared policy.
- Reading `session.user` before pending state is handled.
- Wide store subscriptions without selectors when field-level selectors are possible.
- Hand-written oRPC procedures for plain policy-protected CRUD — use ZenStack hooks.
- Passing BA client errors to `reportError` — use `translateAuthError` (see `frontend/i18n.md` + `backend/error-handling.md`).
