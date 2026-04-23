# refactor: saas mode fixups

## Goal

上一 task（04-23-product-positioning）完成了 tan-admin → tan-servora 重定位、路由组拆分、personal org 自动 provision、plan 驱动的 feature gating。用户端到端测试时发现三类遗留问题，本 task 修复：

1. **Organization slug 可编辑 + 校验失效**：UI 把 slug 当普通字段渲染，允许修改；且 personal org 的 slug 生成规则用了 BA nanoid `user.id`（大小写混用），违反前端 `/^[a-z0-9-]+$/` 校验
2. **Saas 模式超管无 activeOrganization 的分流缺失**：saas 模式下 super-admin 不自动建 personal org（按设计），但 `(workspace)/_layout.tsx` 的 `beforeLoad` 只校验 authenticated，不校验 `activeOrganizationId`，导致超管登录后进 `/dashboard` 时 `orpc.getUserMenus` 会因无 activeOrg 失败
3. **Paraglide 生成产物同步**：前一任务新增的 `teams_disabled_plan_hint` key 已重新编译，但需要确认其他相关 key 清理干净

不做（Out of Scope）：
- BA UI 的邮件模板切换（→ Task 2b）
- Plan badge / Convert to team / Billing / `/site/metrics` 等 UI 打磨（→ Task 2c，独立对齐颗粒度）

## What I already know

**Slug 问题**

- `src/routes/(workspace)/_layout/settings/organization/index.tsx`（Organization Settings 页）：slug 用普通 Input 渲染，失焦后触发 `organization.update`
- Personal org slug 生成在 `src/lib/auth.ts` 的 `databaseHooks.user.update.after` 里：`const slug = \`personal-${user.id}\`;`
- BA user.id 是 nanoid，含大小写字母（样例 `dJwRXcFdEdfAfRgVTXUvZAVEvwUoJw5`），直接拼出的 slug 不合法
- BA organization plugin 默认允许 slug 修改；要服务端硬禁改可以在 `organizationHooks.beforeUpdateOrganization` 里拦截，或在表级用 `@@validate`/policy，或业务层直接不暴露编辑 UI

**Super-admin 分流**

- `src/routes/(workspace)/_layout.tsx` 的 `beforeLoad` 目前：只检查 `session?.user` 存在
- Saas 模式 super-admin（`SEED_SUPER_ADMIN_EMAIL`）由 seed 脚本绕过 provision hook 建账号，无 member 关系、无 activeOrg
- BA session 的 `activeOrganizationId` 为 null 时，`useActiveOrganization()` 返回 null；workspace 内 menu / policy 全失效
- 方案 B（用户拍定）：在 `(workspace)/_layout.tsx` 的 `beforeLoad` 加 `activeOrganizationId` 检查，null 时：
  - 如果是 super-admin → `redirect({ to: "/site/users" })` 或 `/site`
  - 如果是普通用户（理论不该出现，因为 saas 注册 hook 会建 personal org）→ `/onboarding` 占位页兜底

## Assumptions (temporary)

- 不重写 BA user.id 生成规则（动 identity layer 成本大，不值当）
- Personal org slug 一旦建好就永久固化，不做 "id 变了 slug 也跟着变" 的联动（BA user.id 本身不变）
- `/onboarding` 做最小占位页（"你还没有 workspace，联系管理员" + 退出按钮），不做自助创建入口
- Slug 在 UI 层 readonly 是第一道防线；服务端 `beforeUpdateOrganization` 拦 slug diff 是第二道防线（即便未来加其他 UI 也兜底）

## Requirements

### R1 — Slug 不可编辑 + 生成规则修正

- `src/lib/auth.ts` 中 personal org 建组逻辑：`const slug = \`personal-${user.id.toLowerCase()}\`;`
  - BA user.id 字符集 `[A-Za-z0-9]`，`.toLowerCase()` 后落进 `[a-z0-9]`，符合前端 `/^[a-z0-9-]+$/`
  - 连字符只在前缀里，合法
- `src/routes/(workspace)/_layout/settings/organization/index.tsx`：
  - slug Input 改为只读展示（disabled + 说明文案 "slug 用作组织唯一标识，不可修改"）
  - 如果存在提交按钮能连带 slug 一起 PATCH，确保请求体不带 slug 字段
- `src/lib/auth.ts` 的 `organizationHooks.beforeUpdateOrganization`：
  - 如果 `data.slug !== undefined && data.slug !== existing.slug` → `throw new APIError("BAD_REQUEST", { message: "slug 不允许修改" })`
  - 这一层是后端护栏，防 API 直调 / 未来 UI 失误

### R2 — Saas 模式 super-admin 分流

- `src/routes/(workspace)/_layout.tsx` 的 `beforeLoad`：
  - 保留 `session?.user` 检查
  - 新增：`if (!session.session.activeOrganizationId)` 分流
    - 判断是否 super-admin（`session.user.role === "admin"` 或 `session.user.email === env.SEED_SUPER_ADMIN_EMAIL`，用 BA admin plugin 的 role 字段更稳）
    - super-admin → `throw redirect({ to: "/site" })`
    - 非 super-admin → `throw redirect({ to: "/onboarding" })`
- `src/routes/onboarding.tsx`（裸页，不走 workspace layout）：
  - 显示 "你的账号还没有关联 workspace，请联系管理员" + Sign out 按钮
  - 挂在根 `/onboarding`（跟 `/auth/*` 一样裸）

### R3 — i18n 兜底

- 确认 `src/paraglide/messages/*/teams_disabled_plan_hint.js` 存在（前 task 已生成）
- 新增 slug 相关 i18n：`organization_slug_readonly_hint`（"slug 用作组织唯一标识，创建后不可修改"）
- 新增 onboarding 页 i18n：`onboarding_no_workspace_title` / `onboarding_no_workspace_body` / `onboarding_sign_out`
- 跑 `pnpm paraglide:compile` 刷新生成产物

## Acceptance Criteria

- [ ] 新注册 saas 用户邮箱验证后，personal org 的 slug 是纯小写（样例 `personal-djwrxcfdedfaflhj...`）
- [ ] Organization Settings 页 slug 字段不可编辑，有说明文案
- [ ] 直接调用 `authClient.organization.update({ data: { slug: "new-slug" }, organizationId })` 服务端返回 400 BAD_REQUEST
- [ ] Saas 模式下用 super-admin 邮箱登录，落地 URL 是 `/site`（不是 `/dashboard`）
- [ ] Saas 模式下假造一个 activeOrg=null 的普通用户 session（或通过 BA API 手动清 activeOrg），访问 `/dashboard` 被重定向到 `/onboarding`
- [ ] Private 模式下 super-admin 登录进入默认 org（activeOrg 不 null），正常进 workspace（不受本次改动影响）
- [ ] `pnpm check` 无 lint/format 错误
- [ ] `pnpm build` 通过（typecheck）

## Definition of Done

- 上述 AC 全通
- `.trellis/spec/backend/personal-org.md` 更新 slug 生成规则（`.toLowerCase()` + 约束理由）
- `.trellis/spec/frontend/route-organization.md` 增补 `/onboarding` 裸页 + workspace layout 分流规则
- 手动过一次 dev 验证：clear DB → seed → 注册新 saas 用户 → 检查 slug → 登录 super-admin → 检查落地

## Technical Approach

**后端**

1. `src/lib/auth.ts`：
   - personal org hook 里 `user.id.toLowerCase()`
   - 新增 `beforeUpdateOrganization` hook 拦 slug diff
2. `src/env.ts`：无改动（SEED_SUPER_ADMIN_EMAIL 已存在）

**前端**

1. `src/routes/(workspace)/_layout.tsx`：`beforeLoad` 加 activeOrg + super-admin 分流
2. `src/routes/onboarding.tsx`：新建裸页（参考 `src/routes/auth/*` 的裸页模板）
3. `src/routes/(workspace)/_layout/settings/organization/index.tsx`：slug 字段 disabled
4. Paraglide 新 i18n key

**Spec**

- `personal-org.md`：slug 规则段落加 `.toLowerCase()` 注释
- `route-organization.md`：onboarding 裸页说明 + workspace 分流表

## Decision (ADR-lite)

**Context**: BA 身份层 user.id 是 mixed-case nanoid；org.slug 是用户可见的 URL 级 identity；private 模式默认 seed org 走明文 slug，saas 模式自动建 personal org 需编程生成 slug 且必须满足 `[a-z0-9-]+`

**Decision**:
- Slug 生成：`personal-${user.id.toLowerCase()}` —— 保留 "slug 反推 user.id" 的 debug 可读性，长度可控
- Slug 不可变：UI readonly + beforeUpdateOrganization hook 双层护栏
- Super-admin 无 activeOrg 分流：workspace layout beforeLoad 统一判（不是根路由分流），因 marketing/site 不需要此检查，只有 workspace 入口强制要 activeOrg

**Consequences**:
- 如果未来 BA user.id 引入非 ASCII 字符，生成规则要再加 normalize（现在 nanoid 只产 `[A-Za-z0-9_-]`，安全）
- Slug 永久不可变意味着 personal org 升级成 team org 时 slug 仍是 `personal-xxx`（Task 2c 的 "Convert to team" 需要补一个 slug 迁移 hook 或允许一次性 rename —— 留给 2c 对齐）
- `/onboarding` 裸页兜底场景罕见（saas provision hook 正常工作时不触发），但 super-admin 场景必经

## Out of Scope

- BA UI 邮件模板整体切换（→ Task 2b）
- Plan badge 展示 / Convert to team workspace 按钮 / Billing v1 / `/site/metrics` / OrganizationSwitcher 分组 / Personal org UI 隐藏邀请按钮 / Personal org 隐藏删除按钮 —— 全部入 Task 2c，另行对齐
- BA user.id 生成规则改造（不动 identity layer）

## Technical Notes

**相关文件**

- `src/lib/auth.ts` — databaseHooks + organizationHooks 集中处
- `src/routes/(workspace)/_layout.tsx` — workspace 入口
- `src/routes/(workspace)/_layout/settings/organization/index.tsx` — settings UI
- `src/routes/auth/*.tsx` — 裸页模板参考
- `src/lib/admin-guards.ts` — requireSiteAdmin / requireOrgMemberRole
- `src/paraglide/messages/*.js` — 生成产物，改 i18n 源后需 `pnpm paraglide:compile`

**参考 spec**

- `.trellis/spec/backend/personal-org.md` — 个人 org hook 契约
- `.trellis/spec/backend/product-modes.md` — PRODUCT_MODE 分流矩阵
- `.trellis/spec/frontend/route-organization.md` — 路由组 + 权限 gate

**BA API**

- `organizationHooks.beforeUpdateOrganization({ organization, data, user })` — data 可能只含部分字段，要判 `data.slug !== undefined`
- `authClient.useActiveOrganization()` — 读 `plan` / `type` 等 additionalFields，客户端 hook
- Server: `auth.api.getSession({ headers })` 返回 `{ user, session }`，`session.activeOrganizationId` 即是 BA admin plugin 的 activeOrg id

**验证步骤**

```bash
# 1. 清数据重来
pnpm db:push --force-reset && pnpm db:seed

# 2. saas 模式：改 .env.local PRODUCT_MODE=saas + VITE_PRODUCT_MODE=saas，重启 dev
# 3. 注册新用户 foo@dev.com（@dev.com 自动 verified），看 DB organization.slug
psql "$DATABASE_URL" -c 'select id, slug, type, plan from "organization";'

# 4. 登录 super-admin，应落地 /site
# 5. 切回 private 测默认 org + team 仍 work
```
