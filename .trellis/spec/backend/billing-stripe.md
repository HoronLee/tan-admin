# Billing — Stripe Integration (Stub)

> Reservation contract for future Stripe-based plan-upgrade flow. **Current state: stub** —— 没装任何 Stripe SDK，没接 webhook，"升级" CTA 全部 toast "Coming soon"。本 spec 描述当前 stub 的边界 + 未来真接入时按部就班的步骤。

---

## 1. Scope / Trigger

Triggers when work touches:

- `src/lib/env.ts` 中 `STRIPE_*` env 字段
- `.env.example` 的 Stripe 段
- `src/lib/auth/config.ts` plugin 数组（Stripe plugin 注册位）
- `src/lib/auth/client.ts` plugins 数组（stripeClient 注册位）
- `src/components/billing/*` 升级 CTA / 价格表组件
- 任何"升级 plan / 订阅 / 计费"相关业务逻辑

读 `plan-gating.md` 拿到 plan→limits 的契约；读 `personal-org.md` 拿到 type 维度保护逻辑；本 spec 只管"用户怎么从 plan A 升到 plan B"。

---

## 2. Current State (stub)

### 2.1 已落地

- **env 占位**：`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` 在 `src/lib/env.ts` server 段以 `z.string().optional()` 声明。缺失时 boot 正常，runtime 不读取
- **`.env.example`**：列出占位 + 注释说明"未启用，留空即可"
- **UpgradePlanButton 组件**（`src/components/billing/upgrade-plan-button.tsx`）：导出按钮变体 + 整卡变体（`UpgradePlanCard`），统一被 teams / organization 页和 sidebar 旁的 CTA 入口消费。点击行为：`toast.info(m.upgrade_coming_soon())`，组件内部留 `// TODO(stripe): replace toast with authClient.subscription.upgrade(...)` 注释
- **PlanBadge**（`src/components/layout/plan-badge.tsx`）：在 sidebar 展示当前 plan 标签
- **TODO 注释**：`src/lib/auth/config.ts` plugin 数组下方 + `src/lib/auth/client.ts` plugins 数组旁，列出未来接入 Stripe 时的改动锚点

### 2.2 尚未落地（本期 out-of-scope）

- 没装 `@better-auth/stripe` / `stripe` npm 依赖
- 没注册 Stripe plugin（server / client）
- 没有 Stripe webhook endpoint（`/api/webhooks/stripe` 不存在）
- 没有 `subscription` 表（pnpm ba:shadow 没生成 → 数据库里也没建）
- 没有 plan 升降级 API、价格表 UI、试用 / 退款 / 税逻辑

### 2.3 行为约束

- 升级按钮**仅** `VITE_PRODUCT_MODE === "saas"` 且 `plan !== "enterprise"` 时渲染。`private` 模式下 sidebar / teams / organization 页都不出现升级 CTA（默认 org `plan=enterprise`，所有门控放行；交付客户没"升级"概念）
- `enterprise` plan 在 saas 模式也不渲染（已经是顶档，没有再升的空间）
- 点击升级按钮 toast 后不发任何网络请求，**不**修改 `organization.plan`

---

## 3. Future Integration Steps (when ready)

Step-by-step playbook，按顺序执行：

### 3.1 装依赖

```bash
pnpm add @better-auth/stripe stripe
```

### 3.2 把 env 变 required

`src/lib/env.ts`:

```ts
// 改 .optional() → 强制要求（生产环境）
STRIPE_SECRET_KEY: z.string().min(1),
STRIPE_WEBHOOK_SECRET: z.string().min(1),
```

如果还想保留"开发/测试 stub"模式，可以条件化（`APP_ENV === "prod"` 才必填），但不推荐——半启用状态难调试。

### 3.3 注册 Server plugin

`src/lib/auth/config.ts` plugins 数组：

```ts
import { stripe as stripePlugin } from "@better-auth/stripe";
import Stripe from "stripe";

const stripeInstance = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia", // 用当时最新的 API 版本
});

// plugins 数组里追加：
stripePlugin({
  stripeClient: stripeInstance,
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
  subscription: {
    enabled: true,
    plans: [
      // 跟 #/lib/auth/plan 的 PLAN_LIMITS 表对齐
      { name: "personal_pro", priceId: "price_xxx" },
      { name: "team_pro", priceId: "price_yyy" },
      { name: "enterprise", priceId: "price_zzz" },
    ],
    // BA 的 referenceId 关到 organization.id（多租户 SaaS 标准做法）
    authorizeReference: async ({ user, referenceId, action }) => {
      // 校验当前 user 在 referenceId 这个 org 是 owner / admin
      const { rows } = await pool.query(
        'SELECT role FROM "member" WHERE "userId" = $1 AND "organizationId" = $2',
        [user.id, referenceId],
      );
      const role = rows[0]?.role;
      return role === "owner" || role === "admin";
    },
  },
}),
```

### 3.4 同步 schema（subscription 表）

```bash
pnpm ba:shadow      # 生成 zenstack/_better-auth.zmodel 影子（带 subscription 表）
pnpm db:push        # 迁移 DB
```

### 3.5 注册 Client plugin

`src/lib/auth/client.ts` plugins 数组：

```ts
import { stripeClient } from "@better-auth/stripe/client";

// plugins 数组里追加：
stripeClient({ subscription: true }),
```

这一步让 `authClient.subscription.upgrade(...)` / `authClient.subscription.list(...)` 等 helper 在 client 上可用。

### 3.6 把 stub 升级按钮替换成真升级

`src/components/billing/upgrade-plan-button.tsx`：

```ts
// 把 toast.info(m.upgrade_coming_soon()) 改成：
const { error } = await authClient.subscription.upgrade({
  plan: targetPlan,                       // "team_pro" / "enterprise"
  referenceId: activeOrg.id,
  successUrl: `${window.location.origin}/settings/billing?status=success`,
  cancelUrl: window.location.href,
});
if (error) toast.error(translateAuthError(error));
// 成功时 BA 自动 redirect 到 Stripe Checkout
```

### 3.7 同步 organization.plan（webhook handler）

BA Stripe plugin 自带 webhook 处理（`/api/auth/stripe/webhook` 端点由 BA 路由树挂载）。但**plan 字段不会自动同步到 `organization.plan`**——需要在 `subscription.created` / `subscription.updated` / `subscription.deleted` 事件里手写一条 UPDATE：

```ts
// src/lib/auth/config.ts stripe plugin 配置追加：
onSubscriptionUpdate: async ({ subscription }) => {
  await pool.query(
    'UPDATE "organization" SET plan = $1 WHERE id = $2',
    [subscription.plan, subscription.referenceId],
  );
},
onSubscriptionDeleted: async ({ subscription }) => {
  // 用户取消订阅 → 退回 free
  await pool.query(
    'UPDATE "organization" SET plan = $1 WHERE id = $2',
    ["free", subscription.referenceId],
  );
},
```

### 3.8 加测试

- `subscription.test.ts`：`upgrade("team_pro")` 后 `organization.plan === "team_pro"`、`maxTeams` 即时生效
- `webhook.test.ts`：模拟 Stripe webhook 事件，确认 `organization.plan` 同步
- E2E（Playwright）：完整 Checkout 流程（test mode + Stripe test card）

---

## 4. Why Stub 而不是直接接

PRD §Decision 选 A 档（最轻预留）的理由：

- 用户原话是"预留"不是"接入"
- A 档把"将来要改的位置"全标注了，但运行时 0 影响、bundle 0 增长、schema 0 drift
- 真到接入时，工作量比一开始就装 dep 几乎没区别（只省一行 import）
- 提前装 dep 反而引入安全审计 surface（Stripe SDK 是 secret-handling 关键链，漂移风险大）

---

## 5. 可能扩展为通用 billing 接入位

如果将来选 Stripe 以外的支付（支付宝 / 微信 / Paddle / Lemon Squeezy 等），本 spec 应扩成"通用 billing 接入位"，而不是 Stripe-specific：

- env 改成 `BILLING_PROVIDER=stripe|alipay|paddle|...`
- plugin 注册路径分支
- webhook endpoint 各自独立
- `organization.plan` 仍是 plan 字段单一真相源（与 provider 解耦）

但**stub 阶段架构无差异**——都只是 env + 注释 + 文档。

---

## Related

- `backend/plan-gating.md` — plan→limits 契约，Stripe 升级流程的目标状态由它定义
- `backend/personal-org.md` — type=personal 的钩子，升级流程要绕过个人空间
- `backend/authorization-boundary.md` — BA organization 插件拥有 organization 表；plan 字段通过 additionalFields 挂进去；subscription 表将由 Stripe plugin 引入并由 ba:shadow 同步
- BA Stripe plugin 文档：https://www.better-auth.com/docs/plugins/stripe
