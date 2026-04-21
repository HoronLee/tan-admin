# Research Index — identity-layer-v2

本目录持久化所有为本任务做的技术调研。implement 阶段直接按需引。

## 既有
- [Better Auth 开源生态全景](./better-auth-ecosystem.md) — 旧 npm 包变体的 better-auth-ui + admin/org 基础 + v1 复用对照（先看这个理解大背景）

## 2026-04-21 新增（按主人列出的 8 个 URL 深度抓取）

### UI 层
- [better-auth-ui shadcn 变体 + TanStack Start 集成](./better-auth-ui-shadcn-variant.md) — PRD D3 决策的最终方案，含 Provider / 动态路由 / SSR 注意点 / 与 npm 包变体的差异对照表

### Better Auth 插件（按字母序）
- [admin 深研](./plugin-admin-deep.md) — CRUD / ban / impersonate 全 API + 自定义 RBAC + 与 organization 的"双 RBAC"冲突分析
- [api-key](./plugin-api-key.md) — 程序化访问，独立包 `@better-auth/api-key`，含 user / org 归属、rate limit、quota
- [captcha](./plugin-captcha.md) — Turnstile / reCAPTCHA / hCaptcha / CaptchaFox；私有化部署陷阱
- [email-otp](./plugin-email-otp.md) — sign-in / verify-email / forget-password / change-email 四种 OTP；与 admin / captcha 协同
- [generic-oauth](./plugin-generic-oauth.md) — 通用 OAuth/OIDC 适配，预配置 helper（Auth0/Keycloak/Okta/Entra/...）+ 手工配置 + PKCE 安全建议
- [organization 深研](./plugin-organization-deep.md) — teams 启用下的完整 schema / hasPermission server-side 用法 / 全部 organizationHooks / 与 PRD getUserMenus 重写对接

## 总结：哪些插件影响 schema（auth:migrate 自动建表）

| 插件 | 新增表 | 现有表加字段 |
|---|---|---|
| admin | — | `user`+ `role`/`banned`/`banReason`/`banExpires`；`session`+ `impersonatedBy` |
| organization | `organization` / `member` / `invitation` | `session`+ `activeOrganizationId` |
| organization (teams) | + `team` / `teamMember` | + `session.activeTeamId` |
| organization (dynamicAccessControl) | + `organizationRole` | — |
| api-key | `apiKey` | — |
| email-otp | — | 复用现有 `verification` 表 |
| generic-oauth | — | 复用现有 `account` 表（accountId + providerId） |
| captcha | — | — |
| **better-auth-ui shadcn 变体** | — | — |

PRD 选定组合（admin + organization + teams）下 `auth:migrate` 会建：`organization` / `member` / `invitation` / `team` / `teamMember`，并给 `user` / `session` 加字段。

## 与 PRD 决策的潜在冲突 / 待确认

1. **双 RBAC 缺口（admin role vs organization role）**：PRD D1/D2 提"完全删 Role/Permission"用 organization role，但 admin 插件的全站 role 不能省（否则 `admin.listUsers` 没人能调）。建议补丁：保留 admin 插件 + 仅给超管账号 admin role 或用 `adminUserIds`。详见 [plugin-admin-deep.md#与-organization-插件的双-rbac-冲突](./plugin-admin-deep.md)。
2. **captcha 私有化部署陷阱**：4 个 provider 全是 SaaS。PRD"私有化部署禁用 Sentinel"的开源替代组合（captcha + HIBP + rate limit）依然带 SaaS 依赖，只有 rate limit 是真正本地。详见 [plugin-captcha.md#注意事项--坑](./plugin-captcha.md)。
3. **api-key 是否纳入本任务**：PRD 没列 must-have，要主人决策；纳入会新增 `apiKey` 表 + 一套 UI（key 管理页，且"key 只露一次"的 UX 比较特别）。
4. **OTP 视图 UI**：better-auth-ui shadcn 变体 v3.4.0 时 `viewPaths.auth` 没 `email-otp` 项；如要 OTP 登录页需自写或等上游升级。
5. **active org 自动选**：必须用 `databaseHooks.session.create.before` 自动给 `activeOrganizationId` 赋值，否则用户登入后所有依赖 active org 的 API 直接失败——PRD seed 里建好 default org + 默认成员关系是前提，但 hook 这一步要在 implement 显式补。
