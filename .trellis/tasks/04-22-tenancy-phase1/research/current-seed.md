# Research: current-seed

- **Query**: What does the current seed do? What must change for R3?
- **Scope**: internal
- **Date**: 2026-04-22

## Files

| Path | Role |
|---|---|
| `src/seed.ts` | Single-file seed script |
| `package.json:22` | `db:seed` script — `dotenv -e .env.local -- tsx src/seed.ts` |
| `src/env.ts:20-21` | `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD` (both optional) |

## What seed currently does

Source of truth: `src/seed.ts:105-211`.

1. `TRUNCATE TABLE "Menu" RESTART IDENTITY CASCADE` — **destructive on every run** (`src/seed.ts:111`).
2. Upserts 5 top-level menus via `db.menu.upsert` (keyed by unique `name`):
   - `dashboard` → `/dashboard` — meta `{ title: "Dashboard", icon: "LayoutDashboard", order: 1 }`
   - `users` → `/users` — meta `{ title: "Users", icon: "Users", order: 10 }`, `requiredPermission: "user:read"`
   - `organization` → `/organization` — meta `{ title: "Organization", icon: "Building2", order: 20 }`, `requiredPermission: "organization:read"`
   - `menus` → `/menus` — meta `{ title: "Menus", icon: "Menu", order: 30 }`, `requiredPermission: "menu:write"`
   - `settings` → `/settings/account` — meta `{ title: "Settings", icon: "Settings", order: 99 }`
3. `bootstrapSuperAdmin()` — `src/seed.ts:12-56`:
   - Reads `env.SEED_SUPER_ADMIN_EMAIL` + `env.SEED_SUPER_ADMIN_PASSWORD`; both must be set or function no-ops.
   - Calls `auth.api.signUpEmail({ body: { email, password, name: "Super Admin" } })`; swallows errors (assumes "user exists").
   - Looks up user via `db.$qbRaw.selectFrom("user")` (Kysely).
   - `UPDATE "user" SET role='admin'` if not already.
   - Returns `userId`.
4. `seedDefaultOrg(adminUserId)` — `src/seed.ts:63-103`:
   - Hardcoded constants `DEFAULT_ORG_SLUG = "default"`, `DEFAULT_ORG_NAME = "Default Organization"` (`src/seed.ts:7-8`).
   - Raw `INSERT INTO "organization"` if slug absent.
   - Raw `INSERT INTO "member" (role='owner')` if not present.
5. No top-level CLI arg parsing, no banner beyond `log.info("Seeding database…")`.

## Env usage

```ts
// src/env.ts
SEED_SUPER_ADMIN_EMAIL: z.string().email().optional(),
SEED_SUPER_ADMIN_PASSWORD: z.string().min(8).optional(),
```

No `SEED_DEFAULT_ORG_NAME`, `SEED_DEFAULT_ORG_SLUG`, `TENANCY_MODE`, `SEED_SKIP`.

## Gaps vs PRD R3

| PRD requirement | Current | Delta |
|---|---|---|
| Idempotent by default (menus upsert, no TRUNCATE) | `TRUNCATE` runs unconditionally | Remove TRUNCATE; rely on `db.menu.upsert` (already keyed by unique `name`) |
| `--reset-menus` CLI flag | None | Parse `process.argv`; TRUNCATE only when flag set |
| Menu `meta.title` → i18n key (`"menu.dashboard"` etc.) | Literal English strings | Change each `meta.title` to `"menu.<name>"` |
| TENANCY_MODE branching | Always seeds default org | Guard `seedDefaultOrg` with `env.TENANCY_MODE === "single"` |
| `SEED_DEFAULT_ORG_NAME` / `SEED_DEFAULT_ORG_SLUG` | Hardcoded in script | Read from env with defaults `"默认组织"` / `"default"` |
| Startup banner (mode + affected tables + reset flag) | Missing | Add `log.info({ tenancyMode, resetMenus, ... }, "seed banner")` |
| Remove `SEED_SKIP` env | Not present (never added) | Already OK — no action |

## Bugs / surprises

- `seed.ts:31` swallows **all** errors from `signUpEmail`, not just `USER_ALREADY_EXISTS`. Could mask transport / password-policy failures; consider narrowing catch when touching this file.
- `DEFAULT_ORG_NAME = "Default Organization"` (English) — PRD wants Chinese default `"默认组织"`. Must also account for Menu title key migration (seed writes the raw key; sidebar resolves via Paraglide fallback — see `current-paraglide.md`).
- `db.menu.upsert` relies on `name` being unique (confirmed via zmodel `name  String?  @unique` in `zenstack/schema.zmodel:47`).
- Once TRUNCATE is removed, historic menus inserted by operators via `/menus` UI will persist; this is the *desired* safe mode per PRD.
