# Type Safety

> Runtime validation + TypeScript inference conventions used in this project.

---

## Overview

Codebase combines compile-time typing and runtime validation:

- TypeScript strict mode (`tsconfig.json#strict: true`).
- Zod at boundaries (oRPC input/schema, env schema, MCP inputSchema).
- End-to-end typed RPC clients through `RouterClient<typeof router>`.

## Boundary Validation with Zod

Validate every external boundary with Zod (or T3Env built on Zod).

```ts
// src/lib/env.ts
import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'
server:       { SERVER_URL: z.string().url().optional() }
clientPrefix: 'VITE_'
client:       { VITE_APP_TITLE: z.string().min(1).optional() }

// src/orpc/router/todos.ts
os.input(z.object({})).handler(() => ...)
os.input(z.object({ name: z.string() })).handler(({ input }) => ...)

// src/orpc/schema.ts — shared
export const TodoSchema = z.object({
  id: z.number().int().min(1),
  name: z.string(),
})
```

## Prefer Inference over Duplicate Types

When a schema exists, derive TS types from it (`z.infer<typeof Schema>`) instead of hand-written mirror interfaces.

```ts
// Schema-based contracts centralized in src/orpc/schema.ts,
// reused in OpenAPI generation (src/routes/api.$.ts)
import { TodoSchema } from '#/orpc/schema'
commonSchemas: { Todo: { schema: TodoSchema } }
```

## End-to-End oRPC Typing

Server router types flow into the client using `RouterClient<typeof router>`:

```ts
// src/orpc/client.ts
import type { RouterClient } from '@orpc/server'
.client((): RouterClient<typeof router> => { ... })
export const client: RouterClient<typeof router> = getORPCClient()

// src/routes/(workspace)/_layout/settings/organization/menus.tsx — typed query/mutation
useQuery(orpc.listMenus.queryOptions({ input: {} }))
useMutation({ ...orpc.createMenu.mutationOptions() })
```

## Typed Router Context

Register router context types once and reuse everywhere:

```ts
// src/routes/__root.tsx
interface MyRouterContext { queryClient: QueryClient }
createRootRouteWithContext<MyRouterContext>()({ ... })

// src/router.tsx — module augmentation
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
```

## React Props Typing

- Do NOT use `React.FC`.
- Use inline typed params and utility types (`React.ComponentProps`, `VariantProps`).

```ts
// src/components/ui/button.tsx
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {

// Plain typed params (src/routes/__root.tsx)
function RootDocument({ children }: { children: React.ReactNode }) {
```

## Catch Blocks: Narrow `unknown`

Convert non-Error throwables safely in error branches:

```ts
// src/lib/mcp/handler.ts
data: error instanceof Error ? error.message : String(error)
```

## Generated Types and Files

Never hand-edit; regenerate with toolchain commands:

- `src/routeTree.gen.ts` (TanStack Router)
- `zenstack/{schema,models,input}.ts` (ZenStack)
- `src/paraglide/**` (Paraglide)

```zmodel
// zenstack/schema.zmodel
generator client {
  provider = "@zenstackhq/orm"
  output   = "."
}
```

```ts
// vite.config.ts
paraglideVitePlugin({
  outdir:   './src/paraglide',
  strategy: ['url', 'baseLocale'],
})
```

## Forbidden Patterns

- `any` in new code.
- Schema/type duplication (manual interface mirrors for the same payload).
- Type assertions that bypass validation at boundaries.
- Editing generated files directly.

```json
// tsconfig.json
"strict": true
```
