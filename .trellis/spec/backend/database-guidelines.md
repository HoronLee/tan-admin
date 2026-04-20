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
