# Research: current-paraglide

- **Query**: Paraglide integration state + gap vs R13
- **Scope**: internal
- **Date**: 2026-04-22

## Files & config

| Path | Role |
|---|---|
| `project.inlang/settings.json` | Paraglide project config |
| `messages/en.json`, `messages/de.json` | Existing message files (EN + DE) |
| `src/paraglide/*` (generated) | Runtime + messages, imported via `#/paraglide/...` |
| `vite.config.ts:14-18` | `paraglideVitePlugin({ project: "./project.inlang", outdir: "./src/paraglide", strategy: ["url", "baseLocale"] })` |
| `package.json:86` | `@inlang/paraglide-js ^2.16.0` (devDependency) |
| `src/routes/__root.tsx:15,35,108` | Reads `getLocale()` from `#/paraglide/runtime` for `<html lang>` |
| `src/components/LocaleSwitcher.tsx` | Only consumer of `m.*()` calls today |

## Current `project.inlang/settings.json`

```json
{
  "baseLocale": "en",
  "locales": ["en", "de"],
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@4/dist/index.js",
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-m-function-matcher@2/dist/index.js"
  ],
  "plugin.inlang.messageFormat": {
    "pathPattern": "./messages/{locale}.json"
  }
}
```

## Existing `messages/en.json` (full content)

```json
{
  "$schema": "https://inlang.com/schema/inlang-message-format",
  "home_page": "Home page",
  "about_page": "About page",
  "example_message": "Welcome to your i18n app.",
  "language_label": "Language",
  "current_locale": "Current locale: {locale}",
  "learn_router": "Learn Paraglide JS"
}
```

Only 6 starter keys. `messages/de.json` has the same keys translated.

## Usage footprint

`grep m\.[a-z_]+\(\)` over `src/` returns exactly **one** consumer (`src/components/LocaleSwitcher.tsx:22,25`). No page or sidebar string currently goes through Paraglide.

Runtime wiring:

- `src/routes/__root.tsx:33-37` — `beforeLoad` sets `document.documentElement.lang = getLocale()`.
- `src/routes/__root.tsx:108` — `<html lang={getLocale()}>`.
- **No cookie / SSR-level locale negotiation** beyond the URL strategy registered in `vite.config.ts`.

## Hard-coded Chinese literals in components (R13 migration targets)

Total: 22 occurrences across 6 files (via Grep `[一-鿿]` under `src`):

| File | Count | Highlights |
|---|---|---|
| `src/components/confirm-dialog.tsx` | 6 | `"确认删除"`, `"取消"`, `"处理中..."`, `"请输入…"`, `"以确认"` |
| `src/components/data-table/data-table-pagination.tsx` | 7 | `"共 N 条"`, `"N 条/页"`, `"第 N / M 页"`, aria-labels `"第一页"`/`"上一页"`/`"下一页"`/`"最后一页"` |
| `src/components/data-table/data-table.tsx` | 1 | `emptyText = "暂无数据"` |
| `src/components/form-drawer.tsx` | 3 | `submitText = "保存"`, `"取消"`, `"提交中..."` |
| `src/components/layout/AppTabbar.tsx` | 3 | `"关闭标签页"`, `"关闭其他"`, `"关闭右侧"` |
| `src/components/layout/AppSidebar.tsx` | 2 | `"暂无可访问的菜单"`, group label `"导航"` |

Hard-coded English still exists in pages (`OrganizationPage`, `UsersPage`, etc.) — the full zh-CN migration has *not yet been done*, but UI is already mostly Chinese in the common components.

## Gaps vs PRD R13

1. **baseLocale swap** — `project.inlang/settings.json` still has `baseLocale: "en"` and ships `de.json`. PRD wants `baseLocale: "zh"`, `locales: ["zh", "en"]`, delete `de.json`, add `zh.json` + empty `en.json`.
2. **No Menu i18n key rendering strategy** — `src/components/layout/AppSidebar.tsx:89,110` renders `child.meta?.title ?? child.name ?? child.path` directly. Must insert fallback:
   ```tsx
   const t = node.meta?.title;
   const label = t?.startsWith("menu.") ? m[t]?.() ?? t : t;
   ```
   Note the dynamic `m[t]` lookup — Paraglide generates named exports, not a keyed map. Will likely need a wrapper function / codegen map. See `src/paraglide/messages/_index.js` for the generated shape.
3. **Hard-coded literals** — every string above becomes a `m.<key>()` call; need ~22 + N(page-level) new keys in `zh.json`.
4. **BA error translation** — no `translateAuthError(code)` helper; PRD wants `src/lib/auth-errors.ts` mapping `INVALID_EMAIL_OR_PASSWORD` → 中文.
5. **Email template i18n** — react-email templates must pull via Paraglide (`m.email_verify_title()`), which requires the runtime being callable outside of a React request context (server-safe `getLocale()` or hard-default to `"zh"`).
6. **LocaleSwitcher removal** — PRD §R13 says "不做语言切换 UI"; `src/components/LocaleSwitcher.tsx` can be deleted or kept out of layout (currently isn't wired into `_layout.tsx`).

## Constraints / surprises

- `strategy: ["url", "baseLocale"]` — URL strategy means `/zh/...` paths could be inferred; TanStack Router routes are currently un-prefixed (`/dashboard` not `/zh/dashboard`). After switching `baseLocale` to `"zh"`, the absent prefix resolves to baseLocale. Safe, but verify there is no accidental EN detection when someone hits `/en/*`.
- Paraglide-generated `messages.js` exports are typed per-key. Runtime `m[key]()` indexing is possible but loses type safety — acceptable for the Menu fallback, but add `as keyof typeof m` cast.
- Biome-lint is tolerant of `m.*()` keys; ensure new keys follow `snake_case` (the convention in existing `en.json`).
