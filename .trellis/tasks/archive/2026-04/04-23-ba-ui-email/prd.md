# feat: BA UI email templates 切换 + 品牌统一配置

## Goal

**两条主线，一个 task**：

1. **邮件**：shadcn add BA UI 7 个邮件模板替换现有自写 + 新增 5 种通知邮件；org 场景两封（invite / transfer）保留自写但视觉对齐
2. **品牌**：把"项目名/logo"抽成 `appConfig.brand` 单一真相源，通过 env 注入，邮件和网页所有品牌露出点全部读它——发布前只改一处 env 全站生效

## What I already know

**现状（`src/emails/`）**

- 4 个模板：`verify-email.tsx` / `reset-password.tsx` / `invite-member.tsx` / `transfer-ownership.tsx`
- 共用自写 layout：`src/emails/components/email-layout.tsx`（Tan Servora 品牌头 + Paraglide `m.email_brand_name()` / `m.email_footer_note()` 等）
- 派发：`src/lib/email.tsx` 用 discriminated union `EmailPayload` 分发
- 传输：`src/lib/email-transport.ts` 支持 `console` / `smtp` / `resend`
- BA 挂接：`src/lib/auth.ts` 里 `emailVerification.sendVerificationEmail` / `emailAndPassword.sendResetPassword` / `organization.sendInvitationEmail` 等调 `sendEmail()`

**BA UI 邮件情况**

- 组件实现住在 `@better-auth-ui/react` 包内 `packages/react/src/components/email/*.tsx`
- shadcn registry URL：`https://better-auth-ui.com/r/<name>-email.json`（7 个）
  - email-verification-email / reset-password-email / email-changed-email / password-changed-email / magic-link-email / new-device-email / otp-email
- shadcn 方式（推荐）：`pnpm dlx shadcn@latest add <url>` 把源码拉进 `src/components/email/`（路径由 `components.json` 决定），**脱离包依赖**
- 组件签名：接受 `url` / `email` / `appName` / `expirationMinutes` / `logoURL` / `darkMode` / `poweredBy` / **`localization?: Partial<...>`** 等 props
- **i18n 策略**：BA UI 用 `localization` 对象（英文硬编码 default），可通过 `localization` prop 部分 override

**我们没有的（BA UI 不提供）**

- `invite-member`（org 邀请）
- `transfer-ownership`（org 所有权转移）

这两个要保留自写，且让视觉风格跟齐 BA UI（复用 `email-styles.tsx` 导出的 `EmailStyles` + `cn` + Tailwind className 体系）。

## Assumptions (temporary)

- 走 **shadcn add** 把源码拉进来，不装 `@better-auth-ui/react` 作为 runtime dep（own the source，未来改版方便）
- `src/components/email/` 放 BA UI 拉下来的模板 + `email-styles.tsx`；**废弃** `src/emails/components/email-layout.tsx`（BA UI 的 `EmailStyles` 不是 layout 而是 `<style>` 注入，样式模型不同）
- 保留 `src/emails/invite-member.tsx` / `src/emails/transfer-ownership.tsx` 两个模板文件位置，但重写内部用 BA UI 的 `EmailStyles` + 同一套 Tailwind className
- Paraglide i18n 接入方式：为每个模板声明一个 `<template>_localization` 构造函数（返回 BA UI 的 `EmailLocalization` 形状），用当前 `m.xxx()` 填入；`sendEmail()` 渲染时传 `localization={...}` 给 BA UI 组件
- 视觉 token（颜色 / border / font）沿用 BA UI 默认 `defaultColors`，不做 Tan Servora 品牌替换（如果后续要品牌化，再覆盖 `colors` prop）

## Requirements

### R1 — shadcn add 7 个 BA UI 模板

- `pnpm dlx shadcn@latest add https://better-auth-ui.com/r/{email-verification,reset-password,email-changed,password-changed,magic-link,new-device,otp}-email.json`
- 产物进 `src/components/email/`（+ `email-styles.tsx` 单次拉入）
- 验收：7 个 .tsx 文件 + 1 个 email-styles 文件都在，`pnpm build` 通过

### R2 — Paraglide localization 接入

- 每个 BA UI 模板对应一个 Paraglide message key 族（前缀 `email_<type>_`，如 `email_verify_title` / `email_verify_click_to_verify` / ...）
- 在 `src/lib/email.tsx` 或新建 `src/lib/email-localization.ts` 里，为每个 BA UI 组件做一个 localization 工厂：
  ```ts
  export function verifyLocalization(): EmailVerificationEmailLocalization {
    return {
      VERIFY_YOUR_EMAIL_ADDRESS: m.email_verify_title(),
      CLICK_BUTTON_TO_VERIFY_EMAIL: m.email_verify_click_to_verify(),
      // ...全套 keys 1:1 映射
    };
  }
  ```
- 中文 + 英文两份 `messages/{en,zh}.json` 补齐
- 渲染时：`<EmailVerificationEmail url={...} appName={...} localization={verifyLocalization()} />`

### R3 — `sendEmail` 派发扩展

- `EmailPayload` 的 discriminated union 扩到 7 + 2 = 9 种 type
  - `verify` / `reset` / `email-changed` / `password-changed` / `magic-link` / `new-device` / `otp` / `invite` / `transfer`
- 每种 type 提供 subject key（`m.email_subject_<type>()`）+ 渲染逻辑
- `appConfig` 暴露 `appName` 和 `brandLogoURL`（可选）给所有模板用统一默认值

### R4 — BA 身份层 hook 挂接

接 BA 现有邮件通知点（见 `src/lib/auth.ts`）：

| BA hook | 触发 | 我们的 EmailPayload type |
|---|---|---|
| `emailVerification.sendVerificationEmail` | 注册 | `verify`（已有，改接 BA UI 组件） |
| `emailAndPassword.sendResetPassword` | 忘密 | `reset`（已有，改接 BA UI 组件） |
| `changeEmail.sendChangeEmailVerification` | 改邮箱 | `email-changed` |
| `user.changePassword.sendPasswordChangedEmail`（若启用） | 改密 | `password-changed` |
| `magicLink.sendMagicLink`（若启用 magicLink 插件） | magic link 登录 | `magic-link` |
| `account.onNewDevice`（若启用设备追踪） | 新设备登录 | `new-device` |
| `emailOTP.sendOTP`（若启用 OTP 插件） | OTP 码 | `otp` |

**注意**：`password-changed` / `magic-link` / `new-device` / `otp` 对应的 BA 插件**可能未启用**。本 task 把模板 + 渲染 + `sendEmail` 派发准备好，挂接到现有插件的邮件 hook；**未启用的插件不在本 task 开启**（避免 scope 扩散到"加 magic-link 登录入口"这种功能）。

### R5 — `invite-member` / `transfer-ownership` 视觉对齐

- 两个模板文件重写，复用 `src/components/email/email-styles.tsx` 的 `EmailStyles` + 同一套 Tailwind className
- 保留现有 Paraglide keys
- 废弃 `src/emails/components/email-layout.tsx`

### R6 — `appConfig.brand` 统一品牌配置

- `src/env.ts` 新增三条**可选** env：
  - `BRAND_NAME?: string` —— 品牌文字名（不设则回退 `"Tan Servora"`）
  - `BRAND_LOGO_URL?: string` —— 通用 logo URL（emails + 网页共用）
  - `BRAND_LOGO_DARK_URL?: string` —— 暗色模式 logo URL（可选，不设则 light/dark 用同一张）
- 同时三条都加 `VITE_` 前缀前端可读版本（`VITE_BRAND_NAME` / `VITE_BRAND_LOGO_URL` / `VITE_BRAND_LOGO_DARK_URL`），和产品模式 flag 一样"一式两份"
- `src/config/app.ts` 扩：

  ```ts
  export const appConfig = {
    // ...既有
    brand: {
      name: env.BRAND_NAME ?? "Tan Servora",
      logoURL: env.BRAND_LOGO_URL,
      logoDarkURL: env.BRAND_LOGO_DARK_URL,
    },
  };
  ```
- 客户端侧 `src/config/app.client.ts`（如需新建）读 `VITE_*` 同样暴露 `brand`
- 邮件渲染所有 BA UI 模板传 `appName={appConfig.brand.name}` + `logoURL={...}`（有 dark → object，没 dark → string，都没 → 不传）

### R7 — `<BrandMark>` 组件替换所有网页品牌露出点

- 新建 `src/components/brand-mark.tsx`：
  - 读客户端 `appConfig.brand`
  - 有 `logoURL` → 渲染 `<img>`（或 `<picture>` 支持 light/dark，如配了 `logoDarkURL`）
  - 没 `logoURL` → 渲染品牌文字 `<span>`
  - Props：`size?: "sm" | "md" | "lg"` / `showName?: boolean`（logo + name 两列 vs 只 logo）
- 替换 4 个硬编码露出点：
  - `src/components/layout/AppSidebar.tsx:309`（workspace sidebar 品牌头）
  - `src/components/layout/AppSiteSidebar.tsx:48`（site-admin sidebar 品牌头）
  - `src/routes/(marketing)/index.tsx:15`（marketing 首页）
  - `src/routes/__root.tsx:43`（`<title>` 读 `appConfig.brand.name`）

## Acceptance Criteria

- [ ] `src/components/email/` 包含 7 个 BA UI 模板 + `email-styles.tsx`
- [ ] `src/emails/components/email-layout.tsx` 已删除
- [ ] `src/emails/invite-member.tsx` 和 `transfer-ownership.tsx` 用 BA UI 的 `EmailStyles` 重写，视觉与 BA UI 7 个一致
- [ ] `src/lib/email.tsx` `EmailPayload` 扩到 9 种 type，每种都有 subject + 渲染分支
- [ ] `messages/en.json` + `messages/zh.json` 补齐所有新 i18n key（按 BA UI localization 字段 1:1 映射）
- [ ] `src/lib/auth.ts` 里 `sendVerificationEmail` / `sendResetPassword` / `sendChangeEmailVerification` 等 hook 调用新的 type（verify/reset/email-changed）
- [ ] `src/env.ts` 新增 6 条可选 brand env（3 × server + 3 × VITE 前端），`src/config/app.ts` 暴露 `appConfig.brand`
- [ ] `src/components/brand-mark.tsx` 存在；4 个硬编码露出点（AppSidebar / AppSiteSidebar / marketing index / __root title）全部改用 `appConfig.brand` 或 `<BrandMark>`
- [ ] 不设 `BRAND_LOGO_URL` 时全站回退 "Tan Servora" 文字（无破坏性回退）；设了 logo URL 时邮件 + 网页都显示 logo
- [ ] `pnpm check` + `pnpm build` 双绿
- [ ] 本地 `mailpit`（`EMAIL_TRANSPORT=smtp`）收到的 verify / reset / email-changed 三封邮件视觉正常（深色模式亦可）

## Definition of Done

- AC 全过
- spec 同步：`.trellis/spec/backend/email-infrastructure.md` 更新 —— 记录 BA UI 的 shadcn add 安装方式、localization 注入模式、模板目录迁移（`src/emails/` → `src/components/email/` + `src/emails/` 留给 org 两封自写）
- 手动过：mailpit 看视觉（至少 verify + reset + email-changed 三封）

## Technical Approach

**安装**：`pnpm dlx shadcn@latest add <registry-url>` × 7 次（可以写成 one-liner `add url1 url2 ...`）

**目录重组**：

```
src/
├── components/email/              # 新目录：BA UI 模板 + email-styles（shadcn add 产物）
│   ├── email-verification.tsx
│   ├── reset-password.tsx
│   ├── email-changed.tsx
│   ├── password-changed.tsx
│   ├── magic-link.tsx
│   ├── new-device.tsx
│   ├── otp.tsx
│   └── email-styles.tsx
├── emails/                        # 保留：org 自写的两封（套 BA UI EmailStyles）
│   ├── invite-member.tsx
│   └── transfer-ownership.tsx
│   # components/email-layout.tsx 删除
└── lib/
    ├── email.tsx                  # 扩 EmailPayload 到 9 种
    └── email-localization.ts      # 新：7+2 个 localization 工厂
```

**localization 工厂模式**（关键）：BA UI 组件接收 `localization: Partial<...>` prop，不会覆盖默认英文 localization，所以我们把 Paraglide `m.xxx()` 在渲染时生成一个 full localization 对象喂进去。这样：
- BA UI 升级只会碰 registry 拉下来的文件，不碰我们的 localization 工厂
- Paraglide 多语言正常工作
- 英文 fallback：Paraglide 英文文案照抄 BA UI 默认英文即可

## Decision (ADR-lite)

**Context**: BA UI 提供 7 个与 BA 身份层契合的邮件模板。我们自写的 4 个模板有视觉和功能缺口。要不要切、怎么切是决策点。

**Decision**:
- 走 **shadcn add 源码拉进来** 而不是装 `@better-auth-ui/react` 包 —— 符合 shadcn 哲学（own the source），升级路径清晰（重新 shadcn add 就是 diff），未来发 registry 容易
- **localization 通过工厂 prop 注入**，不改 BA UI 拉下来的源码 —— 升级不冲突
- 视觉沿用 BA UI 默认（不品牌化）—— 短期聚焦功能完整，品牌后面再搞
- **`invite` / `transfer` 保留自写但视觉对齐** —— BA UI 没这俩，org 场景逻辑耦合自家业务

**Consequences**:
- 短期：7 个文件进库，项目体积微增
- 长期：BA UI 升级 registry 文件时，`shadcn add` 重跑一次就能同步；若内部字段名变，要同步改 localization 工厂
- i18n key 数量翻数倍（每个模板 8-12 个 key × 9 个模板 ≈ 80+ 条 en/zh）—— Paraglide 本来就是这个模型，无性能问题

## Out of Scope

- 启用 BA magicLink / new-device-tracking / emailOTP 插件本身（本 task 只准备模板，插件启用另排）
- `password-changed` 通知的触发时机（BA 默认不发通知；要发需要在 `changePassword` hook 里手动调 sendEmail——列为增强项，本 task 提供模板 + 渲染但不接 hook）
- **色彩品牌化**（BA UI `colors` prop 覆盖 / Tailwind token 改配色）—— 本 task 仅做 logo + appName 层，色彩保持 BA UI 默认
- 邮件营销 / 通讯类（非 transactional）
- 邮件送达追踪 / bounce 处理 / retries
- **favicon** / OG image / Apple touch icon 等静态资源切换（涉及 build 流程，不在本 task）

## Technical Notes

**相关文件**

- 现状：`src/emails/{verify-email,reset-password,invite-member,transfer-ownership}.tsx`、`src/emails/components/email-layout.tsx`、`src/lib/email.tsx`、`src/lib/email-transport.ts`、`src/lib/auth.ts`
- BA UI registry：`https://better-auth-ui.com/r/<name>-email.json`（7 个）
- BA UI 源码参考：`https://github.com/better-auth-ui/better-auth-ui/tree/main/packages/react/src/components/email`
- spec：`.trellis/spec/backend/email-infrastructure.md`

**BA UI 模板 localization keys 参考**（email-verification 样例）

```
VERIFY_YOUR_EMAIL_ADDRESS, LOGO, CLICK_BUTTON_TO_VERIFY_EMAIL,
VERIFY_EMAIL_ADDRESS, OR_COPY_AND_PASTE_URL, THIS_LINK_EXPIRES_IN_MINUTES,
EMAIL_SENT_BY, IF_YOU_DIDNT_REQUEST_THIS_EMAIL, POWERED_BY_BETTER_AUTH
```

**components.json 检查**：项目有没有 `components.json`，shadcn CLI 会读它决定 alias 和 output 路径。如果 alias 跟 BA UI registry 里的 relative import 不匹配，shadcn add 会报错。

**shadcn 安装验证步骤**

```bash
# one-liner 安装 7 个
pnpm dlx shadcn@latest add \
  https://better-auth-ui.com/r/email-verification-email.json \
  https://better-auth-ui.com/r/reset-password-email.json \
  https://better-auth-ui.com/r/email-changed-email.json \
  https://better-auth-ui.com/r/password-changed-email.json \
  https://better-auth-ui.com/r/magic-link-email.json \
  https://better-auth-ui.com/r/new-device-email.json \
  https://better-auth-ui.com/r/otp-email.json
```

## Technical Notes (品牌露出点审计)

dev 已跑一次 grep，硬编码 "Tan Servora" 四处：

| 文件 | 行 | 用法 |
|---|---|---|
| `src/components/layout/AppSidebar.tsx` | 309 | Workspace sidebar 品牌头文字 |
| `src/components/layout/AppSiteSidebar.tsx` | 48 | Site-admin sidebar 品牌头文字 |
| `src/routes/(marketing)/index.tsx` | 15 | Marketing 首页品牌文字 |
| `src/routes/__root.tsx` | 43 | `<title>` meta（页面标题） |

另外 Paraglide `m.email_brand_name()` 也硬编码 "Tan Servora"，要么废弃（邮件全走 `appConfig.brand.name`）要么改成读 env—— R6 方案是**废弃** `m.email_brand_name()` / `m.email_brand_tagline()`，邮件 brand 全走 `appConfig.brand`。

## Decided — Paraglide key 命名方案（A）

**决定**：统一项目惯例，小写下划线 `email_<type>_<field>`。

- `verify` 族：`email_verify_title` / `email_verify_click_to_verify_body` / `email_verify_button` / `email_verify_or_copy_url` / `email_verify_expires_in` / `email_verify_sent_by` / `email_verify_ignore_if_not_requested` / `email_verify_powered_by`
- 其他 6 个 BA UI 模板 + 2 个 org 模板同构：`email_<type>_<field>`
- 旧 `email_subject_*` 保留，扩成 `email_<type>_subject`（或直接保留现有命名）—— 实施时由 implement agent 决定最少变动

**维护代价**：localization 工厂对照表即是 "BA UI 大写字段 → 我们小写 key" 的唯一映射处，单文件维护，字段改名时一次改全。

## Decided — `invite` / `transfer` key 一并 rename（A）

**决定**：两个 org 模板的现有 Paraglide key 全部 rename 到 `email_invite_*` / `email_transfer_*`，与 BA UI 7 模板统一成 `email_<type>_<field>` 风格。

- 实施 hint：`grep -rn "email_invite\|email_subject_invite\|email_transfer\|email_subject_transfer\|org_invite\|email_brand_name\|email_brand_tagline\|email_footer_note" src/ messages/` 找所有引用点，一并迁移
- `email_brand_name` / `email_brand_tagline` / `email_footer_note` 随品牌 R6 废弃（邮件 brand 读 `appConfig.brand.name`，footer 要保留就并入 `email_<type>_ignore_if_not_requested` / `email_<type>_sent_by` 的 BA UI localization 字段族）

## Decided — 暗色 logo 回退策略（A）

**决定**：只配了 `BRAND_LOGO_URL`、没配 `BRAND_LOGO_DARK_URL` 时，light/dark 共用同一张 logo（传 `string` 给 BA UI 的 `logoURL` prop）。

```ts
const logoURL = appConfig.brand.logoURL
  ? appConfig.brand.logoDarkURL
    ? { light: appConfig.brand.logoURL, dark: appConfig.brand.logoDarkURL }
    : appConfig.brand.logoURL
  : undefined;
```

BA UI 默认 `darkMode={true}`，保留。配了 dark 版本视觉更好，没配也不阻塞——零配置可用。

## Open Questions

（无，全部已决）
