# Research: TanStack Start SSR 下的 Dark Mode 集成

## 🚨 重大更新（主人二次追问后发现）

**原结论"推荐 tanstack-theme-kit"作废**。正确答案：**shadcn 官方有专门的 TanStack Start dark mode 指南**（`https://ui.shadcn.com/docs/dark-mode/tanstack-start`），推荐**自写 ~80 行 theme-provider.tsx + mode-toggle.tsx**，用 TanStack Router 原生 `<ScriptOnce>` 注入 FOUC 脚本，**零运行时依赖**。

本文件下方的 tanstack-theme-kit 分析作为"否决方案对比"保留，不再作为实施依据。**实施请按本文件末尾"shadcn 官方实现"段的代码抄**。

---

# 原分析（作废）：Research: next-themes 在 TanStack Start SSR 下的集成

- **Query**: 在 TanStack Start 里怎么挂 `<ThemeProvider>`、FOUC 避免方案、`suppressHydrationWarning` 挂法、AuthProvider appearance 接通
- **Scope**: external + internal
- **Date**: 2026-04-22

## 结论

**No——不要用 `next-themes`，换成 `tanstack-theme-kit`**。

- `next-themes` 是 Next.js 专用，内部依赖 `"use client"` 指令和 Next.js 的 RSC/RCC 分界，**直接在 TanStack Start 下用会跑但不稳定**（hydration mismatch + FOUC 风险）
- 社区已经有**官方推荐**的适配包：`tanstack-theme-kit`（npm 0.1.0，作者 @augiwan，基于 @WellDone2094 的 gist，原作者 pacocoursey 点名认可）
- API 与 `next-themes` **几乎一致**（`<ThemeProvider>` + `useTheme()`），2 行代码集成，MIT
- 已经注入 `<script>` 在 hydration 前改 `<html>` class，主动支持 `suppressHydrationWarning` + SSR 防 FOUC

**更好的消息**：项目 `src/routes/__root.tsx` 已经手写了 `THEME_INIT_SCRIPT`（line 31-31）在 hydration 前设置 `<html>` class，功能上**已经等价于 tanstack-theme-kit 做的事**。可以选：

- **A. 引入 tanstack-theme-kit**（推荐，~2KB，得到 `useTheme()` hook 和规范 ThemeProvider）
- **B. 保留手写 THEME_INIT_SCRIPT，只补写一个 tiny `useTheme()` hook**（零依赖，但要自己维护）

PRD 选择的 next-themes 方案需要改写为 tanstack-theme-kit，改动清单见下文。

## 证据

### next-themes 在 non-Next.js 环境的已知问题

来自 `github.com/pacocoursey/next-themes/issues/317`（2024-10-22）：

> "I mean... obviously - the whole provider is a client component either way, it's built that way. In the README it says... add the `suppressHydrationWarning` prop to your `<html>` tag, which fixes it for me."

next-themes 依赖 `"use client"` 和客户端 only 的 `useSyncExternalStore`——在 TanStack Start 里**会**跑（because React 19 兼容），但作者从未在 README 里承诺非 Next.js 场景。

### tanstack-theme-kit（推荐方案）

**来源**：`github.com/augiwan/tanstack-theme-kit`（2025-10-26 发布）

核心卖点（逐字来自 README）：

> - ✅ Perfect dark mode in 2 lines of code
> - ✅ System setting with `prefers-color-scheme`
> - ✅ Themed browser UI with `color-scheme`
> - ✅ Works with TanStack Start SSR
> - ✅ No flash on load (SSR compatible)

集成示例：

```tsx
// app/routes/__root.tsx
import { ThemeProvider } from 'tanstack-theme-kit'

export default function Root() {
  return (
    <html suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>
          <Outlet />
        </ThemeProvider>
      </body>
    </html>
  )
}
```

> **Note!** Add suppressHydrationWarning to your `<html>` element to prevent warnings. The ThemeProvider injects a script that updates the html element before React hydrates, which is intentional to prevent flashing.

作者血缘：`tanstack-theme-kit` fork 自 `@WellDone2094` 的 gist（`gist.github.com/WellDone2094/16107a2a9476b28a5b394bee3fa1b8a3`），WellDone2094 的 gist 是 `next-themes` 的 TanStack Start 移植，`@pacocoursey` 在评论区认可该 gist 是"最接近 next-themes 官方 TanStack Start 支持"的适配。

### suppressHydrationWarning 挂法（有分歧但定论清楚）

来自多个来源交叉验证：

- `next-themes` README（`github.com/pacocoursey/next-themes`）：`<html suppressHydrationWarning>`——**挂 `<html>` 上**
- `tanstack-theme-kit` README：`<html suppressHydrationWarning>`——**挂 `<html>` 上**
- `github.com/tonyedgal/ui-theme/blob/main/docs/tanstack-start-setup.md`：`<html lang="en" suppressHydrationWarning>`——**挂 `<html>` 上**

**不要挂到 `<body>` 或内部节点**。原因：theme 脚本改的是 `document.documentElement.classList`（`<html>` 的 class），React hydration 时 diff 的就是 `<html>` 层的 className。

项目现状（`src/routes/__root.tsx` line 111）已经挂对了：

```tsx
<html lang={getLocale()} suppressHydrationWarning>
```

### 项目现状内部分析

- `src/routes/__root.tsx` line 31：`THEME_INIT_SCRIPT`（一行 IIFE）在 hydration 前读 localStorage、改 `<html>` class、设置 `color-scheme`——**功能上等价于 next-themes / tanstack-theme-kit 的 inject script**
- `src/components/ThemeToggle.tsx`：手写三态（light/dark/auto）按钮，`useEffect` 同步 matchMedia
- `src/components/providers.tsx`：**没有**挂任何 `<ThemeProvider>`，但 `AuthProvider appearance` 也没有接通 `useTheme()`（PRD R6 提到的断裂）

### FOUC 避免的黄金组合

1. `<html suppressHydrationWarning>` —— 让 React 容忍 `<html>` 上 theme class 的 server/client 差异
2. `<head>` 内注入 blocking `<script>`（`dangerouslySetInnerHTML`）在 hydration 前写入 className —— 项目现状已做
3. `<body className="font-sans antialiased">` —— 字体/基础样式不依赖 theme，避免二次 reflow

项目 3 项都对。

## 风险与建议

### PR1 最小改动清单

**方案 A：引入 tanstack-theme-kit（推荐）**

1. `pnpm add tanstack-theme-kit`
2. 删除 `src/routes/__root.tsx` 里的 `THEME_INIT_SCRIPT` 常量（line 31）和 `<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />`（line 114）——tanstack-theme-kit 自己注入
3. `src/components/providers.tsx` 最外层加 `<ThemeProvider attribute="class" defaultTheme="system">`（从 `tanstack-theme-kit` import）
4. 重写 `src/components/ThemeToggle.tsx`：替换手写逻辑为 `import { useTheme } from 'tanstack-theme-kit'`，用 shadcn DropdownMenu + lucide `Sun/Moon/Monitor`
5. `providers.tsx` 的 `AuthProvider` 接通 `appearance={{ theme, setTheme }}` —— theme 来自 `useTheme().theme`，setTheme 来自 `useTheme().setTheme`

**方案 B：保留 THEME_INIT_SCRIPT，自写 useTheme hook（零依赖）**

1. 把 `src/components/ThemeToggle.tsx` 里的 state 逻辑提取为 `src/hooks/useTheme.ts` 导出 `{ theme, setTheme, resolvedTheme }`
2. `ThemeToggle.tsx` 改为 shadcn DropdownMenu + 调 `useTheme()`
3. `providers.tsx` 无需 ThemeProvider（全局状态在 localStorage + `<html>` class）
4. `AuthProvider` 的 `appearance={{ theme, setTheme }}` 接通

**推荐 A**，因为 `useTheme()` 是生态标准 API（ba-ui / shadcn docs 所有示例都这样调），不自造轮子。

### 不要做

- **不要装 `next-themes`**——PRD R6 写的"装 `next-themes`（若未装）"应该改成 `tanstack-theme-kit`
- 不要把 `suppressHydrationWarning` 移到 `<body>` 或 `<div id="root">`——必须在 `<html>`
- 不要删 `<head>` 内的 theme inject script（不管是保留手写的还是换 tanstack-theme-kit 的）——否则 dark 模式首屏必闪白

---

# ✅ shadcn 官方 TanStack Start 实现（PR1 照抄）

来源：`https://ui.shadcn.com/docs/dark-mode/tanstack-start`（抓取 2026-04-22）

## 1. `src/components/theme-provider.tsx`（新建）

```tsx
import { createContext, useContext, useEffect, useState } from "react"
import { ScriptOnce } from "@tanstack/react-router"

type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

function getThemeScript(storageKey: string, defaultTheme: Theme) {
  const key = JSON.stringify(storageKey)
  const fallback = JSON.stringify(defaultTheme)
  return `(function(){try{var t=localStorage.getItem(${key});if(t!=='light'&&t!=='dark'&&t!=='system'){t=${fallback}}var d=matchMedia('(prefers-color-scheme: dark)').matches;var r=t==='system'?(d?'dark':'light'):t;var e=document.documentElement;e.classList.add(r);e.style.colorScheme=r}catch(e){}})();`
}

const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: "system",
  setTheme: () => {},
})

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.remove("light", "dark")
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      : theme
  root.classList.add(resolved)
  root.style.colorScheme = resolved
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(storageKey)
    setThemeState(
      stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : defaultTheme
    )
    setMounted(true)
  }, [defaultTheme, storageKey])

  useEffect(() => {
    if (!mounted) return
    applyTheme(theme)
  }, [theme, mounted])

  useEffect(() => {
    if (!mounted || theme !== "system") return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => applyTheme("system")
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [theme, mounted])

  const setTheme = (next: Theme) => {
    localStorage.setItem(storageKey, next)
    setThemeState(next)
  }

  return (
    <ThemeProviderContext value={{ theme, setTheme }}>
      <ScriptOnce>{getThemeScript(storageKey, defaultTheme)}</ScriptOnce>
      {children}
    </ThemeProviderContext>
  )
}

export function useTheme() {
  const context = useContext(ThemeProviderContext)
  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")
  return context
}
```

## 2. `src/routes/__root.tsx`（改动）

- 删除现有 `THEME_INIT_SCRIPT` 常量（line 31 附近）
- 删除 `<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />`
- 把 `<ThemeProvider>` 包在 `<body>` 里的 `<Outlet>` 之外（或在 providers.tsx 里统一）
- `<html lang suppressHydrationWarning>` **保留**

```tsx
<html lang={getLocale()} suppressHydrationWarning>
  <head>
    <HeadContent />
  </head>
  <body>
    <ThemeProvider defaultTheme="system" storageKey="theme">
      <Providers>  {/* AuthProvider etc. */}
        <Outlet />
      </Providers>
    </ThemeProvider>
    <Scripts />
  </body>
</html>
```

## 3. `src/components/ThemeToggle.tsx`（重写，或新建 `mode-toggle.tsx`）

```tsx
import { Moon, Sun } from "lucide-react"
import { Button } from "#/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu"
import { useTheme } from "#/components/theme-provider"

export function ModeToggle() {
  const { setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>Light</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>Dark</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

## 4. `src/components/providers.tsx`（改动）

接通 `AuthProvider appearance`：

```tsx
import { useTheme } from "#/components/theme-provider"

export function Providers({ children }) {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  return (
    <AuthProvider
      authClient={authClient}
      appearance={{ theme, setTheme }}
      // ...
    >
      {children}
    </AuthProvider>
  )
}
```

注意：`Providers` 必须作为 `<ThemeProvider>` 的 child 才能调 `useTheme()`——所以 `<ThemeProvider>` 挂在 `<Providers>` 外层。

## 关键点

- **零新增 npm 依赖**——`ScriptOnce` 来自 `@tanstack/react-router`（已装 v1.133）
- `<ScriptOnce>` 是 TanStack Router 的 SSR 组件，专门用于只注入一次的 head script，替代 `dangerouslySetInnerHTML`
- 整套代码跟 shadcn 在 Next.js / Vite / Astro / Remix 的 dark mode 方案 API **完全一致**，心智成本最低
- 主人项目的 `THEME_INIT_SCRIPT` 和 `ThemeToggle` 的现有逻辑 **本质上就是这个方案的雏形**，重构成本 < 1.5h
