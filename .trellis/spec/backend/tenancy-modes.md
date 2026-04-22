# Tenancy Modes

> Executable contract for product-shape switches: `TENANCY_MODE` (single vs multi) and `TEAM_ENABLED`. One codebase, two business models.

---

## 1. Scope / Trigger

Triggers when work touches:

- `src/env.ts` tenancy/team env (server + `VITE_*` client mirror)
- `src/lib/auth.ts` `allowUserToCreateOrganization` / `teams.enabled` / `databaseHooks.user.create.after`
- `src/seed.ts` default-org / super-admin bootstrap
- `src/components/layout/AppSidebar.tsx` `getDisabledReason` (Teams menu gating)
- `/organizations` route or any "create org / dissolve org" UI
- Adding a new product-shape switch

Rule of thumb: if logic reads "is this deployed as single-tenant delivery or multi-tenant SaaS?", it belongs here.

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
VITE_TENANCY_MODE: z.enum(["single", "multi"]).default("single"),
VITE_TEAM_ENABLED: z.stringbool().default(false),
```

Two vars per switch (server + `VITE_*`). Server is runtime source of truth; `VITE_*` exists so UI can gate without a loader round-trip.

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

| `TENANCY_MODE` | `TEAM_ENABLED` | Product shape | Seed + runtime |
|---|---|---|---|
| `single` | `false` | **Default — delivery product** | seed: 1 default org + super-admin as `owner` + menu skeleton; `allowUserToCreateOrganization=false`; signup hook auto-joins as `member`; UI disables create/dissolve |
| `multi`  | `false` | Small SaaS | seed: super-admin only; `allowUserToCreateOrganization=true`; hook no-op; `/organizations` exposes create + dissolve |
| `multi`  | `true`  | Enterprise SaaS | same as above + Teams plugin endpoints active |
| `single` | `true`  | Valid but unusual | Single tenant with Teams subdividing its membership |

### `TEAM_ENABLED` contract

- `false`: BA `teams.enabled=false` — team CRUD endpoints reject. Sidebar `getDisabledReason("/teams")` returns the "feature disabled" tooltip; `/teams` route must never hit BA team endpoints when flag is off.
- `true`: team endpoints (`createTeam` / `listTeams` / `addTeamMember` / ...) active. Client plugin in `src/lib/auth-client.ts` pins `teams: { enabled: true }` for TS inference (BA types on literal `true` only). **Runtime gating stays in server env + UI**, not this client flag.

### signUp hook constraints (NEVER break these)

1. Use **raw SQL via shared `pool`**, never `auth.api.*`. Calling `auth.api.createOrganization` from inside a BA hook deadlocks (`better-auth#6791`).
2. `INSERT` must be idempotent — BA has no `(organizationId, userId)` unique constraint, so the hook checks first.
3. Errors are swallowed + logged. Auto-join is best-effort; a failed join must not roll back signup (BA #7260 makes this hook post-commit anyway).
4. Skip super-admin email — seed pins them as `owner`, the hook would downgrade them to `member`.

### Client env sync rule

```
server .env:          TENANCY_MODE=single,  TEAM_ENABLED=false
same .env file:  VITE_TENANCY_MODE=single, VITE_TEAM_ENABLED=false
```

Mirror mismatch ships a UI that disagrees with the server (e.g. sidebar enables Teams while BA rejects calls). Add a deployment checklist item or runtime consistency check.

---

## 4. Validation Matrix

| Condition | Expected |
|---|---|
| `TEAM_ENABLED=false` (string) | `z.stringbool()` → `false` ✅ |
| `TEAM_ENABLED=True` / `1` / `yes` | → `true` ✅ |
| `TEAM_ENABLED` unset | Default `false` |
| `z.coerce.boolean()` used instead | ⚠️ `"false"` coerces to `true`. **Forbidden.** |
| `TENANCY_MODE=single` + user signup | Hook binds as `member` of default org |
| `TENANCY_MODE=single` + default org missing | Hook logs warn, continues; user orphaned (operator must seed) |
| `TENANCY_MODE=multi` + user signup | Hook early-returns; user has no org |
| `TENANCY_MODE=multi` + dissolve last org | Allowed (multi allows zero-org state) |
| `TENANCY_MODE=single` + dissolve default org | Server-side rejection at API layer |
| Client `VITE_*` not synced with server | UI may expose buttons server rejects — fix env, not code |
| Hook calls `auth.api.createOrganization` | Deadlock (#6791). Use raw SQL. |

---

## 5. Good / Bad Cases

### Good — delivery product default

```bash
TENANCY_MODE=single        VITE_TENANCY_MODE=single
TEAM_ENABLED=false         VITE_TEAM_ENABLED=false
SEED_DEFAULT_ORG_NAME=某公司后台
SEED_DEFAULT_ORG_SLUG=acme
SEED_SUPER_ADMIN_EMAIL=admin@acme.com
SEED_SUPER_ADMIN_PASSWORD=...
```

`pnpm db:seed` → acme org + super-admin owner + menu skeleton. New users signup → auto-joined to `acme` as `member`.

### Good — multi-tenant SaaS

```bash
TENANCY_MODE=multi    VITE_TENANCY_MODE=multi
TEAM_ENABLED=true     VITE_TEAM_ENABLED=true
```

Seed creates super-admin only. First customer signs up → UI prompts to create their org.

### Bad — env mismatch

```bash
TENANCY_MODE=multi            # server allows createOrganization
VITE_TENANCY_MODE=single      # ← UI hides the button
```

Server accepts, UI doesn't expose → users can't self-create orgs. Debug: check env alignment first.

### Bad — `z.coerce.boolean()` regression

```ts
TEAM_ENABLED: z.coerce.boolean().default(false)   // ❌
// TEAM_ENABLED=false in .env → parses to true → Teams plugin activates in prod
```

---

## 6. Tests Required

| Test | Assertion |
|---|---|
| `env.test.ts` | `TEAM_ENABLED="false"` → `false` |
| `env.test.ts` | `TEAM_ENABLED="true"` → `true` |
| `env.test.ts` | `TEAM_ENABLED=""` → default `false` (with `emptyStringAsUndefined`) |
| `auth.hook.test.ts` | `single` signup binds user to default org |
| `auth.hook.test.ts` | `single` signup of `SEED_SUPER_ADMIN_EMAIL` does NOT double-bind |
| `auth.hook.test.ts` | `multi` signup leaves user with no org |
| `auth.hook.test.ts` | Re-signup same email is no-op (idempotent) |
| Seed smoke (manual) | `single` creates default org + owner; `multi` creates super-admin only |

---

## 7. Wrong vs Correct — `z.stringbool()` not `z.coerce.boolean()`

```ts
// ❌ z.coerce.boolean() delegates to Boolean(value). Any non-empty string
//    ("false", "0", "no") → true. TEAM_ENABLED=false silently flips to true.
TEAM_ENABLED: z.coerce.boolean().default(false),

// ✅ z.stringbool() (zod 3.25+) parses "true"/"1"/"yes"/"on" → true and
//    "false"/"0"/"no"/"off" → false, rejecting anything else.
TEAM_ENABLED: z.stringbool().default(false),
```

Same pattern used for `SMTP_SECURE`.

---

## Related

- `backend/authorization-boundary.md` — BA organization plugin owns org/member/team tables; tenancy-modes is the product-shape lens
- `backend/email-infrastructure.md` — `sendInvitationEmail` branches on `invitation.role === "owner"` for transfer flow
- `frontend/layout-guidelines.md` — sidebar `getDisabledReason` implements Teams gating
- `docs/research/plugin-organization-deep.md` — 04-22: last-owner protection lives in native BA hooks, not oRPC wrappers
- BA issue #6791 — nested `auth.api.*` in hooks deadlocks; must use raw SQL
- BA issue #7260 — `user.create.after` runs post-commit
