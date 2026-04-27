# Component Guidelines

> Frontend component conventions based on current repository patterns.

---

## Component Tiers

Two explicit tiers:

- **Primitive UI tier**: `src/components/ui/*` (shadcn-style, variant-driven, reusable primitives).
- **Domain/UI composition tier**: `src/components/<domain>/*.tsx`（如 `components/layout/`、`components/auth/`、`components/settings/`、`components/email/`）。

```ts
// src/components/ui/button.tsx (primitive)
const buttonVariants = cva(...)

// src/components/layout/app-sidebar.tsx (composition)
export function AppSidebar() {
  return <Sidebar>...</Sidebar>
}

// src/components/layout/organization-switcher.tsx (composition)
export function OrganizationSwitcher() {
  const { data: session } = authClient.useSession()
}
```

Better Auth UI hooks（`authClient.useSession()` / `authClient.admin.*` 等）就近 import 到使用它的 composition 组件文件里——**没有** `src/integrations/better-auth/*` 这一层抽象。

## Props Typing Conventions

- Prefer inline `React.ComponentProps<"...">` + `VariantProps<typeof variants>`.
- Do NOT introduce `React.FC` for new components.

```ts
// src/components/ui/button.tsx
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {

// src/components/ThemeToggle.tsx — plain function, no React.FC
export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>('auto')
}

// src/components/layout/app-sidebar.tsx — named export, no React.FC
export function AppSidebar() { /* ... */ }
```

## Class Composition

Always compose Tailwind classes with `cn()` from `#/lib/utils` for merge safety:

```ts
// src/lib/utils.ts
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// src/components/ui/button.tsx
className={cn(buttonVariants({ variant, size, className }))}
```

## Variant and Composition Pattern (`cva` + `asChild`)

Use `cva` for structured variants + Radix `Slot.Root` for composability:

```ts
// src/components/ui/button.tsx
const buttonVariants = cva("...", {
  variants: { variant: {...}, size: {...} },
  defaultVariants: { variant: "default", size: "default" },
})
const Comp = asChild ? Slot.Root : "button"
```

## Data Attributes Are Styling Contract

For primitive components, keep `data-slot` / `data-variant` / `data-size` stable — styles and selectors depend on them:

```tsx
<Comp
  data-slot="button"
  data-variant={variant}
  data-size={size}
  className={cn(...)}
/>
```

## React Compiler Guidance

Repo enables `babel-plugin-react-compiler`; avoid manual memoization by default:

```ts
// vite.config.ts
viteReact({ babel: { plugins: ['babel-plugin-react-compiler'] } })
```

业务代码当前**没有**手写 `useCallback` / `useMemo`（仅 `src/components/ui/sidebar.tsx` shadcn vendor 内有 2 处，属上游资产）。除非 React Compiler 明确拒绝优化某段代码（profiler 验证后），否则不要新增手动 memo——这是 baseline。

## Accessibility Baseline

Interactive elements without visible text must include accessible labeling (`aria-label`, `aria-pressed`, or `sr-only`):

```tsx
// src/components/ThemeToggle.tsx
aria-label={label}
title={label}

// src/components/LocaleSwitcher.tsx
aria-label={m.language_label()}
aria-pressed={locale === currentLocale}

// src/components/layout/app-sidebar.tsx — icon-only 控件必须有 sr-only 文本
<span className="sr-only">{m.nav_collapse_label()}</span>
```

**i18n gotcha**: all a11y labels (`aria-label`, `alt`, `sr-only`, `title`) must route through Paraglide `m.xxx()` — never hard-coded CJK/EN. See `frontend/i18n.md`.

## 命名契约

`src/components/<domain>/*.tsx`：

- **文件名**：kebab-case（`app-sidebar.tsx`、`organization-switcher.tsx`、`impersonation-banner.tsx`、`app-tabbar.tsx`、`app-site-sidebar.tsx`）。
- **export name**：PascalCase（`AppSidebar`、`OrganizationSwitcher`、`ImpersonationBanner`、`AppTabbar`、`AppSiteSidebar`）。
- **shadcn 原语豁免**：`src/components/ui/*` 跟随 shadcn 上游约定（`button.tsx` / `select.tsx` 单词无连字符）——属 vendor 资产，不强制。

PR2 已把 `components/layout/` 的 5 个 PascalCase 文件全量改 kebab-case，新增组件按本契约书写，避免漂移。

## Forbidden Patterns

- Building class strings manually (`className={a + " " + b}`) instead of `cn()`.
- Importing shadcn primitives from npm packages instead of local `src/components/ui/*`.
- Hand-editing generated artifacts (`src/routeTree.gen.ts`, `zenstack/*.ts`, `src/paraglide/*`).
- Hard-coded CJK/EN text in JSX (use `m.xxx()`).
- Custom CSS variables (`--sea-ink`, etc.) — use shadcn tokens (`frontend/theming.md`).

```ts
// ✅ Local primitive re-export
import { Button } from '#/components/ui/button'
import { Input }  from '#/components/ui/input'
```
