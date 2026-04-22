# Theming

> Executable contract for the shadcn-based theming system: style schema, dark mode wiring, AuthProvider appearance bridge, and how to evolve the preset safely.

---

## 1. Scope

Triggers when work touches any of:
- `components.json` (`style` / `tailwind.baseColor`)
- `src/styles.css` (CSS tokens / `@theme inline` / radius scale / font)
- `src/components/theme-provider.tsx` / `ThemeToggle.tsx`
- `<html>` / `<body>` / `<ThemeProvider>` mount order
- Installing or migrating shadcn `@import "shadcn/tailwind.css"` dependency
- Adding a new `baseColor` / `style` via `shadcn apply`

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
- radius scale uses multiplier formula; do not revert to `calc(var(--radius) ± Npx)`.
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

- `<ThemeProvider>` injects FOUC-prevention script via `<ScriptOnce>` (from `@tanstack/react-router`). No manual `<script dangerouslySetInnerHTML>` needed.
- `<Providers>` **must** be a child of `<ThemeProvider>` because it consumes `useTheme()` to wire `AuthProvider appearance`.

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

---

## 4. Validation & Error Matrix

| Condition | Symptom | Fix |
|---|---|---|
| `useTheme()` called outside `<ThemeProvider>` | throws `"useTheme must be used within a ThemeProvider"` | Mount `<ThemeProvider>` above the caller |
| `localStorage["theme"]` holds legacy value (e.g. `"auto"` from pre-migration) | falls back to `defaultTheme="system"` on mount; old value overwritten on next `setTheme()` | One-time UX hit, no code fix needed |
| `setTheme` passed to `AuthProvider appearance` without wrapper | TS2322: `(theme: Theme) => void` not assignable to `(theme: string) => void` | Add `setThemeFromAuth` wrapper |
| `<html>` missing `suppressHydrationWarning` | React warns on every navigation about `class` mismatch | Always present on `<html>` |
| `shadcn` moved to devDependencies | Build fails: cannot resolve `shadcn/tailwind.css` | Keep in `dependencies` |
| Manual edit of `:root` hue/chroma without running `shadcn apply` | May drift from chosen baseColor; future `apply` resets it | Always use `shadcn apply --preset <id>` for base/theme/font changes |
| Adding a new `rounded-*` utility assuming old formula | Off-pixel at non-10px `--radius` values | Use multiplier-aware values or tailwind `rounded-{sm/md/lg/xl/2xl}` |

---

## 5. Good / Base / Bad Cases

### Good
- Use shadcn tokens: `bg-background`, `text-foreground`, `text-muted-foreground`, `border`, `bg-card`, `bg-accent`.
- Invoke `useTheme()` inside components under `<ThemeProvider>`; expose `setTheme` only through `ThemeToggle` or `AuthProvider appearance`.
- Change theme visuals via `pnpm dlx shadcn@latest apply --preset <id>` → commit diff.

### Base
- Inline variable fallback like `text-[var(--muted-foreground,#fallback)]` works but is **redundant** post-apply — strip the fallback in follow-up cleanup.
- Hardcoding `oklch(...)` in a one-off component — acceptable for truly ad-hoc colors (chart gradients, illustrations), but prefer `--chart-*` tokens.

### Bad
- Custom CSS variables like `--sea-ink / --lagoon / --chip-bg` (legacy demo tokens) — forbidden; use shadcn tokens only.
- Hardcoding `#64748b` / `#f1f5f9` style colors in className — breaks dark mode.
- `body { background: radial-gradient(...) }` overriding `var(--background)` — forbidden.
- Installing `next-themes` or `tanstack-theme-kit` — project uses self-written `theme-provider.tsx` (shadcn official TanStack Start recipe). Do not add third-party theme libs.
- Manually editing `components.json#style` without running `shadcn apply` afterwards — leaves CSS out of sync with chosen style.

---

## 6. Tests Required

Theming is a visual contract; automated assertions focus on structural invariants:

| Test | Assertion Point | Type |
|---|---|---|
| `theme-provider.test.tsx` | `useTheme()` throws outside provider | Unit |
| `theme-provider.test.tsx` | `setTheme("dark")` adds `.dark` class to `<html>` and persists to `localStorage` | Integration (jsdom) |
| `theme-provider.test.tsx` | mount with `localStorage["theme"]="foo"` → state falls back to `defaultTheme` | Integration |
| `providers.test.tsx` | `setThemeFromAuth("invalid")` is a no-op (does not call `setTheme`) | Unit |
| Visual smoke (manual via chrome-devtools MCP) | `/dashboard`, `/users`, `/auth/sign-in`, `/settings/account` render coherently in both light + dark | E2E-lite |

Current repo has **no** automated tests for `theme-provider.tsx`; add them when modifying the provider logic.

---

## 7. Wrong vs Correct

### Wrong — hardcoded CSS var with fallback + manual FOUC script

```tsx
// Route with legacy fallback
<p className="text-[var(--muted-foreground,#64748b)]">...</p>

// Root component manually injecting theme script
const THEME_INIT = `(function(){ /* 20 lines of IIFE */ })();`;
<head>
  <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
</head>
```

Problems:
1. Hardcoded `#64748b` breaks dark mode.
2. Hand-rolled script duplicates what `<ScriptOnce>` already provides.
3. Keeping it in sync with `ThemeToggle` logic is error-prone.

### Correct — standard tokens + delegated FOUC via ThemeProvider

```tsx
<p className="text-muted-foreground">...</p>
```

```tsx
// Root: let ThemeProvider own the script
<body>
  <ThemeProvider defaultTheme="system" storageKey="theme">
    <Providers>{children}</Providers>
  </ThemeProvider>
  <Scripts />
</body>
```

Rationale: single source of truth (ThemeProvider injects via `<ScriptOnce>`), tokens respond to `.dark` class automatically, zero drift risk.

---

## Design Decisions

### Decision: `style: "radix-vega"` (not base-nova / radix-nova)

**Context**: shadcn 2026 schema extended styles to `{library}-{style}`. Default CLI `--defaults` uses `base-nova` (Base UI + Nova visual), but shadcn/create Web UI defaults to Vega.

**Options**:
1. `base-nova` — primitive library swap (Radix → `@base-ui/react`). `asChild` becomes `render` prop. Project has 48 `asChild` usages (31 UI + 17 business). Cost: huge.
2. `radix-nova` — keeps Radix, gets compact Nova spacing. But ba-ui's three registries (auth / user-button / settings) ship as **single-style flat URLs** (`better-auth-ui.com/r/*.json` with no `{style}` placeholder) — they bake Vega-era tokens. Mixing Nova framework + Vega ba-ui causes 4px-level padding drift at `/auth/*` and `/settings/*`.
3. `radix-vega` — Vega is the rename of old `new-york`. ba-ui matches it natively. Zero visual split, zero primitive migration. **Chosen.**

**Extensibility**: If the project ever needs a denser admin visual, revisit only after ba-ui officially supports Nova. Until then, `radix-vega` is the stable pick.

### Decision: self-written `theme-provider.tsx` (not next-themes / tanstack-theme-kit)

**Context**: `next-themes` is Next.js-only. `tanstack-theme-kit` is a 0.1.0 community fork of a gist. shadcn publishes an official TanStack Start dark mode recipe at `ui.shadcn.com/docs/dark-mode/tanstack-start` — ~80 lines, uses `@tanstack/react-router`'s `<ScriptOnce>` for FOUC prevention.

**Decision**: Copy the shadcn official template verbatim into `src/components/theme-provider.tsx`. Zero runtime deps, API (`<ThemeProvider>` + `useTheme()`) matches shadcn's Next.js / Vite / Astro / Remix docs.

**Extensibility**: Future features (forced theme per route, theme sync across tabs, custom theme names) follow the same shadcn docs — paste in, adapt.

### Decision: `shadcn apply --preset <id>` over manual `shadcn add --overwrite`

**Context**: shadcn CLI 2026-04 added `apply` command. One invocation updates `components.json` + `:root`/`.dark` CSS + all installed UI components + fonts + icons, given a preset id from `ui.shadcn.com/create`.

**Decision**: Preferred over hand-editing `components.json` + running `shadcn add --overwrite` for each of the 28 components. `apply` has **no `--dry-run`** — always commit current work first so `git reset --hard HEAD^` is a valid undo.

---

## Common Mistakes

### Mistake: adding a theme library "for convenience"

**Symptom**: PR adds `next-themes` or `tanstack-theme-kit` as a dependency.
**Cause**: Assumption that "theme management needs a library".
**Fix**: Use `src/components/theme-provider.tsx`; it already provides `useTheme()` with an identical API.
**Prevention**: See decision above — self-written is project standard.

### Mistake: moving `shadcn` to devDependencies

**Symptom**: `pnpm build` fails with "cannot resolve module `shadcn/tailwind.css`".
**Cause**: Reviewer sees `shadcn` CLI in deps, assumes it's dev-only, reorganizes.
**Fix**: Keep `shadcn` in `dependencies`. `src/styles.css` has `@import "shadcn/tailwind.css"` — runtime import.
**Prevention**: Rule of thumb — anything the bundle resolves at build or run time belongs in `dependencies`, regardless of whether the package also ships a CLI.

### Mistake: hardcoding colors in new components

**Symptom**: New component looks fine in light mode, breaks in dark mode.
**Cause**: Used `bg-white` / `text-gray-900` / `#...` instead of shadcn tokens.
**Fix**: Use `bg-background` / `text-foreground` / `text-muted-foreground` / `border` / `bg-card` / `bg-accent`.
**Prevention**: Reference `src/components/ui/*` source for canonical token usage.

---

## Related

- `docs/research/better-auth-ui-shadcn-variant.md` — full ba-ui integration research + "实施反馈" section with migration learnings
- `docs/research/INDEX.md` — research library index
- `.trellis/spec/frontend/layout-guidelines.md` — `<ThemeProvider>` sits between `<body>` and `<Providers>`; route-group / `_layout` rules are orthogonal
- `.trellis/spec/frontend/component-guidelines.md` — components should consume shadcn tokens exclusively
- shadcn docs: `ui.shadcn.com/docs/theming`, `ui.shadcn.com/docs/dark-mode/tanstack-start`, `ui.shadcn.com/docs/cli#apply`
