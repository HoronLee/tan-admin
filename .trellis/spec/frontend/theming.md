# Theming

> Executable contract for the shadcn-based theming system: style schema, dark mode wiring, AuthProvider appearance bridge, preset evolution.

---

## 1. Scope

Triggers when work touches: `components.json` (`style` / `tailwind.baseColor`) · `src/styles.css` (CSS tokens / `@theme inline` / radius / font) · `src/components/theme-provider.tsx` / `ThemeToggle.tsx` · `<html>` / `<body>` / `<ThemeProvider>` mount order · migrating `@import "shadcn/tailwind.css"` · adding a new `baseColor` / `style` via `shadcn apply`.

---

## 2. Signatures

### components.json contract
```json
{
  "style": "radix-vega",         // {library}-{style}; project locked to radix-vega
  "tailwind": {
    "baseColor": "neutral",      // chroma=0 grayscale
    "cssVariables": true,
    "css": "src/styles.css"
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "menuColor": "default",
  "menuAccent": "subtle"
}
```

### Runtime API
```ts
// src/components/theme-provider.tsx
type Theme = "dark" | "light" | "system";

export function ThemeProvider(props: {
  children: React.ReactNode;
  defaultTheme?: Theme;   // default "system"
  storageKey?: string;    // default "theme"
}): JSX.Element;

export function useTheme(): {
  theme: Theme;
  setTheme: (t: Theme) => void;
};
```

### Required npm deps (runtime, **not** dev)
```jsonc
{
  "dependencies": {
    "shadcn": "^4.x",                              // provides shadcn/tailwind.css
    "@fontsource-variable/noto-sans": "^5.x",      // --font-sans source
    "tw-animate-css": "*"                          // @import in styles.css
  }
}
```

---

## 3. Contracts

### CSS variable contract (`src/styles.css`)

```css
:root { /* light theme neutral tokens */
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  /* ...  no chroma (neutral) ... */
  --radius: 0.625rem;
}
.dark { /* dark theme neutral tokens */ }

@theme inline {
  --font-sans: 'Noto Sans Variable', sans-serif;
  --font-heading: var(--font-sans);
  /* radius scale uses 2026 multiplier formula */
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}
```

**Locked invariants**:
- `--foreground` chroma must be `0` (neutral grayscale). Any non-zero chroma breaks the "neutral base" contract.
- Radius scale uses multiplier formula; do not revert to `calc(var(--radius) ± Npx)`.
- `.dark { --border }` / `{ --input }` use rgba-like `oklch(1 0 0 / 10%)` syntax (not flat grays).

### Mount order (`src/routes/__root.tsx`)

```
<html lang=... suppressHydrationWarning>   // suppressHydrationWarning REQUIRED
  <head><HeadContent /></head>
  <body>
    <ThemeProvider defaultTheme="system" storageKey="theme">
      <Providers>                          // AuthProvider etc. — depends on useTheme()
        <Outlet />
      </Providers>
    </ThemeProvider>
    <Scripts />
  </body>
</html>
```

- `<ThemeProvider>` injects FOUC-prevention via `<ScriptOnce>` (`@tanstack/react-router`). No manual `<script dangerouslySetInnerHTML>`.
- `<Providers>` **must** be child of `<ThemeProvider>` — consumes `useTheme()` to wire `AuthProvider appearance`.

### AuthProvider appearance bridge (`src/components/providers.tsx`)

```tsx
const { theme, setTheme } = useTheme(); // typed: (Theme, (Theme)=>void)

// Adapter — ba-ui's appearance.setTheme is typed (string)=>void
const setThemeFromAuth = (next: string) => {
  if (next === "light" || next === "dark" || next === "system") {
    setTheme(next);
  }
};

<AuthProvider appearance={{ theme, setTheme: setThemeFromAuth }} ... />
```

### Brand integration (`src/lib/config.ts` + `<BrandMark>`)

Brand identity (display name + logo) is env-driven, not code-baked:

```ts
// src/lib/config.ts — client-safe, reads VITE_BRAND_*
export const brandConfig = {
  name: env.VITE_BRAND_NAME ?? "Tan Servora",
  logoURL: env.VITE_BRAND_LOGO_URL,
  logoDarkURL: env.VITE_BRAND_LOGO_DARK_URL,
} as const;
```

`<BrandMark>` (`src/components/brand-mark.tsx`) is the single UI entry point:
- `logoURL` unset → renders brand name `<span>` (zero-config fallback)
- `logoURL` set, `logoDarkURL` unset → renders `<img>` (same logo in light + dark)
- Both set → renders `<picture>` with `<source media="(prefers-color-scheme: dark)">`

`VITE_BRAND_*`（display name + logo URL）是前后端共用 brand 字段的真相源——这些字段 client UI 直接读，必须 `VITE_` 暴露给浏览器 bundle。**纯服务端 brand 字段**（如品牌主色 OKLCH 派生、SSR head 注入、邮件 hex 派生）走非 `VITE_` 服务端 env（`BRAND_PRIMARY_OKLCH` / `BRAND_PRIMARY_DARK_OKLCH`），消费链路全在 server，client 通过 CSS `var(--primary)` cascade 消费、不经 JS。一份字段一种语义，不存在"server-side `BRAND_*` twin"——`VITE_` 与非 `VITE_` 是不同字段。Server-side email rendering reads from `appConfig.brand` (`src/lib/config.server.ts`, which imports `brandConfig` from `#/lib/config`); UI reads `brandConfig` directly. Do not import `*.client.*` filenames from route modules — TanStack Start's import-protection plugin blocks them on the server bundle; keep client-safe config under `src/lib/config.ts` and server-only config under `src/lib/config.server.ts`.

Title meta (`src/routes/__root.tsx`) reads `brandConfig.name` directly since `<title>` is a string attribute, not a component.

**Brand primary color injection**（PR `04-27-brand-color-injection`）：

- 真相源：服务端 env `BRAND_PRIMARY_OKLCH` + 可选 `BRAND_PRIMARY_DARK_OKLCH`（裸 OKLCH 三元组，无 `VITE_`）。
- 派生：`src/lib/brand/oklch.ts` 用 culori `formatCss` + `formatHex` 一次性产出 web (oklch 字面量) + 邮件 (hex)。
- 注入路径：`src/routes/__root.tsx` 用 root loader + `createServerFn` 派生，head() 从 loaderData 读 `<style>` 注入 `:root` / `.dark` 的 `--brand-primary` / `--brand-primary-foreground`，client navigate 后稳定保留（loaderData 序列化机制，不会被 React reconcile）。
- Approach A 边界：仅 `--primary` / `--primary-foreground` / `--sidebar-primary` / `--sidebar-primary-foreground` 4 个 shadcn token 跟随；`--ring` / `--sidebar-ring` / `--chart-*` / `--destructive` / `--muted` / `--accent` 保持现状中性灰。focus ring 中性是为可访问性 / 色弱友好。
- 缺省兜底优先级：**主人显式 > 静态 default > 算法派生**（见 `src/lib/config.server.ts`）。两个 env 都未配置时，`--brand-primary` 严格回退到 shadcn neutral 默认（light=`oklch(0.205 0 0)` / dark=`oklch(0.922 0 0)`），UI 与历史现状零偏差。
- `<meta name="theme-color">` 双 media 退化：原计划注入 light + dark 两条带 `media` 属性的 meta，TanStack Router `headContentUtils` 按 `name` 字段去重，实际只保留 dark variant；light mode 移动地址栏走浏览器默认色。该限制可接受（移动 light 地址栏色非核心 surface），如要双 variant 需在 `RootDocument` 旁路渲染 JSX `<meta>`。

---

## 4. Validation Matrix

| Condition | Symptom | Fix |
|---|---|---|
| `useTheme()` outside `<ThemeProvider>` | throws `"useTheme must be used within a ThemeProvider"` | Mount `<ThemeProvider>` above caller |
| `localStorage["theme"]` legacy value (e.g. `"auto"`) | falls back to `defaultTheme="system"`; old value overwritten on next `setTheme()` | One-time UX hit, no code fix |
| `setTheme` passed to `AuthProvider appearance` without wrapper | TS2322: `(theme: Theme) => void` not assignable to `(theme: string) => void` | Add `setThemeFromAuth` wrapper |
| `<html>` missing `suppressHydrationWarning` | React warns on navigation about `class` mismatch | Always present on `<html>` |
| `shadcn` moved to devDependencies | Build fails: cannot resolve `shadcn/tailwind.css` | Keep in `dependencies` |
| Manual edit of `:root` hue/chroma without `shadcn apply` | Drifts from chosen baseColor; next `apply` resets it | Always `shadcn apply --preset <id>` for base/theme/font |
| New `rounded-*` utility assuming old formula | Off-pixel at non-10px `--radius` | Use multiplier-aware tailwind `rounded-{sm/md/lg/xl/2xl}` |

---

## 5. Good / Bad Cases

### Good
- Use shadcn tokens: `bg-background`, `text-foreground`, `text-muted-foreground`, `border`, `bg-card`, `bg-accent`.
- Invoke `useTheme()` inside components under `<ThemeProvider>`; expose `setTheme` only through `ThemeToggle` or `AuthProvider appearance`.
- Change theme visuals via `pnpm dlx shadcn@latest apply --preset <id>` → commit diff.

### Base (acceptable)
- Inline fallback like `text-[var(--muted-foreground,#fallback)]` works but is **redundant** post-apply — strip in follow-up cleanup.
- Hardcoding `oklch(...)` in truly ad-hoc components (chart gradients, illustrations) — acceptable, but prefer `--chart-*` tokens.

### Bad
- Custom CSS variables like `--sea-ink / --lagoon / --chip-bg` (legacy demo tokens) — forbidden.
- Hardcoded `#64748b` / `#f1f5f9` in className — breaks dark mode.
- `body { background: radial-gradient(...) }` overriding `var(--background)` — forbidden.
- Installing `next-themes` or `tanstack-theme-kit` — project uses self-written `theme-provider.tsx` (shadcn official TanStack Start recipe).
- Editing `components.json#style` without running `shadcn apply` — leaves CSS out of sync.

---

## 6. Tests Required

Theming is a visual contract; automated assertions focus on structural invariants:

| Test | Assertion |
|---|---|
| `theme-provider.test.tsx` | `useTheme()` throws outside provider |
| `theme-provider.test.tsx` | `setTheme("dark")` adds `.dark` class to `<html>` and persists to `localStorage` |
| `theme-provider.test.tsx` | Mount with `localStorage["theme"]="foo"` → falls back to `defaultTheme` |
| `providers.test.tsx` | `setThemeFromAuth("invalid")` is a no-op |
| Visual smoke (manual, chrome-devtools MCP) | `/dashboard`, `/users`, `/auth/sign-in`, `/settings/account` render in both light + dark |

Current repo has **no** automated tests for `theme-provider.tsx`; add them when modifying provider logic.

---

## 7. Wrong vs Correct

```tsx
// ❌ Hardcoded fallback + manual FOUC IIFE
<p className="text-[var(--muted-foreground,#64748b)]">...</p>
const THEME_INIT = `(function(){ /* 20 lines */ })();`;
<head><script dangerouslySetInnerHTML={{ __html: THEME_INIT }} /></head>
// Problems: #64748b breaks dark mode; hand-rolled script duplicates <ScriptOnce>;
// stays out of sync with ThemeToggle.

// ✅ Standard tokens + delegated FOUC
<p className="text-muted-foreground">...</p>
<body>
  <ThemeProvider defaultTheme="system" storageKey="theme">
    <Providers>{children}</Providers>
  </ThemeProvider>
  <Scripts />
</body>
```

Rationale: single source of truth (ThemeProvider injects via `<ScriptOnce>`), tokens respond to `.dark` automatically, zero drift.

---

## Design Decisions (short rationale; full history via git log)

- **`style: "radix-vega"`**: ba-ui's 3 shadcn registries ship as single-style flat URLs with Vega-era tokens. `radix-nova` mixes Nova framework + Vega ba-ui → 4px padding drift at `/auth/*` / `/settings/*`. `base-nova` also forces Radix→`@base-ui/react` migration (48 `asChild` call sites). `radix-vega` matches ba-ui natively, zero visual split, zero primitive migration.
- **Self-written `theme-provider.tsx`**: `next-themes` is Next-only; `tanstack-theme-kit` is a 0.1.0 gist fork. Official shadcn TanStack Start recipe (~80 lines, uses `<ScriptOnce>` for FOUC) copied verbatim. Zero runtime deps, API matches shadcn docs across frameworks.
- **`shadcn apply --preset <id>`**: one invocation updates `components.json` + `:root`/`.dark` CSS + all installed components + fonts + icons. **No `--dry-run`** — commit current work first so `git reset --hard HEAD^` is a valid undo.

---

## Common Mistakes

- **Adding a theme library "for convenience"** (`next-themes` / `tanstack-theme-kit`): use `src/components/theme-provider.tsx` — same `useTheme()` API, zero deps.
- **Moving `shadcn` to devDependencies**: `src/styles.css` has `@import "shadcn/tailwind.css"` — runtime import. Build fails otherwise. Rule: anything the bundle resolves at build/run time belongs in `dependencies`, even if the package also ships a CLI.
- **Hardcoding colors** (`bg-white` / `#...`): breaks dark mode. Use `bg-background` / `text-foreground` / `text-muted-foreground` / `border` / `bg-card` / `bg-accent`. Reference `src/components/ui/*` for canonical usage.

---

## Related

- `docs/research/better-auth-ui-shadcn-variant.md` — full ba-ui integration research + migration learnings
- `frontend/layout-guidelines.md` — `<ThemeProvider>` sits between `<body>` and `<Providers>`
- `frontend/component-guidelines.md` — components consume shadcn tokens exclusively
- shadcn docs: `ui.shadcn.com/docs/theming`, `ui.shadcn.com/docs/dark-mode/tanstack-start`, `ui.shadcn.com/docs/cli#apply`
