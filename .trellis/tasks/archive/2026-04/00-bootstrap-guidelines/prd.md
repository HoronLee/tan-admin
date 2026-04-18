# Bootstrap: Fill Frontend + Backend Development Guidelines

## Goal

Fill **all spec files** under `.trellis/spec/frontend/` (6 files) and `.trellis/spec/backend/` (5 files) with this project's **actual** conventions, extracted from the real codebase. Every pattern must be backed by a concrete file path. No placeholder text, no generic advice.

Write every spec file in **English** (matches each `index.md`).

### About "frontend" vs "backend" in a TanStack Start project

TanStack Start is a full-stack framework — **frontend and backend share one `src/` tree**. The split is by *role*, not by directory:

- **Frontend role** = UI components, route pages rendered in the browser, client-side hooks/state/styling. Lives under `src/components/`, `src/hooks/`, `src/integrations/`, `src/lib/` (client helpers like `auth-client.ts`, `utils.ts`, `demo-store.ts`), and the **client portion** of `src/routes/*.tsx` (the `component` / route React trees).
- **Backend role** = HTTP handlers, RPC procedures, DB access, auth server, MCP server, server functions. Lives under `src/orpc/`, `src/db.ts`, `src/mcp-todos.ts`, `src/lib/auth.ts`, `src/utils/mcp-handler.ts`, `src/polyfill.ts`, and the **server portion** of `src/routes/*.$.ts` + `createServerFn(...)` calls inside `.tsx` routes.
- A single file can have both roles — e.g. `src/routes/demo/prisma.tsx` defines `createServerFn` (backend) and renders React (frontend). Document patterns in whichever spec the role belongs to.

---

## Tools Available

This project does **not** have GitNexus or ABCoder MCP configured. Use plain file tools:

| Tool | Use for |
|------|---------|
| `Read` | Read a specific file (absolute path) |
| `Grep` | Regex/keyword search across the repo — use `glob`/`type` to filter |
| `Glob` | List files by pattern, e.g. `src/routes/**/*.tsx` |

Always prefer these over shell `cat`/`grep`/`find`.

---

## Architectural Context (read before filling specs)

### Stack at a glance
- **Framework**: TanStack Start (SSR + server functions) + TanStack Router (file-based, 100% type-safe)
- **React**: 19 + React Compiler (Babel plugin `babel-plugin-react-compiler`, see `vite.config.ts`). Compiler auto-memoizes — do **not** reflexively reach for `useMemo`/`useCallback`; treat them as exceptions, not defaults.
- **Data layer**: Prisma 7 (PostgreSQL) + oRPC (end-to-end type-safe RPC) + TanStack Query (client cache) + TanStack Store (light global state)
- **UI**: shadcn/ui (copied into `src/components/ui/`, not an npm dep) + Tailwind v4 + Radix UI + `class-variance-authority` + `clsx` + `tailwind-merge`
- **Forms**: TanStack Form via `createFormHook` factory
- **Auth**: Better Auth (server + React client)
- **i18n**: Paraglide (inlang) — messages in `src/paraglide/`, project config in `project.inlang/`
- **Env**: T3Env + Zod in `src/env.ts`
- **Tooling**: pnpm (mandatory), Biome 2.4.5 (tabs indent, double quotes, linter `recommended`), Vitest 3, TypeScript 5.7, Vite 8
- **Observability**: Sentry (`instrument.server.mjs` via `NODE_OPTIONS --import`)
- **MCP**: this project *serves* an MCP server at `/mcp`

### Import alias — CRITICAL
- `#/*` → `./src/*`, declared in `package.json` → `imports` field (NOT `tsconfig.json` `paths`)
- TS resolves it via `moduleResolution: bundler`
- Always use `#/...`. Never `../../` across 2+ levels.

Examples from the codebase:
- `src/orpc/client.ts:10` → `import router from '#/orpc/router'`
- `src/routes/demo/prisma.tsx:3` → `import { prisma } from '#/db'`

### Routing
- File path = URL. Two conventions coexist:
  - **Directory style**: `src/routes/demo/orpc-todo.tsx` → `/demo/orpc-todo`
  - **Flat dot-style**: `src/routes/demo.i18n.tsx` → `/demo/i18n`, `src/routes/form.address.tsx`, `src/routes/api.rpc.$.ts`
- Root layout: `src/routes/__root.tsx` using `createRootRouteWithContext<MyRouterContext>()`; context carries the `QueryClient`
- Generated route tree: `src/routeTree.gen.ts` — **never edit by hand** (ignored by Biome at `biome.json:15`)
- Route instance in `src/router.tsx` wires SSR-query integration: `setupRouterSsrQueryIntegration`, `defaultPreload: "intent"`

### Data fetching — three layered patterns
1. **oRPC + TanStack Query** (preferred for typed client/server calls)
   - Define: `src/orpc/router/todos.ts` — `os.input(z.object({...})).handler(({input}) => ...)`
   - Aggregate: `src/orpc/router/index.ts` default-exports the router map
   - Expose HTTP: `src/routes/api.rpc.$.ts` with `new RPCHandler(router)` and `prefix: '/api/rpc'`
   - Client: `src/orpc/client.ts` uses `createIsomorphicFn().server(...).client(...)` — server-side calls skip HTTP via `createRouterClient`
   - Consume: `const { data } = useQuery(orpc.listTodos.queryOptions({ input: {} }))` — see `src/routes/demo/orpc-todo.tsx`
   - Prefetch in loader: `context.queryClient.prefetchQuery(orpc.listTodos.queryOptions(...))` — see `src/routes/demo/orpc-todo.tsx:9-15`
   - Mutations: `useMutation({ mutationFn: orpc.addTodo.call, onSuccess: () => refetch() })`

2. **Server Functions** (for simple SSR-only endpoints that don't need an RPC client)
   - `const getTodos = createServerFn({ method: 'GET' }).handler(async () => {...})`
   - With input: `.inputValidator((data: {title: string}) => data).handler(async ({data}) => ...)`
   - Call from loader: `loader: async () => await getTodos()`, read via `Route.useLoaderData()`
   - Invalidate after mutation: `router.invalidate()`
   - Example: `src/routes/demo/prisma.tsx`

3. **Plain TanStack Query** (client-only fetches)
   - `useQuery({ queryKey: ['todos'], queryFn: () => ..., initialData: [] })`
   - Example: `src/routes/demo/tanstack-query.tsx`

### State management
- **Local**: `useState` / `useReducer` (React 19, compiler handles memoization)
- **Server cache**: TanStack Query via oRPC integration
- **Global client state**: TanStack Store — `new Store({...})`, consume with `useStore(store, selector)`
- Derived stores: subscribe + recompute pattern — see `src/lib/demo-store.ts`
- Immutable setState: `store.setState(state => ({ ...state, field: next }))` — `src/routes/demo/store.tsx:17`

### Styling
- Tailwind v4 via `@tailwindcss/vite`, utility-first; tokens live in CSS vars in `src/styles.css` (`--sea-ink`, `--line`, `--lagoon-deep`, etc.)
- **Always** merge classes with `cn()` from `#/lib/utils` (`twMerge(clsx(...))`)
- shadcn pattern (cva + `asChild` + `data-slot`): `src/components/ui/button.tsx` is the canonical reference
- `data-slot`, `data-variant`, `data-size` attributes are used for styling hooks
- Inline `style={{...}}` for one-off gradients is tolerated in demo pages; avoid in `src/components/ui/*`
- Dark mode: class-based via `document.documentElement.classList.add('dark'|'light')` + `[data-theme]` attribute (see `src/components/ThemeToggle.tsx` + theme-init inline script in `src/routes/__root.tsx:25`)

### Forms (TanStack Form)
- Contexts: `src/hooks/demo.form-context.ts` — `createFormHookContexts()`
- Hook factory: `src/hooks/demo.form.ts` — `createFormHook({ fieldComponents, formComponents, fieldContext, formContext })` → exports `useAppForm`
- Field/form primitive components live in `src/components/demo.FormComponents.tsx` and wrap shadcn UI
- Validators are inline per-field: `validators: { onBlur: ({value}) => ... }`
- Example: `src/routes/demo/form.address.tsx`

### Auth (Better Auth)
- Server instance: `src/lib/auth.ts` — `betterAuth({ emailAndPassword: {enabled:true}, plugins:[tanstackStartCookies()] })`
- React client: `src/lib/auth-client.ts` — `createAuthClient()`
- Session hook: `authClient.useSession()` → `{ data: session, isPending }`
- Handler route: `src/routes/api/auth/$.ts`
- UI widget: `src/integrations/better-auth/header-user.tsx` (lives under `integrations/`, not `components/`)

### i18n (Paraglide)
- Runtime: `import { getLocale, setLocale, locales } from '#/paraglide/runtime'`
- Messages: `import { m } from '#/paraglide/messages'` — call `m.key({ param })`
- `src/paraglide/` is **generated** (dev/build time) — do not hand-edit
- Example: `src/components/LocaleSwitcher.tsx`
- Strategy: `['url', 'baseLocale']` (see `vite.config.ts`)

### Database
- Prisma Client generated to `src/generated/prisma/` (non-default path, set in `prisma/schema.prisma`)
- Singleton: `src/db.ts` — `globalThis.__prisma` cache + `@prisma/adapter-pg`
- Env `DATABASE_URL` read from `process.env` (not through T3Env; T3Env is for Vite-exposed vars)
- Import: `import { PrismaClient } from '#/generated/prisma/client.js'` (server-only)

### Env
- Single source of truth: `src/env.ts` using `createEnv` from `@t3-oss/env-core`
- Client vars **must** be prefixed `VITE_`
- Unknown vars at runtime → schema error
- `emptyStringAsUndefined: true`

### Testing
- Vitest + `@testing-library/react` + `jsdom` are installed
- **No tests exist yet** — setup is virgin ground; writing the first test file is valid advice

### Build & lint
- `pnpm check` → Biome combined (lint + format)
- `pnpm lint` / `pnpm format` run individually
- `routeTree.gen.ts` and `styles.css` are excluded from Biome
- Format: **tabs** indent, **double quotes**, `organizeImports: "on"`

---

## Files to Fill

For each file below: read the current template, overwrite its sections with real, file-backed content. When a template section doesn't fit, delete it; when a pattern exists that the template misses, add a new section. Finally update `.trellis/spec/frontend/index.md` to reflect the real file set and mark status `Filled`.

### 1. `.trellis/spec/frontend/directory-structure.md`
Document:
- Top-level layout of `src/` (`routes/`, `components/`, `components/ui/`, `orpc/`, `lib/`, `hooks/`, `integrations/`, `generated/prisma/`, `paraglide/`, `data/`, `utils/`)
- The `#/*` alias — where it is declared (`package.json` → `imports`), why it's NOT in `tsconfig.json`
- Route file-naming dual convention (flat `demo.i18n.tsx` vs nested `demo/orpc-todo.tsx`) — when to use which (observed pattern: sibling-flat when grouped, directory when more than ~2 pages)
- Generated artifacts list (do-not-edit): `src/routeTree.gen.ts`, `src/generated/prisma/`, `src/paraglide/`
- Where each concern lives (auth → `src/lib/auth*.ts` + `src/integrations/better-auth/`, DB → `src/db.ts` + `prisma/`, etc.)

Source inputs: `src/`, `package.json`, `prisma/schema.prisma`, `biome.json`, `vite.config.ts`.

### 2. `.trellis/spec/frontend/component-guidelines.md`
Document:
- Two component tiers: primitive UI in `src/components/ui/` (shadcn-generated, cva + `asChild` + `data-slot`) vs domain components at `src/components/*.tsx` (Header, Footer, ThemeToggle, LocaleSwitcher)
- **Props**: inline `{ field }: React.ComponentProps<'tag'> & VariantProps<typeof variants> & { extra }` or a nearby interface; never `React.FC`
- **Class composition**: always `cn(...)` from `#/lib/utils`; never string concatenation
- **cva pattern** recipe with `buttonVariants`-style structure (variants + sizes + defaultVariants)
- **`asChild`** + `Slot.Root` pattern from `radix-ui`
- **Data attributes** (`data-slot`, `data-variant`) are part of the styling contract
- React Compiler: avoid `useCallback`/`useMemo` unless profiling shows a need
- Accessibility: `aria-label` / `aria-pressed` / `sr-only` usage (ThemeToggle, LocaleSwitcher, Header X/GitHub links)
- Anti-patterns:
  - Writing ad-hoc `className={a + ' ' + b}` instead of `cn()`
  - Importing shadcn components as npm packages (they are copied into `ui/`)
  - Hand-editing `routeTree.gen.ts` / `generated/prisma/` / `paraglide/`

Canonical references to cite: `src/components/ui/button.tsx`, `src/components/Header.tsx`, `src/components/ThemeToggle.tsx`, `src/components/LocaleSwitcher.tsx`.

### 3. `.trellis/spec/frontend/hook-guidelines.md`
Document:
- Custom hook file location: `src/hooks/` with **dotted-flat** naming (e.g., `demo.form.ts`, `demo.form-context.ts`) — mirrors route flat style
- TanStack Form hook factory pattern: `createFormHookContexts()` + `createFormHook({ fieldComponents, formComponents, fieldContext, formContext })` — both files must be read
- Session hook from external lib: `authClient.useSession()` — returns `{ data, isPending }`; UI must handle `isPending` before reading `session.user`
- Store subscription: `useStore(store, selector)` to avoid unnecessary rerenders (`src/routes/demo/store.tsx`)
- Router/data hooks: `useRouter()`, `Route.useLoaderData()`, `useQuery`, `useMutation`
- React Compiler implications for custom hooks (same rule: skip manual memoization)
- Anti-pattern: writing a wrapper hook just to rename a TanStack Query call — stay close to `@tanstack/react-query` / `orpc.*.queryOptions()` directly

### 4. `.trellis/spec/frontend/state-management.md`
Document the three layers with concrete examples:
- **Local** — `useState` (`src/routes/demo/orpc-todo.tsx`, `demo/better-auth.tsx`)
- **Server state (cached)** — oRPC + TanStack Query (`src/orpc/client.ts`, `src/routes/demo/orpc-todo.tsx`)
- **Global client state** — TanStack Store (`src/lib/demo-store.ts`, `src/routes/demo/store.tsx`)
  - Derived stores via `subscribe` + `setState`
  - Immutable updates: `setState(s => ({ ...s, field: next }))`
- SSR prefetch + hydration via `setupRouterSsrQueryIntegration` in `src/router.tsx`
- Decision guide: "When to put state in Store vs Query vs local"
  - Query: anything that has a server source of truth
  - Store: small, app-wide, client-only (theme, UI prefs, ephemeral)
  - Local: default; only lift when ≥2 siblings need it
- Anti-pattern: duplicating server data into Store (breaks cache invalidation)
- Route-level data: loaders prefetch; mutations invalidate via `router.invalidate()` (server-fn pattern) or `queryClient.invalidateQueries` (oRPC pattern)

### 5. `.trellis/spec/frontend/type-safety.md`
Document:
- Zod 4 + T3Env for runtime validation at **every boundary** (`src/env.ts`, `src/orpc/router/todos.ts`, `src/orpc/schema.ts`)
- Type inference from schemas: `type X = z.infer<typeof XSchema>` — prefer inference over hand-written mirrors
- oRPC end-to-end types: server handler types flow to client automatically via `RouterClient<typeof router>` (`src/orpc/client.ts:8,20,27`)
- TanStack Router typed context: `createRootRouteWithContext<MyRouterContext>()` (`src/routes/__root.tsx:21,27`) + `declare module '@tanstack/react-router'` register (`src/router.tsx:27-31`)
- React props typing — never `React.FC`; inline interfaces/types; use `React.ComponentProps<'x'>` + `VariantProps<typeof variants>`
- `any` is forbidden in new code; `unknown` + narrowing in catch blocks
- Generated types (`src/generated/prisma/`, `src/routeTree.gen.ts`, `src/paraglide/`) — never hand-edit; re-run the relevant command instead (`pnpm db:generate`, dev server regenerates route tree + paraglide)
- Anti-pattern: duplicating a zod schema as a TS interface — use `z.infer` only

### 6. `.trellis/spec/frontend/quality-guidelines.md`
Document:
- **Package manager**: pnpm **only** — never `npm`/`yarn` (enforced via team convention, see `pnpm` field in `package.json`)
- Biome config: tabs, double quotes, `organizeImports: on`; run `pnpm check` before every commit
- Lint ignores: `src/routeTree.gen.ts`, `src/styles.css` (see `biome.json`)
- Testing: Vitest + React Testing Library + jsdom are installed but unused — first test should live in `src/**/__tests__/*.test.ts(x)` or colocated `*.test.tsx`; run with `pnpm test`
- Logging: `console.error` is acceptable in user-facing error paths (see `src/routes/demo/prisma.tsx:44`); `console.log` is tolerated in demo pages but should not land in `src/components/` or `src/orpc/`
- Dev environment depends on `.env.local`; scripts use `dotenv -e .env.local` — missing file → dev fails fast (this is intentional)
- Secret management: nothing hardcoded; all secrets via `.env.local` validated by `src/env.ts`; `VITE_`-prefixed values are client-exposed (remember what you put there)
- Sentry is loaded via `NODE_OPTIONS --import ./instrument.server.mjs` in `dev`/`start` scripts — do not remove that flag
- Accessibility baseline: every interactive without text (icon buttons, locale chips) needs `aria-label` + `sr-only` fallback
- Anti-patterns list (hard NOs):
  - Using `npm install` / `yarn add`
  - Importing from `../../*` across multiple levels (use `#/*`)
  - Editing generated files (`routeTree.gen.ts`, `src/generated/prisma/*`, `src/paraglide/*`)
  - Hardcoded secrets
  - Importing shadcn primitives from npm instead of `src/components/ui/*`
  - Mutating props or store state directly (always spread)

### 7. `.trellis/spec/frontend/index.md`
After the six files are filled: update the index table so the **Status** column reads `Filled` (or equivalent) for every filled file, and add any file you newly created.

---

## Backend Architectural Context (extra, read before filling backend specs)

### Backend entry points — TanStack Start `server.handlers`
Every backend HTTP surface is a TanStack Router route file that defines `server.handlers`:

| File | Protocol / role | Key details |
|------|-----------------|-------------|
| `src/routes/api.rpc.$.ts` | oRPC **RPC** protocol — internal typed client | `new RPCHandler(router)`, `prefix: '/api/rpc'`, all verbs mapped to one `handle` |
| `src/routes/api.$.ts` | oRPC **OpenAPI** protocol — public REST + Swagger UI | `new OpenAPIHandler(router, { interceptors: [onError(...)], plugins: [SmartCoercionPlugin, OpenAPIReferencePlugin] })`, `prefix: '/api'`, declares `bearerAuth` security scheme, exposes `commonSchemas: { Todo: { schema: TodoSchema } }` |
| `src/routes/api/auth/$.ts` | Better Auth handler | `GET/POST: ({request}) => auth.handler(request)` — trivial delegation |
| `src/routes/mcp.ts` | MCP server (Model Context Protocol) | `new McpServer(...)`, `server.registerTool('addTodo', {inputSchema: {title: z.string().describe(...)}}, handler)`, dispatched via `handleMcpRequest` |
| `src/routes/demo/api.mcp-todos.ts` | SSE stream + JSON POST | `new ReadableStream`, `text/event-stream` headers, pub/sub from `subscribeToTodos` |

All of these load `#/polyfill` first where oRPC is involved (see `api.rpc.$.ts:1`, `api.$.ts:1`).

### oRPC procedures
- Definition: `os.input(z.object({...})).handler(({ input, context }) => {...})` — see `src/orpc/router/todos.ts`
- Aggregation: `src/orpc/router/index.ts` default-exports a flat object map `{ listTodos, addTodo, ... }` (no nested namespaces yet; introduce sub-maps only when the API grows)
- Shared schemas: `src/orpc/schema.ts` exports `TodoSchema` — reused by `api.$.ts` `commonSchemas` so OpenAPI doc reflects the same source of truth
- Isomorphic client: `src/orpc/client.ts` uses `createIsomorphicFn().server(() => createRouterClient(router, { context: () => ({ headers: getRequestHeaders() }) })).client(() => createORPCClient(new RPCLink({url})))` — on the server, calls skip HTTP entirely
- TanStack Query integration: `createTanstackQueryUtils(client)` → the exported `orpc` object gives `orpc.listTodos.queryOptions({ input })` and `orpc.addTodo.call` (used as `mutationFn`)

### Server Functions (TanStack Start)
Alternative to oRPC for SSR-only endpoints that don't need a typed public client:
```ts
const createTodo = createServerFn({ method: 'POST' })
  .inputValidator((data: { title: string }) => data)
  .handler(async ({ data }) => prisma.todo.create({ data }))
```
- Called from `loader` or event handler in the same file; invalidate with `router.invalidate()`
- Example: `src/routes/demo/prisma.tsx`
- Decision: prefer **oRPC** when the procedure is public / typed / shared; use **server functions** when the code is tightly coupled to a single route

### Database (Prisma 7 + Postgres)
- Schema: `prisma/schema.prisma` — `generator client { provider = "prisma-client"; output = "../src/generated/prisma" }`, `datasource db { provider = "postgresql" }`, Postgres 17 locally via `docker-compose.yml`
- Generated client path: `src/generated/prisma/` — **not** the default `node_modules/.prisma`; import as `#/generated/prisma` / `#/generated/prisma/client.js`
- Singleton: `src/db.ts` — uses `globalThis.__prisma` cache in non-production to survive HMR; DB driver is `@prisma/adapter-pg` with `connectionString: process.env.DATABASE_URL!` (bang means the env is validated upstream; missing URL fails fast)
- Migrations: `prisma/migrations/` directory declared in `prisma.config.ts` → `migrations.path: './prisma/migrations'`
- Seed: `prisma/seed.ts` — run via `tsx` (configured in `prisma.config.ts:seed`)
- Scripts all wrap with `dotenv -e .env.local`: `db:push`, `db:migrate`, `db:generate`, `db:studio`, `db:seed`
- `.env.local` is **required** for any db:* script — the missing file fails the shell immediately (intentional, see `package.json` scripts)
- Local dev: `pnpm db:push` for rapid schema iteration; `pnpm db:migrate` for versioned migrations when stabilizing
- Configuration of datasource URL from the Prisma CLI side: `prisma.config.ts` uses `env('DATABASE_URL')` from `prisma/config`

### Auth (Better Auth, server side)
- Server instance: `src/lib/auth.ts` — `betterAuth({ emailAndPassword: { enabled: true }, plugins: [tanstackStartCookies()] })`
- HTTP surface: `src/routes/api/auth/$.ts` — pure delegation `auth.handler(request)`
- Session access server-side: currently only via client's `authClient.useSession()` (SSR cookie plugin carries cookies)
- `context` inside oRPC `createRouterClient` is populated with `getRequestHeaders()` on the server — this is where you'd read the auth cookie for authorization in oRPC procedures (not yet implemented but the wiring is there)

### MCP server (inside the app)
- `src/routes/mcp.ts` creates an `McpServer` and registers tools; each tool has a `title`, `description`, `inputSchema` (zod shape), and a handler returning `{ content: [{ type: 'text', text }] }`
- Transport: `src/utils/mcp-handler.ts` uses `InMemoryTransport.createLinkedPair()` to bridge a single-shot `Request` → `Response`. Note the `setTimeout(resolve, 10)` hack waits for the response — this is fragile; future refactor candidate
- Business logic lives in `src/mcp-todos.ts`: in-memory array + JSON file persistence (`./mcp-todos.json`) + pub/sub (`subscribeToTodos` returns an unsubscribe function)

### Error handling patterns
- **oRPC interceptor**: `api.$.ts` wraps the handler with `onError((error) => console.error(error))` — every OpenAPI request surfaces its error to stderr
- **MCP handler**: `src/utils/mcp-handler.ts` wraps the whole dispatch in try/catch, returning a JSON-RPC error envelope `{ jsonrpc: '2.0', error: { code: -32603, message, data }, id: null }` with HTTP 500
- **Server functions**: caller-side try/catch + `console.error` (`src/routes/demo/prisma.tsx:39-45`)
- **Input validation**: happens at the boundary via zod — invalid input never reaches the handler (oRPC throws a typed error; server-fn throws via `.inputValidator`)
- **No custom error classes** exist yet. Record that as the current state; if the team wants typed errors, that's a future convention.
- **Error narrowing in catches**: `error instanceof Error ? error.message : String(error)` — see `src/utils/mcp-handler.ts:49`

### Logging
- **No logger library**. All logging is `console.*`:
  - `console.error` for failures (`src/utils/mcp-handler.ts:40`, `instrument.server.mjs:?`, `api.$.ts` interceptor, `prisma.tsx:44`, `seed.ts:31`)
  - `console.warn` for degraded startup (`instrument.server.mjs:6` when `VITE_SENTRY_DSN` missing)
  - `console.log` for seed script progress output
- **Sentry** catches unhandled exceptions on the server, loaded via `NODE_OPTIONS='--import ./instrument.server.mjs'` in `dev`/`start` scripts; config in `instrument.server.mjs`:
  - Enabled only when `VITE_SENTRY_DSN` is set, otherwise logs a warning and continues
  - `sendDefaultPii: true`, `tracesSampleRate: 1.0`, `replaysSessionSampleRate: 1.0`, `replaysOnErrorSampleRate: 1.0` — suitable for dev, needs tuning for prod
- **What NOT to log**: `DATABASE_URL`, auth cookies, session tokens, OpenAPI `bearerAuth` values (`default-token` in docs is illustrative only), full user objects containing email/PII
- **PII flag**: `sendDefaultPii: true` in Sentry config — note this explicitly; ingest layer will receive request headers + IP

### Validation (everywhere crossing a boundary)
- Zod 4 (`zod` package) is the only validator
- Points where validation is mandatory:
  - Env vars → `src/env.ts` (T3Env wraps zod)
  - oRPC procedure input → `os.input(z.object(...))`
  - oRPC OpenAPI `commonSchemas` → reused zod schema (`src/orpc/schema.ts` TodoSchema)
  - MCP tool input → `inputSchema: { field: z.string().describe(...) }`
  - Server-fn input → `.inputValidator(data => data)` (current code only narrows types; introduce a zod schema here when accepting non-trivial payloads)
- Never hand-write a TS interface that mirrors a zod schema — always use `z.infer<typeof Schema>`

### Node runtime
- Local dev: Node 20+ (polyfill file notes Node 18 compatibility but recommends 20+)
- Server build: `vite build` → `.output/server/index.mjs`, started with `node --import ./.output/server/instrument.server.mjs .output/server/index.mjs`
- ESM only (`"type": "module"`)

---

## Backend Files to Fill (under `.trellis/spec/backend/`)

### B1. `directory-structure.md`
Document:
- `src/routes/*.$.ts` catch-all convention — each `$.ts` file is an HTTP handler (table of the 5 entry points with their purpose)
- oRPC tree layout: `src/orpc/{client,schema,router/}` and why `router/index.ts` re-exports flat procedures
- `src/lib/auth.ts` (server) vs `src/lib/auth-client.ts` (client) split
- Prisma layout: `prisma/` for schema/migrations/seed, `src/generated/prisma/` for the generated client (never edit, re-run `pnpm db:generate`), `src/db.ts` for the singleton
- MCP layout: `src/routes/mcp.ts` (entry) + `src/utils/mcp-handler.ts` (transport) + `src/mcp-todos.ts` (business)
- Polyfill: `src/polyfill.ts` must be imported first in any oRPC-hosting route file
- Where new backend code should go: new RPC procedure → `src/orpc/router/<domain>.ts` + export in `router/index.ts`; new DB model → `prisma/schema.prisma` + `pnpm db:migrate`
- Sentry init: `instrument.server.mjs` at repo root, loaded via `NODE_OPTIONS --import`

### B2. `database-guidelines.md`
Document:
- ORM: **Prisma 7** with `prisma-client` generator and explicit `output = "../src/generated/prisma"`; import via `#/generated/prisma` (or `#/generated/prisma/client.js` as seed does)
- Driver: `@prisma/adapter-pg` wrapping `DATABASE_URL` (Postgres 17)
- Singleton pattern in `src/db.ts` with `globalThis.__prisma` cache for dev HMR safety
- Schema style: one file (`prisma/schema.prisma`); current model `Todo` uses `@id @default(autoincrement())`, `DateTime @default(now())` — follow the same conventions
- **Migration workflow** — quote `.trellis/spec/backend/*` itself + CLAUDE.md: `pnpm db:push` for fast iteration, `pnpm db:migrate` when stabilizing, always wrapped in `dotenv -e .env.local`
- Seeding: `prisma/seed.ts` run via `tsx` (configured in `prisma.config.ts`), invoked with `pnpm db:seed`
- Transactions: Prisma supports `prisma.$transaction([...])` — not yet used in codebase; recommend using it for multi-step writes when introduced
- Query locations: oRPC procedures in `src/orpc/router/*.ts` or server functions inside route files — never from a component
- Never import Prisma client from a file that runs on the client (Vite tree-shaking won't catch this; it's a server-only module)
- Anti-patterns:
  - Creating new `PrismaClient()` per request (breaks connection pooling — always import from `#/db`)
  - Running Prisma queries without `dotenv -e .env.local` at the CLI (will error on missing `DATABASE_URL`)
  - Hand-editing `src/generated/prisma/`

### B3. `error-handling.md`
Document:
- oRPC interceptor pattern: `interceptors: [onError((error) => console.error(error))]` — see `src/routes/api.$.ts:14-18`
- MCP JSON-RPC error envelope: code `-32603` (internal error), HTTP 500 — see `src/utils/mcp-handler.ts:42-59`
- Server-function caller pattern: try/catch with `console.error` — see `src/routes/demo/prisma.tsx:39-46`
- Input validation **at the boundary** (zod) means handlers can assume valid input — do not re-validate inside the handler body
- Narrowing unknown in catch blocks: `error instanceof Error ? error.message : String(error)` — see `src/utils/mcp-handler.ts:49`
- Current state: **no custom error classes**. Document this, then recommend: when domain-specific errors are needed, introduce them under `src/orpc/errors.ts` (or similar) and throw inside handlers so oRPC serializes them consistently
- Error visibility to clients: oRPC RPC protocol returns typed errors; OpenAPI protocol returns HTTP status + JSON body. MCP always returns JSON-RPC error envelope.
- Anti-patterns:
  - Swallowing errors silently (no empty catch)
  - Throwing plain strings (always throw `Error` or an oRPC-typed error)
  - Leaking internal error details to the public OpenAPI response in production (add a mapping layer when needed)

### B4. `logging-guidelines.md`
Document:
- Logger: currently **none** — `console.*` + Sentry. Document the **actual** state first.
- Log levels:
  - `console.error` → handler failures, unexpected exceptions
  - `console.warn` → degraded-but-running startup conditions (e.g. missing optional env)
  - `console.log` → currently only in `prisma/seed.ts` progress output; avoid in request paths
- Sentry init: `instrument.server.mjs`, required env `VITE_SENTRY_DSN`, loaded via `NODE_OPTIONS --import` (server script `dev`/`start` in `package.json`)
- Sentry settings in use: `sendDefaultPii: true`, `tracesSampleRate: 1.0`, `replaysSessionSampleRate: 1.0` — document these as **dev-only defaults** that must be tuned before production (sample rates → lower, PII → reconsider)
- Request context: oRPC procedures receive `context.headers` (via `createRouterClient` server path) — use this to attach user id / request id to logs once a structured logger is introduced
- What to log: boundary errors, external call failures, DB write failures, auth failures (without secret payloads)
- What NOT to log: `DATABASE_URL`, auth cookies/tokens, raw user passwords, `bearerAuth` tokens, full user objects with PII — even in error details
- Recommended next step (non-binding note): introduce `pino` or `consola` as the structured logger, wire it through an oRPC interceptor so every request gets a child logger; until then, `console.*` is the convention.

### B5. `quality-guidelines.md`
Document:
- Same base rules as the frontend quality doc: **pnpm only**, Biome (tabs + double quotes), `#/*` alias, no editing generated files
- **Polyfill rule**: any route file that hosts oRPC MUST have `import '#/polyfill'` as its **first** line (see `src/routes/api.rpc.$.ts:1`, `api.$.ts:1`)
- **Env var access**: backend reads server vars via `process.env.X` (e.g. `src/db.ts`, `instrument.server.mjs`); declare them in `src/env.ts` so the app fails fast on missing/invalid values
- **Boundary validation mandatory**: every new HTTP entry point (oRPC procedure, MCP tool, server function accepting input) must validate input via zod. No exceptions.
- **Isomorphic discipline**: `createIsomorphicFn()` is how server-only vs client-only code is dispatched; never import a server-only module (`#/db`, `#/lib/auth`) from a `.tsx` component — if you need DB data in a component, go through oRPC or a server function
- **Testing**: Vitest installed, no backend tests yet; first test should cover oRPC procedures using the in-process `createRouterClient` (no HTTP needed). Record that as the recommended starting pattern.
- **Sentry wiring**: do not remove `NODE_OPTIONS='--import ./instrument.server.mjs'` from `dev`/`start` scripts — the file is only loaded via that flag; editing the scripts breaks error reporting silently
- **Secrets**: nothing hardcoded; `.env.local` for local, deployment env for prod; never log them
- **OpenAPI security**: `bearerAuth` scheme is declared in `src/routes/api.$.ts`; if auth-protected procedures are added, wire the actual token check in a procedure-level middleware — the `default-token` in `docsConfig` is for the Swagger playground only and must never be shipped as a real credential
- Anti-patterns (hard NOs):
  - Importing `#/db`, `#/lib/auth`, `#/mcp-todos`, `#/orpc/router/*` from a client-only `.tsx` route component (use oRPC/server-fn instead)
  - Skipping `import '#/polyfill'` in a new oRPC-hosting route file
  - Hardcoding `DATABASE_URL` or tokens
  - Creating a new `PrismaClient()` outside `src/db.ts`
  - Logging auth tokens, cookies, or raw request bodies that may contain secrets
  - Editing `src/generated/prisma/` or `src/routeTree.gen.ts`

### B6. `.trellis/spec/backend/index.md`
After the five backend files are filled: update the index table's **Status** column and add any newly created files.

---

## Important Rules

### Stay in your lane
- **ONLY** modify files under `.trellis/spec/frontend/` and `.trellis/spec/backend/`.
- Do **NOT** modify source code, task files, `CLAUDE.md`, or anything outside those two spec directories.
- Do **NOT** run `git` commands.
- You MAY read any file for analysis.

### Adapt to reality
- Every claim needs a file path. If you can't cite a file, don't include the claim.
- If a template section doesn't apply, **delete** it.
- If a real pattern isn't in the template, **add** a new section.
- Keep the tone concise. Prefer small code blocks over prose.

### Language
- Write all spec files in **English** (index.md mandates this).

---

## Acceptance Criteria

- [ ] All 6 frontend spec files filled with real, file-path-cited content
- [ ] All 5 backend spec files filled with real, file-path-cited content
- [ ] At least 2 concrete code examples per file, quoted from real source (file path + function/line reference)
- [ ] Anti-patterns / "forbidden" section present in: `component-guidelines`, `state-management`, `type-safety`, `quality-guidelines` (frontend) and `database-guidelines`, `error-handling`, `quality-guidelines` (backend)
- [ ] No `(To be filled by the team)` / `<!-- ... -->` placeholders remain in any filled file
- [ ] `.trellis/spec/frontend/index.md` and `.trellis/spec/backend/index.md` Status columns updated to reflect filled state
- [ ] No changes outside `.trellis/spec/frontend/` and `.trellis/spec/backend/`

---

## Technical Notes

- Project root: `/Users/horonlee/projects/node/tan-admin`
- Language: TypeScript 5.7 (strict — see `tsconfig.json`), ESM (`"type": "module"`)
- Runtime: Node 22+ (see `@types/node`); Vite 8; React 19
- Package manager: pnpm (mandatory)
- Build: `pnpm build` → `.output/server/index.mjs`
- Primary CLAUDE.md-level context is in `/Users/horonlee/projects/node/tan-admin/CLAUDE.md` (Chinese) — cross-check against it, but write specs in English.
