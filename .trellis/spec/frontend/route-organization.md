# Route Organization

> Executable contract for 路由分组 + 权限 gating。三组职责分明：公开站（`(marketing)/`）、超管后台（`site/`，URL 带前缀）、业务 workspace（`(workspace)/`）。加上 `auth/` 裸页。

---

## 1. Scope / Trigger

Triggers when work touches:

- `src/routes/` 下任何新建 / 挪位 / 删除路由文件
- `createFileRoute("/(admin)/...")`（这是旧的，遇到要迁）
- `beforeLoad` 权限 gating 函数（`requireSiteAdmin` / `requireOrgMemberRole`）
- `src/routes/(workspace)/_layout.tsx` / `src/routes/site/_layout.tsx` / `src/routes/(marketing)/index.tsx`
- 加新的路由组或 URL 前缀规则

TanStack Router 的 `_layout.tsx` 嵌套细节见 `frontend/layout-guidelines.md` §TanStack Router 章节（那是地基）。本 spec 专注 **分组策略**。

---

## 2. Signatures

### 目录结构

```
src/routes/
├── __root.tsx
├── auth/                           # 裸页层（无 shell）
│   └── $path.tsx                   # /auth/sign-in / /auth/sign-up / 等
├── onboarding.tsx                  # 裸页（无 shell）：workspace guard 兜底 → /onboarding
├── (marketing)/                    # 括号组：URL 不带前缀
│   └── index.tsx                   # → /
├── site/                           # 无括号：URL 带 /site/ 前缀
│   ├── _layout.tsx                 # 用 AppSiteSidebar（静态菜单）
│   └── _layout/
│       ├── users/index.tsx         # → /site/users
│       ├── organizations/index.tsx # → /site/organizations
│       └── metrics/index.tsx       # → /site/metrics（占位）
├── (workspace)/                    # 括号组：URL 不带前缀
│   ├── _layout.tsx                 # 用 AppSidebar（动态菜单）
│   └── _layout/
│       ├── dashboard.tsx           # → /dashboard
│       ├── invitations/index.tsx   # → /invitations
│       ├── organization/           # → /organization（member 管理，临时位置）
│       ├── teams/index.tsx         # → /teams
│       └── settings/
│           ├── $path.tsx           # → /settings/<path>
│           └── organization/
│               ├── index.tsx       # → /settings/organization（general）
│               └── menus.tsx       # → /settings/organization/menus（owner-only）
├── api/                            # server-only
├── api.$.ts
├── api.rpc.$.ts
└── mcp.ts
```

### 权限 gating

```ts
// site/_layout.tsx — super-admin only
export const Route = createFileRoute("/site/_layout")({
  beforeLoad: async () => {
    const ok = await requireSiteAdmin();  // auth.api.userHasPermission({ permissions: { user: ["list"] } })
    if (!ok) throw redirect({ to: "/dashboard" });
  },
  component: SiteLayout,
});

// (workspace)/_layout.tsx — authenticated + activeOrg 分流
export const Route = createFileRoute("/(workspace)/_layout")({
  beforeLoad: async () => {
    const guard = await inspectWorkspaceSession();  // { authenticated, hasActiveOrg, isAdmin }
    if (!guard.authenticated) {
      throw redirect({ to: "/auth/$path", params: { path: "sign-in" } });
    }
    // saas 模式下 super-admin 不自建 personal org；没有 activeOrg 时
    // 必须分流，否则进 /dashboard 会因 menu/policy 查询失败白屏。
    if (!guard.hasActiveOrg) {
      if (guard.isAdmin) throw redirect({ to: "/site/users" });
      throw redirect({ to: "/onboarding" });
    }
  },
  component: WorkspaceLayout,
});

// (workspace)/_layout/settings/organization/menus.tsx — owner only
beforeLoad: async () => {
  await requireOrgMemberRole({ data: { allowed: ["owner"] } });
},

// (marketing)/index.tsx — 无 gating（公开可访问，已登录用户不 redirect）
```

---

## 3. Contracts

### 为什么 `site/` 不加括号

TanStack Router 括号组 `(name)/` 不进 URL，普通文件夹 `name/` 进 URL。

**选择带前缀的理由**：
- `/site/users` vs `/users` 在浏览器地址栏区分度高
- 超管意外分享 URL 时不会误导普通用户（"怎么我也有 /users 页？"）
- DB 动态菜单的 path 字段一眼看出"这是超管菜单"

**workspace 和 marketing 不加前缀的理由**：
- workspace 是业务主力面，URL 要短（`/dashboard` 比 `/app/dashboard` 友好）
- marketing 占用 `/`，必须无前缀

### URL 冲突避免

如果两个组都有同名子目录（比如都有 `users/`），括号组规则会让它们 URL 冲突。当前已规避：`site/` 是无括号的、有前缀，不会和 `(workspace)/` 的任何路径撞。

### Redirect 规则

| 来源 | 条件 | 去向 |
|---|---|---|
| `/` | 总是 | 不 redirect，渲染 `(marketing)/index` |
| `/auth/*` | 已登录 | redirect `/dashboard`（TODO，待实现）|
| `/site/*` | 未登录 | redirect `/auth/sign-in` |
| `/site/*` | 已登录 + 非超管 | redirect `/dashboard` |
| `/dashboard`（及 workspace 下所有）| 未登录 | redirect `/auth/sign-in` |
| `/dashboard`（及 workspace 下所有）| 已登录 + 无 activeOrg + super-admin | redirect `/site/users` |
| `/dashboard`（及 workspace 下所有）| 已登录 + 无 activeOrg + 普通用户 | redirect `/onboarding` |
| `/settings/organization/menus` | 已登录 + 非 owner（且非 super-admin）| redirect `/dashboard` |

### Layout 组件对应

| 路由组 | `_layout.tsx` | Sidebar 组件 | Header 标识 |
|---|---|---|---|
| `(marketing)/` | 无 layout（平铺页）| 无 | 无 |
| `site/` | `site/_layout.tsx` | `AppSiteSidebar` | "Platform Admin" |
| `(workspace)/` | `(workspace)/_layout.tsx` | `AppSidebar`（动态）| "Workspace" |
| `auth/` | 无 shell | 无 | 无 |
| `onboarding.tsx` | 无 shell（bare） | 无 | 无 |

### `/onboarding` 裸页职责

场景：用户已登录但 `session.activeOrganizationId=null`。两类触发：
- **saas 模式 super-admin**（seed 不建 personal org）—— 被 `(workspace)/_layout.tsx` beforeLoad 分流去 `/site/users`，**不会**落到 `/onboarding`
- **saas 模式普通用户 + provision hook 失败**（数据库故障 / 邮箱验证后 hook 超时等罕见情况）—— 落到 `/onboarding` 显示 "联系管理员 + Sign out" 占位页，避免白屏

`onboarding.tsx` 直挂根路由（和 `auth/$path.tsx` 同级的裸页），不走 workspace layout，不需要 activeOrg。仅依赖 Paraglide `onboarding_no_workspace_title` / `_body` / `_sign_out` 三个 key + `authClient.signOut()`。

---

## 4. Validation Matrix

| Condition | Expected |
|---|---|
| 未登录访问 `/` | 渲染 `(marketing)/index`（欢迎页）|
| 未登录访问 `/dashboard` | redirect `/auth/sign-in` |
| 未登录访问 `/site/users` | `(workspace)/_layout` 的 `requireAuth` fail 前，`site/_layout` 的 `requireSiteAdmin` 先跑，返 false → redirect `/dashboard` → dashboard 的 workspace layout 再检 auth → `/auth/sign-in`。最终落脚 `/auth/sign-in`。（实际路径：site/_layout 的 requireSiteAdmin 底层调 session headers，未登录直接 false）|
| 登录普通 member 访问 `/site/users` | `requireSiteAdmin` false → redirect `/dashboard` |
| 登录 super-admin 访问 `/site/users` | 通过 |
| 登录 org owner 访问 `/settings/organization/menus` | 通过 |
| 登录 org admin 访问 `/settings/organization/menus` | `requireOrgMemberRole({ allowed: ["owner"] })` 拒绝 → redirect `/dashboard?denied=org-role` |
| 登录 super-admin 访问 `/settings/organization/menus` | 通过（`requireOrgMemberRole` 内置 isAdmin 旁路）|
| 已登录用户访问 `/` | 渲染 marketing（不 redirect）—— 允许回看官网 |

---

## 5. Good / Bad Cases

### Good — 迁移路由时保 git 历史

```bash
git mv src/routes/(admin)/_layout/dashboard.tsx src/routes/(workspace)/_layout/dashboard.tsx
# TanStack Router Vite 插件会自动把 createFileRoute("/(admin)/...") 改成 /(workspace)/...
```

### Good — 新加 site-admin 页面

```
src/routes/site/_layout/audit/index.tsx
→ URL: /site/audit
→ 自动继承 site/_layout 的 requireSiteAdmin gate
→ 自动挂 AppSiteSidebar（但要在 AppSiteSidebar.tsx 的静态菜单 SITE_MENU 里加条目）
```

### Bad — 把 workspace 页面放进 `site/`

```
src/routes/site/_layout/my-feature.tsx  // ❌
```

URL 变成 `/site/my-feature`，默认 requireSiteAdmin gate 挡住 org owner / member。正确做法：放 `(workspace)/_layout/my-feature.tsx`，URL `/my-feature`。

### Bad — 手写 `createFileRoute` 路径不匹配文件位置

```tsx
// src/routes/(workspace)/_layout/dashboard.tsx
export const Route = createFileRoute("/(admin)/_layout/dashboard")({ ... });
```

TanStack Router 会在 routeTree.gen.ts 里报错或跳到错的 parent。**必须**让 `createFileRoute` 参数和文件路径一致（Vite 插件会自动改，但手写新文件要注意）。

### Bad — `(marketing)/` 里塞登录检查

```tsx
// ❌
beforeLoad: async () => {
  if (await requireAuth()) throw redirect({ to: "/dashboard" });
},
```

marketing 应该是**公开可访问**，已登录用户也能回来看（点 "Back to App" 按钮）。强制 redirect 会让用户看不到自己的官网。

---

## 6. Tests Required

| Test | Assertion |
|---|---|
| `route-gating.test.ts` | 未登录访问 `/dashboard` → redirect `/auth/sign-in` |
| `route-gating.test.ts` | 普通 member 访问 `/site/users` → redirect `/dashboard` |
| `route-gating.test.ts` | super-admin 访问 `/site/users` → 渲染 |
| `route-gating.test.ts` | org owner 访问 `/settings/organization/menus` → 渲染 |
| `route-gating.test.ts` | org admin 访问同上 → redirect |
| E2E smoke | `pnpm dev` 后点击所有主要路由，验证 layout / sidebar 正确切换 |

---

## 7. Wrong vs Correct

### Wrong — 所有页都塞一个 `(admin)/` 组

```
(admin)/_layout/users       → 超管功能
(admin)/_layout/dashboard   → 业务功能
```

所有页面混一个层级，权限 gate 逻辑不得不写成 "if path startsWith '/users' 则要求超管"，脆且容易漏。

### Correct — 分组承载权限语义

```
site/_layout/users         → /site/ 前缀 + site/_layout 的 requireSiteAdmin，自动 gate
(workspace)/_layout/dashboard  → (workspace)/_layout 的 requireAuth，自动 gate
```

路由分组 = 权限分组。新加页面放对位置就自动继承正确 gate。

---

## Related

- `frontend/layout-guidelines.md` — TanStack Router `_layout.tsx` 嵌套规则、组件选择约定、Drawer vs Dialog 等
- `backend/product-modes.md` — `PRODUCT_MODE` 的运行时 gate（saas 允许自建 org，private 不允许）
- `backend/authorization-boundary.md` — site-admin vs org-owner 的授权分层
- `src/lib/auth/guards.ts` — `requireSiteAdmin` / `requireOrgMemberRole` 的实现
