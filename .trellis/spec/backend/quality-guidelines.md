# Quality Guidelines

> Backend quality standards and hard constraints.

---

## Core Baseline

- Use `pnpm` scripts for all quality/build/database actions.
- Keep formatting/linting under Biome (`pnpm check`).
- Use `#/*` imports for cross-module source access.
- Do not edit generated artifacts.

### Evidence

Source: scripts in `package.json:12-22` and import alias in `package.json:5-7`.

```json
"imports": { "#/*": "./src/*" },
"check": "biome check",
"db:migrate": "dotenv -e .env.local -- prisma migrate dev"
```

Source: Biome exclusions in `biome.json:15-16`.

```json
"!**/src/routeTree.gen.ts",
"!**/src/styles.css"
```

## Polyfill Rule for oRPC Hosting Routes

Any route file that hosts oRPC handlers must import `#/polyfill` as line 1.

### Evidence

Source: `src/routes/api.rpc.$.ts:1`, `src/routes/api.$.ts:1`.

```ts
import '#/polyfill'
```

Source: polyfill purpose in `src/polyfill.ts:4-8`.

```ts
/**
 * This file aims to polyfill missing APIs in Node.js 18 that oRPC depends on.
 * ...use Node.js 20 or later for full compatibility.
 */
```

## Env Access and Validation

- Backend runtime reads server vars through `process.env`.
- Keep env schema declarations in `src/env.ts` for fail-fast validation and client prefix enforcement.

### Evidence

Source: process-env usage `src/db.ts:6`, `instrument.server.mjs:3`.

```ts
connectionString: process.env.DATABASE_URL!
const sentryDsn = import.meta.env?.VITE_SENTRY_DSN ?? process.env.VITE_SENTRY_DSN
```

Source: env schema prefix in `src/env.ts:13-17`.

```ts
clientPrefix: 'VITE_',
client: {
  VITE_APP_TITLE: z.string().min(1).optional(),
},
```

## Boundary Validation Is Mandatory

Every new backend boundary must validate input:

- oRPC procedures with `os.input(z.object(...))`
- MCP tools with `inputSchema`
- Server functions with `.inputValidator(...)` (prefer zod schema for non-trivial payloads)

### Evidence

Source: oRPC and server function validators: `src/orpc/router/todos.ts:15`, `src/routes/demo/prisma.tsx:16-17`.

```ts
.input(z.object({ name: z.string() }))
.inputValidator((data: { title: string }) => data)
```

Source: MCP input schema `src/routes/mcp.ts:19-21`.

```ts
inputSchema: {
  title: z.string().describe('The title of the todo'),
},
```

## Isomorphic Discipline

Do not import server-only modules into client-only component runtime.

- Server-only examples: `#/db`, `#/lib/auth`, `#/mcp-todos`, `#/orpc/router/*`.
- Use server functions or oRPC clients for UI access to backend logic.

### Evidence

Source: server-only module usage in server contexts:

```ts
// src/routes/demo/prisma.tsx:3
import { prisma } from '#/db'

// src/routes/api/auth/$.ts:2
import { auth } from '#/lib/auth'
```

Source: client route uses oRPC client, not router internals (`src/routes/demo/orpc-todo.tsx:5`).

```ts
import { orpc } from '#/orpc/client'
```

## Testing Expectations

Vitest is installed. Backend testing should start with in-process oRPC router/client tests (without HTTP transport), then add route-level integration tests as needed.

### Evidence

Source: test tooling in `package.json:12,83` and oRPC in-process server client utility in `src/orpc/client.ts:1,14`.

```json
"test": "vitest run",
"vitest": "^3.0.5"
```

```ts
import { createRouterClient } from '@orpc/server'
createRouterClient(router, { context: () => ({ headers: getRequestHeaders() }) })
```

## Sentry Wiring Must Not Be Removed

`instrument.server.mjs` is loaded only via startup import flags.

### Evidence

Source: `package.json:9,16` and `instrument.server.mjs:1`.

```json
"dev": "... NODE_OPTIONS='--import ./instrument.server.mjs' ...",
"start": "node --import ./.output/server/instrument.server.mjs ..."
```

```js
import * as Sentry from '@sentry/tanstackstart-react'
```

## OpenAPI Security Declaration

OpenAPI route declares `bearerAuth` scheme and a docs token placeholder. Treat docs token as playground-only text, never as a real credential.

### Evidence

Source: `src/routes/api.$.ts:34-40,45-49`.

```ts
security: [{ bearerAuth: [] }],
components: {
  securitySchemes: {
    bearerAuth: { type: 'http', scheme: 'bearer' },
  },
},
docsConfig: {
  authentication: {
    securitySchemes: {
      bearerAuth: { token: 'default-token' },
    },
  },
},
```

## Hard NO Anti-Patterns

- Importing `#/db` or `#/lib/auth` from client-only route components.
- Skipping `import '#/polyfill'` in new oRPC-hosting route files.
- Hardcoding secrets (`DATABASE_URL`, auth tokens).
- Creating ad hoc `new PrismaClient()` outside `src/db.ts` for request handling.
- Logging cookies/tokens/password payloads.
- Editing generated files (`src/generated/prisma/*`, `src/routeTree.gen.ts`).

### Evidence

Source: singleton standard `src/db.ts:13`; generated warning `src/routeTree.gen.ts:7-9`; polyfill-first routes `src/routes/api.$.ts:1`.

```ts
export const prisma = globalThis.__prisma || new PrismaClient({ adapter })
```
