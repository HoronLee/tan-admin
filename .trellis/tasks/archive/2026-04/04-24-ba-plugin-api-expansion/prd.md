# 扩用 BA 已装插件未用 API

## Goal

admin / organization 两个 BA 插件都已接入，但只用了其中一部分 API。目标：把**官方现成、我们可能正在手写或将来会手写**的能力替换 / 补齐，减少自研代码面、同时修几个已发现的功能缺失。

## What I already know

### 当前已用的 BA API（src/ 全量 grep 结果）
- admin: `createUser` / `listUsers` / `setRole` / `banUser` / `unbanUser` / `impersonateUser` / `removeUser`
- organization: `createOrganization` / `getActiveMember` / `hasPermission` / `getFullOrganization` / `update` / `delete` / `setActive` / `listMembers` / `addMember*N` / `removeMember` / `updateMemberRole` / `inviteMember` / `acceptInvitation` / `cancelInvitation` / `rejectInvitation` / `listInvitations` / `listUserInvitations` / Teams 全套

### 已发现的"空缺 + 可能在手写"候选

**A. 可能已经在手写（用 BA API 可消灭）**
- `organization.checkSlug` — create-org 表单可做实时 slug 可用性校验（目前 UI 不明确，可能仅后端失败回来才提示）
- `organization.getInvitation(token)` — ⚠️ **已发现死链**：`auth.ts:257` 邀请邮件 URL 写 `${BETTER_AUTH_URL}/accept-invitation?token=...`，但 `src/routes` 下**根本没有这个页面**，邮件链接点进来 404。补这个页面必须配合 `getInvitation` 按 token 查
- `organization.leaveOrganization` — 用户自愿退出 org（saas 模式刚需，目前未见实现）
- `organization.listOrganizations` — 用户自己的 org 列表（workspace 切换器可能在用 getFullOrganization + session 拼凑）
- `organization.getActiveMemberRole` — 当前用户在 activeOrg 的 role（前端 ACL / 菜单判断可能手查）

**B. 超管面板缺功能（BA 现成）**
- `admin.setUserPassword` — 超管重置用户密码
- `admin.adminUpdateUser` — 超管统一改用户资料（避开 BA user.update hook 副作用的官方路径）
- `admin.listUserSessions` / `admin.revokeUserSession` / `admin.revokeUserSessions` — 看用户活跃 session、强制下线
- `admin.stopImpersonating` — 退出 impersonate 会话（impersonate 入口已有，需确认退出链路）

**C. 配置项（改 auth.ts 一两行就能拿到）**
- admin `Email Enumeration Protection` — sign-in 错误信息不泄漏"用户是否存在"（安全加固）
- admin `impersonationSessionDuration` — 目前默认，无审计约束
- admin `bannedUserMessage` — 被 ban 用户前端错误文案
- admin `defaultBanReason` / `defaultBanExpiresIn` — ban API 默认值

**D. 大块未用特性**
- organization `Dynamic Access Control` — 运行时建角色（运营/客户自建角色，而不是写死 owner/admin/member）。saas 模式下客户想自定义权限时可省大量代码
- admin `Access Control Custom Permissions` — 我们已有 `permissions.ts` 自定义 ac，但可能还没把所有需要门控的资源接进去

## Assumptions (temporary)

- 候选 (A)(B) 大概率都能命中——具体每项要在 Phase 2 prepare 阶段一一核对代码确认"是否确实手写"或"是否确实缺"
- Dynamic Access Control 属于未来方向，不是 MVP
- 死链 `/accept-invitation` 页面是高优先级 bug（影响邀请流程完整性）

## Open Questions

- ~~Q1~~ ✅ 2026-04-24 主人选 **选项 3**：A + B + C 全范围（修 bug + 超管补齐 + 前端手写替换巡检）。D 组 Dynamic Access Control 不在本 task
- ~~Q2~~ ✅ 2026-04-24 主人选 **按业务域扫**：仅扫 `(workspace)/_layout/organization/*` / `site/*` / workspace switcher 三个域，不碰故意绕 BA 的 `organizations-admin.ts` / `seed.ts` / `auth.ts` hook 内部

## Requirements

### R1 — 修死链 + 补 accept-invitation 公开页（PR1）
- 新建 `src/routes/accept-invitation.tsx`（裸页路由，未登录可达）
- 用 `authClient.organization.getInvitation({ invitationId: token })` 按 token 查邀请详情
- 未登录 → 跳 sign-up，保留 token 以便注册 / 验证邮箱后自动回到 accept-invitation
- 已登录且邮箱匹配 → 展示"加入 `<org.name>`"确认页 → `acceptInvitation`
- 已登录但邮箱不匹配 → 提示"邀请发给 `<email>`，请用对应账号登录"+ 切号入口
- 邀请邮件 URL `${BETTER_AUTH_URL}/accept-invitation?token=...`（auth.ts:257）保持不变

### R2 — saas 用户刚需（PR1）
- workspace 里加"退出组织"入口，接 `authClient.organization.leaveOrganization`
- personal org（`type=personal`）不显示退出入口（自己是唯一 owner，退了就废）

### R3 — 超管面板补齐（PR2）
- `authClient.admin.setUserPassword` — 用户列表行操作"重置密码"
- `authClient.admin.adminUpdateUser` — 用户编辑弹窗走这个而不是业务 oRPC
- `authClient.admin.listUserSessions` — 用户详情页展示活跃 session 列表
- `authClient.admin.revokeUserSession` / `revokeUserSessions` — session 行/全部踢下线
- `authClient.admin.stopImpersonating` — 顶栏 impersonate 退出按钮（impersonate 入口已有，退出链路补齐）

### R4 — auth.ts 配置项（PR2，2 行改完）
- `admin.options.emailEnumerationProtection: true` —— sign-in 错误不泄漏用户存在性
- `admin.options.impersonationSessionDuration: 3600` —— impersonate 1 小时过期（审计友好）
- `admin.options.defaultBanReason: "账号被管理员禁用"`
- `admin.options.bannedUserMessage: "您的账号已被禁用，请联系管理员。"`

### R5 — 业务域巡检替换手写（PR3）
扫三个域：
- `src/routes/(workspace)/_layout/organization/*` — 主要检查 slug 校验、org 列表
- `src/routes/site/*` — 超管后台的用户 / org 操作（super-admin 跨 org 的保持不变）
- workspace switcher（先 find 定位）

每处 raw SQL / 手拼查询对照候选表：
- `organization.checkSlug` → create-org 表单实时校验
- `organization.listOrganizations` → switcher
- `organization.getActiveMemberRole` → 前端 role 判断

有对应 API 且不属于"故意绕 BA"清单 → 换；没有 → 留并记录原因

## Acceptance Criteria

- [ ] `/accept-invitation?token=X` 页面存在：未登录跳 sign-up 带 token；已登录邮箱匹配可接受；邮箱不匹配有明确提示
- [ ] workspace 有"退出组织"入口，personal org 自动隐藏
- [ ] 超管用户详情页能看 session 列表、踢下线、改密、改资料
- [ ] Impersonate 顶栏有退出按钮
- [ ] `auth.ts` 4 个配置项已设置
- [ ] 巡检报告：三个域的 raw SQL 每一处都有"保留 / 替换"标注
- [ ] `pnpm check` + `pnpm tsc --noEmit` 通过
- [ ] `docs/research/plugin-{admin,organization}-deep.md` 追加"实施反馈"段

## Definition of Done

- 每项功能对应的手工验证记录在 task 的 journal 里
- research/ 下对 admin + organization 深研文档追加"实施反馈"段（按 docs/research/INDEX.md 约定）
- **完成后严格对照 `docs/reference/better-auth-plugin-admin.md` + `docs/reference/better-auth-plugin-organization.md`**，在 task 产出一份"仍未使用的插件能力清单"（API + 配置项 + schema 选项 + hooks），每项标注 "保留原因"（业务不需要 / 需独立 task / 架构级改动）。清单落地到 `docs/research/plugin-{admin,organization}-deep.md` 的"实施反馈"段或单独 gap 文件，跨 task 可复用

## Out of Scope (explicit)

- 四个未集成插件（captcha / email-otp / generic-oauth / api-key）—— 留独立 task
- 重做权限矩阵 / `permissions.ts` 大改
- 前端 UI 视觉改版

## Technical Notes

- 相关文件：
  - `src/lib/auth.ts` — server 配置
  - `src/lib/auth-client.ts` — client 插件
  - `src/routes/(workspace)/_layout/organization/index.tsx` — org 管理页
  - `src/routes/(workspace)/_layout/invitations/index.tsx` — 邀请收件箱
  - `src/routes/site/` — 超管后台
  - `src/orpc/router/organizations-admin.ts` — **故意**绕过 BA user-scoped 的超管跨 org 路径，不要替换
- 约束：
  - Better Auth 表（organization/member/invitation/user/session）由 BA CLI 管理，ZenStack `@@ignore`，改写路径必须走 BA API 或 raw SQL pool
  - `src/routes/(workspace)/_layout/*` 的 _layout 嵌套约定（见 `.trellis/spec/frontend/layout-guidelines.md`）
- 参考：
  - `docs/research/plugin-admin-deep.md` ✅
  - `docs/research/plugin-organization-deep.md` ✅
  - `docs/reference/better-auth-plugin-admin.md`（官方镜像）
  - `docs/reference/better-auth-plugin-organization.md`（官方镜像）
