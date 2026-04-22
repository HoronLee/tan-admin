# 身份层 v2：基于 Better Auth 开源插件生态

## Goal

弃用 v1 自建的 `Tenant / UserRole / RolePermission / Role / Permission` 模型，改用 **Better Auth 开源插件生态**做身份层基础：
- `better-auth/plugins/admin` — https://better-auth.com/docs/plugins/admin
- `better-auth/plugins/organization`（**teams 开启**） — https://better-auth.com/docs/plugins/organization
- UI 库 **better-auth-ui shadcn 变体**（`@better-auth-ui/react` + `npx shadcn add`）— 仅覆盖 **auth / user-button / 个人 settings** 三个模块；**Organization / Admin / Menu 模块 ba-ui 未提供**（官方 `/docs/shadcn` 组件清单仅 Provider / User / Auth / Settings / Email），需自写 UI 调用 `authClient.organization.*` + `authClient.admin.*` + Stage 2 自研组件（DataTable / FormDrawer / ConfirmDialog）组装

**保留自建 Menu 树**（Better Auth 无此概念）。保留 v1 Stage 1/2/3 产出的前端基础设施（shell 去 demo 化 / 基础组件库 / 动态 Sidebar + Tabbar + stores）。

**项目定位已调整**：tan-admin 不再"对标 / 复刻 go-wind-admin"，它仅作为交互参照之一；新身份层基于 Better Auth 现代 IAM 生态构建。

## Context from v1（archived to `.trellis/tasks/archive/2026-04/04-21-identity-layer/`）

### ✅ v1 可复用的前端成果（working tree 已就位）
- **Stage 1**：`__root.tsx` 瘦身、`routes/index.tsx` redirect、`(admin)/_layout.tsx` session 守卫、已删 demo Header/Footer/demo-store-devtools
  - ⚠️ `login.tsx`（v1 Stage 1 自写的 shadcn 版）**将被 `<SignIn />` 替换**
  - ⚠️ `integrations/better-auth/header-user.tsx`（v1 自写 header-user）**将被 `<UserButton />` 替换**
- **Stage 2**：`components/data-table/{data-table,data-table-pagination}.tsx` + `components/form-drawer.tsx` + `components/confirm-dialog.tsx`（**全保留**）
- **Stage 3**：`stores/menu.ts` + `stores/tabbar.ts` + `components/layout/AppSidebar.tsx` + `components/layout/AppTabbar.tsx`（**全保留**）

### ⚠️ v1 需要丢弃或重写的后端成果
- `zenstack/schema.zmodel` 里的自建 `Tenant / Role / Permission / UserRole / RolePermission / PermissionMenu` 模型（**整块删**）+ `Menu.tenantId` 字段改为 `Menu.organizationId: String?`
- `src/orpc/router/tenants.ts`（整个删，改用 `auth.api.organization.*` / better-auth-ui 组件）
- `src/orpc/router/users.ts`（删 create/update/disable/enable 业务逻辑，改用 `auth.api.admin.*`）
- `src/orpc/router/roles.ts` / `permissions.ts` / `user-roles.ts`（**全删**）
- `src/lib/auth.ts` 的 `additionalFields.tenantId` 删；改为装载 admin + organization plugin（开 teams）
- `src/lib/auth-session.ts` 的 `tenantId` 字段删，改读 `session.activeOrganizationId`

### 🔒 v1 需要保留的后端成果
- `src/orpc/router/user-menus.ts`（`getUserMenus`）— **改写内部逻辑**（从"UserRole → RolePermission"改为 `organization.hasPermission` 批量判定），保留 API 形状

## Decisions（已全部敲定）

| # | 决策 | 最终 | 说明 |
|---|---|---|---|
| D1 | 自建 Role 表 | **a. 完全删** | 用 `organization.member.role`（owner/admin/member）+ Better Auth `customRoles` 扩展 |
| D2 | 自建 Permission 表 | **a. 完全删** | 用 Better Auth access control **statements DSL**（代码里静态声明，TypeScript 类型安全） |
| D3 | **better-auth-ui（shadcn 变体）** | **能用全用** | 使用 shadcn CLI 方式安装（`npx shadcn add https://better-auth-ui.com/r/{auth,settings,user-button}.json`），组件代码落地到 `src/components/{auth,settings,user}/`；Provider 本地化（`src/components/providers.tsx` + `src/components/auth/auth-provider.tsx`）；hook 从 `@better-auth-ui/react` 导入。**实际覆盖范围**：auth（`/auth/$path`）+ 个人 settings（`/settings/$path` → account / security）+ UserButton。**ba-ui shadcn 变体不提供 Organization / Admin / Menu 组件**，因此需要自写：`<OrganizationSwitcher />`（Header）+ `/organization`（资料 / 成员 / 邀请 / 团队）+ `/invitations`（我收到的邀请）+ `/users`（全站 admin 用户列表 ban/impersonate/setRole）+ `/menus`（Menu 树 CRUD）。自写组件全部复用 Stage 2 的 DataTable / FormDrawer / ConfirmDialog |
| D4 | Organization `teams` | **a. 开启** | `teams: { enabled: true }`；避免未来迁移痛 |
| D5 | 审计日志 | **b. 推迟** | 本 task 不做；未来新 task 评估"自建 AuditLog + ZenStack hooks" 或成熟库 |
| D6 | 迁移策略 | **a. Drop + 重建** | dev 无生产数据；`db:reset` → zmodel 重写 → `db:migrate` + `auth:migrate` → `db:seed` |
| D7 | 菜单鉴权规则 | **a. `hasPermission`** | `Menu.requiredPermission: String?`（单个能力 key，如 `"user:read"`）；`getUserMenus` 批量调 `organization.hasPermission` 过滤 |
| D8 | 多租户字段 | **a. `organizationId: String?`** | Better Auth organization id 是 UUID 字符串；Menu 表作为软关联（BA organization 表 zmodel `@@ignore`） |

## Scope

### 后端
1. **Better Auth 装插件**（`src/lib/auth.ts`）：
   - `admin()` — 管理员 API（createUser / listUsers / banUser / impersonateUser / setRole）
   - `organization({ teams: { enabled: true } })` — 组织 / 团队 / 成员 / 邀请
   - 配置 Better Auth access control **`statements`**：声明完整能力清单（如 `user:read|write|delete`、`menu:read|write`、`organization:read|write`）
   - 配置 `roles`：内置 owner/admin/member 映射到 statements 的不同子集
   - `additionalFields.nickname/avatar/status` 保留
2. **Schema 清理**（`zenstack/schema.zmodel`）：
   - **删**：`Tenant / Role / Permission / UserRole / RolePermission / PermissionMenu` 六个模型
   - **保**：`Menu`（字段调整：`tenantId → organizationId: String?`、新增 `requiredPermission: String?`；删 `PermissionMenu[]` 关系）
   - **保**：`BaUser`（`@@ignore`）+ auth 模型（删 `tenantId`）
3. **oRPC router 清理**（`src/orpc/router/`）：
   - **删**：`tenants.ts` / `roles.ts` / `permissions.ts` / `user-roles.ts` / `users.ts`（admin 用户列表在 Stage 业务页里用 `auth.api.admin.listUsers` 直接封装为一个小 action 即可）
   - **保并重写**：`user-menus.ts` — `getUserMenus` 内部改用 `organization.hasPermission` 批量判定
   - **保**：`menus.ts` — Menu CRUD
4. **客户端 API 层**：`src/lib/auth-client.ts` 装 `adminClient()` + `organizationClient()` plugins
5. **数据库重置**：drop 所有表 → 重跑 `db:migrate` + `auth:migrate` → `db:seed` 创建默认 organization + 超管账号 + 默认 menu 树

### 前端
1. **better-auth-ui shadcn 变体接入**：
   - `src/components/providers.tsx` 顶层包装 `<AuthProvider>`（来自 `src/components/auth/auth-provider.tsx`，shadcn add 落地），注入 `authClient` / `navigate` / `Link` / `redirectTo`
   - `__root.tsx` 的 `RootDocument` 内挂 `<Providers>`
2. **替换 v1 Stage 1 的自写部分**：
   - 删 `src/routes/login.tsx`；新建 `src/routes/auth/$path.tsx` 用 `<Auth path={path} />`（自动处理 sign-in / sign-up / sign-out / forgot-password / reset-password / magic-link 所有子路径）
   - 删 `src/integrations/better-auth/header-user.tsx`；`(admin)/_layout.tsx` Header 用 `<UserButton size="icon" themeToggle={false} align="end" />`
3. **个人 Settings 页面**（ba-ui 现成）：
   - `src/routes/(admin)/settings/$path.tsx` → `<Settings path={path} />`，viewPaths 校验 `account` / `security`
   - 菜单 `/settings` seed path 指向 `/settings/account`（匹配 ba-ui 默认 basePaths）
4. **组织模块自写**（ba-ui 无对应组件）：
   - Header 自写 `<OrganizationSwitcher />`：`useListOrganizations()` + `authClient.organization.setActive()` 下拉切换
   - `src/routes/(admin)/organization/index.tsx` → 组织资料卡（`organization.update/delete`）+ 成员 DataTable（`organization.listMembers` + inviteMember Drawer / updateMemberRole / removeMember ConfirmDialog）+ Team 子模块（PRD D4 开了 teams）
   - `src/routes/(admin)/invitations/index.tsx` → 我收到的邀请（`organization.listUserInvitations` + accept/reject）
5. **全站管理员用户管理自写**（ba-ui 无对应组件）：
   - `src/routes/(admin)/users/index.tsx` → DataTable 展示 `authClient.admin.listUsers`，操作列 banUser / impersonateUser / setRole（ConfirmDialog）
   - URL 路径统一用 `/users`（不是 `/admin/users`）—— `(admin)` 是 TanStack Router 路由组，括号不进入 URL；菜单 path 保持短
6. **Menu 管理自写**：
   - `src/routes/(admin)/menus/index.tsx` → Menu 树形 CRUD（DataTable + FormDrawer + ConfirmDialog，复用 Stage 2 组件）
7. **动态 Sidebar 接入新鉴权**：
   - `src/orpc/router/user-menus.ts` 改写后，前端 `menuStore` / `AppSidebar` **零改动**（API 形状保持）
   - ⚠️ `databaseHooks.session.create.before` 必须配：新用户登录后自动把 member 表里最早的 org 设为 `session.activeOrganizationId`，否则 `hasPermission` 永远 false，所有带 `requiredPermission` 的菜单全被过滤掉
8. **Dashboard 页保留不动**。

### Seed 数据
- 1 个默认 organization（name: "Default Organization", slug: `default`）
- 1 个超管（`user.role = "admin"` for admin plugin + `member.role = "owner"` in default org），email/password 由 `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD` env 注入
- 默认扁平 Menu 树（无 `/admin` catalog 前缀，因 `(admin)` 是路由组，括号不入 URL）：
  - `/dashboard`（无 permission）
  - `/users`（`user:read`）
  - `/organization`（`organization:read`）
  - `/menus`（`menu:write`）
  - `/settings/account`（无 permission，指向 ba-ui Settings 默认第一个 tab）
- Menu 表每次 seed 前 `TRUNCATE ... CASCADE`（菜单骨架全量重建，避免老路径残留）

## Acceptance Criteria

### 插件与配置
- [ ] `src/lib/auth.ts` 已装 `admin()` + `organization({ teams: { enabled: true } })` 两个插件
- [ ] Better Auth `statements` 完整声明能力清单；`roles` 映射到 owner/admin/member
- [ ] `src/lib/auth-client.ts` 装 `adminClient()` + `organizationClient()`
- [ ] 顶层 `AuthUIProvider` 已接入 TanStack Router

### Schema & 迁移
- [ ] `zenstack/schema.zmodel` 删除 6 个自建模型；Menu 改为 `organizationId: String?` + `requiredPermission: String?`
- [ ] `pnpm db:reset` + `pnpm db:migrate` + `pnpm auth:migrate` 全成功
- [ ] `pnpm db:seed` 成功，默认 organization + 超管 + menu 树就位

### 后端 router
- [ ] 删除 `tenants.ts` / `roles.ts` / `permissions.ts` / `user-roles.ts` / `users.ts`
- [ ] `user-menus.ts` 使用 `organization.hasPermission` 批量判定
- [ ] `src/orpc/router/index.ts` 同步更新

### 前端
- [ ] `/auth/sign-in` 使用 `<Auth path="sign-in" />`（登录成功跳 `/dashboard`）
- [ ] Header 区域显示 `<UserButton />` + 自写 `<OrganizationSwitcher />`
- [ ] `/settings/$path` 使用 `<Settings path={path} />`（account / security tabs）
- [ ] `/organization` 自写：组织资料 + 成员 DataTable + 邀请 Drawer
- [ ] `/invitations` 自写：我收到的邀请列表 + accept/reject
- [ ] `/users` 自写（注意不是 `/admin/users`，`(admin)` 是路由组）：`authClient.admin.*` API + DataTable + ConfirmDialog 完成列表 / ban / setRole / impersonate
- [ ] `/menus` 自写：DataTable + FormDrawer + ConfirmDialog 完成 Menu 树 CRUD
- [ ] Sidebar 按 `organization.hasPermission` 过滤菜单，且 `databaseHooks.session.create.before` 已配置自动 active org
- [ ] 未登录访问 `(admin)/*` redirect `/auth/sign-in`

### 质量门禁
- [ ] `pnpm check` 全绿
- [ ] `pnpm build` 全绿
- [ ] 无 `console.log` 残留
- [ ] 无 `any` 类型（`unknown` + 收窄）
- [ ] 所有 import 走 `#/*` 别名

## Out of Scope

- SSO / SAML / SCIM 插件（开源可用，未来企业接入时加）
- Two-Factor / Passkey / Magic Link 登录方式
- Better Auth Infrastructure 付费服务（Dash / Sentinel / 托管 Email SMS）
- 菜单拖拽排序
- 审计日志系统（见 D5，新 task 做）
- 批量导入 / 导出
- 移动端适配（桌面优先）

## Technical Notes

### 关键 URL
- Better Auth admin plugin: https://better-auth.com/docs/plugins/admin
- Better Auth organization plugin: https://better-auth.com/docs/plugins/organization
- Better Auth access control / statements: https://better-auth.com/docs/plugins/organization#access-control
- Better Auth UI: https://better-auth-ui.com/
- Better Auth UI TanStack Start 集成: https://better-auth-ui.com/docs/integrations/tanstack-start
- Better Auth UI Organizations guide: https://better-auth-ui.com/advanced/organizations

### 核心代码骨架（供 implement 参考）

`src/lib/auth.ts`：
```ts
import { admin, organization } from "better-auth/plugins";
import { ac, owner, adminRole, member } from "./permissions"; // 见下

export const auth = betterAuth({
  database: pool,
  emailAndPassword: { enabled: true },
  plugins: [
    admin(),
    organization({
      ac,
      roles: { owner, admin: adminRole, member },
      teams: { enabled: true },
    }),
    tanstackStartCookies(),
  ],
  user: {
    additionalFields: {
      nickname: { type: "string", required: false },
      avatar: { type: "string", required: false },
      status: { type: "string", defaultValue: "ACTIVE" },
    },
  },
});
```

`src/lib/permissions.ts`（新建，定义 statements + roles）：
```ts
import { createAccessControl } from "better-auth/plugins/access";

const statement = {
  user: ["read", "write", "delete"],
  menu: ["read", "write", "delete"],
  organization: ["read", "write", "delete"],
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
  user: ["read", "write", "delete"],
  menu: ["read", "write", "delete"],
  organization: ["read", "write", "delete"],
});
export const adminRole = ac.newRole({
  user: ["read", "write"],
  menu: ["read", "write"],
  organization: ["read"],
});
export const member = ac.newRole({
  user: ["read"],
  menu: ["read"],
  organization: ["read"],
});
```

`src/components/providers.tsx`（shadcn 变体，S3 实现）：
```tsx
import { Link, useNavigate } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { authClient } from "#/lib/auth-client";
import { AuthProvider } from "#/components/auth/auth-provider"; // shadcn add 生成

export function Providers({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  return (
    <AuthProvider
      authClient={authClient}
      appearance={{ theme, setTheme }}
      navigate={navigate}
      Link={Link}
      redirectTo="/dashboard"
    >
      {children}
    </AuthProvider>
  );
}
```
- 安装：`npx shadcn@latest add https://better-auth-ui.com/r/auth.json` + `.../r/settings.json`
- hook：`useAuthenticate` from `@better-auth-ui/react`
- 路由：`/auth/$path`（sign-in / sign-up / sign-out / forgot-password / reset-password / magic-link）+ `/settings/$path`（account / security）
- 参考：https://better-auth-ui.com/docs/shadcn/integrations/tanstack-start

### 私有化部署约束
- 不使用 `@better-auth/infra` 包（付费 SaaS）
- 所有认证、授权、审计数据保存在自有 PostgreSQL

### `getUserMenus` 新实现逻辑
```ts
// 伪代码
const menus = await db.menu.findMany({ where: { status: "ACTIVE" } });
const visible = await Promise.all(
  menus.map(async (m) => {
    if (!m.requiredPermission) return m;
    const [resource, action] = m.requiredPermission.split(":");
    const { data: allowed } = await authClient.organization.hasPermission({
      permissions: { [resource]: [action] },
    });
    return allowed ? m : null;
  }),
);
return buildTree(visible.filter(Boolean));
```
（实际实现用 server 端 API，不走 authClient；具体签名以 Better Auth 文档为准）
