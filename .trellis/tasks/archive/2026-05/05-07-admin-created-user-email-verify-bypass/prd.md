# Bug: Super-admin 创建的 @dev.com 用户登录提示 Email not verified

## Goal

修复 super-admin 通过后台 `authClient.admin.createUser({...})` 创建的用户在 dev 模式下走不通登录的 drift。期望：`@dev.com` 邮箱在任何创建路径下都自动 `emailVerified=true`，与 spec "Dev convenience: addresses at `@dev.com` skip verification entirely" 的承诺一致；resend 行为也能在管理员创建场景下覆盖兜底。

## What I already know

- 现象：超管在 `/site/users` 通过 `CreateUserDrawer` 创建 `2@dev.com` → 登录被拒（"Email not verified"）；点 resend 后 mailpit 收不到（dev 域名跳过发邮件本身是预期），但用户后续登录还是失败。手动注册的 `1@dev.com` 走 `signUpEmail` → 触发 `sendVerificationEmail` hook → 命中 dev 分支 → `emailVerified=true`。
- UI 入口：`src/routes/site/_layout/users/-components/create-user-drawer.tsx:41` 调用 `authClient.admin.createUser({ name, email, password, role })`，没传 `data: { emailVerified }`。
- 服务端入口：BA `admin` plugin 的 `createUser` 不会调用 `sendVerificationEmail`（管理员侧创建用户的语义是"管理员决定"，BA 默认 `emailVerified=false`）。
- Auto-verify 唯一锚点：`src/lib/auth/config.ts:144-170` 的 `emailVerification.sendVerificationEmail` hook 内部判断 `isDevAutoVerifyEmail(email)` → raw SQL flip + `ensurePersonalOrg`。**不在 `user.create.after` / admin plugin 路径上**——这是 drift 来源。
- Seed 路径不受影响：`src/server/seed.ts:405` 用 `ctx.internalAdapter.createUser({ ..., emailVerified: true })` 显式落库 verified（spec `email-infrastructure.md` 已记录）。

## Assumptions (temporary)

- BA `admin.createUser` 默认 `emailVerified=false`（待 research 确认是否可通过 `data: { emailVerified: true }` 显式传入；BA admin plugin 在某些版本支持 `data` 透传 user additional fields）。
- Resend "卡住"是因为 hook 本身是触发了 → flip 成 true 了，但 sign-in 页面状态没刷新；或 BA 在 `emailVerified=false + 已存在用户` 时 resend 行为有 throttle。需 research 确认。
- 私有化模式同样适用（admin plugin 在两种 `VITE_PRODUCT_MODE` 下都启用）。

## Open Questions

- _无_ —— Q1/Q2 已收敛，见 Decision。剩余未知量是技术细节（BA hook 如何识别 admin plugin 路径），由 research 任务回答，不阻塞需求。

## Requirements

- 必含：super-admin 通过后台 `authClient.admin.createUser` 创建的**所有**用户（不论邮箱后缀）`emailVerified=true`，登录立刻可用；与 seed 内的 super-admin bootstrap 行为对齐
- 必含：`signUpEmail`（公开注册）路径**不变**——非 `@dev.com` 用户照常走邮件验证；`@dev.com` 仍由 `sendVerificationEmail` hook 内现有 dev 分支兜底
- 必含：private 模式下 `user.create.after` 既有"auto-join default org"行为不能回归
- 必含：saas 模式下若新建用户被自动标 verified，personal org provision 必须触发（沿用 `ensurePersonalOrg` 幂等调用）
- 必含：hook 内必须能稳定区分"admin plugin createUser 路径"vs"signUpEmail 路径"——具体识别方式由 research 决定

## Acceptance Criteria

- [ ] super-admin UI 创建 `2@dev.com` → 立即登录成功（dev 模式 + 任意 PRODUCT_MODE）
- [ ] super-admin UI 创建 `bob@acme.com`（非 dev 后缀）→ 立即登录成功，emailVerified=true，**不发**验证邮件
- [ ] 公开注册（`signUpEmail`）`bob@acme.com` 仍发验证邮件（既有路径不回归）
- [ ] 公开注册 `1@dev.com` 仍走 `sendVerificationEmail` 内 dev 分支自动 verified（既有路径不回归）
- [ ] private 模式：admin 创建的新用户自动 join default org（既有 `user.create.after` 路径不回归）
- [ ] saas 模式：admin 创建的新用户登录后 `activeOrganizationId` 已有值（personal org 已 provision）
- [ ] Vitest 覆盖：`user.create.after` 在 admin plugin 路径 flip emailVerified；signUpEmail 路径**不**误 flip

## Definition of Done

- 单测覆盖 `user.create.after` 新分支（dev 域名 flip）+ 既有 private auto-join 路径回归
- `pnpm check` / `pnpm test` 全绿
- spec 同步：`backend/email-infrastructure.md` 补一条"admin.createUser 路径下的 dev auto-verify 兜底契约"
- 不需要 db migration（只动 hook 逻辑）

## Out of Scope

- 自定义 dev auto-verify suffix（`VITE_DEV_AUTO_VERIFY_SUFFIXES` 等 env 配置）—— Approach 2 已经覆盖私有化交付场景，prod 模式扩此口子有安全风险，明确不做
- BA admin plugin 自身行为修改 / fork（只在我们 hook 层兜底）
- 非 dev 域名用户被 admin 创建时的"邮箱必须可达"校验（当前直接信任管理员录入）
- 邮件 throttle / resend 限流策略调整
- OAuth / SSO callback 路径（本期只覆盖 password + admin.createUser）

## Technical Notes

- 关键文件：
  - `src/lib/auth/config.ts:144-170`（dev auto-verify 当前唯一锚点 — 仅在 sendVerificationEmail）
  - `src/lib/auth/config.ts:241-296`（`databaseHooks.user.create.after` — 私有模式 auto-join，**dev flip 应该挂这里**）
  - `src/lib/auth/config.ts:225-240`（`user.update.after` — saas personal org provision 触发点）
  - `src/routes/site/_layout/users/-components/create-user-drawer.tsx:41`（UI 入口）
  - `src/server/seed.ts:405`（参考 internalAdapter.createUser 怎么写 emailVerified=true）
- 提示：raw SQL 写 `"user".emailVerified = true` 不会再触发 `user.update.after`（BA 适配器只看 BA-managed writes），所以若 hook 内 flip emailVerified，还要**显式调用 `ensurePersonalOrg`**（沿用 sendVerificationEmail 分支的现有 pattern）。
- BA 版本：根据 package.json 锁定。research 任务确认 admin plugin createUser 是否支持 `data: { emailVerified }` 直传。

## Research References

- [`research/ba-hook-admin-path-detection.md`](research/ba-hook-admin-path-detection.md) — `ctx?.path === "/admin/create-user"` 精准识别 admin 路径；`/sign-up/email` 是公开注册路径；admin plugin 无独立 hook；`internalAdapter.updateUser` 会触发 `user.update.after` 链；`/send-verification-email` 默认 60s/3 次 rate-limit + enumeration 防护（解释了 resend 卡住）

## Technical Approach

### 实现要点

- **修改点**：`src/lib/auth/config.ts` 的 `databaseHooks.user.create.after`（L246-295 附近）—— 在现有 private-mode auto-join 逻辑**之前**插入 admin 路径检测分支
- **路径识别**：`ctx?.path === "/admin/create-user"` —— BA 1.6.5 通过 AsyncLocalStorage 注入 internalContext，第二参稳定可用；`signUpEmail` 路径是 `/sign-up/email`，不会误命中；seed 路径 `ctx === null`，也不会误命中（正合需求，seed 已经显式 `emailVerified: true`）
- **flip 方式**：`await ctx.context.internalAdapter.updateUser(user.id, { emailVerified: true })` —— **不**用 raw SQL。理由：
  1. 走 BA 适配器 → 触发 `user.update.after` → saas 模式下 `ensurePersonalOrg` 自动跑（沿用既有路径，无需在本 hook 里再调一次）
  2. BA 1.6 用 `queueAfterTransactionHook`，commit 后才跑 after hook，无嵌套事务 / FK 风险
- **顺序**：`if (ctx?.path === "/admin/create-user" && !user.emailVerified) { await flip; }` 先于 private-mode auto-join 既有逻辑；两段独立，互不依赖
- **测试**：Vitest 单测覆盖
  - admin 路径 + dev 域名 → flip ✓
  - admin 路径 + 非 dev 域名 → flip ✓（这是 Approach 2 的核心改动）
  - signUpEmail 路径 + 非 dev 域名 → **不** flip（既有验证流程不回归）
  - signUpEmail 路径 + dev 域名 → 由现有 `sendVerificationEmail` 分支兜底（既有路径不回归）
  - private 模式 admin 创建 → auto-join default org 仍触发
- **UI 顺手清理**：`CreateUserDrawer` 创建成功后不需要再向 admin 暴露"重发验证邮件"按钮（research 提示 admin-created 用户已 verified，UI 上若有 resend CTA 应隐藏 / 移除）—— 检查后视情况决定

### Implementation Plan

- **PR1**（核心修复 + 测试）：
  - `src/lib/auth/config.ts` `user.create.after` 加 admin 路径分支
  - Vitest 单测覆盖上述 5 个场景
  - 手动验证：dev 模式起服务，超管 UI 创建 `2@dev.com` + `bob@acme.com`，确认登录直通
- **PR2**（spec 同步 + UI 清理）：
  - `.trellis/spec/backend/email-infrastructure.md` 加一条 "admin.createUser 路径 → emailVerified=true 兜底契约"
  - `.trellis/spec/backend/personal-org.md` 提一句 "admin 路径下 personal org 由 user.update.after 链自动 provision"
  - 检查 `src/routes/site/_layout/users/` 下若有 resend 入口则移除（admin-created 用户已 verified，UI 暴露 resend 是僵尸 CTA）

## Feasible Approaches (待用户选 Q2)

**Approach A — Server hook only (Recommended)**
- 在 `databaseHooks.user.create.after` 内加 dev 域名分支：若 `!user.emailVerified && isDevAutoVerifyEmail(user.email)` → raw SQL flip + `ensurePersonalOrg`（saas 模式）
- 私有模式 auto-join default org 逻辑保持不变（只在 dev flip 之后并行/前置）
- Pros: 单点修复覆盖**所有**创建路径（admin / 未来 OAuth / 直接 API），UI 不动
- Cons: hook 逻辑略增长（顺序：先 dev flip → 再走原 private auto-join）

**Approach B — UI 显式传 + server hook 兜底（Defense in depth）**
- A 的所有改动 + `CreateUserDrawer` 在 `@dev.com` 时给 `data: { emailVerified: true }`（前提：BA admin plugin 接受该字段）
- Pros: 行为更显式，前端可观测
- Cons: 多一处可漂移点（前端逻辑可能跟 server 不一致）

**Approach C — UI only**
- 只改 `CreateUserDrawer`，给 `@dev.com` 传 `emailVerified=true`
- Pros: 最小改动
- Cons: 未来其他 admin 入口（CLI / API 调用 / 未来批量导入）会再 drift；不推荐

## Decision (ADR-lite)

**Context**：BA admin plugin 的 `createUser` 不走 `signUpEmail` → 不触发 `sendVerificationEmail` hook → dev auto-verify 逻辑漏接，super-admin 创建的 `@dev.com` 用户 `emailVerified=false` 卡在登录。同时私有化交付场景超管批量建账号是常态，让客户员工都去点验证邮件 UX 不友好。

**Decision**：选 Approach 2 —— 在 `databaseHooks.user.create.after` 里识别"admin plugin 创建路径"，**不论邮箱后缀**直接 raw SQL flip `emailVerified=true`，并显式调用 `ensurePersonalOrg`（saas）/ 既有 default-org auto-join（private）。`signUpEmail` 公开注册路径完全不变。

**Consequences**：
- + 单点修复，覆盖所有 admin 路径（UI / 未来 CLI / API 直调）
- + 与 seed 内 super-admin bootstrap 的"管理员创建 = 已验证"语义对齐
- + 对私有化客户友好：超管录入员工后员工直接登录
- − admin 录错邮箱时该账号也被 verified；缓解：admin 录入是写操作必须有审计，且账号 `status` 字段可以 ban
- − 未来 OAuth / SSO 路径的语义不在本期解决，但 hook 已统一收口，扩展点明确
