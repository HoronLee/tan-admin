# better-auth-ui — shadcn 变体 + TanStack Start 集成

## 来源
- https://better-auth-ui.com/docs/shadcn
- https://better-auth-ui.com/docs/shadcn/integrations/tanstack-start
- 抓取：2026-04-21

## 核心概念

shadcn 变体不是 npm 包，**而是用 shadcn CLI 把组件源码"复制"到本项目**，与 v1 Stage 2 的 DataTable 同套思路。所有组件代码归项目所有，可二次定制；底层共享数据层 `@better-auth-ui/react`（hooks / queries 仍走 npm）。

前置依赖：`better-auth` / `shadcn/ui` / `sonner`（Toaster）已安装。

## 安装命令（增量）

```bash
# 三个 registry，按需取
npx shadcn@latest add https://better-auth-ui.com/r/auth.json          # <Auth /> + sign-in/up/out/magic-link/forgot/reset
npx shadcn@latest add https://better-auth-ui.com/r/settings.json      # <Settings /> + account / security
npx shadcn@latest add https://better-auth-ui.com/r/user-button.json   # <UserButton /> Header 头像菜单
```

落地目录（CLI 会按 components.json 配置）：建议 `src/components/auth/`、`src/components/settings/`、`src/components/user-button/`。

## 服务端配置（src/lib/auth.ts 视角）
本插件**纯前端**，不影响 server/auth 配置。Server 侧只要 better-auth 已经把对应能力打开（emailAndPassword、socialProviders、magicLink…），UI 自动适配。

## 客户端配置（src/lib/auth-client.ts 视角）
`authClient` 必须装上对应能力的 client plugin（如 `magicLinkClient()` / `passkeyClient()` / `multiSessionClient()`），UI 才能渲染对应入口。

## TanStack Start 集成完整骨架

### 1. Provider（`src/components/providers.tsx`）

```tsx
import { Link, useNavigate } from "@tanstack/react-router"
import { useTheme } from "next-themes"
import type { ReactNode } from "react"
import { authClient } from "#/lib/auth-client"
import { AuthProvider } from "#/components/auth/auth-provider"   // shadcn add 落地
import { Toaster } from "#/components/ui/sonner"

export function Providers({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  return (
    <AuthProvider
      authClient={authClient}
      appearance={{ theme, setTheme }}
      deleteUser={{ enabled: true }}
      magicLink
      multiSession
      passkey
      socialProviders={["github", "google"]}
      redirectTo="/dashboard"
      navigate={navigate}
      Link={Link}
    >
      {children}
      <Toaster />
    </AuthProvider>
  )
}
```

要点：
- `navigate` 直接传 TanStack 的 `useNavigate()`（API 形状 `{ to, replace }` 兼容）
- `Link` 直接传 TanStack 的 `Link` 组件
- 主题双向绑定 `next-themes`
- 能力开关（magicLink / multiSession / passkey）必须与 server-side 一致

### 2. Root route（`src/routes/__root.tsx`）

把 `<Providers>` 包在 `<ThemeProvider>` 内、children 外层。已有 root 不要被 doc 里的示例覆盖；只要把 `<Providers>` 挂上即可。

### 3. 动态 auth 路由（`src/routes/auth/$path.tsx`）

```tsx
import { viewPaths } from "@better-auth-ui/react/core"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Auth } from "#/components/auth/auth"

export const Route = createFileRoute("/auth/$path")({
  beforeLoad({ params: { path } }) {
    if (!Object.values(viewPaths.auth).includes(path)) {
      throw redirect({ to: "/" })
    }
  },
  component: AuthPage,
})

function AuthPage() {
  const { path } = Route.useParams()
  return (
    <div className="flex justify-center my-auto p-4 md:p-6">
      <Auth path={path} />
    </div>
  )
}
```

`viewPaths.auth` 合法值：`sign-in` / `sign-up` / `sign-out` / `forgot-password` / `reset-password` / `magic-link`。

### 4. 动态 settings 路由（`src/routes/(admin)/settings/$path.tsx`）

```tsx
import { viewPaths } from "@better-auth-ui/react/core"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { Settings } from "#/components/settings/settings"

export const Route = createFileRoute("/(admin)/settings/$path")({
  beforeLoad({ params: { path } }) {
    if (!Object.values(viewPaths.settings).includes(path)) throw notFound()
  },
  component: SettingsPage,
})

function SettingsPage() {
  const { path } = Route.useParams()
  return (
    <div className="w-full max-w-3xl mx-auto p-4 md:p-6">
      <Settings path={path} />
    </div>
  )
}
```

`viewPaths.settings` 合法值：`account` / `security`。

### 5. 受保护路由 + 会话读取

```tsx
import { useAuthenticate } from "@better-auth-ui/react"
const { data: session } = useAuthenticate()  // 未登录自动跳 sign-in
```

`useAuthenticate` = 自动 redirect + 取 session 一站式。比手写 `(admin)/_layout.tsx` 的 server-side 守卫更轻，但**只在客户端生效**。SSR 守卫还是要保留（v1 已有）。

## 与 npm 包变体的差异

| 维度 | shadcn 变体（本项目选定） | npm 包 `@daveyplate/better-auth-ui` |
|---|---|---|
| 组件代码归属 | 落地到项目，可改 | 锁在 node_modules |
| 数据层 | `@better-auth-ui/react`（npm） | 同（共享） |
| Provider | `AuthProvider`（项目内） | `AuthUIProvider`（包内） |
| TanStack 集成入口 | `import from "./auth/auth-provider"` | `import from "@daveyplate/better-auth-ui/tanstack"` |
| 二次定制成本 | 极低（直接改源码） | 高（需 fork 或 wrapper） |
| 升级成本 | 高（需手动重跑 `shadcn add` diff） | 低（`pnpm up`） |

## 关键代码骨架（最小可用集）

`Header` 接入 UserButton（替换 v1 自写 header-user）：
```tsx
import { UserButton } from "#/components/user-button/user-button"
// ...
<UserButton />
```

## 注意事项 / 坑

1. **shadcn add 落地路径**取决于本项目 `components.json` 的 `aliases.components` 与 `aliases.ui`；本项目用 `#/*` 别名，shadcn CLI 默认以 `@/*` 渲染——**先 patch `components.json` 或安装后批量替换 `@/` → `#/`**。
2. `viewPaths` 是开源数据层导出的常量，将来插件升级可能新增视图（如 `two-factor`）；动态路由用 `Object.values(...).includes` 校验自动跟新。
3. SSR 场景 `useAuthenticate` 在客户端才跑；服务端守卫不要替换，仍用 `auth.api.getSession({ headers })`。
4. `magicLink` / `passkey` / `multiSession` 等能力开关只是 UI 渲染开关；server 端没装对应 plugin 会调用失败。本任务只需 `emailAndPassword`，先全部置 false。
5. shadcn 变体没有"组件版本号"，以本次 `add` 时间戳为准；记录 `add` 时间到 `journal.md` 以便回溯。
6. Tailwind 4 兼容性：组件源码用的是 v4 语法（`@theme` 等），与项目当前 Tailwind 4 一致，无需 transform。
