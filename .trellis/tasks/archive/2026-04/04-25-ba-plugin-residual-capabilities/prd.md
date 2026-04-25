# BA 插件剩余能力收口（addMember + 新员工邀请闭环）

## Goal

收掉 `docs/research/INDEX.md` 里 admin/organization 插件未利用能力清单中真正有触发条件的两件事：
1. **超管 `addMember`**：site 超管在用户管理面板可以把任意已注册用户**直接加入任意 org**（绕过邀请流程），用于私有化部署/客户支持场景。
2. **新员工邀请闭环**：org 成员邀请尚未注册站点的新员工时，对方点邀请邮件后能顺畅地"注册→自动 accept"一次走完，不用回邮件再点一次。

顺带把 `requireEmailVerificationOnInvitation: true` 打开作为防御（成本一行，作用边角但不亏）。

## Requirements

### R1：超管 addMember
- 在 `src/routes/site/_layout/users/index.tsx` 现有用户行操作菜单里加 **"Add to organization"** 入口（DropdownMenuItem）。
- 弹出 drawer / dialog：
  - 输入字段 1：org 选择器（按 name/slug 搜，调 `auth.api.listOrganizations`，超管可见全部 org）。
  - 输入字段 2：role 选择（默认 `member`，下拉 owner/admin/member）。
  - 提交 → 调 `auth.api.addMember({ userId, organizationId, role })`（server side via oRPC handler 透传 headers）。
- 失败提示：用户已在该 org / org 不存在 / 网络错误。
- **不**做反向能力（org owner 直加），保持 SaaS 规范。

### R2：超管的反向入口（org 视角加成员，含 UserPickerCombobox）
- 在 `src/routes/site/_layout/organizations/index.tsx` 的 org 行加 `DropdownMenu` → **"Add member"** item
- 点击弹 dialog：
  - **UserPickerCombobox**（新建可复用组件，放在 `src/components/`）：shadcn 原生 `Command + Popover` 模式（参考 https://ui.shadcn.com/docs/components/combobox），不引入第三方 admin kit
    - 输入框 debounce 300ms 后调 `authClient.admin.listUsers({ query: { searchValue: kw, limit: 10 }})`
    - 下拉显示：avatar + email + name + role badge
    - 选中后回调 `onSelect(userId)`
  - **Role 选择器**：owner / admin / member 三选一，默认 member
- 提交：**复用** `orpc.organizationsAdmin.addMember`，**不**新建 endpoint
- 隐私权衡：操作者是超管（已有 `admin.listUsers` 权限，看到全站用户合法），不破坏 `emailEnumerationProtection`（该 flag 防的是普通用户/匿名探测）

> ⚠️ **Scope 调整记录**：本 R2 原先在 brainstorm 阶段被移出 MVP（理由：R1 入口已知 userId）。主人 review PR1 时发现 site/Organizations 页缺少反向入口（"为某 org 加人"），且超管视角无邮箱枚举风险，故重新拉回 In Scope，作为 PR1 的延伸（不另起 PR）。

### R3：新员工邀请注册闭环
- `src/routes/accept-invitation.tsx` 的 "need sign-in" 分支：
  - sign-up 跳转链接改为 `/auth/sign-up?invitationToken=<token>&prefillEmail=<inv.email>`
  - sign-in 跳转同样带 `invitationToken`（已登录用户切账户也保留）
- `src/routes/auth/$path.tsx`（或对应 sign-up 路由）：
  - 读取 query 中的 `invitationToken` / `prefillEmail`
  - prefillEmail → 表单 email 字段 readonly 默认值（防止用户改成别的邮箱导致 accept 失败）
  - 注册 + 邮箱验证完成后，重定向回 `/accept-invitation?token=<invitationToken>` 自动继续 accept
  - 已登录跳 sign-in 走完后同样回到 accept-invitation
- 邮箱验证流程兼容：sendVerificationEmail 的 callbackURL 要带回 invitationToken（不能丢）。

### R4：开 `requireEmailVerificationOnInvitation`
- `src/lib/auth.ts` 的 `organization()` plugin 配置加 `requireEmailVerificationOnInvitation: true`。
- 配套 i18n：accept-invitation 增加"邮箱未验证不能 accept"分支文案（虽然现有 signup 强制验证，开这个是防御边角场景）。

## Acceptance Criteria

- [ ] R1：超管在 site/users 选任意一个用户 → "Add to organization" → 选 org + role → 提交成功 → 该用户出现在目标 org 的 members 列表
- [ ] R1：被加用户登录后能在 OrganizationSwitcher 看到新 org 并切入
- [ ] R1：重复添加（user 已是 org member）显示明确错误信息
- [ ] R2：超管在 site/organizations 选一行 → "Add member" → 输入邮箱片段 → 下拉显示候选用户 → 选定 + role → 提交成功
- [ ] R2：UserPickerCombobox 输入空时显示 placeholder 提示；无结果显示 "未找到用户"
- [ ] R2：debounce 生效（连续输入不会爆 listUsers 请求）
- [ ] R3：用未注册邮箱发邀请 → 收到邮件点链接 → 看到 sign-up CTA → 跳 sign-up（email prefill）→ 注册 + 验证邮箱 → 自动回 accept-invitation 完成入伙
- [ ] R3：注册时用户改了 email（不一致）→ 注册成功但 accept 时拒绝（emailMismatch 分支已有）
- [ ] R3：已登录别的账户点邀请链接 → "email mismatch" 分支引导切账户（已有，确认仍工作）
- [ ] R4：`requireEmailVerificationOnInvitation: true` 配置生效，未验证邮箱用户尝试 accept 被拒
- [ ] biome check + tsc EXIT:0
- [ ] i18n 中英双语完整

## Definition of Done

- 三个 PR 独立可 commit / revert
- **docs 更新方式**：本 task 落地的能力**从 `plugin-organization-deep.md` / `plugin-admin-deep.md` 的"未利用能力清单"段直接删除**（不保留"实施反馈"沉积层）。deep doc 是知识库，活着的"未做清单"由 `INDEX.md` 的"已装能力盘点"单一维护，对应条目同步减
- 具体减条：
  - INDEX.md：`organization plugin` 的 `addMember` 条目删除
  - INDEX.md：`organization plugin` 的 `requireEmailVerificationOnInvitation` 条目删除
  - plugin-organization-deep.md：相同两条从"未利用能力"段删除

## Out of Scope

- ❌ Owner / org admin 的 direct addMember（主人否决，违 SaaS 规范）
- ❌ Dynamic Access Control（无客户需求）
- ❌ active team / setActiveTeam / listUserTeams（业务表无 teamId 概念）
- ❌ `getActiveMemberRole`（`getActiveMember` 已覆盖）
- ❌ shadcn-admin-kit / ra-core（架构级变更，本次不评估）
- ❌ ~~邮箱搜用户 Combobox（R2 移出，无触发场景；将来若需要 owner 加人或多场景搜用户再做）~~ — **已拉回 R2 In Scope，限超管视角**
- ❌ org 邀请框的"邮箱预选搜索"（主人确认走 A 方案：保持当前流程，输入邮箱即邀，不区分注册/未注册，符合 Slack/Notion/Linear 隐私范式；避免与 `emailEnumerationProtection` 冲突）
- ❌ `getUser(userId)` 用户详情页（独立 task 候选）
- ❌ `checkSlug` 实时校验（独立 task 候选）

## Technical Approach

### R1 实现
- 后端：在 oRPC `users` router 加 `addToOrganization({ userId, organizationId, role })` handler，内部调 `auth.api.addMember({ headers, body: { userId, organizationId, role }})`，site admin guard 保护。
- 前端：`AddToOrganizationDrawer` 组件，挂在用户行 DropdownMenu。org 列表用 `useQuery` 调 oRPC 拉超管视角全 org（已有 `organizations-admin.ts` 路由，复用）。

### R3 实现
- accept-invitation.tsx 把 token 通过 query 透传到 sign-up 页（已登录走 sign-in 同理）。
- sign-up 页读 `invitationToken` query，注册 + verifyEmail 成功后 `navigate({ to: '/accept-invitation', search: { token: invitationToken }})`。
- email verification email 的 callbackURL 要透传 invitationToken（`src/lib/auth.ts` 的 `sendVerificationEmail` 看是否能透传查询参数；如不行用 redirect URL 拼）。

### R4 实现
- 一行配置 + i18n 文案。

## Decision (ADR-lite)

**Context**: brainstorm 提出 7 项剩余 BA 能力，逐一甄别后只有 2 项有真实触发条件（addMember + 邀请闭环）。

**Decision**:
- 取 addMember 仅给超管用（限制为 site/users 入口），不放给 owner——保持 SaaS 平台中立性。
- 取邀请闭环作为完整流程闭环修复（PR1 已经做了 `accept-invitation.tsx` 公开页，但跳 sign-up 没保留 token 是断点）。
- `requireEmailVerificationOnInvitation` 顺手开启，作为深度防御。
- 不引入 shadcn-admin-kit（依赖 ra-core，架构级变更）；用 shadcn 原生 Command/Popover/Combobox 模式。

**Consequences**:
- 之后客户提"我要直接拉人"：可以单独开 owner addMember（独立 task）。
- 之后业务表加 teamId：再做 active team。
- 之后客户提自定义角色：再开 DAC。
- 当前每个能力都"等触发条件"，避免提前装载死代码。

## Implementation Plan (small PRs)

- **PR1**: R1 超管 addMember
  - 后端 oRPC handler + 前端 drawer + 用户行入口
  - i18n 中英对应 keys

- **PR2**: R3 邀请→注册闭环
  - accept-invitation.tsx 透传 token
  - sign-up 页 prefillEmail + 注册后回 accept
  - sendVerificationEmail callbackURL 携带 invitationToken
  - 测试新员工首次入伙 happy path

- **PR3**: R4 + 收尾
  - `requireEmailVerificationOnInvitation: true`
  - `plugin-organization-deep.md`：`addMember` / `requireEmailVerificationOnInvitation` 两条从"未利用能力清单"段删除
  - `INDEX.md`：相同两条从"已装能力盘点"段删除

## Technical Notes

### 关键文件
- `src/lib/auth.ts` — organization plugin 配置 / sendVerificationEmail
- `src/routes/site/_layout/users/index.tsx` — 用户行操作菜单
- `src/routes/accept-invitation.tsx` — 邀请 accept 公开页
- `src/routes/auth/$path.tsx`（或对应 sign-up 文件）— 注册流程
- `src/orpc/router/users.ts`（或类似）— 后端 handler
- `messages/en.json` / `messages/zh.json` — i18n

### BA API 参考
- `auth.api.addMember({ headers, body: { userId, organizationId, role }})` — server-only 直加成员（绕过邀请）
- `organization.requireEmailVerificationOnInvitation` — 配置项，true → 未验证邮箱 accept 被拒
- `admin.listUsers({ query: { searchValue, searchField, limit }})` — R2 暂不用，记录备查

### 已研究文档
- [`docs/research/plugin-organization-deep.md`](../../../docs/research/plugin-organization-deep.md) — addMember / requireEmailVerificationOnInvitation 完整 spec
- [`docs/research/plugin-admin-deep.md`](../../../docs/research/plugin-admin-deep.md) — listUsers searchValue 用法
- [shadcn Combobox docs](https://ui.shadcn.com/docs/components/combobox) — R2 候选模式（本 task 未启用）

### 反对引入的方案
- **shadcn-admin-kit**（marmelab）：依赖 ra-core，是完整 admin 框架而非组件库，引入需把 admin 部分迁到 react-admin 范式 → 架构级变更，不做。

## Research References

无独立 research/ 文件——所需事实已在 `docs/research/plugin-organization-deep.md` / `plugin-admin-deep.md` 覆盖；shadcn-admin-kit 调研结果直接记录在本 PRD 的"反对引入的方案"段。
