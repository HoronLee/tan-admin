# Better Auth — organization 插件（深研版 / teams 启用）

## 来源
- https://better-auth.com/docs/plugins/organization
- 抓取：2026-04-21
- 与 task 已有的 `better-auth-ecosystem.md` 互补——本文聚焦 PRD 决策"开 teams + access control"下的服务端细节、hooks、schema 全字段。

## 核心概念

3 个层级：**Organization → Member（per-org role）→ Team（org 内分组，可选）**。
- Org 级 role 默认 3 个：`owner` / `admin` / `member`，可用 access control DSL 自定义
- Team 是组织内的分组，team 自身没有 role，team 成员的权限继承 member.role
- Invitation 是独立 entity，accept 后产生 Member（可附带 teamId）
- "Active Organization"是 session 上的指针字段（`session.activeOrganizationId`）；"Active Team"同理（`session.activeTeamId`）

## 服务端配置（src/lib/auth.ts 视角，本项目 PRD 配置）

```ts
import { betterAuth } from "better-auth"
import { organization } from "better-auth/plugins"
import { ac, owner, adminRole, member } from "#/lib/permissions"
import { sendOrganizationInvitation } from "#/lib/email"

export const auth = betterAuth({
  plugins: [
    organization({
      // RBAC
      ac,
      roles: { owner, admin: adminRole, member },
      creatorRole: "owner",                       // 默认 owner

      // 配额
      organizationLimit: 5,                       // 每个 user 最多 5 个 org（默认 unlimited）
      membershipLimit: 100,                       // 每个 org 最多 100 member
      allowUserToCreateOrganization: true,        // 也可以传 fn 做 plan-gate

      // 邀请
      async sendInvitationEmail(data) {
        const inviteLink = `${env.PUBLIC_URL}/accept-invitation/${data.id}`
        await sendOrganizationInvitation({
          email: data.email,
          invitedByUsername: data.inviter.user.name,
          invitedByEmail: data.inviter.user.email,
          teamName: data.organization.name,
          inviteLink,
        })
      },
      invitationExpiresIn: 60 * 60 * 24 * 2,      // 默认 48h
      invitationLimit: 100,                       // 每个 user 100 个 pending 邀请
      cancelPendingInvitationsOnReInvite: false,
      requireEmailVerificationOnInvitation: false,

      // Teams（PRD D4：开启）
      teams: {
        enabled: true,
        maximumTeams: 10,                         // 也可传 async fn
        maximumMembersPerTeam: 50,                // 也可传 async fn
        allowRemovingAllTeams: false,             // 至少保留 1 个 team
      },

      // Hooks（按需开）
      organizationHooks: { /* 见下方 */ },

      // 删 org
      disableOrganizationDeletion: false,
    }),
  ],
})
```

## 客户端配置（src/lib/auth-client.ts 视角）

```ts
import { organizationClient } from "better-auth/client/plugins"
import { ac, owner, admin, member } from "#/lib/permissions"

export const authClient = createAuthClient({
  plugins: [
    organizationClient({
      ac,
      roles: { owner, admin, member },
      teams: { enabled: true },
    }),
  ],
})
```

**ac + roles 必须前后端同步**——`checkRolePermission` 同步 API 才能不打网络。

## Schema 影响（zenstack/schema.zmodel 视角）

`auth:migrate` 自动建以下表（zmodel 走 `@@ignore`）：

### 必建（teams 关闭也建）
- `organization` — id / name / slug / logo? / metadata? / createdAt
- `member` — id / userId(FK) / organizationId(FK) / role / createdAt
- `invitation` — id / email / inviterId / organizationId / role / status / expiresAt / teamId? / createdAt
- 给现有 `session` 表加字段：`activeOrganizationId?` / `activeTeamId?`

### Teams 开启后追加
- `team` — id / name / organizationId(FK) / createdAt / updatedAt?
- `teamMember` — id / teamId(FK) / userId(FK) / createdAt?

### Dynamic Access Control 开启后追加
- `organizationRole` — 运行时 role 表（permission 列存 JSON）
- 本任务 **暂不开 dynamicAccessControl**（PRD D2：静态 statements DSL 即可），不会建此表

### Menu 表怎么挂
PRD 决策：`Menu.organizationId: String?`（软关联 BA 的 organization.id 字符串），不建外键约束（因 organization 表不在 zmodel 管控）。

## 与本项目其它插件的协同

### 与 admin 插件的"双 RBAC"
**关键**：admin 插件的 `user.role` 与 organization 的 `member.role` **完全独立**。
- `admin` plugin → 全站维度（site-wide）→ `auth.api.admin.*`
- `organization` plugin → per-org 维度 → `auth.api.organization.*`
- 见 `plugin-admin-deep.md` 的"双 RBAC 冲突"章节，PRD 决策需补丁。

### 与 emailAndPassword + auto active org
新用户登录后**默认 activeOrganizationId 为 null**——必须自己用 `databaseHooks.session.create.before` 设初始值，否则前端 `useActiveOrganization()` 一直空：

```ts
betterAuth({
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const initialOrg = await db.member.findFirst({ where: { userId: session.userId } })
          return { data: { ...session, activeOrganizationId: initialOrg?.organizationId } }
        },
      },
    },
  },
  plugins: [organization({ ... })],
})
```

### 与 generic-oauth / SSO 自动入组
配 `organizationHooks.afterAcceptInvitation` 或在 `databaseHooks.user.create.after` 里自动给新 SSO 用户加默认 org 的 member。

### 与 captcha
默认 captcha 不拦截 org 端点；如果 SaaS 化想防机器人滥用 invite，要把 `/organization/invite-member` 加进 captcha endpoints。

## 关键 API 速查（本任务用到的）

### Organization 维度
| 用途 | client | server | endpoint |
|---|---|---|---|
| 创建 | `organization.create({ name, slug, logo?, metadata?, keepCurrentActiveOrganization? })` | `auth.api.createOrganization` | POST `/organization/create` |
| 检查 slug | `organization.checkSlug({ slug })` | `auth.api.checkOrganizationSlug` | POST `/organization/check-slug` |
| 列表（hook） | `useListOrganizations()` | `auth.api.listOrganizations` | GET `/organization/list` |
| 设激活 | `organization.setActive({ organizationId, organizationSlug? })` | `auth.api.setActiveOrganization` | POST `/organization/set-active` |
| 取激活（hook） | `useActiveOrganization()` | — | — |
| 取完整 | `organization.getFullOrganization({ query: { organizationId?, organizationSlug?, membersLimit? } })` | `auth.api.getFullOrganization` | GET `/organization/get-full-organization` |
| 更新 | `organization.update({ data, organizationId? })` | `auth.api.updateOrganization` | POST `/organization/update` |
| 删除 | `organization.delete({ organizationId })` | `auth.api.deleteOrganization` | POST `/organization/delete` |

### Invitation
| 用途 | endpoint |
|---|---|
| 邀请 | POST `/organization/invite-member` (`email, role, organizationId?, resend?, teamId?`) |
| accept | POST `/organization/accept-invitation` |
| reject | POST `/organization/reject-invitation` |
| cancel | POST `/organization/cancel-invitation` |
| get | GET `/organization/get-invitation` |
| list per org | GET `/organization/list-invitations` |
| list per user | GET `/organization/list-user-invitations` |

### Member
| 用途 | endpoint |
|---|---|
| list | POST `/organization/list-members` |
| remove | POST `/organization/remove-member` |
| update role | POST `/organization/update-member-role` |
| get active | GET `/organization/get-active-member` |
| get active role | GET `/organization/get-active-member-role` |
| add（server-only 直加） | POST `/organization/add-member` |
| leave | POST `/organization/leave-organization` |

### Team（仅 teams enabled）
| 用途 | endpoint |
|---|---|
| create | POST `/organization/create-team` |
| list | GET `/organization/list-teams` |
| update | POST `/organization/update-team` |
| remove | POST `/organization/remove-team` |
| set active | POST `/organization/set-active-team` |
| list user's teams | GET `/organization/list-user-teams` |
| list members | POST `/organization/list-team-members` |
| add member | POST `/organization/add-team-member` |
| remove member | POST `/organization/remove-team-member` |

### **本项目核心：hasPermission（菜单鉴权）**

服务端用法（PRD D7 的 `getUserMenus` 应该走这个）：

```ts
// src/orpc/router/user-menus.ts 内
import { auth } from "#/lib/auth"

const result = await auth.api.hasPermission({
  headers,                                          // session 解出 userId / activeOrgId
  body: {
    permissions: { menu: ["read"], user: ["read"] },// 多 resource 一次查
  },
})
// returns { success: boolean }
```

客户端用法（前端守卫 / 按钮显示）：

```ts
const { data } = await authClient.organization.hasPermission({
  permissions: { project: ["create"] },
})
```

**checkRolePermission**（同步、纯客户端、不查后端）：
```ts
const can = authClient.organization.checkRolePermission({
  permissions: { organization: ["delete"] },
  role: "admin",
})
```
⚠️ 不包含 dynamic role；本项目静态 ac，可放心用。

## 关键代码骨架

### permissions.ts（PRD 已给雏形，本研究补完默认 statements 合并）

```ts
import { createAccessControl } from "better-auth/plugins/access"
import { defaultStatements, adminAc, ownerAc, memberAc } from "better-auth/plugins/organization/access"

export const statement = {
  ...defaultStatements,                             // organization / member / invitation / team
  // 业务 resources：
  user: ["read", "write", "delete"],                // 这是 org 内"用户管理"的能力，不是 admin 插件的 user
  menu: ["read", "write", "delete"],
  project: ["read", "write", "delete"],
} as const

export const ac = createAccessControl(statement)

export const owner = ac.newRole({
  ...ownerAc.statements,
  user: ["read", "write", "delete"],
  menu: ["read", "write", "delete"],
  project: ["read", "write", "delete"],
})
export const adminRole = ac.newRole({
  ...adminAc.statements,
  user: ["read", "write"],
  menu: ["read", "write"],
  project: ["read", "write"],
})
export const member = ac.newRole({
  ...memberAc.statements,
  user: ["read"],
  menu: ["read"],
  project: ["read"],
})
```

### `getUserMenus` 重写（PRD 伪代码的服务端版）

```ts
// src/orpc/router/user-menus.ts
const allMenus = await db.menu.findMany({ where: { status: "ACTIVE" } })

const checks = await Promise.all(
  allMenus.map(async (m) => {
    if (!m.requiredPermission) return { menu: m, allowed: true }
    const [resource, action] = m.requiredPermission.split(":")
    const { success } = await auth.api.hasPermission({
      headers,
      body: { permissions: { [resource]: [action] } },
    })
    return { menu: m, allowed: success }
  }),
)
return buildTree(checks.filter((x) => x.allowed).map((x) => x.menu))
```

性能优化（N+1）：把同 org 的 menus 按 `requiredPermission` 分组，对每个 unique permission 批量查一次。

## organizationHooks 完整列表（决策点）

可挂的 hook（before/after 配对）：

**Org**: `beforeCreateOrganization` / `afterCreateOrganization` / `beforeUpdateOrganization` / `afterUpdateOrganization` / `beforeDeleteOrganization` / `afterDeleteOrganization`

**Member**: `beforeAddMember` / `afterAddMember` / `beforeRemoveMember` / `afterRemoveMember` / `beforeUpdateMemberRole` / `afterUpdateMemberRole`

**Invitation**: `beforeCreateInvitation` / `afterCreateInvitation` / `beforeAcceptInvitation` / `afterAcceptInvitation` / `beforeRejectInvitation` / `afterRejectInvitation` / `beforeCancelInvitation` / `afterCancelInvitation`

**Team**: `beforeCreateTeam` / `afterCreateTeam` / `beforeUpdateTeam` / `afterUpdateTeam` / `beforeDeleteTeam` / `afterDeleteTeam` / `beforeAddTeamMember` / `afterAddTeamMember` / `beforeRemoveTeamMember` / `afterRemoveTeamMember`

错误处理：在 `before*` 里抛 `APIError("BAD_REQUEST", { message })` 即可阻断。

PRD D5 推迟审计日志——但本任务可以**预埋钩子**：所有 `after*Member*` / `after*Invitation*` 写到一个 `auditLog` 表，未来 task 再做 UI。

## 注意事项 / 坑

1. **session.activeOrganizationId 默认 null** —— 新用户登录后用不了任何依赖 active org 的 API，必须 databaseHooks 自动选 org，或前端引导。
2. **organization slug 必须唯一**——但 `checkSlug` 是建议，不是强制；高并发下要靠 DB unique 约束兜底。
3. `organization.delete` 默认级联删 member / invitation，但**不删** team / teamMember 等"组织内业务表"——业务方需自管。
4. `inviteMember` 的 `role` 接受 string | string[]，多角色用数组（不是逗号分隔）。
5. `requireEmailVerificationOnInvitation: true` 与 emailAndPassword 的 `requireEmailVerification` 不联动；要设置都得显式开。
6. **Teams 没有 role 字段**——team 成员的权限完全继承 `member.role`。如果业务要"团队 leader"概念得自管 metadata。
7. `defaultStatements` 默认 4 个 resource：`organization` / `member` / `invitation` / `team`（teams 关闭时也存在 team statement，但用不到）。**自定义 role 不合并 defaultStatements 会导致 owner 都不能删 org**。
8. 删除 org 用 `disableOrganizationDeletion: true` 全局禁；本项目可以保留默认开启 + 仅 owner 角色有权限。
9. `creatorRole` 默认 `owner`，不要改成 `admin` ——否则 owner 永不存在，删 org 没人能干。
10. `organization.list()` 不带 `headers` 在 server-side 用必报错；它强依赖 session。
11. teams 开启后 zmodel 的 `Menu.organizationId` **不应**改为 teamId——team 是 org 内的细分，业务菜单一般还是按 org 切（PRD D8 决策正确）。
