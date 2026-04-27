# Quality Guidelines

> Backend quality standards and hard constraints.

---

## Core Baseline

- Use `pnpm` scripts for all quality/build/database actions. No npm/yarn.
- Keep formatting/linting under Biome (`pnpm check`).
- Use `#/*` imports (declared in `package.json#imports`) for cross-module source access.
- Do not edit generated artifacts.

```json
// package.json
"imports": { "#/*": "./src/*" },
"check": "biome check",
"db:migrate": "dotenv -e .env.local -- zen migrate dev"
```

```json
// biome.json — generated files excluded
"!**/src/routeTree.gen.ts",
"!**/src/styles.css",
"!**/src/paraglide/**",
"!**/zenstack/{schema,models,input}.ts"
```

## Polyfill Rule for oRPC Hosting Routes

Any route file that hosts oRPC handlers must import `#/polyfill` as line 1:

```ts
// src/routes/api.rpc.$.ts / src/routes/api.$.ts
import '#/polyfill'
```

Purpose (`src/polyfill.ts`): polyfill missing Node 18 APIs that oRPC depends on. Use Node 20+ for full compatibility.

## Env Access and Validation

- Backend runtime reads server vars through `process.env` (or T3Env proxy).
- Keep env schema declarations in `src/lib/env.ts` for fail-fast validation and client prefix enforcement.
- Client-visible vars must use `VITE_` prefix (`clientPrefix` in env schema).
- **Gotcha**: `VITE_*` in `runtimeEnv` must guard `import.meta.env` with `typeof` check — bare access throws in Node scripts (see `backend/error-handling.md` "Common Mistake" section).

```ts
// src/lib/db.ts
connectionString: process.env.DATABASE_URL!

// src/lib/env.ts
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

```ts
// oRPC
.input(z.object({ name: z.string() }))

// Server fn
.inputValidator((data: { title: string }) => data)

// MCP
inputSchema: { title: z.string().describe('The title of the todo') }
```

Zod failures at oRPC boundary are auto-upgraded to `INPUT_VALIDATION_FAILED` by the interceptor chain — no manual remapping needed. See `backend/error-handling.md`.

## Isomorphic Discipline

Do not import server-only modules into client-only component runtime.

- **Server-only**: `#/lib/db` / `#/lib/auth/{server,session,config,db}` / `#/orpc/router/*` / `#/lib/email/*` / `#/lib/config.server`.
- Use server functions or oRPC clients for UI access to backend logic.

```ts
// Server context — OK
import { db } from '#/lib/db'                    // src/routes/api/model/$.ts
import { auth } from '#/lib/auth/server'         // src/routes/api/auth/$.ts

// Client route — use client, NOT router internals
import { orpc } from '#/orpc/client'             // 业务路由
```

## Testing Expectations

Vitest is installed. Backend testing should start with in-process oRPC router/client tests (no HTTP transport), then add route-level integration tests.

```json
"test": "vitest run",
"vitest": "^3.0.5"
```

```ts
// src/orpc/client.ts
import { createRouterClient } from '@orpc/server'
createRouterClient(router, { context: () => ({ headers: getRequestHeaders() }) })
```

## Sentry Wiring Must Not Be Removed

`instrument.server.mjs` is loaded only via startup `--import` flags:

```json
"dev":   "... NODE_OPTIONS='--import ./instrument.server.mjs' ...",
"start": "node --import ./.output/server/instrument.server.mjs ..."
```

```js
// instrument.server.mjs
import * as Sentry from '@sentry/tanstackstart-react'
```

Sentry init is limited to DSN + tracing — it does NOT install custom `uncaughtException` / `unhandledRejection` handlers; see `backend/error-handling.md` for the fatal-fallback contract.

## OpenAPI Security Declaration

OpenAPI route declares `bearerAuth` scheme + a docs token placeholder. Treat docs token as playground-only text, **never** a real credential:

```ts
// src/routes/api.$.ts
security: [{ bearerAuth: [] }],
components: {
  securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
},
docsConfig: {
  authentication: {
    securitySchemes: { bearerAuth: { token: 'default-token' } },
  },
},
```

## Hard NO Anti-Patterns

- Importing `#/lib/db` / `#/lib/auth/{server,session,config,db}` / `#/lib/email/*` / `#/lib/config.server` from client-only route components.
- Skipping `import '#/polyfill'` in new oRPC-hosting route files.
- Hardcoding secrets (`DATABASE_URL`, auth tokens, SMTP creds).
- Creating ad-hoc `new ZenStackClient()` / `new Pool()` outside `src/lib/db.ts`.
- Logging cookies / tokens / password payloads (pino redacts, but new call sites must not leak into `msg`).
- Hand-editing generated files (`src/routeTree.gen.ts`, `src/paraglide/**`, `zenstack/{schema,models,input}.ts`).
- Using `npm`/`yarn` instead of `pnpm`.

```ts
// src/lib/db.ts (singleton standard)
export const db = globalThis.__db ?? new ZenStackClient(schema, { dialect: ... })
```
