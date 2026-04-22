# Component Guidelines

> Frontend component conventions based on current repository patterns.

---

## Component Tiers

Two explicit tiers:

- **Primitive UI tier**: `src/components/ui/*` (shadcn-style, variant-driven, reusable primitives).
- **Domain/UI composition tier**: `src/components/*.tsx` and `src/integrations/**/*.tsx`.

```ts
// src/components/ui/button.tsx (primitive)
const buttonVariants = cva(...)

// src/components/Header.tsx (composition)
export default function Header() {
  return <header ...>
}

// src/integrations/better-auth/header-user.tsx (integration)
export default function BetterAuthHeader() {
  const { data: session, isPending } = authClient.useSession()
}
```

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

One explicit `useCallback` in `src/routes/demo/orpc-todo.tsx` should be treated as an exception, not baseline style:

```ts
const submitTodo = useCallback(() => {
  addTodo({ name: todo })
}, [addTodo, todo])
```

## Accessibility Baseline

Interactive elements without visible text must include accessible labeling (`aria-label`, `aria-pressed`, or `sr-only`):

```tsx
// src/components/ThemeToggle.tsx
aria-label={label}
title={label}

// src/components/LocaleSwitcher.tsx
aria-label={m.language_label()}
aria-pressed={locale === currentLocale}

// src/components/Header.tsx
<span className="sr-only">Follow TanStack on X</span>
```

**i18n gotcha**: all a11y labels (`aria-label`, `alt`, `sr-only`, `title`) must route through Paraglide `m.xxx()` — never hard-coded CJK/EN. See `frontend/i18n.md`.

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
