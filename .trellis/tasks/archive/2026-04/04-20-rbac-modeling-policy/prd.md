# RBAC 建模 + PolicyPlugin 启用（T2）

> 状态：**活跃**（设计完成，待实现）

## Goal

在 T1 建好 ZenStack v3 地基之上，落地 admin 服务所需的 **完整 RBAC 数据模型** 与 **声明式访问控制**：

1. **数据模型**：在 `zenstack/schema.zmodel` 新增 6 张业务表 + 3 张关联表 + 1 个 Typed JSON 类型（参考 go-wind-admin 的身份/权限/资源三个域）。**不新建 User 表**，用户数据由 Better Auth `user` 表 + `additionalFields` 承载。
2. **访问策略**：用 `@@allow` / `@@deny` 声明每张业务表的 RBAC 规则，替代手写 authorizer。
3. **PolicyPlugin 启用**：装 `@zenstackhq/plugin-policy`，`src/db.ts` 暴露带策略的 client（`authDb = db.$use(new PolicyPlugin())`）。
4. **authed middleware 升级**：从"只校验 session"升级为"校验 session + `authDb.$setAuth(user)`"，所有 oRPC handler 拿到的 `db` 自动带策略过滤。
5. **oRPC RBAC router**：新增角色/权限/菜单的 CRUD oRPC handler，消费 authDb。
6. **Seed 数据**：内置 super-admin 角色 + 基础权限 + 系统菜单种子数据。
7. **不触碰 API 协议栈**：仍然 oRPC 单栈。

## Prerequisites

- ✅ T1 `04-20-zenstack-v3-bootstrap` 完成（ZenStackClient 就位、Better Auth 接 DB、Todo demo 接真 DB）
- ✅ 项目中已有 `@zenstackhq/orm` 和 `@zenstackhq/cli`

## 设计决策（已收敛）

### D1: User 表策略 — Better Auth `additionalFields`

**不在 zmodel 中建 User 表**。用 Better Auth 的 `additionalFields` 扩展 `user` 表：

```ts
// src/lib/auth.ts
user: {
  additionalFields: {
    nickname: { type: "string", required: false },
    avatar:   { type: "string", required: false },
    status:   { type: "string", defaultValue: "ACTIVE" }, // ACTIVE | DISABLED
  }
}
```

Better Auth 管 `user` / `session` / `account` / `verification` 四张表，ZenStack 管业务表。两者共享同一 `pg.Pool`。

RBAC 关联表 `UserRole` 通过 `userId String`（Better Auth user.id）建立关联，**不用 zmodel 外键**（因为 user 表不在 zmodel 中），在应用层保证引用完整性。

### D2: 角色与权限 — 全局单租户，预留多租户扩展

当前为**单租户全局角色**。未来扩展多租户时：
- 每张表加 `tenantId` 列
- 定义 `abstract model TenantScoped { tenantId String?; @@deny('all', auth().organizationId != tenantId) }`
- 业务表 `extends TenantScoped`
- Better Auth 启用 Organization plugin

**当前不加 tenantId，不影响未来扩展。**

### D3: Menu meta — ZenStack Typed JSON

Menu 的路由元信息（title、icon、hideInMenu 等 23 个前端消费字段）使用 ZenStack **Typed JSON**：

```zmodel
type MenuMeta {
  title                    String?
  icon                     String?
  activeIcon               String?
  activePath               String?
  order                    Int?
  affixTab                 Boolean?
  affixTabOrder            Int?
  authority                String[]
  badge                    String?
  badgeType                String?    // "dot" | "normal"
  badgeVariants            String?    // "default" | "destructive" | "primary" | "success" | "warning"
  hideChildrenInMenu       Boolean?
  hideInBreadcrumb         Boolean?
  hideInMenu               Boolean?
  hideInTab                Boolean?
  iframeSrc                String?
  ignoreAccess             Boolean?
  keepAlive                Boolean?
  link                     String?
  maxNumOfOpenTab          Int?
  menuVisibleWithForbidden Boolean?
  openInNewWindow          Boolean?
}
```

存储为 PostgreSQL `jsonb` 列，ZenStack 提供 TypeScript 类型 + Zod 运行时校验。扩展字段只改 `type MenuMeta`，无需 DB 迁移。

### D4: 前端管理面板 — 不在本 task 范围

本 task 只做数据层 + API 层。admin UI 页面拆为独立 task：
- T-shell: Layout 骨架移植（sidebar/header/tabbar，可借鉴 servora-iam）
- T-admin-ui: RBAC 管理页面（用户/角色/权限/菜单 CRUD），消费本 task 的 API

## 数据模型设计

### Auth Context

```zmodel
type Auth {
  userId String @id
  // 未来多租户扩展点：
  // organizationId   String?
  // organizationRole String?
  @@auth
}
```

### 核心表（6 张）

| 模型 | 说明 | 关键字段 |
|------|------|---------|
| **Role** | 角色（支持层级） | id, name, code(unique), description, parentId(自引用), status, order |
| **Permission** | 权限标识 | id, name, code(unique), description, type(MENU/BUTTON/API), status |
| **Menu** | 菜单/路由树 | id, type(CATALOG/MENU/BUTTON/EMBEDDED/LINK), name(unique), path, component, redirect, alias, meta(@json MenuMeta), parentId(自引用), status, order |
| **UserRole** | 用户-角色关联 | userId(BA user.id), roleId |
| **RolePermission** | 角色-权限关联 | roleId, permissionId |
| **PermissionMenu** | 权限-菜单关联 | permissionId, menuId |

### 枚举

```zmodel
enum MenuType {
  CATALOG
  MENU
  BUTTON
  EMBEDDED
  LINK
}

enum PermissionType {
  MENU
  BUTTON
  API
}

enum Status {
  ACTIVE
  DISABLED
}
```

### 访问策略概要

| 模型 | 读 | 写 | 策略逻辑 |
|------|----|----|---------|
| Role | 所有登录用户 | super-admin | `@@allow('read', auth() != null)` / `@@allow('all', hasSuperAdmin())` |
| Permission | 所有登录用户 | super-admin | 同上 |
| Menu | 所有登录用户 | super-admin | 同上；读取时可根据 status 过滤 |
| UserRole | 自己的记录可读 | super-admin | `@@allow('read', userId == auth().userId)` |
| RolePermission | 所有登录用户 | super-admin | 同 Role |
| PermissionMenu | 所有登录用户 | super-admin | 同 Role |

> `hasSuperAdmin()` 通过检查当前用户是否关联了 code="super-admin" 的角色实现。具体实现方式需根据 ZenStack v3 的策略表达能力调整（可能需要 relation 遍历或辅助字段）。

## 实现计划

### Phase 1: 数据模型 + PolicyPlugin

1. `zenstack/schema.zmodel` 新增所有表 + 类型 + 枚举 + 策略
2. `zen generate` 产出 TS 类型
3. 安装 `@zenstackhq/plugin-policy`
4. `src/db.ts` 导出 `authDb = db.$use(new PolicyPlugin())`
5. DB migrate（`pnpm db:push` 或 `db:migrate`）

### Phase 2: Middleware 升级

1. `src/orpc/middleware/auth.ts`：注入 `authDb.$setAuth({ userId: user.id })` 到 context
2. 所有 oRPC handler 从 context 拿 `authDb` 而非裸 `db`

### Phase 3: oRPC RBAC Router

1. `src/orpc/router/roles.ts` — Role CRUD
2. `src/orpc/router/permissions.ts` — Permission CRUD
3. `src/orpc/router/menus.ts` — Menu CRUD（含树形查询）
4. `src/orpc/router/user-roles.ts` — 用户-角色关联管理
5. `src/orpc/router/index.ts` 注册新路由

### Phase 4: Seed + 测试

1. `src/seed.ts` 扩展：插入 super-admin 角色 + 基础权限 + 系统菜单
2. 单测覆盖策略路径：
   - own-record 读取（UserRole 自己的）
   - cross-user-deny（非 admin 尝试写 Role）
   - admin-override（super-admin 写所有表）
   - 未登录用户全拒绝
3. Better Auth `additionalFields` 迁移测试

## References

- ZModel 访问控制: https://zenstack.dev/docs/orm/access-control/overview
- Policy Plugin: https://zenstack.dev/docs/orm/access-control/query
- Post-update rules: https://zenstack.dev/docs/orm/access-control/post-update
- `$setAuth` API: https://zenstack.dev/docs/orm/access-control/query#setting-auth-context
- Better Auth additionalFields: https://www.better-auth.com/docs/concepts/database#additional-fields
- go-wind-admin 参考: https://github.com/tx7do/go-wind-admin

## Out of Scope

- admin 后台 UI 页面（用户/角色/权限/菜单管理页面）→ 独立 task
- Layout 骨架（sidebar/header/tabbar）→ 独立 task
- 多租户 / 多部门隔离 → 远期（D2 已预留扩展路径）
- ZenStack Server Adapter / 自动 CRUD hooks → 见下方"T3 评估"

## Definition of Done

- [ ] zmodel 编译通过，`zen generate` 输出干净
- [ ] DB schema 与 zmodel 一致（`db:push` 成功）
- [ ] PolicyPlugin 启用，未授权请求返回 `NOT_FOUND` 或 `FORBIDDEN`
- [ ] Better Auth `additionalFields`（nickname, avatar, status）生效
- [ ] oRPC RBAC router 可调通（role/permission/menu CRUD）
- [ ] Seed 数据包含 super-admin 角色 + 基础权限 + 系统菜单
- [ ] 单测覆盖 ≥4 个策略路径（own-record、cross-user-deny、admin-override、unauthenticated）
- [ ] spec `.trellis/spec/backend/*.md` 补充 RBAC 章节
