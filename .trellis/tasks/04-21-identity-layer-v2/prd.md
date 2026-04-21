# 身份层 v2：基于 Better Auth 开源插件生态

## Goal

弃用 v1 自建的 `Tenant / UserRole / RolePermission / Role / Permission` 模型，改用 **Better Auth 开源插件生态**做身份层基础：
- `better-auth/plugins/admin` — https://better-auth.com/docs/plugins/admin
- `better-auth/plugins/organization`（**teams 开启**） — https://better-auth.com/docs/plugins/organization
- UI 库 `@daveyplate/better-auth-ui` — 所有"能用的"预制组件全部接入

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
| D3 | **better-auth-ui（shadcn 变体）** | **能用全用** | 使用 shadcn CLI 方式安装（`npx shadcn add https://better-auth-ui.com/r/{auth,settings}.json`），组件代码落地到项目 `src/components/auth/` / `settings/`；Provider 本地化（`src/components/auth/auth-provider.tsx`）；hook 从 `@better-auth-ui/react` 导入。覆盖：auth（`/auth/$path` 动态路由）/ settings / 组织相关卡片；**只自写** Admin 用户列表（ban/impersonate）+ Menu 管理 |
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
1. **`@daveyplate/better-auth-ui` 接入**：
   - 顶层 Provider：`AuthUIProvider from "@daveyplate/better-auth-ui/tanstack"` 包住 Router；注入 `authClient` / `Link` / `navigate` / `replace`
   - 配置 `organization: { logo: true, customRoles: [...] }`（如需）
2. **替换 v1 Stage 1 的自写部分**：
   - `src/routes/login.tsx` → 用 `<SignIn />`（可扩展到独立的 `/signup` / `/forgot-password`）
   - `src/integrations/better-auth/header-user.tsx` → 用 `<UserButton />`
   - `(admin)/_layout.tsx` 的 header 增加 `<OrganizationSwitcher />`
3. **新 Settings 页面**：
   - `src/routes/(admin)/settings/index.tsx` → `<SettingsCards />`（用户自助）
   - `src/routes/(admin)/organization/index.tsx` → `<OrganizationSettingsCards />` + `<OrganizationMembersCard />`
   - `src/routes/(admin)/invitations/index.tsx` → Accept invitation / pending invitations 列表
4. **自写管理页面**（用 Stage 2 组件）：
   - `src/routes/(admin)/admin/users/index.tsx` → 管理员用户列表（`authClient.admin.listUsers`）+ banUser / impersonateUser / setRole 操作（DataTable + ConfirmDialog）
   - `src/routes/(admin)/menus/index.tsx` → Menu 树形 CRUD（DataTable + FormDrawer + ConfirmDialog）
5. **动态 Sidebar 接入新鉴权**：
   - `src/orpc/router/user-menus.ts` 改写后，前端 `menuStore` / `AppSidebar` **零改动**（API 形状保持）
6. **Dashboard 页保留不动**。

### Seed 数据
- 1 个默认 organization（name: "Default Org"）
- 1 个超管（role: `admin` 或 `owner`），email 同 v1 `admin@example.com`
- 默认 Menu 树：Dashboard / 用户管理（admin/users）/ 组织（organization）/ 菜单（menus）/ 设置（settings）
- 每个菜单节点挂对应的 `requiredPermission`（如 `admin:read` / `menu:write`）

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
- [ ] `/login` 使用 `<SignIn />`（登录成功跳 `/dashboard`）
- [ ] Header 区域显示 `<UserButton />` + `<OrganizationSwitcher />`
- [ ] `/settings` 使用 `<SettingsCards />`
- [ ] `/organization` 使用 `<OrganizationSettingsCards />` + `<OrganizationMembersCard />`
- [ ] `/admin/users` 使用自写表格 + `authClient.admin.*` API 完成列表 / ban / setRole
- [ ] `/menus` 使用自写表格 + FormDrawer + ConfirmDialog 完成 Menu 树 CRUD
- [ ] Sidebar 按 `organization.hasPermission` 过滤菜单
- [ ] 未登录访问 `(admin)/*` redirect `/login`

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
