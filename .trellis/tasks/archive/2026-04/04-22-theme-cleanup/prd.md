# theme-cleanup: 移除 TanStack Start demo 水绿色，统一 shadcn/ui 默认配色

## Goal

清除项目里 TanStack Start 启动模板遗留的水绿色（sea / lagoon / palm / foam / sand 等）demo 主题，
使整个后台只依赖 shadcn `zinc` 基座的 CSS 变量。目标是**视觉一致性 + 移除双轨配色系统**，
让未来 better-auth-ui shadcn 组件、业务页面、已经 shadcn add 进来的 29 个 UI 组件全部落在同一套
token 上，避免"新组件是黑白、旧页面是水绿"的撕裂感。

## What I already know

- `components.json`：`style=new-york / baseColor=zinc / cssVariables=true`，**shadcn 配置已经是目标状态**
- `src/styles.css`：shadcn zinc token 已完整声明（:root / .dark 两组），legacy demo token 与之**并列存在**
- legacy 污染范围只有 4 个文件：`styles.css` / `ThemeToggle.tsx` / `(admin)/_layout/dashboard.tsx` / `about.tsx`
- better-auth-ui shadcn 变体的组件**直接用项目的 shadcn token**（zinc），无需额外映射
- `@theme inline` 块已经把 shadcn 变量映射到 Tailwind，**只要删除 legacy 即可**
- `@layer base { body { background-color: var(--background); color: var(--foreground); } }` 已经存在于 styles.css 末尾，但被 `body { background: radial-gradient(...) }` 的更高特异性规则覆盖

## Assumptions (temporary)

- 所有使用 legacy token 的自定义 CSS 类（`island-shell / feature-card / nav-link / island-kicker / display-title / rise-in / page-wrap / site-footer`）在**后台业务路由**里已无引用（需 grep 再验证）
- `next-themes` 现在未用；主题切换由 `ThemeToggle.tsx` 手写 light/dark/auto 三态维护
- `about.tsx` 是 TanStack Start 模板遗留，可直接删除或重写

## Research Notes

### better-auth-ui shadcn 变体的配色

shadcn 变体 = CLI 把组件源码复制进本项目（见 `docs/research/better-auth-ui-shadcn-variant.md`）。
组件用的是项目 `components.json` 里声明的 baseColor（本项目=zinc），因此只要本项目的 zinc token
齐全一致，ba-ui 的 `<Auth />` / `<UserButton />` / `<Settings />` 渲染即天然统一，无需做 override。

### shadcn zinc 基座（已在 styles.css 声明）

覆盖 `background / foreground / card / popover / primary / secondary / muted / accent / destructive / border / input / ring / chart-1..5 / sidebar-*`，light+dark 双套。
即 shadcn CLI 官方 baseline，与 better-auth-ui 文档 demo 完全一致。

## Open Questions

（已收敛，MVP = Full 档）

## Requirements

### R1 · 清除 legacy CSS 变量
从 `src/styles.css` 删除 TanStack Start demo tokens（light+dark 两份）：
`--sea-ink / --sea-ink-soft / --lagoon / --lagoon-deep / --palm / --sand / --foam / --surface / --surface-strong / --line / --inset-glint / --kicker / --bg-base / --header-bg / --chip-bg / --chip-line / --link-bg-hover / --hero-a / --hero-b`

### R2 · 清除 demo 背景层
删除 `body { background: radial-gradient(...) }`、`body::before`、`body::after` 三段 demo 背景，让 `@layer base` 里已有的 `background-color: var(--background); color: var(--foreground);` 自然生效。

### R3 · 清除 demo 自定义类
删除 legacy CSS 类（grep 验证无引用）：
`.island-shell / .feature-card / .nav-link / .island-kicker / .display-title / .page-wrap / .rise-in / .site-footer`

同时删除 `a / code / pre code / .prose pre / button transition` 等用 legacy var 的块。

### R4 · 移除 Google Fonts + Fraunces + Manrope
- 删掉 `@import url('https://fonts.googleapis.com/...')`（PR2 手工做，legacy 清理的一部分）
- `@theme inline` 里的 `--font-sans` 值由 PR3 `shadcn apply` 按 preset 应用（Inter heading 等 shadcn 内置字体方案）
- 如果 preset 应用后的字体方案不理想（如引入了新的 Google Fonts CDN），PR5 后手工调整为系统字体栈 `ui-sans-serif, system-ui, ...`

### R5 · `dashboard.tsx` 改 shadcn `<Card>`
用 `<Card><CardHeader><CardTitle><CardDescription></CardHeader><CardContent>...` 重写两块区域；移除所有 `[var(--...)]` 硬编码；用 `text-muted-foreground` / `border` / `bg-card` 等标准 token。

### R6 · 按 shadcn 官方 TanStack Start dark mode 指南自写 ThemeProvider
**⚠️ 二次反转（主人提问后）**：shadcn 官方有 `ui.shadcn.com/docs/dark-mode/tanstack-start` 专门指南，推荐**自写 `theme-provider.tsx`（~80 行）+ `mode-toggle.tsx`**，用 **TanStack Router 原生 `<ScriptOnce>`** 注入 FOUC 脚本。**零运行时依赖**。这才是官方最佳实践，**不用 next-themes 也不用 tanstack-theme-kit**。

实施步骤：

1. **新建 `src/components/theme-provider.tsx`**（按 shadcn 官方模板，见 `research/next-themes-tanstack-start.md` 附录）：
   - `ThemeProvider` 组件包 Context + `<ScriptOnce>{getThemeScript(...)}</ScriptOnce>`
   - `useTheme()` hook 返回 `{ theme, setTheme }`
   - `getThemeScript()` 生成的 IIFE 功能等价于项目现有 `THEME_INIT_SCRIPT`（可直接移植逻辑）

2. **改写 `src/routes/__root.tsx`**：
   - 删除现有 `THEME_INIT_SCRIPT` 常量
   - 删除 `<script dangerouslySetInnerHTML>` 注入（改由 ThemeProvider 内部的 ScriptOnce 完成）
   - `<html lang suppressHydrationWarning>` **保留不动**（line 111 已挂对）

3. **改写 `src/components/providers.tsx`**：
   - 最外层包 `<ThemeProvider defaultTheme="system" storageKey="theme">`（from `#/components/theme-provider`）
   - `AuthProvider appearance={{ theme, setTheme }}` 接通 `useTheme()`（修掉当前断裂）

4. **重写 `src/components/ThemeToggle.tsx`**（重命名为 `mode-toggle.tsx` 保持与 shadcn 官方命名一致，或保留原名）：
   - shadcn `<DropdownMenu>` + lucide `Sun / Moon` 图标（官方模板是二图标交叉 rotate 动画，不是 Sun/Moon/Monitor 三图标，按官方来）
   - 三个 `<DropdownMenuItem>`：Light / Dark / System，调 `useTheme().setTheme(...)`
   - 删除现有的手写 `getInitialMode / applyThemeMode / useEffect` 逻辑（迁到 ThemeProvider）

**零新增依赖**：`<ScriptOnce>` 来自 `@tanstack/react-router`（已装）。

### R7 · `about.tsx` 直接删除
TanStack Start demo 遗留，后台无业务意义。同时检查 routes 里是否还有导航链接，一并清理。

### R8 · baseColor 从 zinc 切到 neutral
跟进 shadcn 官方最新默认（2026 年起 neutral 成为 Web UI 默认 baseColor）：

- `components.json` 的 `tailwind.baseColor` 从 `"zinc"` 改为 `"neutral"`
- `styles.css` 的 `:root` 和 `.dark` 里所有 shadcn token 的色值换成 neutral 版（hue 值 285→0，chroma 置 0，参考 https://ui.shadcn.com/docs/theming 的 Default Theme CSS）

**实施说明**：由 PR3 的 `shadcn apply --preset bIkez2m` **自动完成**，无需手工改 `components.json` 或 `styles.css` 色值。

### R9 · Radius scale 公式升级到 2026 新版
`@theme inline` 里的 radius scale 从 `calc(var(--radius) - 4px/2px)` 公式改为官方 2026 新公式：

```css
--radius-sm: calc(var(--radius) * 0.6);
--radius-md: calc(var(--radius) * 0.8);
--radius-lg: var(--radius);
--radius-xl: calc(var(--radius) * 1.4);
--radius-2xl: calc(var(--radius) * 1.8);
--radius-3xl: calc(var(--radius) * 2.2);
--radius-4xl: calc(var(--radius) * 2.6);
```

**实施说明**：由 PR3 的 `shadcn apply --preset bIkez2m` **自动完成**，无需手工改。`--radius: 0.625rem = 10px` 下前 4 档与旧公式像素恒等，零视觉 regression。

### R10 · style 从 new-york 迁到 radix-vega（**三次修订后最终版**）
**⚠️ 主人追问 + 二次核实后的决策链**：

1. 原计划 `base-nova` → 改 `radix-nova`（避免 Base UI primitive 切换 / 48 处 asChild 迁移）
2. 主人观察到 shadcn/create Web UI 默认 **Vega**（不是 Nova）→ 改 **`radix-vega`**

**最终决策**：`components.json` 的 `style: "new-york"` → `"radix-vega"`。

理由：
- Vega = 原 new-york 改名（shadcn 2026 schema 命名），视觉延续
- ba-ui 的三个 registry（`src/components/auth | user | settings/`）本就以 Vega 视觉为基线——选 Vega = **零视觉割裂**
- Web UI 默认首选，生态积累最深（blocks / v0 / third-party registry 全以 Vega 为基线）
- 保留 Radix primitive（48 处 asChild 零改动）

**实施方式变更**：不再手工 `shadcn add --overwrite` 28 个组件。改用 **2026-04 新增的 `shadcn apply --preset` 命令**：

```bash
# 一条命令完成：components.json 更新 / styles.css 色值换 neutral / radius 公式升级 / font / icons / 28 组件 reinstall
pnpm dlx shadcn@latest apply --preset bIkez2m
```

preset `bIkez2m` 对应 shadcn/create 可视化配置（Vega + Neutral + Neutral Theme + Neutral Chart + Inter heading）。

**回滚策略**：`shadcn apply` 没有 `--dry-run`。依赖 git 做 undo 层——本 task brainstorm 产出 commit 后跑 apply，`git diff` review 不满意时 `git reset --hard HEAD^`。

**以下为原 radix-nova 方案遗留记录（不执行）**：

```bash
# 先用 --diff 预览单个组件的变化（shadcn/cli v4 新增 flag）
pnpm dlx shadcn@latest add button --diff
pnpm dlx shadcn@latest add card --diff

# 确认可接受后再批量 --overwrite
pnpm dlx shadcn@latest add button card input select dialog alert-dialog \
  avatar badge breadcrumb checkbox dropdown-menu field form \
  input-group label radio-group separator sheet sidebar skeleton \
  slider sonner spinner switch table tabs textarea tooltip \
  --overwrite
```

**受影响的自写组件**（re-add 后 diff + 手工复核）：
- `src/components/data-table/`（基于 Table + TanStack Table）：`fuzzyFilter` 补丁在 data-table.tsx 自身，**不**在 ui/table.tsx，无冲突；但要目测 Table 新 spacing 是否破坏分页布局
- `src/components/form-drawer.tsx`（基于 Sheet + Field + Form）：Sheet 的新 padding 可能让 drawer 内表单紧贴边
- `src/components/confirm-dialog.tsx`（基于 AlertDialog）：新 AlertDialog footer 间距要目测
- `src/components/layout/AppSidebar.tsx` / `AppTabbar.tsx`（基于 Sidebar）：sidebar 19.9K 最大，overwrite 后要全走一遍 dashboard
- `biome.json` 的 `src/components/ui/**` a11y overrides：保留（Nova 组件大概率还是用 `div role="..."` 套路）

**Nova 视觉特征预期**：radius 相同（已证明）、padding 普遍更紧（`h-9 → h-8` / `px-3 → px-2.5` 这类微调）、min-height 更小。适合 dashboard/admin，与项目定位吻合。

### R11 · better-auth-ui 三个 registry 重新 add → **跳过（决策：No）**
**⚠️ 三次修订的最终理由**：项目 style 留在 **Vega 家族（`radix-vega`）**，ba-ui 本就以 Vega 为视觉基线——**天然视觉匹配**，完全没必要 re-add。

**决策**：不重 add ba-ui 三个 registry。保留 `src/components/auth/ | user/ | settings/` 源码不动。

**零割裂代价**：由于最终 style 选 Vega，框架（Vega）+ ba-ui 页面（Vega）完全统一，不存在原 radix-nova 方案下"4px 级 padding 割裂"的问题。

## Acceptance Criteria

- [ ] `grep -r 'var(--sea-ink\|--lagoon\|--palm\|--sand\|--foam\|--surface\|--line\|--kicker\|--bg-base\|--header-bg\|--chip-bg\|--chip-line\|--hero-a\|--hero-b\|--inset-glint\|--link-bg-hover' src/` 零命中
- [ ] `grep -rE 'island-shell|feature-card|nav-link|island-kicker|display-title|page-wrap|rise-in|site-footer' src/` 零命中
- [ ] `grep 'fonts.googleapis\|Fraunces\|Manrope' src/` 零命中
- [ ] `styles.css` 行数 < 100（当前 347 行，预计降到 80-90）
- [ ] 自写 `theme-provider.tsx` + `useTheme()` hook 正确挂载，ThemeToggle 切换 light/dark/system 三态时 `<html>` class 正确变更
- [ ] `ba-ui` 的 `<Auth />` / `<UserButton />` / `<Settings />` 主题跟随自写 ThemeProvider（dark 模式下自动切 dark）
- [ ] 浏览器（chrome-devtools MCP）在 light + dark 两个模式下验证：`/dashboard` / `/auth/sign-in` / `/users` / `/organization` / `/settings/account` 视觉统一（Vega 视觉延续，与 ba-ui 天然匹配）
- [ ] `/about` 路由 404（确认删除）
- [ ] `components.json` 里 `baseColor: "neutral"` + `style: "radix-vega"`（保留 Radix primitive + Vega 视觉 + ba-ui 匹配）
- [ ] `styles.css` 里 `--foreground` 的 chroma 值为 0（`oklch(0.145 0 0)`，neutral 特征）
- [ ] `@theme inline` 里 radius scale 用 `* 0.6/0.8/1.4/1.8/2.2/2.6` 新公式
- [ ] 29 个 shadcn UI 组件已按 base-nova 重新 add（git diff 可见结构变化）
- [ ] `src/components/{data-table,form-drawer,confirm-dialog}/` 自写组合组件视觉无破相（chrome-devtools 双模式验证）
- [ ] `pnpm check` / `pnpm test` / `pnpm build` 全绿

## Definition of Done

- Biome check green
- 手动在浏览器（chrome-devtools MCP）验证 light + dark 两个主题下至少 3 个页面（/dashboard / /auth/sign-in / /users）
- PRD + session record 同步更新

## Out of Scope (explicit)

- 新增品牌色 / 业务配色层（等有实际品牌 need 再开 task）
- 重写 sidebar / header 布局
- 国际化 dashboard 文案
- 给业务页面加装饰图/插画
- 新 base color 里的 Mauve / Olive / Mist / Taupe（2026 新增但非 shadcn/create 默认，走 neutral 即可）

## Technical Notes

- `@layer base { body { background-color: var(--background); color: var(--foreground); } }` 已存在，删除 override 后即自动生效
- ThemeToggle 迁移可选：
  - A. 保留纯 vanilla 三态按钮，只把 className 换成 shadcn token（`bg-background border text-foreground`）——最小改动
  - B. 改成 shadcn `<DropdownMenu>` + lucide `Sun/Moon/Monitor` 图标，与 better-auth-ui 官方 demo 对齐——推荐
- `about.tsx` 简单看一眼决定删或留
- 字体：目前 `@import url('https://fonts.googleapis.com/...Fraunces...Manrope...')` + `@theme inline { --font-sans: 'Manrope', ... }`。shadcn 默认不指定字体（靠系统 sans）。Manrope 要保留吗？（待确认）

## Decision (ADR-lite)

**Context**: 项目已经是 shadcn `zinc` 基座，但 TanStack Start 启动模板的水绿色 demo token 还并存于 styles.css，造成视觉双轨和主题切换断裂。主人需要与 better-auth-ui shadcn 变体视觉统一。

**Decision**（三次修订后最终版）: 
- 清 legacy tokens + body gradient + demo classes + `about.tsx`
- ThemeToggle 按 **shadcn 官方 TanStack Start dark mode 指南自写**（零依赖，用 `<ScriptOnce>`）
- 字体按 preset `bIkez2m` 应用（Inter heading，body 由 apply 实际应用后确认）
- **shadcn baseColor: zinc → neutral**
- **style: new-york → `radix-vega`**（非 base-nova / 非 radix-nova；Vega = Web UI 默认 + ba-ui 天然匹配 + 保留 Radix primitive）
- **radius scale 公式升级**（前 4 档像素恒等，零风险）
- **实施方式**：`shadcn apply --preset bIkez2m` 一条命令替代手工 28 组件 re-add
- **ba-ui 三 registry 跳过 re-add**（Vega 本就匹配，零割裂）

**修订决策链**（3 轮）：
1. 原计划 `base-nova` —— PR0 研究发现 base-nova 含 primitive 库切换（Radix → Base UI）+ 48 处 asChild 迁移 → 改 `radix-nova`
2. 主人追问 "next-themes 是最佳实践吗" —— 发现 shadcn 官方有 TanStack Start dark mode 专指南，推荐自写 + `<ScriptOnce>`，**零依赖**
3. 主人观察 shadcn/create Web UI 默认 **Vega**（不是 Nova）+ 发现 `shadcn apply --preset` 新命令 —— 改 `radix-vega` + 一条命令实施

每轮修订都降低了风险面 + 减少工作量。

**Consequences**（三次修订后最终版）:
- ➕ 与 shadcn/create Web UI 默认 preset 对齐，blocks / v0 / ba-ui 视觉 100% 统一，**零割裂**
- ➕ 自写 ThemeProvider + `<ScriptOnce>` 修好 AuthProvider appearance 断裂 + 零运行时依赖 + 跟 shadcn 官方指南走
- ➕ 移除 Google Fonts CDN 依赖（字体 preset 应用 Inter 等 shadcn 内置）
- ➕ radius scale 新公式前 4 档像素恒等，未来调 `--radius` 整体更自然
- ➕ 保留 Radix 原语：48 处 asChild、React Query devtools、所有 TanStack Router `<Link asChild>` 零改动
- ➕ `shadcn apply` 一条命令替代手工 28 组件 re-add：工作量从 3h → 0.5h，错误面大幅缩减
- ➖ `shadcn apply` 是 2026-04 新命令，无 `--dry-run`——依赖 git 做 undo 层（先 commit brainstorm 产出作为锚点，不满意 `git reset --hard`）
- ⚠️ 总工作量 **~6-7h**（比原 "radix-nova 全切" 9-10h 省 3h；比 Full 档 6.5h 持平）

**Consequences**:
- ➕ 与 better-auth-ui docs demo / shadcn docs 完全一致，新页面直接抄 shadcn 官方示例零适配
- ➕ next-themes 修好 `AuthProvider appearance={{ theme, setTheme }}` 的断裂链路
- ➕ 移除 Google Fonts CDN 依赖，SSR 首屏无阻塞
- ➖ 失去水绿色 demo 的视觉记忆点（但本来就是模板残留，不是品牌资产）
- ⚠️ 未来若要加品牌色，新开 task 在 zinc 之上叠 accent token，不回头走水绿色路线

## Implementation Plan (small PRs)

**PR0 · 验证 + 前置研究**（~1h，开工第一步）
- `trellis-research` 子代查：
  1. `base-nova` style 是否已 stable 发布、CLI `add --overwrite` 是否稳定
  2. better-auth-ui 三个 registry JSON 的 `style` 字段是什么、是否已适配 base-nova
  3. next-themes 在 TanStack Start SSR 下的 hydration 注意事项（`suppressHydrationWarning` 挂法）
  4. shadcn 2026 新 radius 公式 vs 旧 `- 4px/2px` 对 29 个组件的实际视觉影响（找 blog / changelog / demo 对比）
- 输出 `.trellis/tasks/04-22-theme-cleanup/research/` 下的研究 md
- 根据结论决定 R11 是否执行 ba-ui re-add

**PR1 · Theme infrastructure**（~1.5h，按 shadcn 官方 TanStack Start 指南）
- **无新增依赖**（`<ScriptOnce>` 来自已装的 `@tanstack/react-router`）
- 新建 `src/components/theme-provider.tsx`（~80 行，按 `ui.shadcn.com/docs/dark-mode/tanstack-start` 官方模板）
- 改写 `src/routes/__root.tsx`：删 `THEME_INIT_SCRIPT` 和 `<script dangerouslySetInnerHTML>`（迁到 ThemeProvider 内的 ScriptOnce）；`<html suppressHydrationWarning>` 保留
- 改写 `src/components/providers.tsx`：最外层包 `<ThemeProvider>`；`AuthProvider appearance={{ theme, setTheme }}` 接通 `useTheme()`
- 重写 `src/components/ThemeToggle.tsx`：按 shadcn 官方 `mode-toggle.tsx` 模板（DropdownMenu + Sun/Moon 交叉动画 + 三项 light/dark/system）

**PR2 · styles.css 归零**（~1.5h，**与 PR3 apply 解耦：只处理 legacy 清理**）
- 删 legacy tokens（`--sea-ink / --lagoon / --palm / --sand / --foam / --surface / --line / --kicker / --bg-base / --header-bg / --chip-bg / --chip-line / --hero-a-b / --inset-glint / --link-bg-hover`）
- 删 body gradient（`body { background: radial-gradient(...) }` + `body::before` + `body::after`）
- 删 demo 自定义类（`.island-shell / .feature-card / .nav-link / .island-kicker / .display-title / .page-wrap / .rise-in / .site-footer`）
- 删 Google Fonts `@import url('...Fraunces...Manrope...')`
- **注意**：`:root` / `.dark` 的 shadcn zinc 色值 + `@theme inline` 里的 `--font-sans` 留给 PR3 的 `shadcn apply` 自动处理，PR2 不碰
- `styles.css` 预期从 347 行降到 ~100 行

**PR3 · shadcn apply --preset 一条命令**（~0.5-1h，**已被 apply 命令大幅简化**）
- 前置：先 commit 本次 brainstorm 产出（PRD + 5 份 research）建立 undo 锚点
- 跑 `pnpm dlx shadcn@latest apply --preset bIkez2m`（`shadcn apply` 无 `--dry-run`）
- 一条命令自动完成：
  - `components.json`：`style: new-york → radix-vega`，`baseColor: zinc → neutral`
  - `src/styles.css`：`:root` + `.dark` 色值换 neutral，radius scale 公式升级
  - 28 个 shadcn UI 组件 reinstall 为 Vega 版（视觉延续 new-york）
  - font / icons 按 preset 应用
- `git diff` review 所有变更
- 跑 dev server 走查：dashboard / users / menus / organization / /auth/sign-in / /settings/account
- 不满意 → `git reset --hard HEAD^`（回到 brainstorm commit）
- git diff 每个组件，记录结构性变化
- 跑 dev server 全站走查：
  - `/dashboard`（Card / 按钮）
  - `/users`（DataTable / FormDrawer / ConfirmDialog）
  - `/menus`（DataTable 的 tree padding）
  - `/organization`（Sheet-based invite flow）
  - `/auth/sign-in`（ba-ui `<Auth />`，暂旧 style）
  - `/settings/account`（ba-ui `<Settings />`，暂旧 style）
  - 侧栏 / Tabbar / Header
- 修自写组件的 className 破相点（FormDrawer padding / ConfirmDialog footer / DataTable 分页）
- biome.json overrides 重新审视（可能某些规则新组件已自带解决）

**PR4 · ~~已删除~~**（三次修订后彻底无必要：style 留 Vega → ba-ui 天然匹配，零割裂）

**PR5 · Page migration**（~1.5h）
- `dashboard.tsx` 改 shadcn `<Card>` 重写
- 删 `src/routes/about.tsx`
- 全 src grep 验证 legacy token / Fraunces / Manrope 零命中

**PR6 · QA + finish**（~1h）
- chrome-devtools MCP：light + dark × 7 个页面视觉验证
- `pnpm check` / `pnpm test` / `pnpm build` 全绿
- trellis-check 扫一遍
- 更新 `docs/research/better-auth-ui-shadcn-variant.md` 的"实施反馈"段记录 base-nova 迁移经验

**总预估**：**6-7h**（三次修订后最终版），分 1-2 个工作日完成。
- PR0 研究：零 primitive 迁移（vs base-nova 省 2h）
- 发现 `shadcn apply` 命令：PR3 从 3h → 0.5-1h
- 选 radix-vega：ba-ui 跳过 re-add（原计划条件执行的 PR4 彻底删除）
- 自写 theme-provider：省去引入 next-themes / tanstack-theme-kit 的验证时间
