# Product Modes

> Executable contract for product-shape switches: `PRODUCT_MODE` (private vs saas)、注册即建 personal org（saas）、默认 org seed（private）。One codebase, two delivery models. Team 能力改由 `plan` gating（见 `plan-gating.md`），不再是 env flag。

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

- `src/env.ts` product-mode env（`VITE_PRODUCT_MODE` 单份前后端共用）
- `src/lib/auth.ts` `allowUserToCreateOrganization` / `databaseHooks.user.create.after` / `user.update.after`（personal org provision）/ `organizationHooks.beforeDeleteOrganization|beforeCreateInvitation`（personal org 保护）
- `src/seed.ts` default-org / super-admin bootstrap
- `/site/organizations` 或 `(workspace)/settings/organization/*` 下任何"create / dissolve org"UI
- 加一个新的 product-shape switch

Team 相关门控改查 `organization.plan`，不再是 env flag。触发 `plan-gating.md`。

Rule of thumb: if logic reads "is this deployed as private delivery or public SaaS?", it belongs here.

---

## 2. Signatures

### Env (`src/env.ts`) — 单份前后端共用

```ts
// 挂在 client 块（VITE_ 前缀），Vite 把它内联到浏览器 bundle；
// Node 进程照样能 `process.env.VITE_PRODUCT_MODE`，所以服务端代码也读这一份。
client: {
  VITE_PRODUCT_MODE: z.enum(["private", "saas"]).default("private"),
},
server: {
  SEED_DEFAULT_ORG_NAME: z.string().default("默认组织"),
  SEED_DEFAULT_ORG_SLUG: z.string().default("default"),
}
```

**不再有 `PRODUCT_MODE` server 版**。2026-04 把"前后端共用"类变量统一成只留 `VITE_*` 一份（与 `VITE_BRAND_NAME` / `VITE_BRAND_LOGO_URL` 同规则）。`VITE_` 前缀是 Vite 约定的"可暴露到客户端 bundle"的白名单；默认所有 env 只在服务端可见，带 `VITE_` 才进 `import.meta.env`（secrets 黑名单保护机制）。因为 `VITE_PRODUCT_MODE` 的值本身不是 secret，暴露到客户端无害，一份就够，消除 drift 风险。

`TEAM_ENABLED` / `VITE_TEAM_ENABLED` 已在 2026-04 移除：team 能不能用由 `organization.plan` 决定，见 `plan-gating.md`。

### BA plugin wiring (`src/lib/auth.ts`)

```ts
organization({
  teams: {
    enabled: true,                                      // 插件级永远启用
    maximumTeams: async ({ organizationId }) => {       // 配额读 plan
      const { rows } = await pool.query('SELECT plan FROM "organization" WHERE id = $1', [organizationId]);
      return getPlanLimits(rows[0]?.plan).maxTeams;
    },
  },
  allowUserToCreateOrganization: env.VITE_PRODUCT_MODE === "saas",
  schema: {
    organization: {
      additionalFields: {
        plan: { type: "string", defaultValue: "free" },  // 见 plan-gating.md
        type: { type: "string", defaultValue: "team" },  // "team" | "personal"
      },
    },
  },
  // ...
})
```

### Saas-mode personal-org provision (`src/lib/auth.ts`)

```ts
databaseHooks: {
  user: {
    update: {
      after: async (user) => {
        if (env.VITE_PRODUCT_MODE !== "saas") return;
        if (!user.emailVerified) return;
        if (env.SEED_SUPER_ADMIN_EMAIL && user.email === env.SEED_SUPER_ADMIN_EMAIL) return;

        // 幂等：查 member + org.type='personal' 是否已存在
        const existing = await pool.query(`SELECT o.id ... WHERE m."userId" = $1 AND o."type" = 'personal'`, [user.id]);
        if (existing.rowCount) return;

        const orgId = randomUUID();
        const slug = `personal-${user.id}`;
        await pool.query('INSERT INTO "organization" (id, name, slug, "createdAt", plan, "type") VALUES (...)',
          [orgId, `${user.name}'s Personal`, slug, "free", "personal"]);
        await pool.query('INSERT INTO "member" (...) VALUES (...)', [..., user.id, "owner"]);
      },
    },
  },
}
```

详见 `personal-org.md`。

### Private-mode signup auto-join (`src/lib/auth.ts`)

```ts
databaseHooks: {
  user: {
    create: {
      after: async (user) => {
        if (env.VITE_PRODUCT_MODE !== "private") return;
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

| `VITE_PRODUCT_MODE` | Product shape | Seed + runtime |
|---|---|---|
| `private` | **Default — 甲方交付 / 私有化部署** | seed: 1 default org (`plan=enterprise`, `type=team`) + super-admin as `owner` + menu skeleton; `allowUserToCreateOrganization=false`; `user.create.after` auto-joins 新用户为 `member`; UI disables create/dissolve |
| `saas` | 公开 B2B SaaS workspace 模型（Slack / Notion 对标）| seed: super-admin only; `allowUserToCreateOrganization=true`; `user.update.after` 在 emailVerified=true 时自动建 personal org（`type=personal, plan=free`）；/site/organizations 对超管开放 |

### Team gating 已改 plan-driven

插件级 `teams.enabled: true` 写死；能不能建 team 由 `organization.plan` 决定（`maximumTeams` 动态函数）。详见 `plan-gating.md` 和 `#/lib/plan`。前端 sidebar `getDisabledReason` 读 `authClient.useActiveOrganization().plan` 做灰化。

### signUp hook constraints (NEVER break these)

1. Use **raw SQL via shared `pool`**, never `auth.api.*`. Calling `auth.api.createOrganization` from inside a BA hook deadlocks (`better-auth#6791`).
2. `INSERT` must be idempotent — BA has no `(organizationId, userId)` unique constraint, so the hook checks first.
3. Errors are swallowed + logged. Auto-join is best-effort; a failed join must not roll back signup (BA #7260 makes this hook post-commit anyway).
4. Skip super-admin email — seed pins them as `owner`, the hook would downgrade them to `member`.

### Env 单份原则（2026-04 改动）

```
.env.local:  VITE_PRODUCT_MODE=private
```

**前后端共用同一条 `VITE_PRODUCT_MODE`**，不再有单独的 server `PRODUCT_MODE`。Vite build 时把它内联进浏览器 bundle，Node 进程照样能 `process.env.VITE_PRODUCT_MODE`——前后端读同一个值，drift 不可能发生。

---

## 4. Validation Matrix

| Condition | Expected |
|---|---|
| `VITE_PRODUCT_MODE=private` + user signup | `user.create.after` binds as `member` of default org |
| `VITE_PRODUCT_MODE=private` + default org missing | Hook logs warn, continues; user orphaned (operator must seed) |
| `VITE_PRODUCT_MODE=saas` + user signup（未验证邮箱）| `user.create.after` 早退；无 org |
| `VITE_PRODUCT_MODE=saas` + emailVerified 翻转 true | `user.update.after` 建 personal org（`type=personal, plan=free, slug=personal-<userId>`），bind 为 owner |
| `VITE_PRODUCT_MODE=saas` + emailVerified 第二次 set true（重复触发）| 查到 personal org 已存在 → 早退幂等 |
| `VITE_PRODUCT_MODE=saas` + dissolve last org（非 personal）| Allowed; personal org 由 hook 拦截不允许删 |
| `VITE_PRODUCT_MODE=private` + dissolve default org | Server-side rejection at API layer |
| 试图邀请进 personal org | `beforeCreateInvitation` 抛 `APIError("BAD_REQUEST")` |
| 试图删除 personal org | `beforeDeleteOrganization` 抛 `APIError("BAD_REQUEST")` |
| Client `VITE_*` not synced with server | UI may expose buttons server rejects — fix env, not code |
| Hook calls `auth.api.createOrganization` | Deadlock (#6791). Use raw SQL. |

---

## 5. Good / Bad Cases

### Good — 甲方交付默认配置（private）

```bash
VITE_PRODUCT_MODE=private
SEED_DEFAULT_ORG_NAME=某公司后台
SEED_DEFAULT_ORG_SLUG=acme
SEED_SUPER_ADMIN_EMAIL=admin@acme.com
SEED_SUPER_ADMIN_PASSWORD=...
```

`pnpm db:seed` → acme org（`plan=enterprise, type=team`）+ super-admin owner + menu skeleton。新用户 signup → auto-joined to `acme` as `member`。Plan=enterprise 让所有门控自动放行，不用升级 plan。

### Good — 公开 B2B SaaS

```bash
VITE_PRODUCT_MODE=saas
```

Seed creates super-admin only。首个客户注册 → emailVerified=true 触发 `user.update.after` → 自动获得一个 personal org。需要 team workspace 时通过 `/site/organizations` 或注册后引导页自行创建。

### Bad — 残留旧 `PRODUCT_MODE`（2026-04 已废弃）

```bash
PRODUCT_MODE=saas             # ❌ 旧 server 版，不再读取
VITE_PRODUCT_MODE=private     # ← 实际生效值
```

历史 `.env.local` 可能同时保留两条；现在服务端和客户端都只读 `VITE_PRODUCT_MODE`，旧的 `PRODUCT_MODE` 无人读取，但留着增加阅读噪音。升级 checklist：删旧行。

---

## 6. Tests Required

| Test | Assertion |
|---|---|
| `auth.hook.test.ts` | `private` signup binds user to default org |
| `auth.hook.test.ts` | `private` signup of `SEED_SUPER_ADMIN_EMAIL` does NOT double-bind |
| `auth.hook.test.ts` | `saas` signup + emailVerified → creates personal org with `type=personal, plan=free, slug=personal-<userId>`，user is owner |
| `auth.hook.test.ts` | `saas` 第二次 emailVerified=true 不重复建 personal org |
| `auth.hook.test.ts` | `saas` 超管账号 emailVerified 翻转 true 不建 personal org |
| `auth.hook.test.ts` | 对 personal org 调 `organization.invite-member` → APIError BAD_REQUEST |
| `auth.hook.test.ts` | 对 personal org 调 `organization.delete` → APIError BAD_REQUEST |
| Seed smoke (manual) | `private` creates default org with `plan=enterprise, type=team` + owner; `saas` creates super-admin only |

---

## 7. Wrong vs Correct — Team gating 用 plan，不用 env

```ts
// ❌ 老做法：env flag 决定整个 deployment 能不能用 team
teams: { enabled: env.TEAM_ENABLED },
if (!env.VITE_TEAM_ENABLED) return <TeamsDisabledCard />;

// 问题：
// - "能不能用 team" 是每个 org 的订阅能力，不是部署配置
// - 私有化给不同客户交付时相同 env 但需要不同 plan
// - SaaS 升级 plan 需要重启服务才生效

// ✅ 新做法：插件级永远开，具体配额读 org.plan
teams: {
  enabled: true,
  maximumTeams: async ({ organizationId }) => {
    const { rows } = await pool.query('SELECT plan FROM "organization" WHERE id = $1', [organizationId]);
    return getPlanLimits(rows[0]?.plan).maxTeams;
  },
},
// 前端：
const { data: activeOrg } = authClient.useActiveOrganization();
if (!planAllowsTeams(activeOrg?.plan)) return <TeamsDisabledCard />;
```

`z.stringbool()` 规则仍适用于其他 boolean env（如 `SMTP_SECURE`）—— 不要用 `z.coerce.boolean()`，`"false"` 会 coerce 成 `true`。

---

## 8. 命名历史（why `PRODUCT_MODE` 不是 `TENANCY_MODE`）

早期版本叫 `TENANCY_MODE=single|multi`，2026-04 改成 `PRODUCT_MODE=private|saas`。原因：

- `TENANCY_MODE` 让读者误以为是"物理多租户切换"（schema 隔离 / DB 隔离），实际底层永远是 multi-workspace 模型，flag 只影响交付形态
- `private|saas` 直接表达产品定位（甲方交付 vs 公开 SaaS），未来 SaaS 独有行为（billing / onboarding 引导 / 使用额度）都可以挂在同一 flag 上
- BA organization 插件本身是 "multi-workspace"（共享表 + `organizationId`），不是 multi-tenant

历史 task 归档（`.trellis/tasks/archive/04-22-tenancy-phase1/`）中仍保留 `TENANCY_MODE` 字样，这是时光快照，不改。

---

## Related

- `backend/plan-gating.md` — plan 枚举 + gating helper + seed 写入规则
- `backend/personal-org.md` — saas 模式注册即建 personal org 的钩子细节
- `backend/authorization-boundary.md` — BA organization plugin owns org/member/team tables; product-modes is the product-shape lens
- `backend/email-infrastructure.md` — `sendInvitationEmail` branches on `invitation.role === "owner"` for transfer flow
- `frontend/route-organization.md` — 三组路由（site/ + (workspace)/ + (marketing)/）权限 gating
- `frontend/layout-guidelines.md` — sidebar `getDisabledReason` 现读 org.plan 做灰化
- `docs/research/plugin-organization-deep.md` — 04-22: last-owner protection lives in native BA hooks, not oRPC wrappers；以及 workspace vs 真·多租户澄清
- BA issue #6791 — nested `auth.api.*` in hooks deadlocks; must use raw SQL
- BA issue #7260 — `user.create.after` runs post-commit
