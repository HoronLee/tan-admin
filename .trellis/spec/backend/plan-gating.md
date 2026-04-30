# Plan Gating

> Executable contract for per-organization plan gating. 每个 workspace 的 `organization.plan` 字段驱动 feature 配额（team 数量、邀请能力、成员上限等）。**不是** deployment-level env flag。

---

## 1. Scope / Trigger

Triggers when work touches:

- `src/lib/auth/plan.ts` — 枚举、limits 表、helpers
- `src/lib/auth/config.ts` `teams.maximumTeams` / `organizationHooks.beforeCreateInvitation` / 任何读 `organization.plan` 的位置
- `src/server/seed.ts` 默认 org 的 `plan` 初始值
- `src/components/layout/AppSidebar.tsx` `getDisabledReason` / `<TeamsDisabledCard>` / 任何 UI 根据 plan 做灰化/禁用的位置
- 新增 plan 值 / 改 plan limits / 添加新的 plan-gated feature

Rule of thumb：凡是"这个 feature 只有升级 plan 才能用"的逻辑，都走这个 spec。

---

## 2. Signatures

### Plan 枚举（`src/lib/auth/plan.ts`）

```ts
export type PlanName = "free" | "personal_pro" | "team_pro" | "enterprise";
export type OrgType  = "personal" | "team";

export interface PlanLimits {
  maxTeams: number;           // 0 表示 teams 不可用
  canInviteMembers: boolean;  // personal org 恒为 false（见 personal-org.md 保护钩子）
  maxMembers: number;         // Infinity 表示无限
}

export function getPlanLimits(plan: string | null | undefined): PlanLimits;
export function planAllowsTeams(plan: string | null | undefined): boolean;
```

### BA wiring（`src/lib/auth/config.ts`）

```ts
organization({
  teams: {
    enabled: true,  // 写死，不要从 env 读
    maximumTeams: async ({ organizationId }) => {
      const { rows } = await pool.query<{ plan: string | null }>(
        'SELECT plan FROM "organization" WHERE id = $1',
        [organizationId],
      );
      return getPlanLimits(rows[0]?.plan).maxTeams;
    },
  },
  schema: {
    organization: {
      additionalFields: {
        plan: { type: "string", defaultValue: "free" },
        type: { type: "string", defaultValue: "team" },
      },
    },
  },
})
```

### 前端读取

```ts
import { authClient } from "#/lib/auth-client";
import { planAllowsTeams } from "#/lib/plan";

const { data: activeOrg } = authClient.useActiveOrganization();
const plan = (activeOrg as { plan?: string | null } | null | undefined)?.plan;
const disabled = !planAllowsTeams(plan);
```

---

## 3. Contracts

### Plan → limits 映射

| plan | maxTeams | canInviteMembers | maxMembers | 典型使用 |
|---|---|---|---|---|
| `free` | 0 | true | 5 | 未付费 team workspace 起步：Notion 心智，免费协作（个人空间由 `type=personal` hook 硬挡邀请，与 plan 字段正交） |
| `personal_pro` | 0 | false | 1 | 个人空间高级功能解锁 |
| `team_pro` | 10 | true | 25 | 中小 team workspace |
| `enterprise` | Infinity | true | Infinity | 企业 / 私有化交付默认值 |

### 写入规则

- **seed.ts**（private 模式默认 org）：`plan=enterprise, type=team` — 交付场景没有 plan 升降级概念，全部门控放行
- **user.update.after**（saas 模式 personal org 自建）：`plan=free, type=personal`
- **用户自建 team workspace**（saas 模式）：默认 `plan=free, type=team`；升级通过 Stripe plugin（Task 2 以后）或 super-admin 手改
- **super-admin 手改**：在 `/site/organizations` 页可直接改 plan 字段

### `canInviteMembers` 与 `type=personal` 叠加取交集

`canInviteMembers` 判断是否 UI 层显示邀请按钮。但 personal org 有第二层保护：`organizationHooks.beforeCreateInvitation` 强制拒绝。即使 plan 升成 personal_pro（canInviteMembers 仍 false）或被手动篡改成 team_pro（limits 允许），personal org 也永远拒绝邀请——type 约束优先于 plan。详见 `personal-org.md`。

---

## 4. Validation Matrix

| Condition | Expected |
|---|---|
| `getPlanLimits("free").maxTeams` | `0` |
| `getPlanLimits("team_pro").maxTeams` | `10` |
| `getPlanLimits("enterprise").maxTeams` | `Infinity` |
| `getPlanLimits(null)` | 退回 `free` |
| `getPlanLimits("nonsense")` | 退回 `free`（防 DB 脏数据）|
| `planAllowsTeams("free")` | `false` |
| `planAllowsTeams("enterprise")` | `true` |
| BA `maximumTeams` 在 `plan=free` 的 org 里调 createTeam | BA 返回配额错误（0 个 team 上限已用满）|
| 升级 plan `free → team_pro` | 下次 createTeam 请求即生效（无需重启，每次查 DB）|

---

## 5. Good / Bad Cases

### Good — 私有部署默认 plan=enterprise

```ts
// seed.ts
await pool.query(
  'INSERT INTO "organization" (id, name, slug, "createdAt", plan, "type") VALUES ($1, $2, $3, now(), $4, $5)',
  [orgId, name, slug, "enterprise", "team"],
);
```

### Good — saas 注册自动 personal，plan=free

```ts
// auth.ts user.update.after
await pool.query(
  'INSERT INTO "organization" (..., plan, "type") VALUES (..., $4, $5)',
  [..., "free", "personal"],
);
```

### Good — 前端 sidebar 读 plan

```tsx
const { data: activeOrg } = authClient.useActiveOrganization();
const gates: SidebarGates = {
  teamsDisabled: !planAllowsTeams(activeOrg?.plan),
};
```

### Bad — 读 env 做门控

```ts
// ❌ 部署级 flag，无法针对单个 org 开/关
if (!env.VITE_TEAM_ENABLED) return <Disabled />;
```

### Bad — 在多处散落 plan 判断，各自实现

```ts
// Component A
if (plan === "enterprise" || plan === "team_pro") { ... }
// Component B
if (plan !== "free" && plan !== "personal_pro") { ... }
```

两者想表达同一件事但写法不同，以后加 plan 需要扫所有 call site。**统一用 `#/lib/plan` helper**。

---

## 6. Tests Required

| Test | Assertion |
|---|---|
| `plan.test.ts` | `getPlanLimits` 各 plan 返回正确 limits |
| `plan.test.ts` | 未知 plan 退回 `free` limits |
| `plan.test.ts` | `null` / `undefined` 退回 `free` limits |
| `plan.test.ts` | `planAllowsTeams` 符合 limits.maxTeams > 0 |
| `auth.integration.test.ts` | `plan=free` org 调 createTeam → 失败 |
| `auth.integration.test.ts` | `plan=enterprise` org 调 createTeam → 成功 |
| `auth.integration.test.ts` | 升级 plan 后 createTeam 立即成功（无缓存）|
| UI 手动 | `plan=free` 的 org sidebar `/teams` 灰化 + tooltip |

---

## 7. Wrong vs Correct — gating 层级

```ts
// ❌ 读 env
if (env.VITE_TEAM_ENABLED) { ... }

// ❌ 硬编码 plan 字符串
if (org.plan === "enterprise" || org.plan === "team_pro") { ... }

// ✅ 集中在 helper
import { planAllowsTeams } from "#/lib/plan";
if (planAllowsTeams(org.plan)) { ... }
```

核心原则：**plan → limits 的映射只在 `src/lib/auth/plan.ts` 里，别处只消费 helper**。新加 plan 或改 limits 只改一个文件，全项目自动同步。

---

## 8. Don't redeclare the plan enum locally

**任何**需要"列出所有 plan"的地方（form select、validation schema、显示文案查表）必须从 `#/lib/auth/plan` 导入 `PLAN_NAMES` 和 `PlanName`，不准本地重声明。

### Convention

```ts
// src/lib/auth/plan.ts —— 真相源
export type PlanName = "free" | "personal_pro" | "team_pro" | "enterprise";
export const PLAN_NAMES: PlanName[] = ["free", "personal_pro", "team_pro", "enterprise"];
```

### Wrong（曾发生的真实 bug）

```ts
// src/routes/(workspace)/_layout/settings/organization/index.tsx — 旧版（已修）
type PlanOption = "free" | "pro" | "enterprise";
const PLAN_OPTIONS: PlanOption[] = ["free", "pro", "enterprise"];
//                  ^ 缺 personal_pro / team_pro，多了不存在的 "pro"
```

后果（real symptom）：
1. DB 里 plan=`team_pro` 时，`<Select>` 找不到匹配 `<SelectItem>` → SelectValue 显示空
2. 用户保存 `"pro"` 后，`getPlanLimits("pro")` fallback 到 `free` limits → sidebar PlanBadge 显示 Free（fallback 在工作，不是没刷新）

### 为什么这是 silent bug

在 `<PlanBadge>` 出现之前，`organization.plan` 字段没有任何前端 UI 消费方——只在后端 `maximumTeams` 钩子里读。settings 页 enum drift 写错也没人发现，直到加了 PlanBadge 才暴露。

**教训**：任何时候为后端字段加上前端 UI 消费方（badge、card、select、tooltip 文案），都要同步把"该字段的 enum 列表"集中到一个文件，别处只 import。这不是 plan 字段独有的——`organization.type`、`organization.industry` 等同样适用。

### Correct

```ts
// src/routes/(workspace)/_layout/settings/organization/index.tsx
import { PLAN_NAMES, type PlanName } from "#/lib/auth/plan";
import * as m from "#/paraglide/messages";

const PLAN_LABEL: Record<PlanName, () => string> = {
  free: m.plan_label_free,
  personal_pro: m.plan_label_personal_pro,
  team_pro: m.plan_label_team_pro,
  enterprise: m.plan_label_enterprise,
};

<Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v as PlanName })}>
  <SelectContent>
    {PLAN_NAMES.map((p) => (
      <SelectItem key={p} value={p}>{PLAN_LABEL[p]()}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

---

## Related

- `backend/product-modes.md` — private 模式默认 org 用 enterprise；saas 模式 personal org 用 free
- `backend/personal-org.md` — type=personal 的保护钩子，与 plan gating 叠加
- `backend/authorization-boundary.md` — BA organization 插件拥有 organization 表，plan 字段通过 additionalFields 挂进去
- `backend/billing-stripe.md` — 当前 plan 升级 CTA 是 stub；未来 Stripe 接入步骤
- `#/lib/plan` — 实现
- `docs/reference/better-auth-plugin-organization.md` §Team Configuration Options — `maximumTeams` 动态函数原文
