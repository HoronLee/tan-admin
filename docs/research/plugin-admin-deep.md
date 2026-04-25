# Better Auth — admin 插件（深研版）

## 来源
- https://better-auth.com/docs/plugins/admin
- 抓取：2026-04-21

## 核心概念

为应用提供"管理员视角"的用户管理：CRUD / role / ban / impersonate / session 管理。配套**自带的 RBAC**（与 organization 的 RBAC 是**独立两套**——这是关键设计点）。

## 服务端配置（src/lib/auth.ts 视角）

```ts
import { betterAuth } from "better-auth"
import { admin } from "better-auth/plugins"
import { ac, admin as adminRole, user, superAdmin } from "#/lib/permissions"

export const auth = betterAuth({
  plugins: [
    admin({
      ac,                                         // 必填：自定义 access control
      roles: { admin: adminRole, user, superAdmin },  // 必填：角色定义
      defaultRole: "user",                        // 默认角色，default "user"
      adminRoles: ["admin", "superAdmin"],        // 哪些角色是 admin（**自定义 ac 时不需要传**）
      adminUserIds: [],                           // 强制 admin 的 user.id 列表（绕过 role 判定）
      impersonationSessionDuration: 60 * 60,      // 默认 1h
      defaultBanReason: "No reason",
      defaultBanExpiresIn: undefined,             // undefined = 永久
      bannedUserMessage: "You have been banned from this application. Please contact support if you believe this is an error.",
    }),
  ],
})
```

## 客户端配置（src/lib/auth-client.ts 视角）

```ts
import { adminClient } from "better-auth/client/plugins"
import { ac, admin, user, superAdmin } from "#/lib/permissions"

export const authClient = createAuthClient({
  plugins: [
    adminClient({ ac, roles: { admin, user, superAdmin } }),
  ],
})
```

**ac + roles 必须前后端同步**——客户端 `checkRolePermission`（同步）才能不打网络。

## Schema 影响（zenstack/schema.zmodel 视角）

`auth:migrate` 会**自动加字段**到已有 `user` / `session` 表（不新增表）：

| 表 | 字段 | 类型 | 说明 |
|---|---|---|---|
| user | role | string? | 默认 "user"；多个角色用 `,` 分隔 |
| user | banned | boolean? | |
| user | banReason | string? | |
| user | banExpires | date? | |
| session | impersonatedBy | string? | impersonation session 来源 admin 的 userId |

zmodel 里 user/session 走 `@@ignore` 跳过 ZenStack 管理，**这两张表完全归 better-auth-cli 管**——本项目已是这套约束。

## 与本项目其它插件的协同

### 与 organization 插件的"双 RBAC"冲突

**关键认知**：admin 插件的 `role` 和 organization 插件的 `member.role` 是**完全独立**的两套。
- admin role：作用于"全站"维度（site-wide），决定能不能调 `auth.api.admin.*`
- organization role：作用于"组织"维度（per-org），决定能不能调 `auth.api.organization.*`

PRD 决策 D1/D2"用 organization role 替代自建 Role"——但要补一条：**admin role 不能完全省**，否则 `admin.listUsers` / `banUser` 这些"跨 org 的全站管理"无人能调。

实操建议（与 PRD 对齐补丁）：
- 保留 admin 插件的 role 字段，仅给"超管账号"赋 admin role（或用 `adminUserIds`）
- 业务角色全部走 organization.member.role + access control statements
- Menu 鉴权走 `organization.hasPermission`（PRD D7 决策不变）

### 与 emailAndPassword 的 customSyntheticUser

如果开了 `requireEmailVerification` 或 `autoSignIn: false`（邮箱枚举防护），**必须**配 `customSyntheticUser` 把 admin 字段塞进虚假响应：

```ts
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true,
  customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
    ...coreFields,
    role: "user",
    banned: false,
    banReason: null,
    banExpires: null,
    ...additionalFields,
    id,
  }),
}
```

否则前端 type narrowing 会失败。

## 关键 API 速查

所有 admin API 走 `/admin/*` 路由（注意：与 organization 的 `/organization/*` 完全独立）。

| 用途 | client | server | endpoint |
|---|---|---|---|
| 创建用户 | `admin.createUser({ email, password, name, role?, data? })` | `auth.api.createUser` | POST `/admin/create-user` |
| 列表 | `admin.listUsers({ query })` | `auth.api.listUsers` | GET `/admin/list-users` |
| 取单个 | `admin.getUser({ query: { id } })` | `auth.api.getUser` | GET `/admin/get-user` |
| 改角色 | `admin.setRole({ userId, role })` | `auth.api.setRole` | POST `/admin/set-role` |
| 改密码 | `admin.setUserPassword({ newPassword, userId })` | `auth.api.setUserPassword` | POST `/admin/set-user-password` |
| 改资料 | `admin.updateUser({ userId, data })` | `auth.api.adminUpdateUser` | POST `/admin/update-user` |
| 封禁 | `admin.banUser({ userId, banReason?, banExpiresIn? })` | `auth.api.banUser` | POST `/admin/ban-user` |
| 解封 | `admin.unbanUser({ userId })` | `auth.api.unbanUser` | POST `/admin/unban-user` |
| 列 session | `admin.listUserSessions({ userId })` | `auth.api.listUserSessions` | POST `/admin/list-user-sessions` |
| 撤单个 session | `admin.revokeUserSession({ sessionToken })` | `auth.api.revokeUserSession` | POST `/admin/revoke-user-session` |
| 撤所有 session | `admin.revokeUserSessions({ userId })` | `auth.api.revokeUserSessions` | POST `/admin/revoke-user-sessions` |
| Impersonate | `admin.impersonateUser({ userId })` | `auth.api.impersonateUser` | POST `/admin/impersonate-user` |
| 停止 imp | `admin.stopImpersonating()` | `auth.api.stopImpersonating` | POST `/admin/stop-impersonating` |
| 硬删 | `admin.removeUser({ userId })` | `auth.api.removeUser` | POST `/admin/remove-user` |
| 鉴权 | `admin.hasPermission({ permissions })` | `auth.api.userHasPermission({ body: { userId/role, permissions } })` | POST `/admin/has-permission` |

`listUsers` 支持 search / sort / filter / pagination：
```ts
{
  searchValue, searchField: "email" | "name", searchOperator: "contains" | "starts_with" | "ends_with",
  limit, offset, sortBy, sortDirection: "asc" | "desc",
  filterField, filterValue, filterOperator: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "not_in" | "contains" | "starts_with" | "ends_with"
}
```
返回：`{ users, total, limit, offset }`。

## Access Control DSL

默认 statements（`better-auth/plugins/admin/access` 导出 `defaultStatements` + `adminAc` / `userAc`）：
```ts
{
  user: ["create", "list", "set-role", "ban", "impersonate", "impersonate-admins", "delete", "set-password"],
  session: ["list", "revoke", "delete"],
}
```

自定义 + 合并默认：
```ts
import { createAccessControl } from "better-auth/plugins/access"
import { defaultStatements, adminAc, userAc } from "better-auth/plugins/admin/access"

export const statement = {
  ...defaultStatements,
  project: ["create", "share", "update", "delete"],
} as const

export const ac = createAccessControl(statement)

// **关键**：自定义 role 默认会**覆盖**默认权限，要用扩展运算符合并
export const admin = ac.newRole({
  ...adminAc.statements,
  project: ["create", "update"],
})
export const user = ac.newRole({ ...userAc.statements })

// "超管允许 impersonate 其他 admin"模式（替代 deprecated `allowImpersonatingAdmins`）
export const superAdmin = ac.newRole({
  ...adminAc.statements,
  user: ["impersonate-admins", ...adminAc.statements.user],
})
```

### Permission 检查（client / server）

```ts
// 客户端：异步，查当前 session 的用户
const { data } = await authClient.admin.hasPermission({
  permissions: { project: ["create"], sale: ["create"] },
})

// 客户端：同步，按 role 名查（不查具体用户）
const can = authClient.admin.checkRolePermission({
  permissions: { user: ["delete"] },
  role: "admin",
})

// 服务端：可直接传 role 字符串，不查 user
await auth.api.userHasPermission({
  body: { role: "admin", permissions: { project: ["create"] } },
})
```

## Impersonate 行为细节

- session 持续 1 小时（可配 `impersonationSessionDuration`），到期或 close tab 失效
- session 表 `impersonatedBy` 字段记录"谁在 impersonate"——审计日志可用
- 默认禁止 admin 互相 impersonate；要开必须授 `user: ["impersonate-admins"]` 权限
- `stopImpersonating()` 恢复原 admin session（不是新登录）

## 注意事项 / 坑

1. **`adminRoles` 与自定义 `ac` 不能同时混用**——文档原话："`adminRoles` 选项在使用自定义 access control 时**不需要**"。如果你既配了 `ac/roles` 又配 `adminRoles: ["superadmin"]`，行为以 ac 为准。
2. **role 字段是字符串多角色**——多角色存为 `"admin,manager"`。本项目老 schema 的 `UserRole` 多对多表被它替代后，要兼容多角色查询。
3. `listUsers` 默认 100 行；前端表格分页要传 `limit/offset`，**没有 cursor 分页**。
4. impersonate 期间，session 上下文里的"who am i"是被 impersonate 的用户；admin 的 oRPC handlers 必须读 `session.impersonatedBy` 判断是否处于 imp 状态，否则审计日志会归错。
5. `removeUser` 是**硬删**，不可恢复；UI 必须有二次确认（用 v1 的 ConfirmDialog）。
6. Access Control 的 `defaultStatements` 必须 `as const` 才能让 TS 推出字面量类型——CLAUDE.md 的 immutability 原则在这里**只是 readonly 类型层面**，运行时不影响。
7. `ban` 撤所有 session 是默认行为——封禁后用户立刻被踢，但已经发出去的 API 请求那一瞬间不被回收。

## 实施反馈（2026-04-22 identity-layer-v2 task 完成）

本项目 v2 已落地 admin plugin，实测确认：

- ✅ `authClient.admin.listUsers({ query: { limit, offset } })` / `createUser` / `setRole` / `banUser` / `unbanUser` / `impersonateUser` / `removeUser` 全部可用，`src/routes/(admin)/_layout/users/index.tsx` 完整封装。
- ✅ 自定义 ac + roles 配合 `admin()` plugin 同时生效（admin plugin 的默认 roles 为 `admin`/`user`，organization plugin 的为 `owner`/`admin`/`member`——双套并存，各管各的 API 面）。
- ✅ `user.role === "admin"` 是超管信号，seed 脚本通过 `UPDATE "user" SET role = 'admin'` 晋升（首个超管由 `auth.api.signUpEmail` 创建）。
- ⚠️ **impersonate 配合 multiSession plugin**：本项目 v2 启用 multiSession。开启后 `impersonateUser` 是"额外开一个并行 session"而非"取代主账户"，管理员切回原身份成本低。没装 multiSession 的场景下 impersonate 会吃掉管理员 session，要手动 `stopImpersonating`。详见 `.trellis/spec/backend/authorization-boundary.md` 的 "multiSession + impersonate 协同" 段。
- ⚠️ ba-ui shadcn 变体**不提供** admin 用户管理 UI，本项目自写（DataTable + FormDrawer + ConfirmDialog）。删除用户走 ConfirmDialog 的 `requireTypedConfirm` 模式（要求输入 email 确认）。

## 实施反馈（2026-04-24 ba-plugin-api-expansion 完成）

本轮补齐 admin plugin 的超管面板缺失功能 + 开启 4 个配置项。当前 API 利用与配置清单：

**已用 API（17 处调用点 ✅）**：`createUser` / `listUsers` / `setRole` / `banUser` / `unbanUser` / `impersonateUser` / `removeUser` / `updateUser` / `setUserPassword` / `listUserSessions` / `revokeUserSession` / `revokeUserSessions` / `stopImpersonating`（全部在 `src/routes/site/_layout/users/index.tsx` + `src/components/layout/ImpersonationBanner.tsx`）。

**`listUsers` 搜索模式（2026-04-25 起）**：`UserPickerCombobox`（`src/components/UserPickerCombobox.tsx`）调 `authClient.admin.listUsers({ query: { searchValue, searchField: "email", searchOperator: "contains", limit: 10 }})` 做超管视角的全站用户搜索（debounce 300ms），用于 `site/organizations` 行操作 "Add member" 反向入口。

**未用 API / 原因**：
- `getUser(userId)` — 📋 未用。我们走 `listUsers` 分页拿，行数据够用；未来做"用户详情页"时接入
- `revokeAllSessionsForAUser` — 等同 `revokeUserSessions`（别名），已覆盖

**Options 当前配置**：
- `emailEnumerationProtection: true` ✅ / `impersonationSessionDuration: 3600` ✅ / `defaultBanReason` ✅ / `bannedUserMessage` ✅
- 📋 未设：`defaultRole`（默认 "user" 够用）/ `adminRoles`（用户表 `role` 字段的字符串匹配，默认 "admin" 够用）/ `adminUserIds`（白名单 bypass，不需要）/ `defaultBanExpiresIn`（我们要永封，默认 undefined 即永久，合意）

**AC 策略**：本 task 把 organization 插件的自定义 ac 删了（走 BA 原生 defaults），admin 插件本身**从未**传过 custom ac——保留 BA 原生 `admin` / `user` 两角色。如果未来要做"子超管分权"（比如"财务管理员只能看 billing 不能 ban user"）需要接入 admin plugin 的 ac。

**Bug 修复留痕**：
- 修了 `user.update.after` hook 在 raw-SQL 写 `emailVerified` 时不触发的问题（`@dev.com` 快速注册路径）—— 抽 `ensurePersonalOrg` 函数，在 raw-SQL 更新后直接调，+ `session.create.before` 兜底。详见 `.trellis/spec/backend/personal-org.md`。
- 修了 impersonate 只入不出的 UX 断点 —— `ImpersonationBanner` 读 `session.impersonatedBy` 显示退出入口。
