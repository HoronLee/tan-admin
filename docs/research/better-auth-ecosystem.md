# Better Auth 开源生态 — 本 task 的技术参考

**定位更新**：tan-admin 不再"对标 go-wind-admin TS 复刻"。身份层完全基于 Better Auth 开源插件 + 社区 UI 库构建。go-wind-admin 仅在"后台交互模式 / 菜单组织"等前端微观处作为参考。

## 1. Better Auth 核心插件（开源，免费，自建）

### admin plugin
- URL: https://better-auth.com/docs/plugins/admin
- 提供 API:
  - `authClient.admin.createUser({ email, password, name, role, data })` — 管理员创建用户
  - `authClient.admin.listUsers({ query })` — 用户列表（支持 filter/sort/pagination）
  - `authClient.admin.setRole({ userId, role })` — 修改用户角色
  - `authClient.admin.banUser({ userId, banReason, banExpiresIn })` — 封禁用户
  - `authClient.admin.unbanUser({ userId })` — 解封
  - `authClient.admin.impersonateUser({ userId })` — 以该用户身份登录（session.impersonatedBy 记录谁在 impersonate）
- 扩展 schema 字段：`user.role / banned / banReason / banExpires / session.impersonatedBy`

### organization plugin
- URL: https://better-auth.com/docs/plugins/organization
- 提供概念：Organization / Member / Invitation / Team（可选）
- 客户端 API：
  - `authClient.organization.create({ name, slug, logo })`
  - `authClient.organization.setActive({ organizationId })` — 切换活跃组织
  - `authClient.organization.inviteMember({ email, role, teamId? })`
  - `authClient.organization.acceptInvitation({ invitationId })`
  - `authClient.organization.updateMemberRole({ memberId, role })`
  - `authClient.organization.hasPermission({ permissions: { resource: [action] } })` — **菜单鉴权核心 API**
- React hooks：
  - `authClient.useListOrganizations()`
  - `authClient.useActiveOrganization()`
- Lifecycle hooks（`organizationHooks`）：`beforeCreateInvitation` / `afterAcceptInvitation` 等（未来审计日志可挂）
- **Teams 开启**：`organization({ teams: { enabled: true } })` —— schema 新增 `team / teamMember` 表
- **Access Control DSL**：
  ```ts
  import { createAccessControl } from "better-auth/plugins/access";
  const statement = { user: ["read", "write"], menu: ["read", "write"] } as const;
  export const ac = createAccessControl(statement);
  export const admin = ac.newRole({ user: ["read", "write"], menu: ["read", "write"] });
  ```

## 2. `@daveyplate/better-auth-ui`（社区 UI，MIT，开源）

- npm: `@daveyplate/better-auth-ui`（最新 v3.4.0，2026-03 发布）
- 基于 shadcn/ui + HeroUI
- GitHub: https://github.com/daveyplate/better-auth-ui（★ 1.5k+，50+ contributors）

### 覆盖的 UI 组件
| 类型 | 组件 | 说明 |
|---|---|---|
| 认证 | `<SignIn />` `<SignUp />` `<ForgotPassword />` | 登录 / 注册 / 找回密码 |
| 用户 | `<UserButton />` `<SettingsCards />` | Header 头像菜单 + 用户自助设置 |
| 组织 | `<OrganizationSwitcher />` | 组织切换器（可隐藏 personal account） |
| 组织 | `<OrganizationSettingsCards />` | 组织信息 / 设置管理 |
| 组织 | `<OrganizationMembersCard />` | 成员列表 + 邀请 + 改角色 + 移除 |
| 组织 | 邀请接收 flow 页面 | 用户接受 / 拒绝邀请 |

### TanStack Start 集成
```tsx
import { AuthUIProvider } from "@daveyplate/better-auth-ui/tanstack";

<AuthUIProvider
  authClient={authClient}
  navigate={(href) => router.navigate({ href })}
  replace={(href) => router.navigate({ href, replace: true })}
  Link={({ href, ...props }) => <Link to={href} {...props} />}
  organization={{ logo: true, customRoles: [...] }}
>
  {children}
</AuthUIProvider>
```
- URL: https://better-auth-ui.com/docs/integrations/tanstack-start

### **better-auth-ui 不覆盖**（必须自写）
- **Admin 视角的用户列表**（管理员看全站用户 + banUser/setRole/impersonate）—— 因为 better-auth-ui 的 SettingsCards 是"用户自助"视角
- **Menu 管理**（业务层概念，不属于 auth 领域）

自写这两块用 v1 Stage 2 基础组件：`DataTable` + `FormDrawer` + `ConfirmDialog`。

## 3. 付费服务（**私有化部署禁用**）

为澄清目的列出；本 task **不使用**：

- `@better-auth/infra` 的 `dash()` —— 托管 Dashboard，数据发送 better-auth.com
- `@better-auth/infra` 的 `sentinel()` —— 托管 Security（credential stuffing / bot / impossible travel），pro plan+
- Infrastructure Email / SMS 托管
- Enterprise：log drains / role-based dashboard access

开源替代：
- Sentinel 的能力用 `better-auth/plugins/captcha` + `better-auth/plugins/have-i-been-pwned` + BA 内置 rate limiting 组合
- 审计日志：自建 `AuditLog` 表 + ZenStack hooks（本 task 推迟到未来 task）

## 4. v1 产出复用 / 丢弃对照

### ✅ 保留
- Stage 1 非 auth 相关部分：`__root.tsx` / `routes/index.tsx` / `(admin)/_layout.tsx` 的 session 守卫 / demo 清理
- Stage 2 全部：DataTable / FormDrawer / ConfirmDialog（自写页面必用）
- Stage 3 全部：`menuStore` / `tabbarStore` / `AppSidebar` / `AppTabbar`
- 后端：`src/orpc/router/user-menus.ts`（**内部逻辑重写**，API 形状保持）、`src/orpc/router/menus.ts`

### ❌ 丢弃或替换
| v1 产物 | 状态 | 替代 |
|---|---|---|
| `src/routes/login.tsx`（Stage 1 自写） | 替换 | `<SignIn />` |
| `src/integrations/better-auth/header-user.tsx`（自写） | 替换 | `<UserButton />` |
| 自建 `Tenant / Role / Permission / UserRole / RolePermission / PermissionMenu` 六个 zmodel | 删 | Better Auth 原生 |
| `src/orpc/router/tenants.ts` / `users.ts` / `roles.ts` / `permissions.ts` / `user-roles.ts` | 删 | `authClient.admin.*` / `authClient.organization.*` |
| `Menu.tenantId: Int?` | 改 | `Menu.organizationId: String?`（BA UUID） |
| `Menu.permissionMenus[]` + `Permission` 关系 | 删 | `Menu.requiredPermission: String?`（单字段） |

## 5. go-wind-admin 的定位

**仅作为**：
- 菜单信息架构的参考（"用户管理 / 角色 / 权限 / 菜单 / 租户"的菜单分组）
- Tabbar 交互 UX 的参考（已由 Stage 3 `AppTabbar` 消化）

**不再是**：
- 数据模型的模仿对象（RBAC 六表结构已抛弃）
- 技术栈的 TS 移植目标
