# 身份层全栈 + 后台 shell 去 demo 化

## Goal

一次性交付 tan-admin 的完整身份层（User / Role / Menu / Permission / Tenant 全栈 CRUD + 动态侧边栏 + 多标签页导航），并把项目从"TanStack Start demo"改造成纯后台形态，对标 go-wind-admin。本任务完成后底座 RBAC 闭环 + 多租户基础 ready，后续 IoT / ERP 业务模块只需挂 `(admin)/` 下的子路由。

## Reference Projects

- `/Users/horonlee/projects/go/servora-legacys/servora-iam/web/iam/` — IAM 前端：`DataTable` / `FormDrawer` / `ConfirmDialog` / `DataState` / `Page` / `Sidebar` 可借鉴结构（不直接复制 JSX，重写时对齐到 tan-admin 的 shadcn 默认黑白主题）
- `/Users/horonlee/projects/go/tx7do/go-wind-admin/web/` — 多租户 RBAC 参考：Tabbar 交互、Tenant 管理页、菜单-权限映射配置 UI

## Scope Split — 已完成 vs 待做

### ✅ 已完成（当前 working tree 保留部分）

**Schema (`zenstack/schema.zmodel`)**
- `Tenant` 模型（多租户顶层隔离：`name/code/domain/type/status/auditStatus/adminUserId/subscriptionAt/expiredAt`）
- `Role` / `Permission` / `Menu` 加 `tenantId` 可空字段（null = 全局资源）
- `BaUser` 加 `tenantId` 字段
- `auth` 模型加 `tenantId` 字段

**Better Auth**
- `src/lib/auth.ts` 声明 `user.additionalFields.tenantId`
- `src/lib/auth-session.ts` 把 `tenantId` 透传到 `AuthSessionContext.user`

**oRPC Router (`src/orpc/router/`)**
- `tenants.ts` — Tenant CRUD + `assignTenantAdmin`
- `users.ts` — User CRUD（通过 `pool.query` 访问 Better Auth `user` 表），含 `listUsers/getUser/updateUser/disableUser/enableUser/getUserRoles`
- `user-menus.ts` — `getUserMenus` 递归拼当前用户可见菜单树（super-admin 全量，普通用户按 Role→Permission→Menu 过滤）
- `menus.ts` / `permissions.ts` / `roles.ts` / `todos.ts` — 空 input schema 改 `.optional()`，避免客户端必须传 `{}`
- `index.ts` — 注册全部新 action

**Trellis Task 基建**
- `.trellis/tasks/04-21-identity-layer/`：`task.json` + `prd.md`（本文件）

### 🚧 待做（本任务剩余工作）

全部在前端层，分以下六块：

#### 1. 后台 shell 去 demo 化

删除：
- `src/routes/index.tsx` — TanStack Start 演示首页
- `src/components/Header.tsx` / `src/components/Footer.tsx` — 公共站点页头页脚
- `src/lib/demo-store-devtools.ts` — demo store
- `src/integrations/tanstack-query/` 里的 demo 样例（保留 provider 必须文件）

重写 `src/routes/__root.tsx`：
- 只保留 html 壳 + `HeadContent` + `Scripts` + `Outlet` + `Toaster` + `TanStackDevtools` + theme 预置脚本
- 去掉 `ADMIN_PATHS` 白名单 + `Header`/`Footer` 分支
- `title` 改成项目实际名（例："Tan Admin"）

新增 `src/routes/index.tsx`（重写版）：根路径 `beforeLoad` 判 session — 已登录 redirect `/dashboard`，未登录 redirect `/login`。

#### 2. 路由守卫

`src/routes/(admin)/_layout.tsx`：
- `beforeLoad` 调用 `getSessionUser(request)` 验证 Better Auth session
- 未登录 → `throw redirect({ to: "/login" })`
- 已登录但 session 过期 → 同上

`src/routes/login.tsx`：
- 重写为 shadcn 风格登录页（去除当前可能存在的 demo 文案）
- 提交调用 `authClient.signIn.email`
- 登录成功 redirect `/dashboard`

#### 3. 动态 Sidebar（替换 hardcode 版本）

`src/components/layout/AppSidebar.tsx`：
- 从 `orpc.getUserMenus` query 拉菜单树
- 写入 `menuStore`（`src/stores/menu.ts`，TanStack Store）
- 根据树渲染二级菜单；支持 `meta.icon` 动态 icon（`ICON_MAP` 白名单，字符串→lucide 组件）
- 支持 `meta.hideInMenu` / `meta.hideChildrenInMenu`
- 加载中显示 skeleton；空菜单显示 empty state；**不要 FALLBACK_NAV 兜底 hardcode 导航**

#### 4. 多标签页 Tabbar

`src/components/layout/AppTabbar.tsx` + `src/stores/tabbar.ts`：
- tab title **从动态菜单 `meta.title` 反查**（菜单树里找当前 pathname 对应节点），不维护独立 `path→title` map
- 菜单里查不到的路径用 fallback（pathname 末段）
- 支持：点击切换 / 关闭 / 关闭其他 / 关闭右侧 / 刷新当前
- active tab 底部下划线；dropdown 支持常规操作
- dashboard 不可关闭（作为固定首页）

#### 5. 五个管理页面

路径 `src/routes/(admin)/<resource>/index.tsx`（+ 需要时拆 `columns.tsx` / `form.tsx`）：

- `/users` — 列表（分页/搜索/状态筛选）+ 新建（调 Better Auth admin API）+ 编辑（name/nickname/status/tenantId）+ 禁用/启用 + 绑定角色（UserRole）
- `/roles` — 列表 + 新建/编辑（name/code/order/parentId）+ 删除 + 配置关联权限（RolePermission 多选）
- `/menus` — 树形展示（用 DataTable 的 expandable row 或 shadcn `Tree`）+ 新建/编辑（含 icon / path / component / order / parentId / meta.title / meta.hideInMenu）
- `/permissions` — 列表 CRUD（name / code / type / status）+ 配置关联菜单（PermissionMenu 多选）
- `/tenants` — 列表 CRUD + 指派租户管理员（`assignTenantAdmin`）

#### 6. 基础组件库（`src/components/`）

- `data-table/data-table.tsx` + `data-table-pagination.tsx` — TanStack Table 封装：分页、loading skeleton、empty state、可选的 row actions 列
- `form-drawer.tsx` — shadcn `Sheet` 侧抽屉，统一新建/编辑表单容器（title / description / 内容区 / footer 按钮）
- `confirm-dialog.tsx` — shadcn `AlertDialog`，支持"输入名字二次确认"模式（删除时使用）
- 可选：`data-state.tsx`（loading / error / empty 三态包装）、`page.tsx`（页面标题 + 操作区 + 内容区容器）

## Decision (ADR-lite)

### D1. 动态侧边栏：方案 A（登录时一次性 fetch 菜单树 + TanStack Store 缓存）

**选择**：登录 / 首次进入 admin 布局时调 `getUserMenus()` 一次，结果存入 `menuStore`。Sidebar / Tabbar / 路由守卫均从 store 读。

**理由**：
- CSR 导航零额外网络开销，UX 最好
- 和参考源 servora-iam 模式一致
- 权限变更场景低频，可接受"重新登录后生效"（后续可加"刷新权限"按钮，不在本 task）

**弃用方案**：
- 方案 B（每次跳转都服务端验证）：每次导航网络请求，UX 差
- 方案 C（前端静态菜单 + 权限 code 过滤）：前端路由表和 DB 菜单两份配置难同步，违背"动态菜单"目标

### D2. Tenant 列入 Scope

**理由**：目标是 go-wind-admin 风格的纯后台，而 go-wind-admin 本身即多租户 RBAC，Tenant 是核心实体。原 PRD 将 Tenant 放 Out-of-Scope 是笔误。

### D3. Tabbar 列入 Scope

**理由**：go-wind-admin 标配；主人已确认。tab 标题从动态菜单 `meta.title` 读（避免硬编码），保证增删菜单时 tab 自动对齐。

### D4. 纯后台项目

**选择**：无公共站点（marketing / landing / 博客）页面；应用根路径 `/` 仅做登录重定向；所有业务页面挂 `(admin)/` pathless group 下。

**影响**：删除 `routes/index.tsx`（demo 首页）、`components/Header.tsx` / `Footer.tsx`（公共站点页头页脚）、`__root.tsx` 里的 `ADMIN_PATHS` 白名单分支。

### D5. 主题

**选择**：shadcn 默认黑白主题，不引入自定义色板 / gradient / 花哨特效。避免"AI 美学"。组件风格对齐 shadcn examples。

## Acceptance Criteria

### 去 demo 化
- [ ] `src/routes/index.tsx` redirect 登录态 → `/dashboard`、未登录 → `/login`
- [ ] `src/components/Header.tsx` / `Footer.tsx` / `src/lib/demo-store-devtools.ts` 已删除
- [ ] `__root.tsx` 无 `ADMIN_PATHS` 白名单、无 `Header`/`Footer` 引用
- [ ] `__root.tsx` 的 `title` 不再是 `TanStack Start Starter`

### 路由守卫
- [ ] 未登录访问任意 `(admin)/*` 路径都 redirect `/login`
- [ ] 登录成功后自动进入 `/dashboard`

### 动态 Sidebar
- [ ] Sidebar 完全由 `getUserMenus` 驱动，代码中无 hardcode 菜单数组
- [ ] 支持 `meta.icon` / `meta.hideInMenu` / `meta.hideChildrenInMenu`
- [ ] 菜单为空时显示 empty state（不兜底 hardcode 导航）
- [ ] super-admin 看到全部 ACTIVE 菜单；普通角色只看到有权限的菜单

### Tabbar
- [ ] Tab title 从动态菜单 `meta.title` 读（代码中无 `path → title` hardcode map）
- [ ] 支持关闭 / 关闭其他 / 关闭右侧 / 刷新 / active 高亮
- [ ] `/dashboard` 不可关闭

### 管理页面
- [ ] `/users` 列表 + 新建（Better Auth createUser）+ 编辑 + 禁用/启用 + 绑定角色
- [ ] `/roles` CRUD + 配置关联权限
- [ ] `/menus` 树形 CRUD（parent/children/order/icon/path/component/meta）
- [ ] `/permissions` CRUD + 配置关联菜单
- [ ] `/tenants` CRUD + 指派管理员

### 质量门禁
- [ ] `pnpm check`（Biome lint + format）全绿
- [ ] `pnpm build` 全绿
- [ ] `pnpm test`（若本任务新增 Vitest 用例）全绿
- [ ] 无 `console.log` 残留
- [ ] 无 `any` 类型（`unknown` + 收窄）

## Out of Scope

- OrgUnit / Position / Department
- 审计日志 / 操作记录
- 菜单拖拽排序（MVP 用 `order` 字段手填）
- 用户头像上传
- 密码强制重置 / 首次登录改密流程
- Tenant 切换器 UI（当前 `session.user.tenantId` 定死；super-admin 跨租户靠 `isAdmin`；后续可加）
- 完整 i18n 覆盖（paraglide 已接，保留即可；新页面文案中英混用可接受）
- 批量导入 / 导出
- 移动端适配（桌面优先）

## Technical Notes

- **User 表**：由 Better Auth 内置 Kysely 管理，`zmodel` 中 `@@ignore`；访问走 `pool.query` 或 Better Auth admin API（`auth.api.createUser` / `listUsers` / `updateUser`）
- **tenantId 传递**：`src/lib/auth.ts` 声明 additionalField，登录返回的 session.user 自带；`AuthSessionContext` 透传
- **Menu.component 字段**：对应 TanStack Router 文件路径。MVP 阶段不做动态路由注册，菜单里的 `path` 必须是已静态注册的路由；后续可扩展。
- **组件风格**：shadcn 默认；不引入 `@radix-ui/react-*` 以外的 primitive；颜色全走 CSS vars，不 hardcode hex
- **禁用项**：TanStack Start demo 里的 `components/Header.tsx` `Footer.tsx` `lib/demo-store-devtools.ts`、任何 gradient / emoji 装饰、任何 `any` 类型
