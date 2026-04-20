# Database Guidelines

> ZenStack v3 + Better Auth (Kysely mode) + PostgreSQL conventions used by backend code.

---

## ORM and Client Generation

- ORM is **ZenStack v3** (runtime built on Kysely; Prisma is only a peer of the CLI for migration).
- Schema source: `zenstack/schema.zmodel` (ZModel, Prisma Schema superset).
- Generated artifacts live next to the `.zmodel` (`zenstack/{schema,models,input}.ts`) and are git-ignored.
- Import the typed `schema` object from `zenstack/schema` (bare path, resolved via `baseUrl: "."`).

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

Source: `src/db.ts:1-4`.

```ts
import { ZenStackClient } from "@zenstackhq/orm";
import { PostgresDialect } from "@zenstackhq/orm/dialects/postgres";
import { Pool } from "pg";
import { schema } from "../zenstack/schema";
```

## Shared `pg.Pool` Topology

One `pg.Pool` per process, shared by ZenStack (business tables) and Better Auth (auth tables). Two Kysely instances sit on top of the same pool — independent query planners, single connection budget.

```
new pg.Pool(DATABASE_URL)
   ├─ ZenStackClient(schema, { dialect: PostgresDialect({ pool }) })
   │     → business tables (Todo, …)
   │
   └─ betterAuth({ database: pool })
         → user / session / account / verification
```

### Evidence

Source: shared pool singleton in `src/db.ts:16-33`.

```ts
export const pool =
  globalThis.__pgPool ?? new Pool({ connectionString: databaseUrl });

export const db =
  globalThis.__db ??
  new ZenStackClient(schema, {
    dialect: new PostgresDialect({ pool }),
  });
```

Source: Better Auth consuming the same pool in `src/lib/auth.ts:8-10`.

```ts
export const auth = betterAuth({
  database: pool,
  emailAndPassword: { enabled: true },
  // …
});
```

## Singleton Rule

Always import DB access from `#/db`; never instantiate `ZenStackClient` or `Pool` in request handlers.

### Evidence

Source: module-load fail-fast handshake in `src/db.ts:38-42`.

```ts
// Fail-fast: any connection error terminates the process before
// the server accepts traffic.
await db.$connect();
```

Source: route usage imports singleton in `src/orpc/router/todos.ts:2`.

```ts
import { db } from "#/db";
```

## Migration and CLI Workflow

- Business schema (ZenStack): `pnpm db:push` | `pnpm db:migrate` | `pnpm db:generate`.
- Auth schema (Better Auth): `pnpm auth:migrate` — creates `user` / `session` / `account` / `verification`.
- Seed: `pnpm db:seed` → `tsx src/seed.ts`.
- All scripts run through `.env.local` injection.

### Evidence

Source: `package.json:18-24`.

```json
"db:generate": "dotenv -e .env.local -- zen generate",
"db:push": "dotenv -e .env.local -- zen db push",
"db:migrate": "dotenv -e .env.local -- zen migrate dev",
"db:studio": "dotenv -e .env.local -- zen studio",
"db:seed": "dotenv -e .env.local -- tsx src/seed.ts",
"auth:migrate": "dotenv -e .env.local -- npx @better-auth/cli@latest migrate"
```

## Seeding Convention

Seed script is TypeScript (`tsx`), logs via `createModuleLogger("seed")` — no `console.*` in production paths.

### Evidence

Source: `src/seed.ts:1-9`.

```ts
import { db } from "#/db";
import { createModuleLogger } from "#/lib/logger";

const log = createModuleLogger("seed");

async function main() {
  log.info("Seeding database…");
  await db.todo.deleteMany({});
  // …
}
```

## Query Location Rules

- Backend queries belong in oRPC procedures or TanStack Start server functions.
- Never import `db` from client-only components.
- CRUD via `db.<model>.<op>` (Prisma-compatible API).

### Evidence

Source: oRPC procedure in `src/orpc/router/todos.ts:5-7`.

```ts
export const listTodos = authed.input(z.object({})).handler(async () => {
  return await db.todo.findMany({ orderBy: { createdAt: "desc" } });
});
```

## Forbidden / Anti-Patterns

- Creating `new ZenStackClient()` or `new Pool()` in request paths.
- Executing ZenStack / Better Auth CLI without `.env.local` loading.
- Importing `#/db` into client-only route components.
- Hand-editing `zenstack/{schema,models,input}.ts` (generated).

---

## RBAC PolicyPlugin — Activation & Per-Request Auth

### 1. Scope / Trigger

Applies whenever ZenStack access-control policies (`@@allow` / `@@deny` in `.zmodel`) need to be enforced at runtime. Without `PolicyPlugin` the schema compiles but all policy annotations are silently ignored.

### 2. Package

```bash
pnpm add @zenstackhq/plugin-policy
```

`PolicyPlugin` lives in `@zenstackhq/plugin-policy`, NOT in `@zenstackhq/orm`.

### 3. Signatures

```ts
// src/db.ts
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

> **Gotcha**: For `findMany` / `findFirst`, policy violations on **read** return empty results, not thrown errors. Only **mutations** (create/update/delete) throw `ORMError`. Tests must account for this distinction.

### 6. isAdmin Determination

`isAdmin` is **not** stored in Better Auth's `user` table. Compute it per-request in `authMiddleware` using raw `db` (bypassing policies):

```ts
// src/orpc/middleware/auth.ts
const userRoles = await db.userRole.findMany({
  where: { userId: session.user.id },
  include: { role: true },
});
const isAdmin = userRoles.some((ur) => ur.role.code === "super-admin");
const userDb = authDb.$setAuth({ userId: session.user.id, isAdmin });
context.db = userDb;
```

### 7. Validation & Error Matrix

| Scenario | Expected |
|---|---|
| Unauthenticated `findMany` | Returns `[]` (filtered) |
| Unauthenticated `create` | Throws `ORMError` (`REJECTED_BY_POLICY`) |
| Non-admin `create` on Role | Throws `ORMError` (`REJECTED_BY_POLICY` or `NOT_FOUND`) |
| isAdmin user `create` | Succeeds |
| Own-record `findMany` | Returns only own rows |
| Other user's records | Filtered out (not thrown) |

### 8. Tests Required

See `src/orpc/middleware/rbac-policy.test.ts`. Assertion points:
- Unauthenticated write → `rejects.toThrow()`
- Unauthenticated read → `resolves` with length `0`
- Non-admin write → `rejects.toSatisfy(err => err instanceof ORMError)`
- Own-record read → `resolves` with rows where `userId == self`
- Admin write → `resolves` (no throw)

### 9. Wrong vs Correct

#### Wrong

```ts
// WRONG: importing PolicyPlugin from the wrong package
import { PolicyPlugin } from "@zenstackhq/orm";  // ❌ PolicyPlugin does not exist here

// WRONG: sharing one authDb across requests without $setAuth
context.db = authDb;  // ❌ auth() == null, all writes rejected
```

#### Correct

```ts
// src/db.ts
import { PolicyPlugin } from "@zenstackhq/plugin-policy"; // ✅
export const authDb = db.$use(new PolicyPlugin());

// src/orpc/middleware/auth.ts (per request)
const userDb = authDb.$setAuth({ userId, isAdmin });       // ✅
context.db = userDb;
```

---

## Better Auth Tables in ZenStack Schema

### Problem

`zen db push` compares the generated `~schema.prisma` against the live database. Because Better Auth tables (`user`, `session`, `account`, `verification`) are managed by `pnpm auth:migrate` and **not** declared in `schema.zmodel`, Prisma sees them as unknown tables and proposes to drop them.

### Fix: `@@ignore` Placeholder Models

Declare all 4 BA tables in `schema.zmodel` with `@@ignore`. This tells Prisma they exist but stops ZenStack from generating CRUD helpers for them.

```zmodel
model BaUser {
  id            String   @id
  name          String
  email         String   @unique
  emailVerified Boolean
  image         String?
  nickname      String?   // additionalFields
  avatar        String?   // additionalFields
  status        String?   // additionalFields
  createdAt     DateTime
  updatedAt     DateTime

  @@map("user")
  @@ignore
}

model BaSession {
  id        String   @id
  expiresAt DateTime
  token     String   @unique
  createdAt DateTime
  updatedAt DateTime
  ipAddress String?
  userAgent String?
  userId    String

  @@map("session")
  @@ignore
}

model BaAccount {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime
  updatedAt             DateTime

  @@map("account")
  @@ignore
}

model BaVerification {
  id         String    @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime?
  updatedAt  DateTime?

  @@map("verification")
  @@ignore
}
```

> **Critical**: If you add `additionalFields` to Better Auth `user`, mirror them as `String?` in `BaUser` so the column schema stays consistent.

### Wrong vs Correct

#### Wrong

```
# zen db push output without @@ignore models:
⚠️  You are about to drop the `user` table, which is not empty (N rows).
⚠️  You are about to drop the `session` table …
```

#### Correct

```
# zen db push output with @@ignore models:
🚀  Your database is now in sync with your Prisma schema. Done in 170ms
```
