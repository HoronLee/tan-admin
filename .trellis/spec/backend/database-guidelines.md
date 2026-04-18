# Database Guidelines

> Prisma + PostgreSQL conventions used by backend code.

---

## ORM and Client Generation

- ORM is Prisma 7.
- Client generator uses `prisma-client` and outputs into `src/generated/prisma`.
- Import generated client from `#/generated/prisma/*` (server side only).

### Evidence

Source: `prisma/schema.prisma:1-4`.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
```

Source: `src/db.ts:1`, `prisma/seed.ts:1`.

```ts
import { PrismaClient } from './generated/prisma/client.js'
import { PrismaClient } from "../src/generated/prisma/client.js";
```

## Driver and Datasource

- Runtime adapter is `@prisma/adapter-pg`.
- Connection string comes from `process.env.DATABASE_URL`.

### Evidence

Source: `src/db.ts:3-7`.

```ts
import { PrismaPg } from '@prisma/adapter-pg'
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
})
```

Source: `prisma.config.ts:9-11`.

```ts
datasource: {
  url: env('DATABASE_URL'),
},
```

## Prisma Singleton Rule

Always import DB access from `#/db`; do not instantiate `PrismaClient` in request handlers.

### Evidence

Source: singleton cache in `src/db.ts:9-16`.

```ts
declare global {
  var __prisma: PrismaClient | undefined
}
export const prisma = globalThis.__prisma || new PrismaClient({ adapter })
if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma
}
```

Source: route usage imports singleton `src/routes/demo/prisma.tsx:3`.

```ts
import { prisma } from '#/db'
```

## Schema Style and Model Conventions

Current schema style is single-file (`prisma/schema.prisma`) with straightforward model definitions.

### Evidence

Source: `prisma/schema.prisma:10-14`.

```prisma
model Todo {
  id        Int      @id @default(autoincrement())
  title     String
  createdAt DateTime @default(now())
}
```

Source: datasource provider `prisma/schema.prisma:6-8`.

```prisma
datasource db {
  provider = "postgresql"
}
```

## Migration and CLI Workflow

- Rapid iteration: `pnpm db:push`.
- Versioned migration: `pnpm db:migrate`.
- Client regeneration: `pnpm db:generate`.
- All scripts run through `.env.local` injection.

### Evidence

Source: `package.json:18-22`.

```json
"db:generate": "dotenv -e .env.local -- prisma generate",
"db:push": "dotenv -e .env.local -- prisma db push",
"db:migrate": "dotenv -e .env.local -- prisma migrate dev",
"db:seed": "dotenv -e .env.local -- prisma db seed"
```

Source: migrations path and seed in `prisma.config.ts:5-8`.

```ts
migrations: {
  path: './prisma/migrations',
  seed: 'tsx prisma/seed.ts',
}
```

## Seeding Convention

Seed script is TypeScript (`tsx`) and may log progress with `console.log`/`console.error`.

### Evidence

Source: `prisma/seed.ts:11-18,26,30-33`.

```ts
async function main() {
  console.log("🌱 Seeding database...");
  await prisma.todo.deleteMany();
  const todos = await prisma.todo.createMany({ data: [...] });
  console.log(`✅ Created ${todos.count} todos`);
}
.catch((e) => {
  console.error("❌ Error seeding database:", e);
  process.exit(1);
})
```

## Query Location Rules

- Backend queries belong in oRPC procedures or server functions.
- Do not query Prisma from client-only components.

### Evidence

Source: oRPC procedure file `src/orpc/router/todos.ts:10-20`.

```ts
export const listTodos = os.input(z.object({})).handler(() => {
  return todos
})
```

Source: server function query in `src/routes/demo/prisma.tsx:7-10,17-20`.

```ts
}).handler(async () => {
  return await prisma.todo.findMany({ orderBy: { createdAt: 'desc' } })
})
.handler(async ({ data }) => {
  return await prisma.todo.create({ data })
})
```

## Transactions

Prisma transactions are available but not currently used in tracked backend modules. Introduce `prisma.$transaction(...)` for multi-step writes when consistency across statements is required.

### Evidence

Source: no `$transaction` usage in current DB access files; single-step writes in `src/routes/demo/prisma.tsx:18-20` and `prisma/seed.ts:18-24`.

```ts
return await prisma.todo.create({ data })
const todos = await prisma.todo.createMany({ data: [...] })
```

## Forbidden / Anti-Patterns

- Creating `new PrismaClient()` in request paths.
- Executing Prisma CLI commands without `.env.local` loading.
- Importing DB client into client-only route components.
- Hand-editing `src/generated/prisma/*`.

### Evidence

Source: required dotenv wrapping in `package.json:18-22`; singleton pattern in `src/db.ts:13`; generated output path in `prisma/schema.prisma:3`.

```ts
export const prisma = globalThis.__prisma || new PrismaClient({ adapter })
```
