# Authorization Boundary — Better Auth × ZenStack

> 授权分两层，各司其职。理解并遵守此边界是后端模型设计、policy 编写、权限检查的前提。

---

## TL;DR

| 层 | 工具 | 负责 | 不管 |
|---|---|---|---|
| **身份层** | **Better Auth** 插件（admin / organization / sso / ...） | 谁是用户、谁属于哪组织、调 `/admin/*` 和 `/organization/*` API 的权限 | 业务数据访问控制 |
| **业务层** | **ZenStack** policy engine（`@@allow` / `@@deny`） | 业务表的行级 / 字段级访问控制、租户隔离、状态流转 | 用户注册、成员管理、组织邀请 |

两层通过 **auth context bridge**（`src/lib/auth/session.ts` → `authDb.$setAuth(...)`）单向连接：Better Auth session 关键字段流入 ZenStack `auth()` 作为 policy 评估上下文。

---

## 层一：身份层（Better Auth 统管）

### 归属 Better Auth 的表（zmodel `@@ignore`）

由 `@better-auth/cli migrate` 建 + Better Auth 内置 Kysely 管理。**不得**写入 zmodel 为可操作模型，**不得**用 ZenStack policy 约束：

- `user`（admin plugin 扩展 `role / banned / banReason / banExpires`）
- `session`（admin plugin 扩展 `impersonatedBy`；organization plugin 扩展 `activeOrganizationId / activeTeamId`）
- `account` / `verification`
- `organization` / `member` / `invitation`
- `team` / `teamMember`

### 归属 Better Auth 的权限检查

- **谁能调 `auth.api.admin.*`**：admin plugin role 判定（默认 `user.role === "admin"`；或自定义 statements + roles）
- **谁能调 `auth.api.organization.*`**：organization plugin 的 `member.role` 判定
- **谁能在某 org 做某事**：`auth.api.hasPermission({ organizationId, permissions: { resource: [action] } })`
- **客户端同步检查**：`authClient.admin.checkRolePermission(...)` / `authClient.organization.hasPermission(...)`

**Access Control DSL**：`src/lib/permissions.ts` 声明 `statements` + `roles`，前后端共用。

### 双 RBAC 不合并

Better Auth **内部就有两套 RBAC**：`admin.role`（全站）驱动 `admin.*` API、`organization.member.role`（组织）驱动 `organization.*` API。这是刻意设计——超管账号设 `user.role = "admin"`，普通用户走 `member.role` + custom AC。**不要试图合并**。

---

## 层二：业务层（ZenStack 统管）

### 归属 ZenStack 的表

所有业务表都应该：
- 在 `zenstack/schema.zmodel` 声明
- 用 `@@allow` / `@@deny` 集中声明访问策略
- 由 `pnpm db:push` / `pnpm db:migrate` 管理迁移
- 通过 `context.db.*`（`authDb`，已挂 `PolicyPlugin`）调用

当前业务表仅 `Menu`，未来扩展到 ERP / 光伏电站 / 工单 / 客户等全业务域。

### Policy Engine 的核心价值

schema 集中声明、运行时自动应用：所有 `authDb.xxx.*` 自动被 policy 过滤，新 handler 不会因"忘加权限检查"而泄漏；字段级 `@@deny(..., field: xxx)` 自动隐藏敏感字段（salary / SSN）。

### 标准 Policy 范式（给未来业务表抄）

**A. 租户隔离**（最常用）：
```prisma
model Station {
  organizationId String
  @@allow('all', auth().activeOrganizationId == this.organizationId)
}
```

**B. 所有者 / 角色混合**：
```prisma
model Order {
  ownerId String
  @@allow('read', auth().id == this.ownerId || auth().isAdmin)
  @@allow('update', auth().id == this.ownerId)
  @@allow('create', auth() != null)
}
```

**C. 状态流转约束**：
```prisma
model WorkOrder {
  status String  // draft | submitted | approved
  @@allow('update', before.status == 'draft')
}
```

**D. 字段级可见性**：
```prisma
model Employee {
  salary Int
  @@deny('read', auth().role != 'hr', field: salary)
}
```

**E. 匿名禁止 + 登录只读 + 管理员全权**（Menu 当前就是这种）：
```prisma
model SomeTable {
  @@deny('all', auth() == null)
  @@allow('read', auth() != null)
  @@allow('all', auth().isAdmin == true)
}
```

---

## Session Active Org 自动填充（必配 hook）

Better Auth 默认 `session.activeOrganizationId = null`，新用户登录后所有 org-scoped `hasPermission(...)` 返回 false，`getUserMenus` 把带 `requiredPermission` 的菜单全过滤。

修复：`betterAuth({ databaseHooks.session.create.before })` 查用户最早绑定的 org 填入：

```ts
betterAuth({
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const { rows } = await pool.query<{ organizationId: string }>(
            'SELECT "organizationId" FROM "member" WHERE "userId" = $1 ORDER BY "createdAt" ASC LIMIT 1',
            [session.userId],
          );
          const organizationId = rows[0]?.organizationId;
          if (!organizationId) return { data: session };
          return { data: { ...session, activeOrganizationId: organizationId } };
        },
      },
    },
  },
});
```

**锚点**：`src/lib/auth/config.ts`（`databaseHooks.session.create.before`）。

---

## BA Hooks 的归属：组织生命周期约束写在身份层

`organization` / `member` / `invitation` / `team` 是 `@@ignore` 表，ZenStack policy 碰不到。所有涉及这些表的前置校验必须走 BA hooks，不得写成 handler 里的散乱 if，也不得伪装成 policy。

| Hook | 用途 |
|---|---|
| `organizationHooks.beforeAcceptInvitation` | 转让 owner 前校验 inviter 仍是 owner |
| `organizationHooks.beforeUpdateMemberRole` | 最后 owner 降级保护 |
| `organizationHooks.beforeRemoveMember` | 最后 owner 删除保护 |
| `databaseHooks.user.create.after` | single 模式 signUp 后用共享 `pg.Pool` 裸 SQL 加入 default org |

**规则**：
- `beforeXxx` hooks 返回 `Promise<void>`，throw `APIError` 即否决（不是 `return { data }`）
- 跨 BA 表联动用 `src/db.ts` 的 `pool.query(...)`，不走 `authDb`（policy 会挡）也不走 BA 客户端 API（会触发事件/邮件）
- 不在 oRPC handler 里重复校验，BA API 和客户端调用走同一链路，hooks 已覆盖

**锚点**：`src/lib/auth/config.ts`（`organizationHooks.*` / `databaseHooks.user.create.after`）。

---

## Plugin × UI Capability 一致性

`better-auth-ui` 组件无条件探测能力端点（如 `<UserButton>` probe `/api/auth/multi-session/list-device-sessions`），server 没装对应 plugin 会永续 404 刷 console。

**约束**：server 的 `plugins: [...]` 必须与 `<AuthProvider>` 的 capability flag 一一对应。当前项目：

| server plugin | AuthProvider flag | 状态 |
|---|---|---|
| `admin()` | — | 装 |
| `organization({ teams: true })` | — | 装 |
| `multiSession()` | `multiSession={true}` | 装（impersonate 不丢主账户的前提）|
| `passkey()` | `passkey={false}` | 不装 |
| `magicLink()` | `magicLink={false}` | 不装 |

`multiSession` + `admin.impersonateUser` 协同：默认 impersonate 会替换当前 session（主账户丢），multiSession 启用后改为并行 session，主账户保留在 device sessions，切回无感。

---

## Auth Context Bridge

Better Auth session → ZenStack `auth()` 的字段流：`auth-session.ts` 从 BA session 提取 → `middleware/auth.ts` 调 `authDb.$setAuth(...)` → zmodel 的 `@@allow` 以 `auth().xxx` 引用。

**当前暴露字段**（以 `auth-session.ts` 类型为准）：
- `auth().id`：用户 id
- `auth().isAdmin`：全站管理员（来自 `user.role === "admin"`）
- `auth().activeOrganizationId`：当前激活组织 id

### 扩展字段的顺序（不可颠倒）

1. `src/lib/auth/session.ts` 的 `AuthSessionContext.user` 加字段
2. `getSessionUser(...)` 填充（从 BA session / member / team 读）
3. `src/orpc/middleware/auth.ts` 的 `authDb.$setAuth(...)` 传入
4. zmodel 才能以 `auth().<新字段>` 引用

颠倒顺序 → zmodel 运行时报错。

---

## 禁止 / 反模式

1. **禁止**业务表 handler 手写"不是 admin 就 throw"的散乱 `if`——用 `@@allow` / `@@deny` 代替（例外：非数据访问动作如触发 webhook）
2. **禁止**把 BA 的 `user` / `organization` / `member` / `team` 写进 zmodel
3. **禁止**用 ZenStack policy 去管 BA API（`/admin/*` / `/organization/*`）访问
4. **禁止**每个 handler 重复 `hasPermission`；业务表读写信任 ZenStack policy
5. **禁止**绕过 `authDb` 直接用 `db` 查业务表（管理员后门需代码注释说明）

---

## FAQ

- **为什么不全用 BA AC 管业务权限？** BA 是"动作级"（能不能调 API），没有行级/字段级，业务场景如"只看自己部门订单"只能在数据层声明。
- **为什么不全用 policy 管身份？** 身份表 `@@ignore`，ZenStack 够不到；BA 的 session / 邀请 / impersonate 是插件内置逻辑。
- **Menu policy 很简单，为啥不写 middleware？** Menu 是第一张业务表，保留 policy 风格为未来定标杆；每 handler 自管权限会在表多时漏洞。
- **字段跨两层怎么办？** 不会。业务表只存 `userId` 外键，查询时在 handler 拼装。

---

## 参考实现锚点

- BA access control：`src/lib/permissions.ts`
- BA 插件装载 + hooks：`src/lib/auth/config.ts`
- Session → auth context：`src/lib/auth/session.ts`
- `authDb.$setAuth` 调用：`src/orpc/middleware/auth.ts`
- Menu policy 样本：`zenstack/schema.zmodel`
