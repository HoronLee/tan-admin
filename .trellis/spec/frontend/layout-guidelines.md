# Layout Guidelines

> Admin shell layout + TanStack Router route-group / layout-nesting conventions.

---

## TanStack Router Route Groups + `_layout.tsx` — 关键约定（坑区）

### 约定 1：`(workspace)/` / `(marketing)/` 是 **Route Group**

括号目录**不进入 URL**，仅用作文件系统分组。同一 app 要并存不同布局（公开站 / 超管后台 / 业务 workspace / 邮件预览...），路由组让你在**不加 URL 前缀**的情况下共享 `_layout`。若故意要 URL 前缀（例如 site-admin 想和 workspace 区分），用无括号普通目录。

```
src/routes/
├── (marketing)/            ← group，URL 不带前缀，放公开站
├── (workspace)/            ← group，URL 不带前缀，放业务面板
├── site/                   ← 无括号，URL 带 /site/ 前缀，放超管页
├── auth/$path.tsx          → /auth/sign-in 等（裸页，不走任何 layout）
```

分组策略详见 `frontend/route-organization.md`。

### 约定 2：`_layout.tsx` 必须有子目录同名伙伴 `_layout/`

**`_layout.tsx` 不会自动 wrap 同级 sibling 文件**。要让一组页面共享 `_layout`，它们必须作为 child —— 放在名为 `_layout/` 的子目录里。

```
// ❌ 错误：dashboard.tsx 和 _layout.tsx 同级 → parent 是 root
(workspace)/
├── _layout.tsx
├── dashboard.tsx          ← 绕过 SidebarProvider，没有侧栏 / header
└── settings/$path.tsx

// ✅ 正确：放在 _layout/ 子目录
(workspace)/
├── _layout.tsx            ← 布局文件
└── _layout/               ← 子路由容器
    ├── dashboard.tsx              → /dashboard
    ├── organization/index.tsx     → /organization
    ├── invitations/index.tsx      → /invitations
    ├── teams/index.tsx            → /teams
    └── settings/
        ├── $path.tsx              → /settings/<path>
        └── organization/
            ├── index.tsx          → /settings/organization
            └── menus.tsx          → /settings/organization/menus
```

`createFileRoute` 路径要带 `_layout` 段：

```ts
createFileRoute("/(workspace)/_layout/dashboard")({ ... })
createFileRoute("/(workspace)/_layout/settings/$path")({ ... })
createFileRoute("/site/_layout/users/")({ ... })  // site/ 无括号，URL 是 /site/users
```

等价 flat 命名（本项目没用，仅参考）：`_layout.dashboard.tsx` / `_layout.settings.$path.tsx`。

### 识别症状

页面**渲染了**但没有 Sidebar / Header / Tabbar —— 第一件事查 `routeTree.gen.ts` 里该 route 的 `getParentRoute` 是不是 `workspaceLayoutRoute` / `siteLayoutRoute`。不是就说明没挂到 layout 下，检查文件位置 + `createFileRoute` 的路径参数。

---

## Admin Shell 组成

**前置**：`<ThemeProvider>` 挂在 `__root.tsx` 的 `<body>` 内、`<Providers>` 外层（`<Providers>` 里 `useTheme()` 要接通 `AuthProvider appearance`）。详见 `./theming.md`。

```tsx
// (workspace)/_layout.tsx  ← 用动态菜单 AppSidebar
// site/_layout.tsx         ← 用静态菜单 AppSiteSidebar，顶部显示 "Platform Admin"
<SidebarProvider>
  <AppSidebar />  {/* 或 <AppSiteSidebar /> */}
  <SidebarInset>
    <header>
      <SidebarTrigger />
      <Separator orientation="vertical" />
      <div className="flex flex-1 flex-col">{/* Workspace / Platform Admin */}</div>
      <div className="flex items-center gap-2">
        <OrganizationSwitcher />    {/* 自写，切 activeOrganizationId */}
        <ThemeToggle />
        <UserButton />              {/* ba-ui shadcn 变体 */}
      </div>
    </header>
    <AppTabbar />                   {/* 多 tab 导航 */}
    <div className="flex-1 p-4 sm:p-6"><Outlet /></div>
  </SidebarInset>
</SidebarProvider>
```

### Sidebar 数据来源：动态菜单

Sidebar 内容从 `orpc.getUserMenus` server handler 拉取：
1. 读 `Menu` 表所有 `status=ACTIVE` 节点
2. 带 `requiredPermission` 的节点调 `auth.api.hasPermission({ organizationId, permissions })` 过滤
3. 返回树形结构，前端 `menuStore` 保存，`AppSidebar` 订阅渲染

**前置**：session 必须有 `activeOrganizationId`。见 `backend/authorization-boundary.md` "Session Active Org 自动填充"。

### Tabbar 同步

`_layout.tsx` 内 `useTabSync` hook 监听 `pathname`，自动把当前页加进 `tabbarStore`。tab 标题从 `menuStore` 的 `meta.title` 解析（通过 `resolveMenuLabel`，见 `frontend/i18n.md`），未命中时用 pathname 末段。`/dashboard` 为不可关闭的固定 tab。

### Teams 菜单 gating

`AppSidebar.getDisabledReason("/teams", gates)` 基于**当前 activeOrg 的 `plan`** 字段返回禁用原因（不再是 env flag）。`plan` 不允许 teams → 灰化 + tooltip "当前方案不支持 Team 子分组"，click no-op；允许 → 正常渲染。`AppSidebar` 顶层通过 `authClient.useActiveOrganization()` 读 plan，算好 `SidebarGates` 后传给每个 `<MenuItem>`。详见 `backend/plan-gating.md` §3 + `#/lib/plan`。

---

## 组件选择约定

### Drawer vs Dialog vs AlertDialog

| 场景 | 组件 | 封装 |
|---|---|---|
| 创建 / 编辑表单（含长表单）| `Sheet` | `#/components/form-drawer.tsx` → `<FormDrawer>` |
| 破坏性确认（删除 / ban）| `AlertDialog` | `#/components/confirm-dialog.tsx` → `<ConfirmDialog>`，支持 `requireTypedConfirm` |
| 简短信息提示 | `Dialog` | shadcn 原生 |

**为什么 destructive 走 AlertDialog**：`role="alertdialog"` 被屏幕阅读器播报为"需要立即响应的中断"，和信息型 `Dialog` 明确区分。

### DataTable

所有数据列表用 `#/components/data-table/data-table.tsx` 的 `<DataTable>`，统一 skeleton + 分页 + 空态。列定义走 TanStack Table `ColumnDef<T>[]`。

---

## 路径别名（`#/*`）

由 `package.json#imports` 声明（**不是** `tsconfig.json#paths`）。跨目录引用用 `#/*`，同级相对 import 可用 `./xxx`。`import` 顺序 Biome organizeImports 自动排。

---

## Out of Scope（将来可能加）

- 多层嵌套菜单折叠展开动画
- 面包屑（`Router.state.matches` 驱动）
- 菜单拖拽排序
