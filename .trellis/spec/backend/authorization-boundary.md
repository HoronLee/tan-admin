# Authorization Boundary — Better Auth × ZenStack

> 本项目的授权系统分两层，各司其职。理解并遵守此边界是所有后端模型设计、policy 编写、权限检查的前提。

---

## TL;DR

| 层 | 工具 | 负责什么 | 不管什么 |
|---|---|---|---|
| **身份层** | **Better Auth** 插件（admin / organization / sso / ...） | 谁是用户、谁属于哪个组织、调 `/admin/*` 和 `/organization/*` API 的权限 | 业务数据访问控制 |
| **业务层** | **ZenStack** policy engine（`@@allow` / `@@deny`） | 业务表的行级 / 字段级访问控制、租户隔离、状态流转约束 | 用户注册、成员管理、组织邀请 |

两层通过 **auth context bridge**（`src/lib/auth-session.ts` → `authDb.$setAuth(...)`）单向连接：Better Auth session 的关键字段流入 ZenStack 的 `auth()` 函数作为 policy evaluation 上下文。

---

## 层一：身份层（Better Auth 统管）

### 归属 Better Auth 的表（zmodel `@@ignore`）

所有这些表由 `@better-auth/cli migrate` 建 + Better Auth 内置 Kysely 管理。**不得**写入 zmodel 为可操作模型，**不得**用 ZenStack policy 约束：

- `user`（admin plugin 扩展 `role / banned / banReason / banExpires`）
- `session`（admin plugin 扩展 `impersonatedBy`；organization plugin 扩展 `activeOrganizationId / activeTeamId`）
- `account` / `verification`
- `organization` / `member` / `invitation`
- `team` / `teamMember`

### 归属 Better Auth 的权限检查

- **谁能调 `auth.api.admin.*`**：由 admin plugin 的 role 判定（默认 `user.role === "admin"`；或自定义 access control statements + roles）
- **谁能调 `auth.api.organization.*`**：由 organization plugin 的 `member.role` 判定
- **谁能在某 org 做某事**：`auth.api.hasPermission({ organizationId, permissions: { resource: [action] } })`
- **客户端同步检查**：`authClient.admin.checkRolePermission(...)` / `authClient.organization.hasPermission(...)`

**Access Control DSL 定义**：`src/lib/permissions.ts` 内声明 `statements` + `roles`，前后端共用同一定义。

### 认知要点

Better Auth **内部就有两套 RBAC**：
- `admin.role`（全站维度，驱动 `admin.*` API 权限）
- `organization.member.role`（组织维度，驱动 `organization.*` API 权限）

这是 Better Auth 的刻意设计（全站管理员 vs 组织角色），**不要试图合并或强制用一套替代另一套**。典型做法：
- 超管账号设 `user.role = "admin"` 以开启 admin plugin 管理能力
- 所有普通用户的业务角色走 `member.role` + custom access control

---

## 层二：业务层（ZenStack 统管）

### 归属 ZenStack 的表

所有业务表都应该：
- 在 `zenstack/schema.zmodel` 中声明
- 使用 `@@allow` / `@@deny` 集中声明访问策略
- 由 `pnpm db:push` / `pnpm db:migrate` 管理迁移
- 通过 `context.db.*`（`authDb`，已挂 `PolicyPlugin`）调用

当前业务表仅 `Menu`（身份层菜单），未来会扩展到 ERP / 光伏电站 / 工单 / 客户等全业务域。

### ZenStack Policy Engine 的核心价值

**在 schema 集中声明、运行时自动应用**。这意味着：
- 所有 `authDb.xxx.*` 调用自动被 policy 过滤，无需 handler 手写 `if (!allowed) throw`
- 新加一个 handler 不会因为"忘记加权限检查"而泄漏（零漏洞成本）
- rules 集中在 schema，审计和 review 简单
- 字段级 `@@deny(... , field: xxx)` 自动隐藏敏感字段（如 salary / SSN），handler 不需操心

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

**C. 状态流转约束**（前置条件写在 `@@allow` 里）：
```prisma
model WorkOrder {
  status String  // draft | submitted | approved
  @@allow('update', before.status == 'draft')  // 只有草稿能改
}
```

**D. 字段级可见性**：
```prisma
model Employee {
  salary Int
  @@deny('read', auth().role != 'hr', field: salary)
}
```

**E. 匿名禁止 + 登录只读 + 管理员全权**（Menu 表当前就是这种模式，最基础）：
```prisma
model SomeTable {
  @@deny('all', auth() == null)
  @@allow('read', auth() != null)
  @@allow('all', auth().isAdmin == true)
}
```

---

## Session Active Org 自动填充（必配 hook）

Better Auth 默认 `session.activeOrganizationId = null`，新用户登录后 **所有**
org-scoped `hasPermission(...)` 返回 false——侧栏菜单如果带 `requiredPermission`
会被 `getUserMenus` 过滤光，用户看到"空后台"。

修复：`betterAuth({ databaseHooks: { session: { create: { before } } } })` 在
session 创建时自动查用户 `member` 表里最早绑定的 org，填入 activeOrganizationId：

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

**锚点**：`src/lib/auth.ts`（`databaseHooks.session.create.before`）。

---

## Better Auth Plugin 与 UI Capability Flag 一致性

`better-auth-ui` shadcn 变体（auth / user-button / settings 三个 registry）
在组件里无条件探测某些能力端点，例如 `<UserButton>` 渲染"Switch account"
子菜单会 probe `/api/auth/multi-session/list-device-sessions`。如果 server
没装对应 plugin，结果是永续 404 刷 console（不影响功能，但脏）。

**一致性约束**：server 的 `plugins: [...]` 必须与 `<AuthProvider>` 的 capability
flag 一一对应。当前项目：

| server plugin | AuthProvider flag | 状态 |
|---|---|---|
| `admin()` | — | 装 |
| `organization({ teams: true })` | — | 装 |
| `multiSession()` | `multiSession={true}` | 装（impersonate 不丢主账户的前提）|
| `passkey()` | `passkey={false}` | 不装 |
| `magicLink()` | `magicLink={false}` | 不装 |

**multiSession + impersonate 协同**：admin plugin 的 `impersonateUser` 默认
"取代"当前 session（管理员主账户 session 丢失，需手动 stopImpersonating 才能回）。
multiSession 启用后 impersonate 变"再开一个并行 session"，主账户保留在
device sessions 列表，切回瞬时无感。企业后台必备。

---

## Auth Context Bridge

Better Auth session → ZenStack `auth()` 的字段流通过 `authed` middleware 完成：

```
Better Auth 插件（运行时）
  ↓ 构造 session（含 user.id / user.role / session.activeOrganizationId）
src/lib/auth-session.ts
  ↓ 提取成 { id, isAdmin, activeOrganizationId } 等字段
src/orpc/middleware/auth.ts
  ↓ 调用 authDb.$setAuth({ ... })
zenstack policy engine
  ↓ 在 @@allow/@@deny 表达式里以 auth().xxx 访问
```

**当前暴露给 `auth()` 的字段**（以 `auth-session.ts` 类型为准）：
- `auth().id`：用户 id
- `auth().isAdmin`：全站管理员（来自 `user.role === "admin"`）
- `auth().activeOrganizationId`：当前激活组织 id（UUID 字符串）

### 扩展字段的规则

未来业务表的 policy 可能需要更多 context（例如 `auth().currentRoles`、`auth().teamIds`、`auth().memberRole`）。扩展时：

1. 在 `src/lib/auth-session.ts` 的 `AuthSessionContext.user` 类型里添加字段
2. 在 `getSessionUser(...)` 里填充（从 Better Auth session / member / team 表读）
3. 在 `src/orpc/middleware/auth.ts` 的 `authDb.$setAuth(...)` 调用里传入
4. zmodel 里才能以 `auth().<新字段>` 引用

**顺序不可颠倒**——zmodel 里引用未注入的字段会运行时报错。

---

## 禁止 / 反模式

1. **禁止**在业务表的 oRPC handler 里手写"如果 user 不是 admin 则 throw"的散乱 `if`——该用 `@@allow` / `@@deny` 代替。唯一例外：policy 表达式无法表达的非数据访问动作（如触发外部 webhook）
2. **禁止**把 Better Auth 的 `user` / `organization` / `member` / `team` 等表写进 zmodel 作为可操作模型。它们归 BA 自管，不得经由 ZenStack CRUD
3. **禁止**用 ZenStack policy 去管 Better Auth 的 API（`/admin/*` / `/organization/*`）的访问——那是 BA 插件的职责
4. **禁止**把 `hasPermission` 调用塞进每个 handler 做重复鉴权（除非是非数据层的动作）；业务表读写应该信任 ZenStack policy
5. **禁止**绕过 `authDb`（policy-enforced client）直接用 `db`（原始 client）查业务表，除了明确的管理员后门场景（需在代码里加注释说明）

---

## FAQ

**Q: 为什么不完全用 Better Auth 的 access control（statements + roles）管业务权限？**
A: Better Auth 的权限检查是"动作级"的（能不能调这个 API），没有"数据行级"和"字段级"概念。业务场景经常需要"用户只能看自己部门的订单"，这类规则只能在数据层声明。

**Q: 为什么不完全用 ZenStack policy 管身份权限？**
A: 身份层的 user / session / org / member 表由 Better Auth CLI 管，zmodel `@@ignore`，ZenStack 本来就够不到。即便够到，Better Auth 的 session 管理、邀请流、impersonate 等都是插件内置逻辑，不适合下沉到数据层。

**Q: Menu 表现在的 policy 很简单，为啥不直接写 middleware？**
A: Menu 只是本项目第一张业务表。保留 policy 风格是为**未来业务表**定标杆。写 middleware 会让团队习惯"每个 handler 自己管权限"，一旦表多了必然出漏洞。

**Q: 如果某个字段既属于身份层也属于业务层怎么办？**
A: 不会。身份层表（user / session / ...）和业务层表（Menu / Order / ...）物理分离。业务表如果要"带上用户信息"，只存 `userId: string` 外键，在查询时用 oRPC handler 拼装。

---

## 参考实现锚点

- Better Auth access control 配置：`src/lib/permissions.ts`
- Better Auth 插件装载：`src/lib/auth.ts`
- Session → auth context：`src/lib/auth-session.ts`
- `authDb.$setAuth` 调用：`src/orpc/middleware/auth.ts`
- Menu 表 policy 样本：`zenstack/schema.zmodel`
