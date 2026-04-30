# Plan Gating UI + Stripe 接入位预留

## Goal

把每个 org 的 `plan` 从"只在后端起作用"升级为**用户可见的产品概念**：teams 页/sidebar 把当前 plan + 配额展示出来，邀请按钮和成员数也按 `plan.ts` 接 UI gating；同时为后续 Stripe 升级闭环挖好接入位（env optional + 条件加载 + 升级按钮 stub），但本期不实做 Stripe 业务流（支付/webhook/订阅状态机都留到下一轮）。

理由：
1. 现状只 teams 入口被 plan 灰化，邀请按钮/成员上限两条 plan 维度的 UI 消费是漏的（spec `plan-gating.md` §2 已定义 `canInviteMembers` / `maxMembers` 但前端没消费），用户能点到一个被服务端 hook 拒掉的按钮，体验割裂。
2. 用户看不到当前 plan 是什么、还能加几个 team / 邀几个人，"升级"这个动作就没法被产品化。
3. Stripe 接入位现在不挖，等真要上线时会回头改 `auth.ts` 的 plugin 数组、env、schema、`organization.plan` 写入路径——分散的 surgical 改动。现在挖好（条件加载 + 升级按钮 stub）成本极低。

## What I already know

### 现有实现
- `src/lib/auth/plan.ts`：`PLAN_LIMITS` 表已定义 `maxTeams / canInviteMembers / maxMembers`，是单一真相源
- `src/components/layout/app-sidebar.tsx:288`：用 `planAllowsTeams` 控制 teams 入口 disabled
- `src/routes/(workspace)/_layout/teams/index.tsx:67`：plan 不允许时渲染 `TeamsDisabledCard`（只有标题 + 一句 hint，没有 plan 信息 / 升级 CTA）
- `src/routes/(workspace)/_layout/organization/index.tsx:98`：邀请只用 `canInvite={!isPersonal}` 判断，**没读 `getPlanLimits().canInviteMembers`**
- `src/routes/(workspace)/_layout/organization/index.tsx` 成员列表：没有 `maxMembers` 上限提示
- `.trellis/spec/backend/plan-gating.md` 已经把 plan 契约写得很清楚，前端做的事就是 spec 兜底落地

### 已知约束
- `personal` 类型 org：邀请永远禁，由 `organizationHooks.beforeCreateInvitation` 硬挡（personal-org.md），UI 层不需要复杂判断——personal 直接不显示邀请。这部分 type 维度已经做了
- `private` 模式默认 org `plan=enterprise`，所有门控放行——所有 plan 提示在 enterprise 下应该是"无限"或直接不渲染（不要让交付场景看到莫名其妙的"升级"按钮）
- `saas` 模式才需要看到升级 CTA；可以用 `import.meta.env.VITE_PRODUCT_MODE === "saas"` 判断
- 前端 i18n：所有文案走 paraglide（`m.xxx()`），不能硬编码中英文
- Better Auth 的 organization 数据来自 `useActiveOrganization`，`plan` 字段通过 `additionalFields` 挂进去（spec §2 BA wiring）

### Better Auth Stripe plugin 已知
- BA 有官方 `@better-auth/stripe` plugin，原生支持把 `subscription.referenceId` 关到 `organization.id`
- 需要 `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`
- plugin 自带 `subscription` 表 schema → 跑 `pnpm ba:shadow` 自动同步进 `_better-auth.zmodel`
- 客户端有 `authClient.subscription.upgrade(...)` 之类的 helper（具体 API 表面待研究）

## Assumptions (temporary)

- 升级 CTA 按钮先做 stub：点击后 toast "Coming soon" 或一个空 dialog 说明价格表（不接真的 Stripe checkout）
- 不引入 `@better-auth/stripe` 依赖也行——只在 `auth.ts` / `env.ts` 加注释 + 留位置；引入 dep 也行，按用户偏好定（见 Open Questions）
- enterprise plan 的 org 看到的 UI 是"无限制"——sidebar 不灰、teams 页不显示升级 CTA、邀请按钮不限额
- private 模式整个升级 CTA 系统都不出现（因为默认 org 就是 enterprise，且交付客户没有"我要付费"的概念）

## Open Questions

（已全部解决，见 Decision）

## Requirements (evolving)

### R1 — Plan 信息可视化
- `teams/index.tsx` 的 `TeamsDisabledCard` 升级为：显示当前 plan 名 + "本 plan 上限 0 teams" + 升级 CTA（仅 saas 模式）
- `teams/index.tsx` 启用态：在标题区显示"X / maxTeams 已使用"或"无限"（enterprise）
- `organization/index.tsx` 成员区：显示"X / maxMembers"或"无限"

### R2 — 邀请按钮接 plan
- `organization/index.tsx:98` 的 `canInvite` 从 `!isPersonal` 改为 `!isPersonal && getPlanLimits(plan).canInviteMembers`
- 邀请按钮被 plan 禁时显示 disabled + tooltip 提示原因（"当前 plan 不允许邀请，升级后启用"）
- 成员数达到 `maxMembers` 时同样 disabled + 提示

### R3 — 升级 CTA stub
- 新组件 `src/components/billing/upgrade-plan-button.tsx`，统一被 teams/organization 页和 sidebar badge 消费
- 仅 `VITE_PRODUCT_MODE=saas` 且 `plan !== "enterprise"` 时渲染
- 点击行为：toast `m.upgrade_coming_soon()`（"升级功能即将上线，请联系管理员"）
- 组件内部留 `// TODO(stripe): replace toast with authClient.subscription.upgrade()` 注释，标明未来接入点

### R4 — Stripe 接入位预留（A 档：最轻）
- `src/env.ts`：`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` 加为 optional（`z.string().optional()`），不引入 runtime 校验
- `.env.example`：新增 `# === Stripe (reserved, not active) ===` 段，列出 `STRIPE_SECRET_KEY=` / `STRIPE_WEBHOOK_SECRET=` 占位 + 注释说明"本期未启用，留空即可；接入计费时取消注释并填值"
- `src/lib/auth/config.ts`：在 plugin 数组下方加 TODO 注释，列出未来需要改的三处（plugins 注册、ba:shadow 同步 subscription 表、organization.plan 写入路径）
- `src/lib/auth/client.ts`：同样的 TODO 注释（未来要挂 `stripeClient()`）
- **不装 dep**（不引入 `@better-auth/stripe` / `stripe`）
- 文档：写 `.trellis/spec/backend/billing-stripe.md`，描述当前 stub 状态 + 未来接入的 step-by-step（dep 安装、env 变 required、plugins 注册、ba:shadow 同步、客户端 hook 替换 toast、Stripe webhook endpoint 添加）

### R9 — 修 spec/实现 drift
- `.trellis/spec/backend/plan-gating.md` §3 plan→limits 表格里 `free` 行的 `canInviteMembers` / `maxMembers` 跟 `plan.ts` 现状对齐（true / 5），跟 spec 文字注释一致；不改 `plan.ts`

### R10 — 修 settings/organization 页的 plan Select drift（PlanBadge 暴露的预存 bug）
- 现象：超管把 org plan 改成"pro"后，sidebar PlanBadge 仍显示 Free；同时套餐 Select 在 plan=team_pro / personal_pro 等真实值下显示空（因为 SelectItem 列表只有 `free / pro / enterprise`，找不到匹配）
- 根因：`src/routes/(workspace)/_layout/settings/organization/index.tsx:40-41` 的 `PlanOption` / `PLAN_OPTIONS` 跟 `plan.ts` 真相源不一致（缺 `personal_pro / team_pro`，多了不存在的 `pro`）
- 修法：
  1. 从 `#/lib/auth/plan` 导入 `PlanName` 类型，替换本地 `PlanOption`
  2. 新增导出常量 `PLAN_NAMES: PlanName[] = ["free","personal_pro","team_pro","enterprise"]`（在 `plan.ts` 里集中维护，避免再 drift），settings 页消费它
  3. SelectItem 的显示文案改为 `m.plan_label_<plan>()`（复用本任务 PR1 已加的 i18n key），而不是渲染原始 enum 字符串
  4. `saveMutation.onSuccess` 在 invalidate ReactQuery 之外，再调 `authClient.organization.setActive({ organizationId: orgId })` 强制重拉 BA 的 active-org 缓存，让 sidebar PlanBadge 立即刷新；或用 BA 推荐的 `authClient.$store.notify("$sessionSignal")`（按 BA 文档现状选择）

### R7 — Sidebar plan badge
- `src/components/layout/app-sidebar.tsx` 在 `BrandMark` 区或 org switcher 旁加 plan badge（小号 Badge 组件）
- 文案：`free → Free` / `personal_pro → Personal Pro` / `team_pro → Team Pro` / `enterprise → ✨ Enterprise`（enterprise 用金色装饰避免显得"是个被推销的目标"）
- 仅 `VITE_PRODUCT_MODE=saas` 渲染（private 模式默认 enterprise，无意义）
- badge 点击不跳转（保持纯展示，避免和 org switcher 的下拉冲突）；升级 CTA 走单独的按钮在 teams/organization 页内

### R8 — Edge cases（diverge sweep 纳入）
- `getPlanLimits` 收到未知 plan 字符串 → 已经退回 `free`，UI 跟着退回 Free 显示（不渲染 fallback 错误页）
- `useActiveOrganization` loading 态 → 默认按 disabled / "无 plan 信息" 走，不闪现可点 CTA（参考 `app-sidebar.tsx:286` 现有写法）
- `personal` 类型 org：邀请按钮渲染优先级 = `type !== "personal"` 优先于 plan 判断（type 隐藏整个邀请区时不再判 plan）

### R5 — i18n
- 所有新增文案走 paraglide，至少 `en` / `zh` 两份

### R6 — Tests
- `plan.test.ts` 已有的覆盖保留；本期不新增（helper 没改）
- 新增前端 component test：`TeamsDisabledCard` 在 `plan=free` 下显示升级按钮，在 `plan=enterprise` 下不显示
- 新增：邀请按钮在 `team_pro` 下可点，在 `personal_pro` 下 disabled
- 不引入 e2e（Stripe 真流程没实做，e2e 等下一轮）

## Acceptance Criteria (evolving)

- [ ] `plan=free` 的 saas team org，访问 `/teams` 看到"当前 Free 版，0/0 teams 已使用 + 升级按钮"
- [ ] 同一 org，邀请按钮 disabled 但 tooltip 说明原因（free plan canInviteMembers=true 实际可邀；测试用 `personal_pro` 反例）
- [ ] `plan=enterprise` 的 org，所有 plan 提示文案显示"无限"或直接不显示升级 CTA
- [ ] `private` 模式整个升级 CTA 系统不渲染（grep 不到 saas-only 组件被渲染）
- [ ] `STRIPE_SECRET_KEY` 不存在时 boot 正常（env 是 optional）
- [ ] `.env.example` 里 STRIPE_* 占位行存在且带注释说明"未启用"
- [ ] `spec/backend/plan-gating.md` §3 表格与 `plan.ts` 一致
- [ ] settings/organization 页套餐 Select 列出 4 个真实 plan（free/personal_pro/team_pro/enterprise），显示文案走 `m.plan_label_*`
- [ ] 保存 plan 后 sidebar PlanBadge 立即反映新值（无需手动刷新页面）
- [ ] paraglide 文案 `en` / `zh` 都补齐
- [ ] `pnpm check` / `pnpm test` 全绿

## Definition of Done

- 所有 AC 勾选
- `pnpm check`（Biome）/ `pnpm test`（Vitest）/ `pnpm build` 三连绿
- 新增组件 < 200 行，遵循 `src/components/` 目录约定
- 文档：`spec/backend/billing-stripe.md` 解释当前 stub 状态 + 后续接入步骤
- 不破坏 private 模式（手动验证：`VITE_PRODUCT_MODE=private pnpm dev` 看不到任何升级按钮）

## Out of Scope (explicit)

- **Stripe 真流程**：checkout、webhook、subscription 状态同步、试用、税、退款——全部本期不做
- **新增 plan**：不动 `PLAN_LIMITS` 表，只消费现有的 4 个 plan
- **plan 升降级 API**：不做用户自助升级（即使选 Q1=C 也只是跳到 Stripe Portal，不做 in-app 流程）
- **billing dashboard 页**：不做"账单 / 发票 / 用量"页面
- **maxMembers 强制阻断**：本期只在 UI 层 disabled + 提示；服务端 `organizationHooks.beforeCreateInvitation` 是否要新增 maxMembers 校验留到下一轮（现状没有，加上需要单独考虑 race condition）

## Technical Notes

- 前端 plan 读取：`authClient.useActiveOrganization()` → `(activeOrg as { plan?: string })?.plan` → `getPlanLimits(plan)`，参考 `app-sidebar.tsx:286-291` 的现成写法
- 升级 CTA 组件位置：`src/components/billing/upgrade-plan-button.tsx`（新建 `billing/` 目录，为后续 Stripe UI 留位置）
- Stripe plugin 相关（待 Q1 答完决定深度）
  - 包：`@better-auth/stripe` + `stripe`
  - 文档：https://www.better-auth.com/docs/plugins/stripe（待 trellis-research 子代理拉取最新版本）

## Research References

- 不做（Q1=A 决定不装 Stripe dep，本期无技术选型需要研究；未来真接入时再派 trellis-research 拉 BA Stripe plugin 最新文档）

## Decision (ADR-lite)

**Context**：用户希望本轮把"plan 决定 team 容量"产品化（UI 可见、可消费），并为未来 Stripe 计费挖好接入位，但本期不实做支付/webhook/订阅状态机。

**Decision**：
- **Stripe 预留强度选 A（最轻）**：env 加 optional key + 代码 TODO 注释 + spec 文档，**不装 `@better-auth/stripe` dep**。理由：用户原话是"预留"不是"接入"，A 把"将来要改的位置"全标注了，但运行时 0 影响、bundle 0 增长、schema 0 drift；未来真接入时工作量和现在选 B 几乎一样（只省一行 import）。
- **Sidebar plan badge 选 A（显示）**：org switcher 旁加小 badge。理由：SaaS 惯例（Notion/Linear/Vercel）让升级 CTA 始终可见；enterprise 用装饰色，不让交付客户产生"被推销"感；private 模式整体不渲染。

**Consequences**：
- ✅ 本期可以做完且不引入 Stripe 相关运行时风险
- ✅ 未来接 Stripe 时所有改动点都有 spec 指路
- ⚠️ 升级按钮目前是 toast，UX 上需要文案明确说明"非 bug"（避免用户以为产品坏了）
- ⚠️ 若未来选 Stripe 以外的支付（支付宝/微信），spec 文档需要扩展为"通用 billing 接入位"而不是 Stripe-specific——但 stub 阶段架构无差异

---

**附加决策（D1 + D2，2026-04-30）**：

- **D1：plan limits 维持现状**——不动 `plan.ts` 的 PLAN_LIMITS 表（free 5 人 / team_pro 10 teams 25 人 / enterprise ∞）。理由：现有数字符合 SaaS 通行做法，没有产品反馈说不合适；本轮聚焦在"把 plan 产品化"而不是"调 plan 数字"。
- **D2：实现优先修 spec drift**——`spec/backend/plan-gating.md` §3 表格里 `free` 行的 `canInviteMembers / maxMembers` 跟 `plan.ts` 对齐（true / 5）。理由：`plan.ts` 注释明确写了产品策略是"Notion 心智：免费开始、加人协作"；spec 表格属于早期占位，与文字注释自相矛盾，按代码修正即可。`maxTeams=0` 两边一致，不动；team 子分组保持"付费功能"定位。
