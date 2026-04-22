# Research: Paraglide JS v2 locale switcher for TanStack Start (SSR, admin-style app)

- **Query**: 最新、最规范的 Paraglide JS v2+ locale switcher 方案（针对 TanStack Start SSR 的后台系统，不使用 URL 前缀）
- **Scope**: mixed (内部 repo 现状 + 官方 docs + TanStack 官方 example + upstream issue)
- **Date**: 2026-04-22

---

## 1. 当前 repo 现状

### 已装版本与产物

- `@inlang/paraglide-js@2.16.0` （`devDependencies`，见 `pnpm ls`）
- 编译产物：`src/paraglide/{runtime.js,server.js,messages.js,registry.js}`
- 配置：
  - `project.inlang/settings.json` — `baseLocale: "zh"`，`locales: ["zh", "en"]`
  - `vite.config.ts:14-18` — `paraglideVitePlugin({ project, outdir, strategy: ["url","baseLocale"] })`
- Runtime 实际生成的 `strategy` = `["url","baseLocale"]`（`src/paraglide/runtime.js:35-38`）
- Runtime URL pattern 自动按 `baseLocale=zh` 配成「zh 无前缀 / en 加 `/en`」（`runtime.js:56-70`）

### 现有 switcher 消费者

- 唯一使用：`src/components/LocaleSwitcher.tsx`（50 行，原生 `<button>`，调用 `setLocale(locale)`，带 `aria-pressed`）
- 目前 **未接入 AppHeader / AppTabbar / AppSidebar**（grep 结果：只有自身和 `routes/__root.tsx` 引 `getLocale`）
- `src/routes/__root.tsx:32-37` 仅通过 `beforeLoad` 在客户端把 `document.documentElement.lang` 设为当前 locale
- 没有 `src/server.ts` / `paraglideMiddleware` 接入 —— SSR 下 locale **不通过服务端解析**（因为 `url` 策略 client-only，后文详解）

### 关键事实：当前策略是 `["url", "baseLocale"]`

**这是官方 default、但不适合后台管理系统**：
- 每种语言都会绑一条 URL 前缀（`/en/...` vs `/`），切换语言会 **整站跳转 + 刷新**
- 所有内部 `<Link to="/foo">` 和业务接口 URL 都会被 `deLocalizeUrl/localizeUrl` rewrite 参与 —— 但 `router.tsx` **并未配 `rewrite`**，所以 `url` 策略在此 repo 实际处于"半残"状态：只有首次加载 & setLocale 时才会靠 `localizeUrl` 跳转，其他时候纯靠 URL path 匹配
- 后台应用通常希望：用户选中语言后跟账号走、刷新页面不变、不影响 URL 路径

---

## 2. Paraglide v2 内置策略清单

来源：https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy 和 `runtime.js:256-307`（`resolveLocaleWithStrategies`）

| Strategy | 何时触发 / 数据源 | Server 可读？ | Client 可读？ | `setLocale` 会写？ |
|---|---|---|---|---|
| `url` | URL pathname 匹配 `urlPatterns` | **仅 document 请求**（`Sec-Fetch-Dest: document`） | ✅ | ✅ (跳转到 localized URL) |
| `cookie` | 读 `PARAGLIDE_LOCALE` cookie | ✅ | ✅ | ✅ (`document.cookie`) |
| `preferredLanguage` | `Accept-Language` header / `navigator.languages` | ✅ (header) | ✅ (navigator) | ❌（只读） |
| `localStorage` | `localStorage[PARAGLIDE_LOCALE]` | ❌ | ✅ | ✅ |
| `globalVariable` | 内存变量（`_locale`） | ❌ | ✅ | ✅ |
| `baseLocale` | 回落到 `settings.baseLocale` | ✅ | ✅ | — (只读 fallback) |
| `custom-<name>` | 自定义（`defineCustomServerStrategy` / `defineCustomClientStrategy`） | 可选 | 可选 | 可选 |

**关键规则**（`runtime.js:259-306` 源码验证）：
1. 数组按 **从前到后** fallthrough，第一个非空 locale 就停
2. `url` 在 **Server 端** 只有 `isServer=true` 且传入 URL 时才生效，否则跳过
3. `localStorage` / `preferredLanguage`（客户端版）/ `globalVariable` 在 Server 端直接 skip
4. `baseLocale` 应永远放最后做兜底，否则 `No locale found` 抛错（`runtime.js:232`）
5. **`setLocale()` 会写所有可写策略**（cookie + localStorage + globalVariable + 自定义 + url-跳转），不是只写第一个（v2 新行为，见 `CHANGELOG` "make setLocale set all strategies"）

---

## 3. 官方对 "不要 URL 前缀的 SSR 应用" 的推荐

### 3.1 官方 docs 原话

> **Strategy order matters**: … SSR apps, the initial document request cannot read localStorage. If the first request must respect the stored override, add `cookie`.

> **URL as source of truth (default)**: `["url", "baseLocale"]` — 适合 SEO / 国际化公共站
> **Prioritize user preferences**: `["localStorage", "cookie", "url", "baseLocale"]` — SPA-friendly
> **Auto-detect browser language (SSR-safe)**: `["localStorage", "cookie", "preferredLanguage", "url", "baseLocale"]`

来源：https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy

### 3.2 不想要 URL 前缀的场景（本项目）

官方 issue 回复（@samuelstroschein，issue #404、#410）：

> yes. define your strategy and don't include `url` — `strategy: ["preferredLanguage", "cookie"]`

对于 SSR + 希望首屏 HTML 就是正确语言（避免 hydration mismatch 和 FOUC），**推荐组合**：

```ts
strategy: ["cookie", "preferredLanguage", "baseLocale"]
```

原因：
- `cookie` 在 server & client 都可读，是唯一能让 server 首屏和 client 达成一致的 "可持久化 + 可共享" 通道
- `preferredLanguage` 提供首次访问的自动检测（server 读 `Accept-Language`，client 读 `navigator.languages`）
- `baseLocale` 最终兜底，避免 `No locale found`
- 不放 `url` → 切换语言不改 URL，也不需要 `rewrite` / `localizeUrl`（简化 `router.tsx`）
- 不放 `localStorage` → server 读不到它，首屏会跟 client hydration 不一致（docs 明确警告）

---

## 4. `setLocale(newLocale)` 的精确行为

来源：`src/paraglide/runtime.js:411-509` + docs `basics` + changelog

```ts
setLocale: (newLocale: Locale, options?: { reload?: boolean }) => void | Promise<void>
```

**默认 `reload: true`**。流程（按配置的每个 strategy）：

| Strategy 在 array 中 | `setLocale` 做什么 |
|---|---|
| `cookie` | 在客户端写 `document.cookie = "PARAGLIDE_LOCALE=xx; path=/; max-age=34560000"`（server 端 skip） |
| `localStorage` | `localStorage.setItem("PARAGLIDE_LOCALE", xx)` |
| `globalVariable` | 更新内存 `_locale` |
| `url` | 计算 `newLocation = localizeUrl(current, { locale }).href`，走 `window.location.href = newLocation`（**全页跳转**） |
| `baseLocale` | 不做事 |
| `custom-*` | 调用 `handler.setLocale(newLocale)`（可能是 Promise） |

**reload 行为**（`runtime.js:494-507`）：
- `reload: true`（默认）且 `newLocale !== currentLocale`：
  - 若 `url` 策略在列：`window.location.href = newLocation`（跳转 + 刷新）
  - 否则：`window.location.reload()`（原地刷新）
- `reload: false`：只更新 cookie / storage / globalVariable，**不刷新**，要求你自己触发 UI 重渲染（需要 `router.invalidate()` 或 React state 重渲，且 **server-rendered 内容不会更新，直到下次 SSR/navigation**）

**官方态度**（docs/basics + issue #525）：
> `setLocale()` triggers a page reload by default. This is a deliberate design choice … A user switches the language once, so optimizing for instant locale switching is a poor trade-off. YouTube and other major sites work the same way.

翻译：官方建议就让它 reload。想不 reload 的话要自己搞定 state + SSR 一致性（踩坑成本不低）。

**对本项目的含义**：`reload: true` 的默认行为 + `cookie` 策略就能实现「切换后刷新，新语言永远跟账号走」—— 无需额外代码。

---

## 5. SSR 首屏 locale 如何解析

参考：docs `server-side-rendering` + `middleware` + `runtime.js:146-217`

### 5.1 没有 `paraglideMiddleware` 会怎样

当前 repo 就是这种情况：
- `src/server.ts` **不存在**，TanStack Start 直接走 `@tanstack/react-start/server-entry`
- `paraglideMiddleware()` 没跑 → `serverAsyncLocalStorage` 是 `undefined`（`runtime.js:146`）
- `getLocale()` 在 SSR 中走 `resolveLocaleWithStrategies`（`runtime.js:218`）
  - 由于 `strategy = ["url","baseLocale"]`：
  - `url` 在 server 且有传入 URL 时会走，否则 skip —— **默认 skip**（只有 document 请求且 middleware 传 URL 才生效）
  - 落到 `baseLocale = "zh"` → 首屏永远是 zh
- 结果：SSR 首屏始终 zh，client hydrate 后 `url` 策略生效才可能改成 en → **hydration mismatch 风险**（这也是 `<html suppressHydrationWarning>` 可能被默默掩盖的问题）

### 5.2 接入 `paraglideMiddleware` 后（官方推荐路径）

`src/paraglide/server.js:45-94`：

```js
export async function paraglideMiddleware(request, resolve, options) { … }
```

用法（TanStack Start 官方 example，`src/server.ts`）：

```ts
import handler from '@tanstack/react-start/server-entry'
import { paraglideMiddleware } from './paraglide/server.js'

export default {
  fetch(req: Request): Promise<Response> {
    // ⚠️ 注意：传 original `req`，而不是回调里的 modified request
    // 因为 TanStack Router 自己有 rewrite.input/output，传 modified 会造成 redirect loop
    return paraglideMiddleware(req, () => handler.fetch(req))
  },
}
```

（来源：官方 example https://github.com/TanStack/router/blob/main/examples/react/start-i18n-paraglide/src/server.ts + docs middleware 页 "TanStack Start" 段落 `[!WARNING]`）

middleware 内部做的事（`paraglide/server.js` 注释 + docs）：
1. 调 `extractLocaleFromRequest(request)` 按 strategy 顺序解析 locale
   - 按序尝试：cookie → preferredLanguage(header) → baseLocale …
2. 把 locale 放进 `AsyncLocalStorage` (Node 的 `async_hooks`)
3. 在这个 async context 中执行 `resolve()` —— 期间所有 `getLocale()` 调用都能拿到正确 locale
4. 对 `url` 策略：若 URL 与 localized 版本不匹配，触发 302 redirect（此行为仅 document 请求）

### 5.3 Async Local Storage 注意

- 需要 Node 18+ 或支持 `AsyncLocalStorage` 的 edge runtime
- Vercel Edge / Cloudflare Workers（启用 Node compat）都 OK
- 若 runtime 不支持，docs 有 fallback（手动 `runtime.overwriteServerAsyncLocalStorage(...)`），但本项目 Node 环境不需要

---

## 6. TanStack Start 官方集成 pattern（已验证 canonical）

### 6.1 `vite.config.ts`（官方 example 版）

```ts
paraglideVitePlugin({
  project: './project.inlang',
  outdir: './src/paraglide',
  outputStructure: 'message-modules',
  cookieName: 'PARAGLIDE_LOCALE',
  strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],   // ← 官方 default
  urlPatterns: [ /* ... */ ],
})
```

官方 example 仍然包含 `url`。对 **本项目（不想要 URL 前缀）**，去掉 `url` 即可：

```ts
paraglideVitePlugin({
  project: './project.inlang',
  outdir: './src/paraglide',
  cookieName: 'PARAGLIDE_LOCALE',
  strategy: ['cookie', 'preferredLanguage', 'baseLocale'],   // ← 本项目建议
})
```

### 6.2 `src/server.ts`（本项目需要新增）

```ts
import handler from '@tanstack/react-start/server-entry'
import { paraglideMiddleware } from '#/paraglide/server'

export default {
  fetch(req: Request): Promise<Response> {
    return paraglideMiddleware(req, () => handler.fetch(req))
  },
}
```

> ⚠️ 官方 `[!WARNING]`：若有用 `router.rewrite`（本项目没有），要传 **original req**，不是 middleware 回调里的 `request`。本项目去掉 url 策略后这条不适用，但按官方写法传 `req` 最安全。

### 6.3 `router.tsx` 调整

当前 repo `src/router.tsx` 没有配 `rewrite`。**去掉 `url` 策略后继续保持不变**（不需要 `deLocalizeUrl/localizeUrl`）。如果哪天想要 URL 策略再回头加。

### 6.4 `__root.tsx` 简化

当前 `routes/__root.tsx:32-37` 的 `beforeLoad` + `document.documentElement.setAttribute("lang", ...)` 是 client-only workaround。有了 SSR middleware 后可以直接：

```tsx
function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang={getLocale()} suppressHydrationWarning>
      …
```

`getLocale()` 在 SSR 会走 `serverAsyncLocalStorage` → 准确；在 client 走 cookie → 一致；不再需要 `beforeLoad` 里手动操作 `document.documentElement`。

### 6.5 Server function 里读 locale（若有需要）

若 oRPC handler / server function 中要拿 locale，再加 global middleware（官方 example 版本）：

```ts
// src/locale-middleware.ts
import { createMiddleware } from '@tanstack/react-start'
import { getLocale, overwriteGetLocale } from '#/paraglide/runtime'

export const localeMiddleware = createMiddleware({ type: 'function' })
  .client(ctx => ctx.next({ sendContext: { locale: getLocale() } }))
  .server(ctx => {
    overwriteGetLocale(() => ctx.context.locale)
    return ctx.next()
  })
```

然后在 `src/start.ts` 的 `functionMiddleware` 数组里追加 `localeMiddleware`。本轮 switcher 需求不强制要这个。

---

## 7. UI pattern：shadcn 风格的 `<LocaleSwitcher />`

官方 example 用的是普通 `<button>` 数组（`__root.tsx:62-73`）：

```tsx
import { getLocale, locales, setLocale } from '#/paraglide/runtime'

{locales.map((locale) => (
  <button
    key={locale}
    type="button"
    onClick={() => setLocale(locale)}
    data-active-locale={locale === getLocale()}
    aria-pressed={locale === getLocale()}
    className="rounded p-1 px-2 border cursor-pointer
               [&[data-active-locale=true]]:bg-primary
               [&[data-active-locale=true]]:text-primary-foreground"
  >
    {locale.toUpperCase()}
  </button>
))}
```

本项目既然用 shadcn，dropdown 版本（放 AppHeader 右侧更合适）：

```tsx
import { Check, Globe } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { getLocale, locales, setLocale, type Locale } from '#/paraglide/runtime'

const LABELS: Record<string, string> = { zh: '中文', en: 'English' }

export function LocaleSwitcher() {
  const current = getLocale()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Switch language">
          <Globe className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onSelect={() => setLocale(locale as Locale)}
            className="justify-between"
          >
            <span>{LABELS[locale] ?? locale.toUpperCase()}</span>
            {locale === current && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

注意点：
- `setLocale` 默认会 reload —— 就是想要的行为（server 会读到新 cookie，首屏正确）
- `getLocale()` 在 component body 里调用没问题（hydrate 后 cookie 已存在）；若担心 hydration 警告，可 `useState(() => getLocale())`
- 不用 `locales` 类型断言：`runtime.js:23` 已经是 `readonly ["zh", "en"]`

---

## 8. Gotchas / 官方 docs 明示的坑

1. **`setLocale` 调用时机**：不要在 render 期间调用（会触发 reload 循环）。只在事件回调里调（`onClick` / `onSelect`）
2. **客户端路由切换语言**：用 `<a href={localizeHref(...)}>` 不会生效（client-side router 不会 reload）。必须 `setLocale()` 或加 `reload={true}`。来源：docs `errors` 页 "Switching locales via links doesn't work"
3. **strategy 末尾必须放 `baseLocale`**：否则 `getLocale()` 抛 `No locale found`（`runtime.js:232`）
4. **`url` + `cookie` 组合**：cookie 可能 stale（URL 是 `/fr`，cookie 是 `de`）。本项目去掉 `url` 策略就没这问题
5. **hydration mismatch**：server 读 cookie、client 读 localStorage → 必 mismatch。**保持 server / client 同一 strategy array**
6. **Sec-Fetch-Dest 陷阱**：server 的 `url` 策略只在 document 请求生效，API 请求会 fallthrough 到下一个策略。本项目去掉 `url` 无影响
7. **TanStack Start 1.143+ 有 bug**：`paraglideMiddleware` + `@tanstack/react-start` ≥ 1.145 可能报 "Cannot read private member #state"（issue #573，未修复），workaround 是改生成的 `server.js` 跳过 `new Request(...)` clone。本项目当前 TanStack Start 版本需要单独核实（见"Caveats"）
8. **`suppressHydrationWarning`** on `<html>` 基本必加 —— theme 和 locale 都可能在 hydration 前不匹配
9. **不要删 `setLocale(resolved, { reload: false })` 那行副作用**（`runtime.js:228`）—— 那是 v2 修的 bug #455，用于把首次解析到的 locale 同步到所有可写 strategy

---

## 9. 本项目具体 code-diff 计划（surgical）

目标：切到 `cookie + preferredLanguage + baseLocale`，接入 SSR middleware，把 LocaleSwitcher 替换成 shadcn dropdown 并挂到 AppHeader。

### 文件清单

1. **`vite.config.ts`** — 改 `strategy`：
   - 删除 `"url"`，加 `"cookie"` / `"preferredLanguage"`
   - 加 `cookieName: "PARAGLIDE_LOCALE"`（保留默认名也行）
   - 最终：`strategy: ["cookie", "preferredLanguage", "baseLocale"]`
   - 跑一次 `pnpm dev` 或 `pnpm build` 让 paraglide 重新生成 `src/paraglide/runtime.js`（`strategy` 数组会对应更新）

2. **`src/server.ts`（新增）** — 接入 `paraglideMiddleware`（见 §6.2）

3. **`src/routes/__root.tsx`** —
   - 删 `beforeLoad`（不再需要手动操作 `document.documentElement.lang`）
   - 保留 `<html lang={getLocale()} suppressHydrationWarning>`
   - `getLocale` 在 SSR 由 middleware 提供，在 client 读 cookie

4. **`src/components/LocaleSwitcher.tsx`** — 重写成 shadcn `DropdownMenu` 版（见 §7）
   - 命名保持 `LocaleSwitcher`（当前是 `ParaglideLocaleSwitcher`，建议同步改 export）
   - 需先确认 `components/ui/dropdown-menu.tsx` 已装（shadcn）

5. **AppHeader 挂载点** — 搜当前 header/topbar 组件：
   - `src/components/layout/AppSidebar.tsx`、`AppTabbar.tsx` 已存在
   - 没有 `AppHeader.tsx`（grep 过了）→ 需要确认 admin 布局顶栏在哪（`(admin)/_layout.tsx` 里）
   - 在顶栏右侧插入 `<LocaleSwitcher />`（紧挨 theme toggle / 用户头像）

6. **`messages/{zh,en}.json`** — 补 `language_label` / `locale_en` / `locale_zh` 等 i18n 字段（若 dropdown 里要显示「当前语言」tooltip）

### 不需要改的文件

- `router.tsx` — 保持不变（没用 rewrite）
- `project.inlang/settings.json` — 保持不变
- `src/start.ts` — 本轮暂不加 `localeMiddleware`（oRPC / server function 读 locale 时再加）

---

## 10. Caveats / docs 留白

1. **TanStack Start 版本兼容性**：opral/paraglide-js#573（2026-01）报告 `paraglide-js@2.7.1 + @tanstack/react-start@1.145.3` 有 private member 错误。需要核对本项目 `@tanstack/react-start` 当前版本，若命中需要用 workaround 或锁版本
2. **Cookie SameSite / Secure 属性**：`runtime.js:448-451` 生成的 cookie 只带 `path=/; max-age=…`，没有 `SameSite` / `Secure`。跨子域或 HTTPS-only 场景可能需要 `overwriteSetLocale` 自定义写 cookie
3. **SSO / embed iframe 场景**：若后续 Better Auth SSO 插件会让用户在外部域跳转回来，cookie domain 可能需要 `cookieDomain` 选项配置
4. **Paraglide 对 `__root.tsx` 的 beforeLoad 没规定**：官方 example 把 `<html lang>` 直接嵌在 `RootDocument`，本项目之前的 `beforeLoad` + DOM 操作是冗余的 workaround（因为 SSR 没走 middleware），接入 middleware 后可删
5. **prerender 场景**：若未来要 prerender 页面，需要每个 locale 各生成一份（`localizeHref` + 枚举 `locales`），docs 有段但本项目暂无需求

---

## Related specs in repo

- `.trellis/spec/frontend/i18n.md`（新增，未读）— 建议本研究结果落成执行契约后 merge 进去
- `docs/research/plugin-organization-deep.md`（M）— 与本研究无直接关系

## External references

- Paraglide strategy docs: https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy
- Paraglide SSR docs: https://inlang.com/m/gerre34r/library-inlang-paraglideJs/server-side-rendering
- Paraglide middleware docs: https://inlang.com/m/gerre34r/library-inlang-paraglideJs/middleware
- Paraglide basics (setLocale 行为): https://inlang.com/m/gerre34r/library-inlang-paraglideJs/basics
- Paraglide errors（locale 解析错误 / link 失效）: https://inlang.com/m/gerre34r/library-inlang-paraglideJs/errors
- TanStack 官方 Start+Paraglide example: https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide
- TanStack Start paraglide 页: https://inlang.com/m/gerre34r/library-inlang-paraglideJs/tanstack-start
- Issue #525 — setLocale 为什么 reload 是 intended: https://github.com/opral/inlang-paraglide-js/issues/525
- Issue #410 — TanStack 集成讨论: https://github.com/opral/inlang-paraglide-js/issues/410
- Issue #573 — TanStack Start 1.145 兼容性: https://github.com/opral/paraglide-js/issues/573
- Issue #461 — `["url", ..]` 在 server 的陷阱: https://github.com/opral/inlang-paraglide-js/issues/461
- Paraglide 2.0 changelog（v2 核心变化）: https://github.com/opral/paraglide-js/blob/main/CHANGELOG.md
