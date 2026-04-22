# Layout Guidelines

> Admin shell layout + TanStack Router route-group / layout-nesting conventions for the TanStack Start frontend.

---

## TanStack Router Route Groups + `_layout.tsx` — 关键约定（坑区）

本项目同一个"已登录后台"布局由 `(admin)/_layout.tsx` 承载。两个独立的路由器约定合在一起决定了目录结构：

### 约定 1：`(admin)/` 是 **Route Group**

括号目录**不进入 URL**，仅用作文件系统分组。同一 app 常见要并存不同布局（登录前裸页 / 登录后后台 / 邮件模板预览...），路由组让你在**不加 URL 前缀**的情况下共享一个 `_layout`。

```
src/routes/
├── (admin)/               ← group（括号不入 URL）
├── auth/$path.tsx         → /auth/sign-in 等（裸页，不走 admin layout）
└── index.tsx              → /
```

### 约定 2：`_layout.tsx` 必须有**子目录同名伙伴** `_layout/`

这是本次任务踩过的大坑：**`_layout.tsx` 不会自动 wrap 同级 sibling 文件**。要让一组页面共享 `_layout`，它们必须作为 `_layout` 的 child —— 放在名为 `_layout/` 的子目录里。

**错误结构**（曾导致 dashboard 绕过 SidebarProvider，没有侧栏 / header）：
```
(admin)/
├── _layout.tsx
├── dashboard.tsx          ← 和 _layout.tsx 同级 → parent 是 root，不是 layout
└── settings/$path.tsx     ← 同上
```
routeTree.gen 证据：`getParentRoute: () => rootRouteImport`。

**正确结构**：
```
(admin)/
├── _layout.tsx            ← 布局文件
└── _layout/               ← 子路由容器
    ├── dashboard.tsx              → /dashboard
    ├── users/index.tsx            → /users
    ├── organization/index.tsx     → /organization
    ├── invitations/index.tsx      → /invitations
    ├── menus/index.tsx            → /menus
    └── settings/$path.tsx         → /settings/$path
```
`createFileRoute` 字符串参数要带上 `_layout` 段：
```ts
createFileRoute("/(admin)/_layout/dashboard")({ ... })
createFileRoute("/(admin)/_layout/settings/$path")({ ... })
```

等价的 flat 命名法（本项目没用，仅作参考）：`_layout.dashboard.tsx` / `_layout.settings.$path.tsx`。

### 识别症状

如果你发现页面**渲染了**但没有 Sidebar / Header / Tabbar —— 第一件事就是查 `routeTree.gen.ts` 里该 route 的 `getParentRoute` 是不是 `adminLayoutRoute`。不是就说明路由没挂到 layout 下，检查文件位置 + `createFileRoute` 的路径参数。

---

## Admin Shell 组成

`(admin)/_layout.tsx` 组合以下组件：

```tsx
<SidebarProvider>
  <AppSidebar />
  <SidebarInset>
    <header>
      <SidebarTrigger />
      <Separator orientation="vertical" />
      <div className="flex flex-1 flex-col">{/* Management title */}</div>
      <div className="flex items-center gap-2">
        <OrganizationSwitcher />    {/* 自写，切换 activeOrganizationId */}
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

Sidebar 内容不再硬编码，而是从 `orpc.getUserMenus` server handler 拉取。该 handler：
1. 读 `Menu` 表所有 `status=ACTIVE` 节点
2. 对每个带 `requiredPermission` 的节点，调 `auth.api.hasPermission({ organizationId, permissions })` 过滤
3. 返回树形结构，前端 `menuStore` 保存，`AppSidebar` 订阅渲染

**前置条件**：session 必须有 `activeOrganizationId`。参考 `backend/authorization-boundary.md` 的 "Session Active Org 自动填充" 段。

### Tabbar 同步

`_layout.tsx` 内部 `useTabSync` hook 监听 `pathname` 变化，自动把当前页加到 `tabbarStore`。tab 标题从 `menuStore` 的 `meta.title` 解析，未命中时用 pathname 末段。`/dashboard` 为不可关闭的固定 tab。

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

所有数据列表用 `#/components/data-table/data-table.tsx` 的 `<DataTable>`，统一 skeleton 加载 + 分页 + 空态。列定义走 TanStack Table `ColumnDef<T>[]`。

---

## 路径别名（`#/*`）

- 由 `package.json` 的 `imports` 字段声明（**不是** `tsconfig.json#paths`）
- 跨目录引用必须用 `#/*`，同级相对 import 可用 `./xxx`
- `import` 顺序 Biome organizeImports 自动排序

---

## Out of Scope（将来可能加的）

- 多层嵌套菜单折叠展开动画
- 面包屑（`Router.state.matches` 驱动）
- 菜单拖拽排序
- 可配置化主题色板（当前 `src/styles.css` 有 TanStack Start 模板遗留的 `--sea-ink` 等 demo 变量，应择日清理，全量切回 shadcn zinc token）
