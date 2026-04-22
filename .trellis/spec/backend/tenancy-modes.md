# Tenancy Modes

> Executable contract for product-shape switches: `TENANCY_MODE` (single vs multi) and `TEAM_ENABLED` (teams plugin toggle). One codebase, two business models.

---

## 1. Scope / Trigger

Triggers when work touches any of:

- `src/env.ts` tenancy / team env declarations (server + `VITE_*` client mirror)
- `src/lib/auth.ts` `allowUserToCreateOrganization` / `teams.enabled` / `databaseHooks.user.create.after`
- `src/seed.ts` default-org / super-admin bootstrap branches
- `src/components/layout/AppSidebar.tsx` `getDisabledReason` (Teams menu gating)
- `/organizations` route (super-admin cross-tenant list) or any "create org / dissolve org" UI
- Adding a new product-shape switch

Rule of thumb: if logic reads "is this deployed as a single-tenant delivery product or a multi-tenant SaaS?", it belongs in this spec.

---

## 2. Signatures

### Server env (`src/env.ts`)

```ts
// Server-side, single source of truth:
TENANCY_MODE: z.enum(["single", "multi"]).default("single"),
TEAM_ENABLED: z.stringbool().default(false),          // NOT z.coerce.boolean()
SEED_DEFAULT_ORG_NAME: z.string().default("默认组织"),
SEED_DEFAULT_ORG_SLUG: z.string().default("default"),
```

### Client-visible mirrors

```ts
// src/env.ts (client section)
VITE_TENANCY_MODE: z.enum(["single", "multi"]).default("single"),
VITE_TEAM_ENABLED: z.stringbool().default(false),
```

Two variables to maintain per switch (one server, one `VITE_*`). The server copy is the runtime source of truth; `VITE_*` exists so UI can gate without a loader round-trip.

### BA plugin wiring (`src/lib/auth.ts`)

```ts
organization({
  teams: { enabled: env.TEAM_ENABLED },
  allowUserToCreateOrganization: env.TENANCY_MODE === "multi",
  // ...
})
```

### Single-tenancy signup auto-join (`src/lib/auth.ts`)

```ts
databaseHooks: {
  user: {
    create: {
      after: async (user) => {
        if (env.TENANCY_MODE !== "single") return;
        // Skip super-admin — seed binds them as "owner" separately.
        if (env.SEED_SUPER_ADMIN_EMAIL && user.email === env.SEED_SUPER_ADMIN_EMAIL) return;

        // Raw SQL via shared pool. DO NOT call auth.api.createOrganization here
        // (better-auth#6791 nested-invocation deadlock).
        const { rows } = await pool.query<{ id: string }>(
          'SELECT id FROM "organization" WHERE slug = $1 LIMIT 1',
          [env.SEED_DEFAULT_ORG_SLUG],
        );
        const orgId = rows[0]?.id;
        if (!orgId) return;

        // Idempotent — no (orgId, userId) unique in BA schema, guard here.
        const existing = await pool.query(
          'SELECT 1 FROM "member" WHERE "organizationId" = $1 AND "userId" = $2 LIMIT 1',
          [orgId, user.id],
        );
        if (existing.rowCount && existing.rowCount > 0) return;

        await pool.query(
          'INSERT INTO "member" (id, "organizationId", "userId", role, "createdAt") ' +
            'VALUES ($1, $2, $3, $4, now())',
          [randomUUID(), orgId, user.id, "member"],
        );
      },
    },
  },
},
```

---

## 3. Contracts

### Default matrix

| `TENANCY_MODE` | `TEAM_ENABLED` | Product shape | Seed behaviour |
|---|---|---|---|
| `single` | `false` | **Default — delivery product** | 1 default org + super-admin as `owner` + optional menu skeleton |
| `multi`  | `false` | Small SaaS | super-admin only; no default org; users self-create orgs |
| `multi`  | `true`  | Enterprise SaaS | same as above + Teams plugin endpoints active |
| `single` | `true`  | Valid but unusual | Single tenant with Teams subdividing its membership |

### `TENANCY_MODE === "single"` contract

- `allowUserToCreateOrganization: false` — BA rejects self-service org creation.
- Seed creates the default org (from `SEED_DEFAULT_ORG_NAME` / `SEED_DEFAULT_ORG_SLUG`) and binds super-admin as `owner`.
- `databaseHooks.user.create.after` auto-joins every new user to the default org as `member`.
- UI (`/organizations`, OrganizationSwitcher) disables "create org" buttons; dissolve-org is blocked at both server and UI layers.

### `TENANCY_MODE === "multi"` contract

- `allowUserToCreateOrganization: true` — users may call `createOrganization`.
- Seed creates super-admin only; **no** default org. Logs an info line announcing the skip.
- `databaseHooks.user.create.after` is a no-op (early return on line 63 of `auth.ts`).
- `/organizations` page exposes the create flow; dissolve allowed with ConfirmDialog requiring slug confirmation.

### `TEAM_ENABLED === false` contract

- BA `organization({ teams: { enabled: false } })` — team CRUD endpoints reject with a plugin error.
- Sidebar `getDisabledReason("/teams")` returns the "feature disabled" tooltip → menu greys out, click is a no-op.
- `/teams` route should render the same disabled state or a redirect — it must never hit BA team endpoints when the flag is off.

### `TEAM_ENABLED === true` contract

- BA team endpoints (`createTeam` / `listTeams` / `addTeamMember` / ...) active.
- Client plugin in `src/lib/auth-client.ts` pins `teams: { enabled: true }` for TS inference (BA types on literal `true` only). **Gating at runtime stays in server env + UI**, not this client flag.

### signUp hook constraints (NEVER break these)

1. Use **raw SQL via shared `pool`**, never `auth.api.*`. Calling `auth.api.createOrganization` from inside a BA hook deadlocks (`better-auth#6791`).
2. `INSERT` must be idempotent — BA has no `(organizationId, userId)` unique constraint, so the hook checks first.
3. Errors are swallowed + logged. Auto-join is best-effort; a failed join should not roll back the signup (BA #7260 makes this hook post-commit anyway).
4. Skip the super-admin email — seed pins them as `owner`, the hook would downgrade them to `member`.

### Client env sync rule

```
server .env:          TENANCY_MODE=single,  TEAM_ENABLED=false
same .env file:  VITE_TENANCY_MODE=single, VITE_TEAM_ENABLED=false
```

Operators forgetting to mirror will ship a UI that disagrees with the server (e.g. sidebar shows Teams enabled while BA rejects calls). Add a deployment checklist item or a runtime consistency check.

---

## 4. Validation & Error Matrix

| Condition | Expected behaviour |
|---|---|
| `TEAM_ENABLED=false` (string) | `z.stringbool()` parses to `false` ✅ |
| `TEAM_ENABLED=True` / `1` / `yes` | `z.stringbool()` parses to `true` ✅ |
| `TEAM_ENABLED` unset | Defaults to `false` |
| Using `z.coerce.boolean()` instead | ⚠️ `"false"` coerces to `true`. **Forbidden.** Use `z.stringbool()`. |
| `TENANCY_MODE=single` + user signs up | Hook binds them to default org as `member` |
| `TENANCY_MODE=single` + default org missing | Hook logs warn, continues — signup succeeds, user orphaned (operator must run seed) |
| `TENANCY_MODE=multi` + user signs up | Hook early-returns; user belongs to no org |
| `TENANCY_MODE=multi` + UI dissolves last org | Allowed (multi allows zero-org state) |
| `TENANCY_MODE=single` + UI tries to dissolve default org | Server-side rejection (wrap at API layer) |
| Client `VITE_TENANCY_MODE` not synced with server | UI may expose create/dissolve buttons that server rejects — fix env, not code |
| Hook calls `auth.api.createOrganization` | Deadlock (#6791). Must use raw SQL. |

---

## 5. Good / Base / Bad Cases

### Good — delivery product default

```bash
# .env (prod)
TENANCY_MODE=single
TEAM_ENABLED=false
VITE_TENANCY_MODE=single
VITE_TEAM_ENABLED=false
SEED_DEFAULT_ORG_NAME=某公司后台
SEED_DEFAULT_ORG_SLUG=acme
SEED_SUPER_ADMIN_EMAIL=admin@acme.com
SEED_SUPER_ADMIN_PASSWORD=...
```

```bash
pnpm db:seed           # creates acme org + super-admin owner + menu skeleton
```

New users who register get auto-joined to the `acme` org as `member`.

### Base — multi-tenant SaaS

```bash
TENANCY_MODE=multi
TEAM_ENABLED=true
VITE_TENANCY_MODE=multi
VITE_TEAM_ENABLED=true
```

Seed creates super-admin only. First customer signs up → UI prompts them to create their org.

### Bad — server/client env mismatch

```bash
# .env
TENANCY_MODE=multi            # server allows createOrganization
VITE_TENANCY_MODE=single      # ← UI hides the "Create org" button
```

Result: server accepts the feature, UI doesn't expose it. Users can't self-create orgs even though they have permission. Debug chain: check env alignment first.

### Bad — `z.coerce.boolean()` regression

```ts
TEAM_ENABLED: z.coerce.boolean().default(false)   // ❌
// TEAM_ENABLED=false in .env → parses to true → Teams plugin activates in prod
```

---

## 6. Tests Required

| Test | Assertion point | Type |
|---|---|---|
| `env.test.ts` | `TEAM_ENABLED="false"` parses to `false` | Unit |
| `env.test.ts` | `TEAM_ENABLED="true"` parses to `true` | Unit |
| `env.test.ts` | `TEAM_ENABLED=""` → default `false` (with `emptyStringAsUndefined`) | Unit |
| `auth.hook.test.ts` | `TENANCY_MODE=single` signup binds user to default org | Integration (pg) |
| `auth.hook.test.ts` | `TENANCY_MODE=single` signup of `SEED_SUPER_ADMIN_EMAIL` does NOT double-bind | Integration |
| `auth.hook.test.ts` | `TENANCY_MODE=multi` signup leaves user with no org | Integration |
| `auth.hook.test.ts` | Re-signup with same email is a no-op (idempotent member insert) | Integration |
| Seed smoke (manual) | `TENANCY_MODE=single` seed creates default org + super-admin owner | E2E-lite |
| Seed smoke (manual) | `TENANCY_MODE=multi` seed creates super-admin only, no default org | E2E-lite |

---

## 7. Wrong vs Correct

### Wrong — `z.coerce.boolean()` for `TEAM_ENABLED`

```ts
// src/env.ts
TEAM_ENABLED: z.coerce.boolean().default(false),
```

Problems:
1. `z.coerce.boolean()` delegates to `Boolean(value)`. Any non-empty string (`"false"`, `"0"`, `"no"`) → `true`.
2. `.env` files store strings. `TEAM_ENABLED=false` silently flips to `true`.
3. Tests pass locally with actual booleans but break in deployed envs.

### Correct — `z.stringbool()`

```ts
// src/env.ts
TEAM_ENABLED: z.stringbool().default(false),
```

`z.stringbool()` (zod 3.25+) specifically parses `"true"/"1"/"yes"/"on"` → `true` and `"false"/"0"/"no"/"off"` → `false`, rejecting anything else. Same pattern used for `SMTP_SECURE` in this project.

---

## Related

- `.trellis/spec/backend/authorization-boundary.md` — BA organization plugin owns org/member/team tables; tenancy-modes is the product-shape lens over the same tables
- `.trellis/spec/backend/email-infrastructure.md` — `sendInvitationEmail` branches on `invitation.role === "owner"` for transfer flow (orthogonal to tenancy)
- `.trellis/spec/frontend/layout-guidelines.md` — sidebar `getDisabledReason` implements the Teams gating contract
- `docs/research/plugin-organization-deep.md` — 04-22 feedback section: last-owner protection lives in native BA hooks, not oRPC wrappers
- BA issue #6791 — nested `auth.api.*` calls in hooks deadlock; must use raw SQL
- BA issue #7260 — `user.create.after` runs post-commit (fixes earlier race condition)
