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

## 实施反馈（2026-04-22 identity-layer-v2 task 完成）

本项目 v2 已完整集成 shadcn 变体，实测确认 + 修订：

### 修订点

1. **实际 registry 只有 3 个**（官方 `/docs/shadcn` 确认）：`auth.json` / `settings.json` / `user-button.json`。**组织相关组件完全不提供**（`<OrganizationSwitcher />` / `<OrganizationSettingsCards />` / `<OrganizationMembersCard />` 是 npm 包变体 `@daveyplate/better-auth-ui` 的 API）。选 shadcn 变体等于承担"组织 UI 自写"的工作量。

2. **shadcn add 的落地目录**（实测，以本项目 `components.json` aliases 为准）：
   - `auth.json` → `src/components/auth/*`
   - `user-button.json` → `src/components/user/*`（不是预想的 `components/user-button/`）
   - `settings.json` → `src/components/settings/{account,security}/*`

3. **落地会覆盖 shadcn 基础组件**：装 auth.json 时会更新 `button.tsx` / `card.tsx` / `input.tsx` 等，给 ba-ui 组件专用 API；如果项目已有定制要先 git diff 确认。

4. **依赖补齐**：shadcn add 会自动装 `@better-auth-ui/react` / `@better-auth/passkey` / `@tanstack/react-pacer` / `next-themes`。

### 验证了的集成模式

`providers.tsx`（实际用的、可跑起来的版本）：

```tsx
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import type { ComponentType, PropsWithChildren, ReactNode } from "react";
import { AuthProvider } from "#/components/auth/auth-provider";
import { authClient } from "#/lib/auth-client";

type LinkProps = PropsWithChildren<{ className?: string; href: string; to?: string }>;

const Link: ComponentType<LinkProps> = ({ href, to, className, children }) => (
  <RouterLink to={(to ?? href) as string} className={className}>{children}</RouterLink>
);

export function Providers({ children }: { children: ReactNode }) {
  const routerNavigate = useNavigate();
  const navigate = (o: { to: string; replace?: boolean }) =>
    routerNavigate({ to: o.to as string, replace: o.replace });
  return (
    <AuthProvider
      authClient={authClient}
      navigate={navigate}
      Link={Link}
      redirectTo="/dashboard"
      // capability flags 必须和 server plugins 一一对应
      multiSession={true}   // server 装了 multiSession()
      passkey={false}
      magicLink={false}
      deleteUser={{ enabled: false }}
    >
      {children}
    </AuthProvider>
  );
}
```

**关键**：Better Auth UI 的 `Link` 组件签名（`{ href, to? }`）与 TanStack Router 的 `Link`（`to`）不一致，必须写适配器。

### Capability flag 与 server plugin 一致性（新发现）

UserButton / Settings 内置组件会**无条件探测**某些能力端点（比如 `<UserButton>` 的 SwitchAccount 子菜单探 `/api/auth/multi-session/list-device-sessions`）。server 没装对应 plugin 时：

- 选项 A：装 plugin（本项目选这条，multiSession 实际还有 impersonate 场景的业务价值）
- 选项 B：给 AuthProvider 显式传 `xxx={false}`（有些组件条件渲染受 flag 控制，但不是全部）
- 选项 C：patch shadcn 落地的组件源码删 probe 调用

**注 4 修订**："magicLink / passkey / multiSession 是 UI 渲染开关" 这条**只部分正确**——`user-button.tsx` 里 `{multiSession && ...}` 会受 flag 控制，但 `settings/account/manage-accounts.tsx` 里 `useListDeviceSessions()` hook 无条件调用（不看 flag），即便组件不渲染也可能在其他页面触发 probe。

### TanStack Router `_layout` 嵌套坑（识别于本次任务，非 ba-ui 本身问题）

按文档示例把 `auth/$path.tsx` 写成 `src/routes/auth/$path.tsx` 是对的（裸页，不需要后台 layout）。**但** `settings/$path.tsx` 想受 `(admin)/_layout.tsx` 包裹，必须放在 `src/routes/(admin)/_layout/settings/$path.tsx`，不能和 `_layout.tsx` 同级。详见 `.trellis/spec/frontend/layout-guidelines.md` "TanStack Router Route Groups + `_layout.tsx` 关键约定" 段。

### 未验证的

- Email registry（`<EmailVerificationEmail />` 等邮件模板）— 本项目 v2 没用，后续搞 SMTP / transactional email provider 再说。
- `passkey` / `magicLink` 流程 — plugin 没装，UI 也没测。

### 实施反馈（04-22 theme-cleanup 任务）

把项目从 `new-york + zinc` 迁移到 shadcn 2026 新默认期间发现的重点：

**1. style 选 `radix-vega`（不选 base-nova / radix-nova）**

shadcn 2026 的 style schema 扩展成 `{library}-{style}` 格式：`radix-vega / radix-nova / base-vega / base-nova / ...`。
- `base-*` 把 Radix primitive 换成 Base UI（`@base-ui/react`），**`asChild` 变 `render` prop**。项目里 `asChild` 48 处（UI 31 + 业务 17），改不起。
- `radix-nova` 保留 Radix 但视觉更紧凑（padding 减、min-height 减）。对 admin 合适，但**ba-ui 源码以 Vega 为基线**——切 Nova 会让 `/auth/*` 和 `/settings/*` 与主站 4px 级割裂。
- `radix-vega`（本项目选）= 原 new-york 的改名，**ba-ui 天然匹配，零视觉割裂**。shadcn/create Web UI 默认也是 Vega。

**2. ba-ui 三个 registry 不支持 style 分支**

`https://better-auth-ui.com/r/auth.json`（以及 user-button.json / settings.json）是**扁平 URL**，没有 `{style}` 占位，说明 ba-ui 单套源码不分 style。shadcn apply 切 style 时不会动 ba-ui 落地的源码（`src/components/auth | user | settings/`）——这**正是想要的行为**：保留 ba-ui 原样 Vega 视觉与框架统一。

**3. `shadcn apply --preset <id>` 一条命令搞定大部分**

2026-04 新增的 `shadcn apply` 命令替代了"手工改 components.json + shadcn add --overwrite × N"的繁琐流程：

```bash
pnpm dlx shadcn@latest apply --preset bIkez2m
```

自动完成：`components.json` 更新 + `:root`/`.dark` 色值换 neutral + 新增 `--radius-2xl/3xl/4xl` 档位 + 28 个 UI 组件 reinstall + 字体安装（本次是 Noto Sans Variable）。**没有 `--dry-run`**，依赖 git 做 undo 层（先 commit 建立锚点）。

`apply` 不清理 legacy（TanStack Start demo 遗留的 CSS 变量 / body gradient / 自定义类），这部分要单独手工做。

**4. `AuthProvider appearance={{ theme, setTheme }}` 的类型适配**

ba-ui 的 `appearance.setTheme` 签名是 `(theme: string) => void`（接受任意字符串），但我们自写的 `useTheme().setTheme` 是 `(theme: Theme) => void`（严格 union）。直接传会 TS 报错，需写适配 wrapper：

```tsx
const setThemeFromAuth = (next: string) => {
  if (next === "light" || next === "dark" || next === "system") {
    setTheme(next);
  }
};

<AuthProvider appearance={{ theme, setTheme: setThemeFromAuth }} ... >
```

**5. Dark mode 用 shadcn 官方 TanStack Start 指南自写，不用 next-themes / tanstack-theme-kit**

`ui.shadcn.com/docs/dark-mode/tanstack-start` 给了 ~80 行 theme-provider.tsx + mode-toggle.tsx 模板，用 TanStack Router 原生 `<ScriptOnce>` 注入 FOUC 脚本，**零第三方依赖**。比 next-themes（Next.js 专用）和 tanstack-theme-kit（0.1.0 个人项目）都干净。项目 `src/components/theme-provider.tsx` 就是照抄官方模板。

**6. `shadcn` npm 包是 runtime dep（不是 devDependency）**

apply 会加 `shadcn ^4.4.0` 到 `dependencies`，并在 `styles.css` 加 `@import "shadcn/tailwind.css"`。这是**运行时** import，`shadcn` 必须在 dependencies，不能挪 devDependencies。

**7. 字体：Noto Sans Variable 对中文友好**

shadcn/create 当前 preset 里选 Inter 作为 heading，但 apply 实际装的是 `@fontsource-variable/noto-sans` 并把 `--font-sans` 设为 `'Noto Sans Variable'`（`--font-heading` 跟着 sans）。Noto Sans 对 CJK 支持远好于 Inter，对中文后台项目是更好的选择。
