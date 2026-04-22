# Research: current-env-zod

- **Query**: What's in `src/env.ts` today; exact additions for PRD R1/R2/R3/R5
- **Scope**: internal
- **Date**: 2026-04-22

## File: `src/env.ts`

Library: `@t3-oss/env-core ^0.13.11` + `zod ^4.3.6` (see `package.json:41,82`).

Structure: `createEnv({ server, client, clientPrefix: "VITE_", runtimeEnv, emptyStringAsUndefined: true })`.

### Current `server` schema (`src/env.ts:6-22`)

```ts
SERVER_URL: z.string().url().optional(),
APP_NAME: z.string().min(1).optional(),
APP_VERSION: z.string().min(1).optional(),
APP_ENV: z.enum(["dev", "prod", "test"]).optional(),
APP_INSTANCE_ID: z.string().min(1).optional(),
LOG_LEVEL: z.enum(["fatal","error","warn","info","debug","trace","silent"]).optional(),
LOG_SLOW_THRESHOLD_MS: z.coerce.number().int().positive().optional(),
LOG_FILE: z.string().min(1).optional(),
LOG_MAX_SIZE: z.string().min(1).optional(),
LOG_MAX_FILES: z.coerce.number().int().positive().optional(),
BETTER_AUTH_SECRET: z.string().min(32),
BETTER_AUTH_URL: z.string().url(),
SEED_SUPER_ADMIN_EMAIL: z.string().email().optional(),
SEED_SUPER_ADMIN_PASSWORD: z.string().min(8).optional(),
```

### Current `client` schema (`src/env.ts:30-34`)

```ts
VITE_APP_TITLE: z.string().min(1).optional(),
VITE_APP_URL: z.string().url().optional(),
VITE_SENTRY_DSN: z.string().url().optional(),
```

### Observations

- **No `z.superRefine` / cross-field validation is used today** (`grep superRefine` on `src/env.ts` returns nothing). PRD demands cross-field rules for email transport — must add via `createEnv` does not expose a refine wrapper by default; `@t3-oss/env-core` relies on a zod *schema object*, so cross-field checks go in a wrapper zod schema passed via the `createFinalSchema` option *or* done as a post-parse assertion in a server-boot helper.
- No `NODE_ENV` read; `APP_ENV` serves that role (`dev|prod|test`).
- `runtimeEnv` block duplicates each var from `process.env` (plus dual-source for `VITE_*`). New vars must also be added there.

## Gaps — exact additions for PRD

### Tenancy / teams

```ts
TENANCY_MODE: z.enum(["single", "multi"]).default("single"),
TEAM_ENABLED: z.coerce.boolean().default(false),
```

### Seed extras

```ts
SEED_DEFAULT_ORG_NAME: z.string().default("默认组织"),
SEED_DEFAULT_ORG_SLUG: z.string().default("default"),
```

### Email transport

```ts
EMAIL_TRANSPORT: z.enum(["console", "smtp", "resend"]).default("console"),
EMAIL_FROM: z.string().email().default("noreply@localhost"),
EMAIL_FROM_NAME: z.string().optional(),
EMAIL_VERIFICATION_SKIP_LIST: z.string().default(""), // comma-separated

SMTP_HOST: z.string().optional(),
SMTP_PORT: z.coerce.number().default(465),
SMTP_SECURE: z.coerce.boolean().default(true),
SMTP_USER: z.string().optional(),
SMTP_PASS: z.string().optional(),

RESEND_API_KEY: z.string().optional(),
```

### Cross-field validation

`@t3-oss/env-core` accepts a full zod object schema via `createFinalSchema` (see t3-env docs); we can pass a `z.object({...}).superRefine(...)` there. Alternatively fail fast in a startup helper (`src/lib/email-transport.ts` can throw on boot if required vars are missing).

Rules required:

1. `EMAIL_TRANSPORT === "smtp"` → `SMTP_HOST` && `SMTP_USER` && `SMTP_PASS` present.
2. `EMAIL_TRANSPORT === "resend"` → `RESEND_API_KEY` present.
3. `APP_ENV === "prod"` → `EMAIL_TRANSPORT !== "console"`.

### runtimeEnv additions

All new server vars must be appended to `runtimeEnv` block in `src/env.ts:44-74`, reading from `process.env.X` (none need VITE dual-source — all server-only).

## Risks / surprises

- `@t3-oss/env-core` **does not** export `createFinalSchema` on every version. If missing, wrap parsed env: `const refinedEnv = envRefineSchema.parse(env)` at import site and re-export.
- `TEAM_ENABLED` uses `z.coerce.boolean()` — note zod coerce treats `"false"` as `true` because `Boolean("false") === true`. Safer to use `z.enum(["true","false"]).transform(v => v === "true")` or import `boolean` from `zod`'s `z.stringbool()` (zod 4.x ships `z.stringbool()`; verify on 4.3.6).
- `EMAIL_FROM` default `"noreply@localhost"` passes `.email()` validation but would be rejected by any SMTP server — rely on prod cross-field refine.
- Paraglide has no env coupling; no changes needed here.
