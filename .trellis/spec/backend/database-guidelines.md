# Database Guidelines

> ZenStack v3 + Better Auth (Kysely mode) + PostgreSQL conventions used by backend code.

---

## ORM and Client Generation

- ORM is **ZenStack v3** (runtime built on Kysely; Prisma is only a peer of the CLI for migration).
- Schema source: `zenstack/schema.zmodel` (ZModel, Prisma Schema superset).
- Generated artifacts live next to the `.zmodel` (`zenstack/{schema,models,input}.ts`) and are git-ignored.
- Import the typed `schema` object from `zenstack/schema` (bare path, resolved via `baseUrl: "."`).

### Evidence

Source: `zenstack/schema.zmodel`.

```zmodel
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Menu {
  id                 Int       @id @default(autoincrement())
  name               String?   @unique
  path               String?
  parentId           Int?
  requiredPermission String?   // "user:read" / "menu:write" / ...
  organizationId     String?   // soft link to BA organization.id
  // ...
}
```

Source: `src/lib/db.ts`.

```ts
import { ZenStackClient } from "@zenstackhq/orm";
import { PostgresDialect } from "@zenstackhq/orm/dialects/postgres";
import { Pool } from "pg";
import { schema } from "zenstack/schema";
```

## Shared `pg.Pool` Topology

One `pg.Pool` per process, shared by ZenStack (business tables) and Better Auth (auth tables). Two Kysely instances sit on top of the same pool — independent query planners, single connection budget.

```
new pg.Pool(DATABASE_URL)
   ├─ ZenStackClient(schema, { dialect: PostgresDialect({ pool }) })
   │     → business tables (Menu, …)
   │
   └─ betterAuth({ database: pool })
         → user / session / account / verification / organization / member / ...
```

### Evidence

Source: `src/lib/db.ts` (shared pool singleton).

```ts
export const pool =
  globalThis.__pgPool ?? new Pool({ connectionString: databaseUrl });

export const db =
  globalThis.__db ??
  new ZenStackClient(schema, {
    dialect: new PostgresDialect({ pool }),
  });
```

Source: `src/lib/auth/server.ts` binds the same pool into the BA runtime; everything else BA-related lives in `src/lib/auth/config.ts`.

```ts
export const auth = betterAuth({
  database: pool,
  emailAndPassword: { enabled: true },
  // …
});
```

## Singleton Rule

Always import DB access from `#/lib/db`; never instantiate `ZenStackClient` or `Pool` in request handlers.

### Evidence

Module-load fail-fast handshake (`src/lib/db.ts`): `await db.$connect()` at import time — any connection error terminates the process before serving traffic. Route usage: `import { db } from "#/lib/db"` (see `src/orpc/router/*.ts`).

## Migration and CLI Workflow

- Business schema (ZenStack): `pnpm db:push` | `pnpm db:migrate` | `pnpm db:generate`.
- Auth schema (Better Auth): `pnpm auth:migrate` — creates/updates `user` / `session` / `account` / `verification` / `organization` / `member` / `invitation` / `team` / `teamMember` (interactive, press `y`).
- Seed: `pnpm db:seed` → `tsx src/server/seed.ts`.
- All scripts run through `.env.local` injection; missing `.env.local` blocks everything.

### No `db:reset` — manual full reset

ZenStack CLI has no "reset" command. To wipe the dev DB:

```bash
pnpm exec dotenv -e .env.local -- psql "$DATABASE_URL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
pnpm db:push           # business tables
pnpm auth:migrate      # BA tables (interactive y)
pnpm db:seed           # data
```

Only business-table churn? `pnpm db:push` suffices (prompts before DROP).

### Evidence

Source: `package.json`.

```json
"db:generate": "dotenv -e .env.local -- zen generate",
"db:push":     "dotenv -e .env.local -- zen db push",
"db:migrate":  "dotenv -e .env.local -- zen migrate dev",
"db:studio":   "dotenv -e .env.local -- zen studio",
"db:seed":     "dotenv -e .env.local -- tsx src/server/seed.ts",
"auth:migrate":"dotenv -e .env.local -- npx @better-auth/cli@latest migrate"
```

## Seeding Convention

- Seed script is TypeScript (`tsx`), logs via `createModuleLogger("seed")` — no `console.*`.
- **Skeleton tables fully owned by seed** (e.g. `Menu` navigation tree): TRUNCATE before upsert so removed entries don't linger. Use `CASCADE` when self-referencing FKs exist (`parentId`).
- **Business/user data**: `upsert({ where, update: {}, create })` to preserve manual edits on re-seed.
- **Auth-managed rows** (user / organization / member): super admin via `auth.api.signUpEmail(...)` (correct password hash + auth columns); binding to default org uses direct `pool.query` because seed has no HTTP request context for `auth.api.organization.*`.

```ts
// Menu skeleton — CASCADE handles parentId self-FK.
await pool.query('TRUNCATE TABLE "Menu" RESTART IDENTITY CASCADE');

// Super admin via BA API (password hashing, auth columns).
await auth.api.signUpEmail({ body: { email, password, name: "Super Admin" } });

// Direct pg INSERT — auth.api.* would require request/session context.
await pool.query(
  'INSERT INTO "member" (id, "organizationId", "userId", role, "createdAt") VALUES ($1, $2, $3, $4, now())',
  [randomUUID(), orgId, adminUserId, "owner"],
);
```

## Query Location Rules

- Backend queries belong in oRPC procedures or TanStack Start server functions.
- Never import `db` from client-only components.
- CRUD via `db.<model>.<op>` (Prisma-compatible API).

```ts
// src/orpc/router/todos.ts
export const listTodos = authed.input(z.object({})).handler(async () => {
  return await db.todo.findMany({ orderBy: { createdAt: "desc" } });
});
```

## Forbidden / Anti-Patterns

- Creating `new ZenStackClient()` or `new Pool()` in request paths.
- Executing ZenStack / Better Auth CLI without `.env.local` loading.
- Importing `#/lib/db` into client-only route components.
- Hand-editing `zenstack/{schema,models,input}.ts` (generated).

---

## RBAC PolicyPlugin — Activation & Per-Request Auth

### 1. Scope / Trigger

Applies whenever ZenStack access-control policies (`@@allow` / `@@deny` in `.zmodel`) need to be enforced at runtime. Without `PolicyPlugin` the schema compiles but all policy annotations are silently ignored.

### 2. Package

```bash
pnpm add @zenstackhq/plugin-policy
```

`PolicyPlugin` lives in `@zenstackhq/plugin-policy`, **not** `@zenstackhq/orm`.

### 3. Signatures

```ts
// src/lib/db.ts
import { PolicyPlugin } from "@zenstackhq/plugin-policy";

export const authDb = db.$use(new PolicyPlugin());
// authDb is a new policy-enforced client; original `db` bypasses all policies.

// Per-request (in middleware):
const userDb = authDb.$setAuth({ userId: string, isAdmin?: boolean });
```

### 4. Auth Context Shape in zmodel

```zmodel
type Auth {
  userId  String  @id
  isAdmin Boolean?
  @@auth
}
```

Fields passed to `$setAuth()` must exactly match the `type Auth` block.

### 5. Policy Expression Contracts

| Policy line | Behaviour |
|---|---|
| `@@deny('all', auth() == null)` | Unauthenticated → read = **filtered** (empty), write = **throw ORMError** |
| `@@allow('read', auth() != null)` | Any logged-in user can read |
| `@@allow('all', auth().isAdmin == true)` | isAdmin users bypass all restrictions |
| `@@allow('read', auth() != null && userId == auth().userId)` | Own-record access (UserRole pattern) |

> **Gotcha**: For `findMany` / `findFirst`, policy violations on **read** return empty results, not thrown errors. Only **mutations** throw `ORMError`. Tests must account for this.

### 6. Per-Request Auth Context

`isAdmin` is **not** stored in BA `user` table. It derives from the `UserRole` join: admin iff bound to `super-admin` Role. Centralised in `src/lib/auth/session.ts` and reused by oRPC middleware and ZenStack Server Adapter — **do not** inline it.

```ts
// src/lib/auth/session.ts
export async function getSessionUser(
  input: Request | Headers,
): Promise<AuthSessionContext | null> {
  const session = await auth.api.getSession({ headers: toHeaders(input) })
  if (!session?.user) return null
  const userRoles = await db.userRole.findMany({
    where: { userId: session.user.id },
    include: { role: true },
  })
  const isAdmin = userRoles.some((ur) => ur.role.code === "super-admin")
  return { session, user: session.user, policyAuth: { userId: session.user.id, isAdmin } }
}
```

**oRPC middleware** — gate on session presence, expose `context.authDb`:

```ts
// src/orpc/middleware/auth.ts
const session = await getSessionUser(context.headers)
if (!session) throw errors.UNAUTHORIZED()
context.authDb = authDb.$setAuth(session.policyAuth)
```

**ZenStack adapter** — must pass `$setAuth` on **every** request (including unauthenticated) so `auth() == null` evaluates predictably. Do not return bare `authDb` on the null branch:

```ts
// src/routes/api/model/$.ts
// ✅ Explicit: pass undefined when there's no session so `auth() == null`
getClient: async (request) => {
  const sessionContext = await getSessionUser(request)
  return authDb.$setAuth(sessionContext?.policyAuth)
}

// ❌ Relying on default semantics — behavior may vary across ZenStack versions.
getClient: async (request) => {
  const sessionContext = await getSessionUser(request)
  return sessionContext ? authDb.$setAuth(sessionContext.policyAuth) : authDb
}
```

### 6a. Querying `@@ignore` Tables (BaUser / BaSession / ...)

Ignored models do not appear on the ZenStack ORM client. Use the raw Kysely builder — `db.$qbRaw` is untyped Kysely over the same pool:

```ts
const user = await db.$qbRaw
  .selectFrom("user")
  .where("email", "=", email)
  .select(["id"])
  .executeTakeFirst()
```

Do **not** `db.baUser.findFirst(...)` — the property does not exist.

### 6b. Super-admin Bootstrap (chicken-and-egg)

`Role` model enforces `@@allow('all', auth().isAdmin == true)` → freshly migrated DB has no principal who can create a Role. Seed resolves this by creating the first super-admin up front (opt-in via env):

- `SEED_SUPER_ADMIN_EMAIL` + `SEED_SUPER_ADMIN_PASSWORD` in `.env.local`
- `pnpm db:seed` calls `auth.api.signUpEmail(...)` (idempotent) then upserts `UserRole(super-admin)` binding
- Without env vars set, seed skips bootstrap and logs info

Never auto-promote "the first user" implicitly (security risk in shared dev DBs).

### 7. Validation Matrix

| Scenario | Expected |
|---|---|
| Unauthenticated `findMany` | Returns `[]` (filtered) |
| Unauthenticated `create` | Throws `ORMError` (`REJECTED_BY_POLICY`) |
| Non-admin `create` on Role | Throws `ORMError` |
| isAdmin user `create` | Succeeds |
| Own-record `findMany` | Returns only own rows |
| Other user's records | Filtered out (not thrown) |

### 8. Tests Required

See `src/orpc/middleware/rbac-policy.test.ts`. Assertion points:
- Unauthenticated write → `rejects.toThrow()`
- Unauthenticated read → `resolves` length 0
- Non-admin write → `rejects.toSatisfy(err => err instanceof ORMError)`
- Own-record read → rows where `userId == self`
- Admin write → `resolves` (no throw)

### 9. Wrong vs Correct

```ts
// ❌ Importing PolicyPlugin from the wrong package
import { PolicyPlugin } from "@zenstackhq/orm";

// ❌ Sharing authDb across requests without $setAuth
context.db = authDb;  // auth() == null, all writes rejected

// ✅
import { PolicyPlugin } from "@zenstackhq/plugin-policy";
export const authDb = db.$use(new PolicyPlugin());
// per request:
context.db = authDb.$setAuth({ userId, isAdmin });
```

---

## Better Auth Tables in ZenStack Schema

### Problem

`zen db push` compares the generated Prisma schema against the live database. BA tables (`user`, `session`, `account`, `verification`, `organization`, `team`, `teamMember`, `member`, `invitation`) are physically managed by `pnpm auth:migrate`. If they aren't declared anywhere, Prisma sees them as unknown and proposes to drop them. Hand-writing shadow declarations works but drifts: every `additionalFields` change or BA plugin upgrade requires a parallel manual edit.

### Fix: Auto-Generated `@@ignore` Shadow

`zenstack/_better-auth.zmodel` is generated by `pnpm ba:shadow`. The pipeline:

1. `better-auth/cli generate --config src/lib/auth/codegen.ts` emits a Prisma-shaped schema (every BA table + plugin column + every `additionalFields` you declared)
2. `scripts/ba-shadow.mjs` post-processes: rename each `Model` → `BaModel`, append `@@ignore`, preserve `@@map` and cross-model `@relation`, write final `_better-auth.zmodel`
3. `zenstack/schema.zmodel` imports the shadow at the top: `import "_better-auth"`

Result: the shadow always matches the runtime BA config because both consume the same `src/lib/auth/config.ts` truth.

```zmodel
// zenstack/schema.zmodel (top of file)
import "_better-auth"

datasource db { ... }
plugin policy { ... }

// ... business models follow
```

```zmodel
// zenstack/_better-auth.zmodel — AUTO-GENERATED, DO NOT EDIT
model BaUser {
  id            String   @id
  email         String
  // ... incl. all additionalFields (nickname / avatar / status / role / banned ...)
  sessions      BaSession[]
  accounts      BaAccount[]
  members       BaMember[]
  // ...
  @@map("user")
  @@ignore
}
// + 8 other Ba* models with full @relation graph preserved
```

> **Critical**: After upgrading `better-auth` or changing `additionalFields` / `plugins` in `src/lib/auth/config.ts`, you **must** run `pnpm ba:shadow` and commit the regenerated `_better-auth.zmodel`. Skipping this leaves ZenStack policy with a stale view of BA schema.

See [Auth Module Layout](./auth-module-layout.md) for the full codegen contract, error matrix, and design rationale.

### Wrong vs Correct

```
# ❌ Hand-edited shadow that drifts from runtime
model BaUser { ...4 fields... @@ignore }   // missing nickname / role / banned

# ❌ zen db push without any shadow at all:
⚠️  You are about to drop the `user` table, which is not empty (N rows).

# ✅ Auto-generated shadow imported into schema.zmodel:
🚀  Your database is now in sync with your Prisma schema. Done in 170ms
```
