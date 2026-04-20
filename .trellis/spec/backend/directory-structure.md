# Directory Structure

> Backend role layout and placement rules in this TanStack Start project.

---

## Overview

Backend entry points are route files with `server.handlers`, supported by oRPC router modules, ZenStack-backed database access, auth handler wiring, and MCP transport/business modules.

## HTTP Entry Points (`src/routes/*.$.ts` + `src/routes/mcp.ts`)

Each route below is an HTTP backend surface:

| File | Purpose | Protocol |
|------|---------|----------|
| `src/routes/api.rpc.$.ts` | Internal typed RPC endpoint | oRPC RPC |
| `src/routes/api.$.ts` | OpenAPI + Swagger surface | oRPC OpenAPI |
| `src/routes/api/auth/$.ts` | Auth request passthrough | Better Auth |
| `src/routes/mcp.ts` | MCP server endpoint | JSON-RPC over HTTP |
| `src/routes/demo/api.mcp-todos.ts` | Demo SSE + JSON POST endpoint | SSE + JSON |

### Evidence

Source: `src/routes/api.rpc.$.ts:19-28`.

```ts
server: {
  handlers: {
    HEAD: handle,
    GET: handle,
    POST: handle,
    PUT: handle,
    PATCH: handle,
    DELETE: handle,
  },
},
```

Source: `src/routes/api/auth/$.ts:7-8`, `src/routes/mcp.ts:49-51`.

```ts
GET: ({ request }) => auth.handler(request),
POST: ({ request }) => auth.handler(request),
POST: async ({ request }) => handleMcpRequest(request, server),
```

## oRPC Tree Layout

- Procedure definitions: `src/orpc/router/*.ts`
- Router aggregation: `src/orpc/router/index.ts`
- Shared schemas: `src/orpc/schema.ts`
- Isomorphic client wiring: `src/orpc/client.ts`

Keep exported router map flat until namespace growth requires sub-routers.

### Evidence

Source: `src/orpc/router/index.ts:1-6`.

```ts
import { addTodo, listTodos } from './todos'
export default {
  listTodos,
  addTodo,
}
```

Source: `src/orpc/router/todos.ts:5-13`.

```ts
export const listTodos = authed.input(z.object({})).handler(async () => ...)
export const addTodo = authed.input(z.object({ title: z.string().min(1) })).handler(async ({ input }) => ...)
```

## Auth Split: Server vs Client

- Server auth instance: `src/lib/auth.ts`
- Client auth SDK wrapper: `src/lib/auth-client.ts`
- HTTP handler route delegates to server instance.

### Evidence

Source: `src/lib/auth.ts:4-9`, `src/lib/auth-client.ts:1-3`.

```ts
export const auth = betterAuth({ ... plugins: [tanstackStartCookies()] })
export const authClient = createAuthClient()
```

Source: `src/routes/api/auth/$.ts:2,7-8`.

```ts
import { auth } from '#/lib/auth'
GET: ({ request }) => auth.handler(request)
POST: ({ request }) => auth.handler(request)
```

## Database Layout and Ownership

- ZModel schema lives in `zenstack/schema.zmodel`.
- Generated runtime artifacts (`schema.ts`, `models.ts`, `input.ts`) are produced in-place at `zenstack/` by `zen generate`; all three are git-ignored.
- Runtime singleton (shared `pg.Pool` + `ZenStackClient`) lives in `src/db.ts`.
- Better Auth schema (`user` / `session` / `account` / `verification`) is managed by `@better-auth/cli migrate` — NOT declared in `.zmodel`.
- Seed script: `src/seed.ts` (TypeScript, runs via `tsx`).

### Evidence

Source: `zenstack/schema.zmodel:1-14`.

```zmodel
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Todo {
  id        Int      @id @default(autoincrement())
  title     String
  createdAt DateTime @default(now())
}
```

Source: `src/db.ts:20-28`.

```ts
export const pool =
  globalThis.__pgPool ?? new Pool({ connectionString: databaseUrl });

export const db =
  globalThis.__db ??
  new ZenStackClient(schema, {
    dialect: new PostgresDialect({ pool }),
  });
```

## MCP Backend Layout

- HTTP entry: `src/routes/mcp.ts`
- JSON-RPC transport bridge: `src/utils/mcp-handler.ts`
- Business/state module: `src/mcp-todos.ts`

### Evidence

Source: `src/routes/mcp.ts:5,47-51`.

```ts
import { handleMcpRequest } from '#/utils/mcp-handler'
POST: async ({ request }) => handleMcpRequest(request, server)
```

Source: `src/utils/mcp-handler.ts:6-9`, `src/mcp-todos.ts:24-33`.

```ts
export async function handleMcpRequest(request: Request, server: McpServer): Promise<Response>
export function addTodo(title: string) {
  todos.push({ id: todos.length + 1, title })
  fs.writeFileSync(todosPath, JSON.stringify(todos, null, 2))
}
```

## Polyfill Ordering Rule

Any oRPC-hosting route must import `#/polyfill` first.

### Evidence

Source: first line in `src/routes/api.rpc.$.ts:1` and `src/routes/api.$.ts:1`.

```ts
import '#/polyfill'
```

## Where New Backend Code Goes

- New RPC procedure: `src/orpc/router/<domain>.ts` and export from `src/orpc/router/index.ts`.
- New database model: `zenstack/schema.zmodel` then run `pnpm db:push` (dev) or `pnpm db:migrate` (prod).
- New HTTP endpoint: `src/routes/<feature>.$.ts` or specific route with `server.handlers`.

### Evidence

Source: current procedure placement (`src/orpc/router/todos.ts`) and export (`src/orpc/router/index.ts`).

```ts
export const addTodo = authed.input(...).handler(...)
export default { listTodos, addTodo }
```

Source: db push command and schema ownership in `package.json:19`, `zenstack/schema.zmodel:10-14`.

```json
"db:push": "dotenv -e .env.local -- zen db push"
```

```zmodel
model Todo {
  id        Int      @id @default(autoincrement())
  title     String
  createdAt DateTime @default(now())
}
```

## Sentry Bootstrap Location

Sentry server bootstrap is at repository root and loaded by startup script flags.

### Evidence

Source: `instrument.server.mjs:1,8-16` and `package.json:9,16`.

```js
import * as Sentry from '@sentry/tanstackstart-react'
Sentry.init({ dsn: sentryDsn, sendDefaultPii: true, ... })
```

```json
"dev": "... NODE_OPTIONS='--import ./instrument.server.mjs' ...",
"start": "node --import ./.output/server/instrument.server.mjs .output/server/index.mjs"
```
