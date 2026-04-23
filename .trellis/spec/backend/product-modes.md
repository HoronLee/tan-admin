# Product Modes

> Executable contract for product-shape switches: `PRODUCT_MODE` (private vs saas) and `TEAM_ENABLED`. One codebase, two delivery models.

---

## 0. Mental model（读 spec 前必须看）

`PRODUCT_MODE` 是**产品交付形态**开关，**不是物理多租户开关**。

| 概念 | 本项目 | 真·多租户（不在范畴） |
|---|---|---|
| 数据布局 | 共享表 + `organizationId` 过滤（BA organization 插件）| schema-per-tenant / DB-per-tenant / RLS |
| 行级隔离 | ZenStack policy 自动注入 WHERE（业务层）| 物理连接路由 / PG `SET app.tenant = ?` |
| 爆炸半径 | 共享资源，靠限流 / 配额 / 慢查询熔断 | 天然隔离 |
| 合规 / 单租户导出 | 不支持 | 支持 |
| 典型产品 | Slack / Notion / Linear / GitHub Org | Shopify / Salesforce / Auth0 tenant |

所以 `private` ↔ `saas` 切换**不改变隔离机制**，只改：谁能建 workspace、是否 seed 默认 workspace、注册后是否自动入伙。

---

## 1. Scope / Trigger

Triggers when work touches:

- `src/env.ts` product-mode/team env (server + `VITE_*` client mirror)
- `src/lib/auth.ts` `allowUserToCreateOrganization` / `teams.enabled` / `databaseHooks.user.create.after`
- `src/seed.ts` default-org / super-admin bootstrap
- `src/components/layout/AppSidebar.tsx` `getDisabledReason` (Teams menu gating)
- `/organizations` route or any "create org / dissolve org" UI
- Adding a new product-shape switch

Rule of thumb: if logic reads "is this deployed as private delivery or public SaaS?", it belongs here.

---

## 2. Signatures

### Server env (`src/env.ts`)

```ts
// Server-side, single source of truth:
PRODUCT_MODE: z.enum(["private", "saas"]).default("private"),
TEAM_ENABLED: z.stringbool().default(false),          // NOT z.coerce.boolean()
SEED_DEFAULT_ORG_NAME: z.string().default("默认组织"),
SEED_DEFAULT_ORG_SLUG: z.string().default("default"),
```

### Client-visible mirrors

```ts
VITE_PRODUCT_MODE: z.enum(["private", "saas"]).default("private"),
VITE_TEAM_ENABLED: z.stringbool().default(false),
```

Two vars per switch (server + `VITE_*`). Server is runtime source of truth; `VITE_*` exists so UI can gate without a loader round-trip. `VITE_` is Vite's convention for "exposed to client bundle" — unrelated to "product", just the safety default Vite applies to avoid leaking secrets.

### BA plugin wiring (`src/lib/auth.ts`)

```ts
organization({
  teams: { enabled: env.TEAM_ENABLED },
  allowUserToCreateOrganization: env.PRODUCT_MODE === "saas",
  // ...
})
```

### Private-mode signup auto-join (`src/lib/auth.ts`)

```ts
databaseHooks: {
  user: {
    create: {
      after: async (user) => {
        if (env.PRODUCT_MODE !== "private") return;
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

| `PRODUCT_MODE` | `TEAM_ENABLED` | Product shape | Seed + runtime |
|---|---|---|---|
| `private` | `false` | **Default — 甲方交付 / 私有化部署** | seed: 1 default org + super-admin as `owner` + menu skeleton; `allowUserToCreateOrganization=false`; signup hook auto-joins as `member`; UI disables create/dissolve |
| `saas`    | `false` | 小型公开 SaaS（无 team 子分组）| seed: super-admin only; `allowUserToCreateOrganization=true`; hook no-op; `/organizations` exposes create + dissolve |
| `saas`    | `true`  | 企业级 B2B SaaS（Slack / Notion 对标）| 同上 + Teams plugin endpoints active |
| `private` | `true`  | Valid but unusual | 私有部署下 workspace 内再分 team |

### `TEAM_ENABLED` contract（与 `PRODUCT_MODE` 正交）

- `false`: BA `teams.enabled=false` — team CRUD endpoints reject. Sidebar `getDisabledReason("/teams")` returns the "feature disabled" tooltip; `/teams` route must never hit BA team endpoints when flag is off.
- `true`: team endpoints (`createTeam` / `listTeams` / `addTeamMember` / ...) active. Client plugin in `src/lib/auth-client.ts` pins `teams: { enabled: true }` for TS inference (BA types on literal `true` only). **Runtime gating stays in server env + UI**, not this client flag.

### signUp hook constraints (NEVER break these)

1. Use **raw SQL via shared `pool`**, never `auth.api.*`. Calling `auth.api.createOrganization` from inside a BA hook deadlocks (`better-auth#6791`).
2. `INSERT` must be idempotent — BA has no `(organizationId, userId)` unique constraint, so the hook checks first.
3. Errors are swallowed + logged. Auto-join is best-effort; a failed join must not roll back signup (BA #7260 makes this hook post-commit anyway).
4. Skip super-admin email — seed pins them as `owner`, the hook would downgrade them to `member`.

### Client env sync rule

```
server .env:          PRODUCT_MODE=private,  TEAM_ENABLED=false
same .env file:  VITE_PRODUCT_MODE=private, VITE_TEAM_ENABLED=false
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
| `PRODUCT_MODE=private` + user signup | Hook binds as `member` of default org |
| `PRODUCT_MODE=private` + default org missing | Hook logs warn, continues; user orphaned (operator must seed) |
| `PRODUCT_MODE=saas` + user signup | Hook early-returns; user has no org（注册后引导建自己 workspace）|
| `PRODUCT_MODE=saas` + dissolve last org | Allowed (saas 允许零-org 状态) |
| `PRODUCT_MODE=private` + dissolve default org | Server-side rejection at API layer |
| Client `VITE_*` not synced with server | UI may expose buttons server rejects — fix env, not code |
| Hook calls `auth.api.createOrganization` | Deadlock (#6791). Use raw SQL. |

---

## 5. Good / Bad Cases

### Good — 甲方交付默认配置（private）

```bash
PRODUCT_MODE=private        VITE_PRODUCT_MODE=private
TEAM_ENABLED=false          VITE_TEAM_ENABLED=false
SEED_DEFAULT_ORG_NAME=某公司后台
SEED_DEFAULT_ORG_SLUG=acme
SEED_SUPER_ADMIN_EMAIL=admin@acme.com
SEED_SUPER_ADMIN_PASSWORD=...
```

`pnpm db:seed` → acme org + super-admin owner + menu skeleton. New users signup → auto-joined to `acme` as `member`.

### Good — 公开 B2B SaaS（saas + teams）

```bash
PRODUCT_MODE=saas      VITE_PRODUCT_MODE=saas
TEAM_ENABLED=true      VITE_TEAM_ENABLED=true
```

Seed creates super-admin only. First customer signs up → UI prompts to create their workspace.

### Bad — env mismatch

```bash
PRODUCT_MODE=saas             # server allows createOrganization
VITE_PRODUCT_MODE=private     # ← UI hides the button
```

Server accepts, UI doesn't expose → users can't self-create workspaces. Debug: check env alignment first.

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
| `auth.hook.test.ts` | `private` signup binds user to default org |
| `auth.hook.test.ts` | `private` signup of `SEED_SUPER_ADMIN_EMAIL` does NOT double-bind |
| `auth.hook.test.ts` | `saas` signup leaves user with no org |
| `auth.hook.test.ts` | Re-signup same email is no-op (idempotent) |
| Seed smoke (manual) | `private` creates default org + owner; `saas` creates super-admin only |

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

## 8. 命名历史（why `PRODUCT_MODE` 不是 `TENANCY_MODE`）

早期版本叫 `TENANCY_MODE=single|multi`，2026-04 改成 `PRODUCT_MODE=private|saas`。原因：

- `TENANCY_MODE` 让读者误以为是"物理多租户切换"（schema 隔离 / DB 隔离），实际底层永远是 multi-workspace 模型，flag 只影响交付形态
- `private|saas` 直接表达产品定位（甲方交付 vs 公开 SaaS），未来 SaaS 独有行为（billing / onboarding 引导 / 使用额度）都可以挂在同一 flag 上
- BA organization 插件本身是 "multi-workspace"（共享表 + `organizationId`），不是 multi-tenant

历史 task 归档（`.trellis/tasks/archive/04-22-tenancy-phase1/`）中仍保留 `TENANCY_MODE` 字样，这是时光快照，不改。

---

## Related

- `backend/authorization-boundary.md` — BA organization plugin owns org/member/team tables; product-modes is the product-shape lens
- `backend/email-infrastructure.md` — `sendInvitationEmail` branches on `invitation.role === "owner"` for transfer flow
- `frontend/layout-guidelines.md` — sidebar `getDisabledReason` implements Teams gating
- `docs/research/plugin-organization-deep.md` — 04-22: last-owner protection lives in native BA hooks, not oRPC wrappers；以及 workspace vs 真·多租户澄清
- BA issue #6791 — nested `auth.api.*` in hooks deadlocks; must use raw SQL
- BA issue #7260 — `user.create.after` runs post-commit
