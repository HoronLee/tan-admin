# 品牌色统一注入

## Goal

把"品牌主色"从仓库现状（4 处零真相源、没人配也都还能跑）变成**单一真相源 → 多端 surface 自动消费**：Web UI（shadcn token）、邮件模板、`<meta name="theme-color">`（PWA 启动屏 / 移动地址栏）。零代码改动支持甲方"换色交付"。

## Recon Findings（基线现状）

仓库当前 4 个"颜色 surface"：

1. **Web UI / shadcn token** — `src/styles.css` `:root` / `.dark` 各 28 个 CSS var，全 `oklch(L 0 0)` 中性灰（= shadcn neutral baseColor）。`@theme inline` 把 CSS var 桥到 Tailwind `--color-*`。
2. **邮件模板** — `src/components/email/email-styles.tsx` 内置 `defaultColors.{light,dark}` 9 个 hex；`<EmailStyles colors={…}>` 组件 prop 已支持覆盖，**但 8 个邮件模板调用方都没传**，全跑 default。
3. **`brandConfig`** — `src/lib/config.ts` 现仅 `name + 2× logoURL`，**没 color 字段**。
4. **`<meta theme-color>` / manifest** — head 里没 `<meta name="theme-color">`；`public/manifest.json` 也没 `theme_color`。

## Decision (ADR-lite)

**Context**: 现状 4 处零真相源、shadcn 默认中性灰、邮件模板已有 `colors` prop 但调用方没传。需要在不破坏现状（未配置时仍是中性主题）前提下，让甲方"换色交付"零代码可行。

**Decision**: **Approach A 极简 single-color 派生** + 4 项细化：

| 维度 | 决策 |
|---|---|
| **真相源粒度（A/B/C）** | A：只动 `--primary` / `--primary-foreground` / `--sidebar-primary` / `--sidebar-primary-foreground`，destructive / chart / muted / accent 不动。 |
| **Light/Dark 配置形态（1A/1B）** | **1B**：`BRAND_PRIMARY_OKLCH` 必填启用 + `BRAND_PRIMARY_DARK_OKLCH` 可选；后者缺省走 culori 算法派生（`1-L+0.1` clamp [0.55,0.85] + chroma×0.85 + 同 hue）。 |
| **`--ring` focus 圈跟不跟（2A/2B）** | **2B 保持中性**：`--ring` 仍为原 `oklch(0.708 0 0)`，理由：可访问性 + 色弱友好 + 避免与品牌按钮选中态视觉冲突。`--sidebar-ring` 同 2B。 |
| **env 命名空间** | **不带 VITE_ 前缀**（`BRAND_PRIMARY_OKLCH` / `BRAND_PRIMARY_DARK_OKLCH`），纯服务端 env。理由：消费链路全在 server（SSR head 注入 + 邮件 OKLCH→hex 派生），client 通过 CSS `var(--primary)` cascade 消费、不经 JS。CLAUDE.md "前后端共用用 VITE_ 一份"规则前置条件是"前后端都要读"，本字段不属于。 |
| **`<meta name="theme-color">`** | **加**：`__root.tsx` head() 双 media 双值（light + dark）。零额外成本带 PWA 启动屏 + 移动地址栏。manifest.json 暂不动（splash 1-2 秒不值得为它做动态 manifest）。 |

**Consequences**:

- ✅ 甲方换色：只改 `.env.local` 一行（必要时两行），无需改代码 / 重新打包浏览器 bundle。
- ✅ 默认未配置时 100% 同现状（中性灰），非破坏性。
- ✅ shadcn `@theme inline` 桥接保持完好——只在 `:root` / `.dark` 改 `--primary` 这一中层 var，不动 `--color-primary` inline 替换。
- ⚠️ chart-1..5 / destructive 保持中性灰 ramp，强设计驱动客户日后想精细调色需升级到 Approach B（增 4 个 env），但不阻塞本次。
- ⚠️ 邮件输出走 hex（Outlook Windows 经典版 + 国内 webmail 不支持 oklch），server 端用 culori `formatHex` 一次性派生 `brandEmailColors` 后注入 `<EmailStyles colors>`。
- ⚠️ 多 brand SaaS（每 org 自带配色、运行时切换）超出本次范围；本方案锁定"部署级常量"。
- ⚠️ 新增 dependency：`culori` + `@types/culori`（~10KB tree-shaken），server 端 OKLCH→hex 派生 + dark 算法派生兜底。

## Requirements

1. 服务端 env 新增（不带 VITE_）：
   - `BRAND_PRIMARY_OKLCH`（可选；形如 `"0.55 0.18 264"`，三元组裸值；缺省 = `"0.205 0 0"` 即现状黑色）
   - `BRAND_PRIMARY_DARK_OKLCH`（可选；缺省走 culori 派生）
2. `src/styles.css` 中层桥接：
   - 在 `:root` / `.dark` 各加 `--brand-primary` / `--brand-primary-foreground`，并把 `--primary` / `--primary-foreground` / `--sidebar-primary` / `--sidebar-primary-foreground` 改成 `var(--brand-primary)` / `var(--brand-primary-foreground)`。
   - `--ring` / `--sidebar-ring` / 其余 22 个 token **不动**。
3. `src/lib/brand/oklch.ts`（新文件，服务端工具）：
   - `parseOklchTriplet(input: string): {l, c, h}`
   - `deriveBrandPair(light, darkOpt?): { lightCss, darkCss, lightHex, darkHex }`（用 culori `formatCss` + `formatHex`；hex 给邮件用）
4. `src/lib/config.server.ts` 加 `brandColor` 字段：`{ primary: { lightCss, darkCss, lightHex, darkHex } }`，模块顶部一次性算好。
5. `src/routes/__root.tsx` 的 `head()`：
   - 注入 `<style>` 标签：`:root{--brand-primary:<lightCss>;--brand-primary-foreground:<auto>}.dark{--brand-primary:<darkCss>;--brand-primary-foreground:<auto>}`。`-foreground` 用 culori 根据 lightness 选黑/白（L>0.5 → 黑，否则白）。
   - 注入双 `<meta name="theme-color">`：light + dark 两条带 `media` 属性。
6. 邮件统一注入：所有渲染邮件的入口（`src/lib/auth/server.ts` 的 `sendVerificationEmail` / `sendChangeEmail` 之类 + `src/emails/invite-member.tsx` / `transfer-ownership.tsx` 的调用方）从 `appConfig.brandColor` 派生 `EmailColors` 对象，传给模板 `<… colors={brandEmailColors}>`，再透传给 `<EmailStyles colors>`。
7. AGENTS.md 更新：
   - "首次部署 seed 流程 / Env 命名约定" 段补一行——"纯服务端 env（非前后端共用）不加 VITE_，按需逐字段判断"，举 `BRAND_PRIMARY_OKLCH` 为例。
   - "技术栈" 或一个独立段落简述 `BRAND_PRIMARY_OKLCH` / `BRAND_PRIMARY_DARK_OKLCH` 用法。

## Acceptance Criteria

- [ ] `pnpm dev` 不传任何 `BRAND_PRIMARY_*` env 时，UI 颜色与现状完全一致（截图比对前后；focus ring / chart / destructive / sidebar 全无变化）。
- [ ] 配置 `BRAND_PRIMARY_OKLCH="0.55 0.18 264"` 后：
  - [ ] 主按钮（`<Button>`）背景变蓝紫色。
  - [ ] sidebar 当前选中项背景变品牌色。
  - [ ] focus ring 仍是中性灰（验证 2B 决策落地）。
  - [ ] chart / destructive / muted 保持中性灰（验证 Approach A 边界）。
  - [ ] dark mode 下品牌色 lightness 自动派生（不传 `BRAND_PRIMARY_DARK_OKLCH` 时 dark 看着不会过暗）。
- [ ] 同一份 env 配置，邮件模板"Verify"/"Accept invitation"按钮变品牌色：
  - [ ] dev console transport 输出 HTML，肉眼检查 `<a class="bg-primary">` 内联 background-color 是 hex 形式（不是 oklch 字面量）。
- [ ] HTML head 含 `<meta name="theme-color" content="..." media="(prefers-color-scheme: light)">` + dark 同款。
- [ ] `pnpm test` / `pnpm check` / `pnpm build` 全部通过，TypeScript 无 error。
- [ ] AGENTS.md 同步落地（grep 能搜到 `BRAND_PRIMARY_OKLCH`）。

## Definition of Done

- 类型 / lint / test / build 通过。
- AGENTS.md 同步；`.env.example`（如有）增字段，没有就不动。
- `.trellis/spec/` 不强制改（本次决策属于"基础设施配置"，不是新业务约定；如果 review 觉得 `email-infrastructure.md` 应记一笔"邮件 brand 注入路径"，再补）。

## Out of Scope（明示排除）

- favicon.ico / logo PNG 替换（已通过 `VITE_BRAND_LOGO_URL` 走 logo 替换路径，独立机制）。
- chart-1..5 / destructive / accent / muted 调色（保持中性 ramp；未来 Approach B 升级再做）。
- 多主题切换（`data-theme` 多套主题）——主题系统 ≠ 品牌色，不是同一回事。
- 真·多租户"每 org 自带配色"运行时切换——会引入 hydrate FOUC，且 BA organization plan/feature 模型是另一套，本次不动。
- 邮件 `defaultColors` API 重命名 / 搬迁（保持现 API 不变，只让调用方传值）。
- manifest.json 动态化（splash 1-2 秒不值得；将来 SaaS 多 brand 真要切再做）。
- `--ring` / `--sidebar-ring` 跟随品牌（已 2B 决策保持中性）。

## Technical Notes

### 中层桥接关键

```css
/* src/styles.css */
:root {
  /* 默认值 = 当前中性灰，等价现状 */
  --brand-primary: oklch(0.205 0 0);
  --brand-primary-foreground: oklch(0.985 0 0);
  /* shadcn token 改成 var-of-var */
  --primary: var(--brand-primary);
  --primary-foreground: var(--brand-primary-foreground);
  --sidebar-primary: var(--brand-primary);
  --sidebar-primary-foreground: var(--brand-primary-foreground);
  /* --ring / --sidebar-ring / 其余不动 */
}
.dark {
  --brand-primary: oklch(0.922 0 0);              /* 默认 dark 中性灰 */
  --brand-primary-foreground: oklch(0.205 0 0);
}
```

SSR `__root.tsx` head() 注入的 `<style>` 会**追加**在 `src/styles.css` 之后，cascade 自然覆盖默认值。

### foreground 自动派生

OKLCH lightness 阈值 0.5 是"对比足够"的实践经验值（WCAG AAA 一般要求 L 差 > 0.4）：
- `light primary L > 0.5` → foreground = `oklch(0.145 0 0)`（深近黑）
- `light primary L ≤ 0.5` → foreground = `oklch(0.985 0 0)`（浅近白）
- dark mode 同算法独立判断

### culori 树摇

```ts
import { useMode, modeOklch, modeRgb, formatCss, formatHex } from "culori/fn";
// 不要 `import { ... } from "culori"`（默认 entry 不树摇）
```

### 引用研究

- [`research/shadcn-oklch-brand-injection.md`](research/shadcn-oklch-brand-injection.md) — 中层 var 桥接已验证 + culori 派生公式 + theme-color meta 双 media 双值 SSR 注入。
- [`research/react-email-brand-injection.md`](research/react-email-brand-injection.md) — 邮件层 OKLCH 不可用、必须 hex；culori `formatHex` 自带 sRGB gamut clip；better-auth-ui `<EmailTemplate>` 不复用、保留我们自己的 `<EmailStyles colors>` 路线。

## Implementation Plan（PR 切分）

**PR1 — 核心注入（Web UI）**
- 加 `culori` + `@types/culori` 依赖。
- 加 `BRAND_PRIMARY_OKLCH` / `BRAND_PRIMARY_DARK_OKLCH` 到 `src/lib/env.ts` server 段。
- 新建 `src/lib/brand/oklch.ts`（parser + deriver + foreground picker）。
- `src/lib/config.server.ts` 加 `brandColor` 字段。
- `src/styles.css` 加中层桥接。
- `src/routes/__root.tsx` head() 注入 `<style>` + 双 `<meta theme-color>`。
- 默认值（不传 env）回归测试：UI 与现状一致。

**PR2 — 邮件透传**
- 找出所有 `<EmailStyles>` 渲染入口（research B 已列：8 个邮件模板 + 调用方），统一从 `appConfig.brandColor` 取 hex 注入 `colors` prop。
- dev `console` transport 跑一次 verify / invite-member / transfer-ownership 三条邮件，肉眼对比按钮配色。

**PR3 — Docs sync**
- AGENTS.md "Env 命名约定" 段补"纯服务端 env 不加 VITE_"原则 + brand env 用法 + 决策。
- `.env.example`（如有）补两个字段示例。
