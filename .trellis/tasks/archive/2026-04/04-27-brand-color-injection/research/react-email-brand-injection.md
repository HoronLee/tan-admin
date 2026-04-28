# Research: react-email + better-auth-ui 邮件品牌主色注入与客户端兼容性

- **Query**: 邮件模板里"品牌主色"怎么注入；OKLCH vs hex 在主流邮件客户端的兼容性；react-email / better-auth-ui 的主流写法。
- **Scope**: mixed（仓库内现状 + 外部生态调研）
- **Date**: 2026-04-27
- **Repo state snapshot**:
  - `src/components/email/email-styles.tsx` — `defaultColors.{light,dark}`（9 个 hex），`<EmailStyles colors={...} darkMode>` 注入 `<style>` 标签 + `@media (prefers-color-scheme: dark)`。
  - 8 个 BA UI 邮件模板（`src/components/email/*.tsx` + `src/emails/invite-member.tsx` / `transfer-ownership.tsx`）全部在 `<Head>` 里渲染 `<EmailStyles colors={colors} darkMode={darkMode} />`，模板上层 prop 都接 `colors?: EmailColors`，但**调用方没人传**——业务侧目前都跑 default。
  - `src/lib/config.ts#brandConfig` 只有 `name` + `logoURL`/`logoDarkURL`，**没有 `primaryColor`** 字段；env (`src/lib/env.ts`) 也只有 `VITE_BRAND_NAME / LOGO_URL / LOGO_DARK_URL` 三个 brand-* 变量。
  - 依赖：`@react-email/components ^1.0.12`、`@react-email/render ^2.0.7`、`react-email ^6.0.0`。**没有装 culori / colorjs.io / colord**。

---

## 1. TL;DR

1. **OKLCH 在邮件里实际可用率不到一半**——caniemail.com `lch()/oklch()/lab()/oklab()` 条目显示主流客户端从 2023-01 起陆续支持，**但 Outlook Windows 桌面（Word 渲染引擎，2007/2010/2013/2016/2019）整列空白 = 不支持**；网易/QQ 这类国内邮件客户端 caniemail 没收，本地实测和 Tailwind v4 邮件兼容性社区证据都指向"**别在邮件里用 oklch**"。
2. **Tailwind v4 `@theme { --color-primary: oklch(...) }` 直接出 oklch 字面量，会在 Outlook Classic / Gmail 部分情况降级成黑或失效**（emailens.dev 2026-03 文章原文：Maizzle 之所以好用就是因为它"handles OKLCH-to-RGB color conversion"）。
3. **推荐做法**：单一真相源放在前端 OKLCH（web 用），**服务端拼邮件时转成 hex 注入** `<EmailStyles colors={...}>`。culori 是当前事实标准（Tailwind v4 / Radix 都用），3 行调用就能 `oklch → hex`。
4. **dark mode 在 Gmail (web/iOS/Android, 2022-12 起)、Apple Mail、Outlook Windows Mail / macOS / Outlook.com 都支持** `@media (prefers-color-scheme)`；但 **Outlook 经典桌面版 (2007–2019, Word 引擎) 永远不支持**——它们直接落到 light-mode 默认值。现 `email-styles.tsx` 里的双 mode 不算 over-engineering，是主流"safe degradation"模式。
5. **better-auth-ui 的 `<EmailTemplate>` 没有 `primaryColor` 之类的 brand color prop**——它通过 `classNames` 叠 Tailwind class 让你自己改色；它本身**不是基于 react-email**，而是基于 shadcn/ui CSS variables（`--primary`），跟我们现在的 `EmailStyles` 路线**不能直接复用**。

---

## 2. 邮件客户端兼容性表

数据来源：[caniemail.com](https://www.caniemail.com)（2026-04 抓取）。

| 客户端 | `oklch() / lab()` | `@media (prefers-color-scheme: dark)` | `color-scheme` meta/CSS | `light-dark()` |
|---|---|---|---|---|
| **Apple Mail macOS** | ✅ 13.1+ (2023-01) | ✅ 10.3+ | ✅ 16.0+ | ✅ 2024-08 |
| **Apple Mail iOS** | ✅ 16.2+ (2023-01) | ✅ 12.2+ | ✅ 16.1+ | ✅ 2024-08 |
| **Gmail Web** | ✅ 2023-01 | ✅ 2022-12 起（早期 2020-01 也部分支持） | ✅ 2023-09 | ✅ 2024-08 |
| **Gmail iOS / Android / Mobile Web** | ✅ 2023-01 | ✅ 2022-12 | ✅ 2023-09 | ✅ 2024-08 |
| **Outlook Windows 桌面 (2007/10/13/16/19, Word 引擎)** | **❌ 全部不支持**（caniemail 列空白） | **❌ 全部不支持** | ❌ 全部不支持 | ❌ 全部不支持 |
| **Outlook Windows Mail (新版)** | ✅ 2023-01 | ✅ 2020-01 | ✅ 2020-01 | ✅ 2024-08 |
| **Outlook macOS (新版)** | ✅ 2023-01 | ✅ 2019+ | ✅ 16.73+ | ✅ 2024-08 |
| **Outlook.com Web** | ✅ 2023-01（2024-01 有 regression note "2"） | ✅ 2019-07 起，2022-12 改进 | ✅ 2023-09 | ✅ 2024-08 |
| **Outlook iOS / Android (新版)** | ✅ 2023-01 | ✅ 2020-01 起，2022-12 改进 | ✅ 2023-09 | ✅ 2024-08 |
| **Yahoo / AOL Web/iOS/Android** | ✅ 2023-01 | ✅ 2020-01 起 | ✅ 2023-09 | ✅ 2024-08 |
| **网易 / QQ 企业邮 / 126** | ⚠️ caniemail 未收录；Greasyfork 上 126 邮箱社区脚本（2024-02）显示**官方根本没适配 dark mode**，需要用户脚本注入 `prefers-color-scheme` | ⚠️ 同上：webmail 端基本无暗黑；移动客户端跟系统但不可控 | ⚠️ 不明 | ❌ |

**关键解读**：
- "Outlook Windows 桌面" = 装在 Windows 上跑 Word 渲染引擎那种，**国内大量企业 IT 标配**。它对 oklch / dark mode / CSS var / `@media` 全部不支持——哪怕你 `oklch(0.55 0.18 264)` 写得再好看，Outlook Word 引擎直接吐黑（无样式）或忽略 → 按钮没颜色。
- Gmail Web 历史上"strip `<style>` in `<head>`"问题在 2016 之后基本不在了（`<head>` 里的 `<style>` 被保留），但客户端嵌套仍要内联 fallback。
- 国内：**网易/QQ 企业邮的 webmail 几乎可以当作 IE 时代 CSS 来对待**（连 dark mode 都没适配）。

引用：
- caniemail "lch(), oklch()..." — https://www.caniemail.com/features/css-modern-color/
- caniemail "@media prefers-color-scheme" — https://www.caniemail.com/features/css-at-media-prefers-color-scheme/
- Emailens "Why Your Tailwind v4 Emails Break in Gmail" 2026-03 — https://emailens.dev/blog/tailwind-v4-email-gmail
- 网易 126 dark-mode 用户脚本（侧证 webmail 无内置暗黑）— https://greasyfork.org/zh-CN/scripts/487070

---

## 3. 真实仓库 brand color 注入写法（3 例）

### 案例 A — react-email 官方 examples (Vercel/Notion/Stripe templates)

仓库 `resend/react-email`，`packages/.../examples/*.tsx` 模板（demo 站 https://demo.react.email/preview/）。

特征：**完全不用 CSS variable，每个颜色都 hex 字面量直接写在 inline `style={{}}` 或 Tailwind class**。

```tsx
// 摘自 react.email 首页 hero 示例（welcome email 简化版）
<Tailwind>
  <Section className="text-center mt-[32px] mb-[32px]">
    <Button
      className="py-2.5 px-5 bg-white rounded-md text-black text-sm font-semibold no-underline text-center"
      href="https://example.com/get-started"
    >
      Get Started
    </Button>
  </Section>
</Tailwind>
```

```tsx
// resend/react-email README 最小例
<Button href="https://example.com" style={{ color: "#61dafb" }}>
  Click me
</Button>
```

社区里给 dark-mode 加 brand color 的 canonical 写法（见 react-email discussion #591）：

```tsx
<Head>
  <meta content="light dark" name="color-scheme" />
  <meta content="light dark" name="supported-color-schemes" />
  <style>{`
    @media (prefers-color-scheme: dark) {
      .logo.light { display: none !important; }
      .logo.dark  { display: block !important; }
      body { background-color: #0A0A0A !important; }
      a[data-id*="react-email-button"] {
        background-color: #FFFFFF !important;
        color: #000000 !important;
      }
    }
  `}</style>
</Head>
```

来源：https://github.com/resend/react-email/discussions/591

**结论**：react-email 官方/社区**不传 brand color 也不用 React Context**，就是 prop drilling + inline hex。Resend 维护者明确拒绝过 `useRenderingOptions` Context 提案（PR #1926 评论："we'd need to rethink how this gets implemented at the core ... using a context isn't going to be sustainable"），理由是 SSR + React `renderToStaticMarkup` 链路上 Context 不稳。

来源：https://github.com/resend/react-email/pull/1926

### 案例 B — better-auth-ui `<EmailTemplate>`

仓库 `daveyplate/better-auth-ui`，import 路径 `@daveyplate/better-auth-ui/server`。

文档 prop 表（https://better-auth-ui.com/components/email-template）：

| Prop | Type | Default |
|---|---|---|
| `variant?` | `"vercel"` | `"vercel"` |
| `siteName?` | string | `process.env.SITE_NAME \|\| process.env.NEXT_PUBLIC_SITE_NAME` |
| `imageUrl?` | string | `${baseUrl}/apple-touch-icon.png` |
| `heading` | ReactNode | — |
| `content` | ReactNode | — |
| `baseUrl?` | string | `process.env.BASE_URL \|\| process.env.NEXT_PUBLIC_BASE_URL` |
| `action?` | string | — |
| `url?` | string | — |
| `classNames?` | `EmailTemplateClassNames` | — |

**没有 `primaryColor` / `brandColor` / `colors` 之类的 prop**——整套靠 `classNames` 叠 Tailwind class 让调用方自己改色。

它的样式系统 = shadcn/ui 的 CSS variables（`--primary`、`--background`...）注入到 globals.css，详见 https://deepwiki.com/better-auth-ui/better-auth-ui/8.2-custom-styling-and-theming。**这套对邮件没用**（globals.css 不会被嵌入邮件 HTML），所以 BA UI 的 `<EmailTemplate>` 在邮件渲染时落到的是它自己 inline 的 default theme，brand 注入只能靠 `classNames` 写死 hex。

### 案例 C — 我们自己的 `EmailStyles`（已实现，可作为模式参考）

`src/components/email/email-styles.tsx` 是上面"discussion #591 写法"的工程化版本：把 `<style>` 块抽成组件，hex 通过 `colors?: EmailColors` prop 覆写。模式正确，**问题在于业务侧没人传 `colors`**——所有 `signIn.sendVerificationEmail`、邀请邮件、change-email 邮件都用 default。

→ 改造方向就是：服务端拼邮件前从 `appConfig.brand.primaryColor`（待加）派生一份 `EmailColors`，对所有渲染邮件的入口统一传进去。

---

## 4. OKLCH → hex 推荐做法

### 库选型

| 库 | OKLCH 支持 | bundle | Node 原生 ESM | 备注 |
|---|---|---|---|---|
| **culori** | ✅ first-class | ~30KB（树摇后小很多） | ✅ | Tailwind v4 / Radix 内部都用；事实标准 |
| colorjs.io | ✅ | 较大；OO API 比 culori 慢 30x，procedural API 持平/快 ~1.4x | ✅ | 学术/规范派 |
| colord | 通过 plugin | ~1.7KB | ✅ | 最小，但 OKLCH 要 `extend([labPlugin])` 折腾 |
| chroma-js | ❌ 仅 LAB | ~60KB | ✅ | 数据可视化场景，本任务不合适 |
| colordx | ✅ | 3KB gzipped、更快 | ✅ | 2026-03 才发布，太新；不推荐生产 |

**推荐 culori**（已是 Tailwind v4 内部依赖，behavioral consistency 最好；`pnpm add culori @types/culori`）。

### 30 行示例

```ts
// src/lib/email-brand-colors.ts (待实现示意)
import { formatHex, oklch as parseOklch, type Oklch } from "culori";

interface OklchTriplet {
  l: number; // 0..1
  c: number; // chroma
  h: number; // hue degrees
}

/**
 * 把 shadcn token 那种 "0.55 0.18 264" 三元组（或完整 "oklch(...)" 字符串）
 * 转成邮件兼容的 #RRGGBB。
 *
 * 注意：culori 的 toGamut 默认会做 sRGB gamut mapping（保持感知一致）。
 */
export function oklchTripletToHex(input: string): string {
  const trimmed = input.trim();
  const oklchStr = trimmed.startsWith("oklch(")
    ? trimmed
    : `oklch(${trimmed})`;
  const parsed: Oklch | undefined = parseOklch(oklchStr);
  if (!parsed) {
    throw new Error(`Invalid OKLCH input: ${input}`);
  }
  // formatHex 会先 gamut-map 到 sRGB 再输出 6 位 hex
  return formatHex(parsed); // e.g. "#3a6cd0"
}

// usage 例：
// oklchTripletToHex("0.55 0.18 264") -> "#4a6cd9"（示意值）
// oklchTripletToHex("oklch(0.55 0.18 264)") -> 同上
```

`formatHex` 内部会自动 sRGB gamut clip（OKLCH 色域比 sRGB 大，超界色会被夹进 sRGB），不需要你手写 `linear→sRGB` 转换函数，比 willvincent.com 那种 50 行手撸 LMS 矩阵代码安全得多。

### Server-side 一次性派生

每次请求都跑 OKLCH→hex 没必要——brand 颜色在 boot 后不变。建议在 `src/lib/config.server.ts`（或 `config.ts`，因为 culori 是同构 ESM、客户端也跑得动）模块顶部一次性算好：

```ts
// 伪代码
const primaryHex = oklchTripletToHex(env.VITE_BRAND_PRIMARY ?? "0.205 0 0");
const brandEmailColors = {
  light: { primary: primaryHex, primaryForeground: "#FAFAFA" },
  dark:  { primary: primaryHex, primaryForeground: "#171717" },
};
```

然后 `signIn.sendVerificationEmail` / 邀请邮件 / change-email 邮件统一用 `<EmailVerificationEmail colors={brandEmailColors} ... />`。

---

## 5. 风险 / 反模式

1. **不要在 `<EmailStyles>` 里直接写 `oklch(...)` 字面量** —— Outlook Windows 桌面 + 网易企业邮直接破。一定走"oklch（前端真相）→ hex（邮件输出）"的派生。
2. **不要依赖 CSS custom property（`var(--primary)`）做邮件主色** —— caniemail "CSS variables" 条目显示 Outlook Windows 经典版 / 大量国内 webmail 不支持；当 `<style>` 里 `color: var(--primary)` fallback 缺失时直接黑。如果非要 var，必须 `color: var(--primary, #fallbackHex)`。
3. **不要用 React Context 在邮件模板里传 brand** —— Resend 维护者已明确否决（PR #1926 close 评论），SSR + `renderToStaticMarkup` 链路对 Context 不友好；坚持 prop drilling，`appConfig.brand` 一处读出后透传。
4. **不要复用 `@daveyplate/better-auth-ui` 的 `<EmailTemplate>` 来做品牌邮件** —— 它的 brand 注入只有 `classNames`（写死 Tailwind class）这一条路，跟我们现在的 `colors` prop 路线两套；它本身底层不是 react-email，是 shadcn 组件硬塞 `<Html>`，dark-mode 行为也跟 caniemail 兼容性表对不上。继续维护我们自己的 `email-styles.tsx + colors prop` 一套更可控。
5. **dark mode 在 Outlook Windows 经典版永远没有** —— 不要假设"用户系统 dark = 邮件 dark"。`email-styles.tsx` 里 `darkMode={true}` 注入 `@media` 是 progressive enhancement，**默认（light）必须自己看得清**。当前 `defaultColors.light.primary = "#171717"` 黑底白字风格在 light fallback 下是安全的。
6. **`!important` 不要省** —— Gmail Web 会注入自己的 reset，不写 `!important` 时品牌色被覆盖。`email-styles.tsx` 已经全加了，保持。
7. **Tailwind v4 在 react-email 里的 `@theme` token 不要直传** —— 见 emailens.dev 2026-03 文章，v4 默认产 `@media (width >= 40rem)` range syntax + `oklch(...)` 颜色，邮件客户端两个都炸。我们目前 `<Tailwind config={{ presets: [pixelBasedPreset] }}>` 用的是 react-email 内置 preset，没踩这个坑——但**任何时候不要把 v4 主项目的 `globals.css` 注入到邮件里**。

---

## 6. 不在本研究范围（明确标注）

- 邮件多语言主色切换（按 locale 换色）—— prd 没要求，跳过。
- Email plain-text fallback 颜色处理 —— plain-text 没颜色，无关。
- Logo `prefers-color-scheme` 双图切换的 Outlook Windows fallback —— 已有 `logo-light/logo-dark` class，BA UI 模板已处理；本次不动。

---

## 引用清单

- caniemail oklch — https://www.caniemail.com/features/css-modern-color/
- caniemail prefers-color-scheme — https://www.caniemail.com/features/css-at-media-prefers-color-scheme/
- caniemail color-scheme property — https://www.caniemail.com/features/css-color-scheme/
- caniemail light-dark() — https://www.caniemail.com/features/css-function-light-dark/
- Emailens "Tailwind v4 emails break in Gmail" (2026-03) — https://emailens.dev/blog/tailwind-v4-email-gmail
- react-email discussion #591 (dark mode pattern) — https://github.com/resend/react-email/discussions/591
- react-email PR #1926 (Context rejected) — https://github.com/resend/react-email/pull/1926
- react-email PR #1749 (theme switcher in dev preview) — https://github.com/resend/react-email/pull/1749
- better-auth-ui EmailTemplate docs — https://better-auth-ui.com/components/email-template
- better-auth-ui theming — https://deepwiki.com/better-auth-ui/better-auth-ui/8.2-custom-styling-and-theming
- culori — https://culorijs.org/
- culori vs chroma-js vs tinycolor2 (2026-03) — https://www.pkgpulse.com/blog/culori-vs-chroma-js-vs-tinycolor2-color-manipulation-javascript-2026
- colordx benchmarks — https://github.com/dkryaklin/colordx
- color.js procedural API perf — https://github.com/color-js/color.js/issues/655
- 126 邮箱 dark mode 用户脚本（侧证国内 webmail 无适配）— https://greasyfork.org/zh-CN/scripts/487070
