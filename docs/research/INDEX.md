# Research — Better Auth 生态深研库

> 本项目 Better Auth 插件生态、UI 生态的技术调研集合。跨 task 复用。

## 用法

- 准备接入新插件 / UI 时先来这里找对应文档
- 所有 "实施反馈" 段是本项目**真实落地后**的实测纠正——比纯文档可靠
- 新增调研请补充独立文件 + 更新本 INDEX；落地后回头加"实施反馈"段

## 文档清单

### 生态概览
- [Better Auth 开源生态全景](./better-auth-ecosystem.md) — 理解大背景先读

### UI 层
- [better-auth-ui shadcn 变体](./better-auth-ui-shadcn-variant.md) ✅ **已验证** — Provider / 动态路由 / 3 个 registry 的覆盖范围 / 与 TanStack Router 的集成坑（_layout 嵌套）

### Better Auth 插件（按字母序）
- [admin 深研](./plugin-admin-deep.md) ✅ **已验证** — listUsers / ban / impersonate / setRole 全 API；与 organization 的"双 RBAC"冲突分析
- [api-key](./plugin-api-key.md) 📋 未集成 — 程序化访问包 `@better-auth/api-key`
- [captcha](./plugin-captcha.md) 📋 未集成 — Turnstile / reCAPTCHA / hCaptcha / CaptchaFox
- [email-otp](./plugin-email-otp.md) 📋 未集成 — sign-in / verify-email / forget-password / change-email 四种 OTP
- [generic-oauth](./plugin-generic-oauth.md) 📋 未集成 — 通用 OAuth/OIDC 适配（Auth0/Keycloak/Okta/Entra/...）
- [organization 深研](./plugin-organization-deep.md) ✅ **已验证** — teams 开启；完整 schema / hasPermission / organizationHooks

图例：✅ 已落地（identity-layer-v2 实测） / 📋 调研完但未实装

## 插件对 schema 的影响

| 插件 | 新增表 | 给现有表加字段 |
|---|---|---|
| admin | — | `user`+ `role`/`banned`/`banReason`/`banExpires`；`session`+ `impersonatedBy` |
| organization | `organization` / `member` / `invitation` | `session`+ `activeOrganizationId` |
| organization (teams) | + `team` / `teamMember` | + `session.activeTeamId` |
| organization (dynamicAccessControl) | + `organizationRole` | — |
| **multiSession** ✅ | — | `session`+ `deviceSessionId` |
| api-key | `apiKey` | — |
| email-otp | — | 复用 `verification` |
| generic-oauth | — | 复用 `account`（accountId + providerId） |
| captcha | — | — |
| better-auth-ui shadcn 变体 | — | — |

**当前项目（identity-layer-v2）实装组合**：`admin + organization(teams) + multiSession + tanstackStartCookies`

## 与项目 spec 的交叉引用

- `.trellis/spec/backend/authorization-boundary.md` — 身份层（BA）× 业务层（ZenStack policy）分层契约 + session hook / multiSession 协同
- `.trellis/spec/frontend/layout-guidelines.md` — ba-ui 集成 + TanStack Router `_layout/` 嵌套约定

## 后续 task 候选

以下插件都有深研文档但**未实装**，按业务优先级开独立 task：

1. **captcha**（优先级高）— 任何公网端点 sign-up / forgot-password 防扫
2. **email-otp**（上线前）— 2FA / 免密登录，需先搞 SMTP provider
3. **generic-oauth**（企业接入时）— SSO 场景
4. **api-key**（有程序化集成需求时）— 开放平台 / SDK 认证

每个 task 做完后，来本目录对应文档追加"实施反馈"段，保持调研库与现实同步。
