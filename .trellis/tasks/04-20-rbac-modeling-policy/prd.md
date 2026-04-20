# RBAC 建模 + PolicyPlugin 启用（T2）

> 状态：**占位**（stub PRD）。等 T1 `04-20-zenstack-v3-bootstrap` 完成、进入本 task 时再补全。

## Goal

在 T1 建好 ZenStack v3 地基之上，落地 admin 服务所需的 RBAC 数据模型与声明式访问控制：

1. **数据模型**：在 `zenstack/schema.zmodel` 新增 `User` / `Role` / `Permission` / `Menu` / `UserRole` 五张表（参考 go-wind-admin 的身份/组织/权限三个域裁剪）。注意 `User` 需与 Better Auth 管理的 auth 表**建立明确的映射关系**（复用 id 或 foreign key）。
2. **访问策略**：用 `@@allow` / `@@deny` 声明每张业务表的 RBAC 规则，替代手写 authorizer。
3. **PolicyPlugin 启用**：装 `@zenstackhq/plugin-policy`，`src/db.ts` 暴露第二个 client（`authDb = db.$use(new PolicyPlugin())`）。
4. **authed middleware 升级**：从"只校验 session"升级为"校验 session + `authDb.$setAuth(user)`"，所有 oRPC handler 拿到的 `db` 自动带策略过滤。
5. **不触碰 API 协议栈**：仍然 oRPC 单栈，所有 CRUD 继续手写过程；本 task 完成后，前端感知到的变化只有"无权限时收到 FORBIDDEN/NOT_FOUND"。

## Prerequisites

- ✅ T1 `04-20-zenstack-v3-bootstrap` 完成（ZenStackClient 就位、Better Auth 接 DB、Todo demo 接真 DB）
- ✅ 项目中已有 `@zenstackhq/orm` 和 `@zenstackhq/cli`
- ⏳ 需要确定的设计点：
  - User 表与 Better Auth `user` 表的关系（复用 id / FK 引用 / 独立双写）
  - Role 是全局的还是租户/部门范围（未来可能多租户）
  - Menu 是否在本 task 建模，还是留给后续 admin UI task

## References（以官方为准）

- ZModel 访问控制: https://zenstack.dev/docs/orm/access-control/overview
- Policy Plugin: https://zenstack.dev/docs/orm/access-control/query
- Post-update rules: https://zenstack.dev/docs/orm/access-control/post-update
- `$setAuth` API: https://zenstack.dev/docs/orm/access-control/query#setting-auth-context

## Out of Scope

- 自动 CRUD API（ZenStack Server Adapter）→ T3
- 前端 TanStack Query hooks 从 oRPC 切到 ZenStack hooks → T3
- admin 后台具体页面（User 管理、角色管理 UI）→ 独立 task
- 多租户 / 多部门隔离 → 远期

## Definition of Done

- zmodel 编译通过，`zen generate` 输出干净
- PolicyPlugin 启用后，一个未授权请求访问受保护资源会返回 `NOT_FOUND` 或 `FORBIDDEN`（按 ZenStack 错误语义）
- 单测覆盖至少 3 个策略路径（own-record、cross-user-deny、admin-override）
- spec `.trellis/spec/backend/*.md` 补充 RBAC 章节

---

> **详细 Requirements 待 T2 启动时补全。**
