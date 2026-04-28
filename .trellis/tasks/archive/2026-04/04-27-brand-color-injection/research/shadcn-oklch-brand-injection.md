# Research: shadcn + Tailwind v4 单一 env 注入品牌主色（OKLCH）

- **Query**: 在 TanStack Start (SSR) + Tailwind v4 + shadcn (v4 dist) 项目里，从单一 env / 运行时配置注入"品牌主色"，让 `--primary` / `--ring` / `--sidebar-primary` 等 token 接管
- **Scope**: external（context7/exa 主线）+ 已 cross-check 本仓库 `src/styles.css`
- **Date**: 2026-04-27

---

## TL;DR

1. **业界共识方案**：把 `--primary` 之类的 shadcn token 在 `:root` / `.dark` 里**指向另一个变量** `var(--brand-primary, oklch(...))`，运行时 SSR 在 `<head>` 里塞一个 `<style>:root{--brand-primary: oklch(L C H); --brand-primary-dark: oklch(...) }</style>` 即可—— `@theme inline` 不阻断这种间接引用，因为 `@theme inline` 把 `--color-primary` **inline 替换**为 `var(--primary)`，而 `--primary` 仍是浏览器端可被层叠覆盖的全局变量。
2. **`@theme inline` 桥接已验证可行**：本仓库的 `--color-primary: var(--primary)` 桥接 + 在 `:root` 把 `--primary: var(--brand-primary)` 改成指向 brand var，Tailwind 编译时只需要知道 `bg-primary` → `var(--primary)`，运行时再让 `--primary` 解析到 `--brand-primary`，浏览器逐级 fallback 即可。**踩坑要点**：`@theme inline` 自身不创建可被覆盖的 `--color-primary` 全局变量，所以注入点必须是 `--primary` 这一层（中层 var），不是 `--color-primary`。
3. **light/dark 派生**：单值注入用 `culori`（树摇后 oklch+oklab+rgb 三模 ~10–15KB），核心就是 `1 - L` 反转 lightness + 略减 chroma；如果对设计精度敏感，**强烈建议让用户配两个值**（`PRIMARY_LIGHT_OKLCH` / `PRIMARY_DARK_OKLCH`），算法派生只做兜底。
4. **shadcn 子 token 必须显式覆盖**：`--ring` / `--sidebar-primary` / `--sidebar-ring` 在 shadcn 默认 baseColor 里是**独立常量**，不会跟着 `--primary` 走；要保持品牌一致就在同一段 `:root` / `.dark` 里一起指向 `--brand-primary`（或派生变体），sidebar 的 accent 系也按需。
5. **PWA 颜色面**：`<meta name="theme-color">` 支持 `media="(prefers-color-scheme: ...)"` 双值（MDN 标准）；TanStack Start 在 `__root.tsx` 的 `head()` 函数里直接返回两条 meta 即可 SSR 注入。manifest 的 `theme_color` 是**单值且只在启动 splash 阶段生效**，PWA 启动后立即被 meta 接管——优先级 = manifest（splash） → meta（运行时）。manifest 想动态就把 `/manifest.json` 路由化成 server fn 输出 JSON。

---

## 三个真实案例

### 案例 1: shadcn-color-theme-switcher-next（ShouryaBatra）

**URL**: https://github.com/ShouryaBatra/shadcn-color-theme-switcher-next

**模式**: 多 palette 走 `[data-theme="..."]` 选择器，跟 `.dark` 组合成 `.dark[data-theme="custom"]`。

**关键代码**:

```css
[data-theme="custom"] {
  --background: oklch(100% 0 0);
  --primary: oklch(60% 0.15 250);
  --primary-foreground: oklch(98% 0 0);
}

.dark[data-theme="custom"] {
  --background: oklch(10% 0 0);
  --primary: oklch(75% 0.18 250);
}
```

**评价**: 适合"预制 N 个 palette 让用户切"的场景；不直接适合"单 env 单 brand"，但选择器嵌套（`.dark[data-theme=...]`）是值得借鉴的层叠技巧。

---

### 案例 2: brokeboiflex/shadcn-theme-provider（双轴 provider）

**URL**: https://github.com/brokeboiflex/shadcn-theme-provider

**模式**: mode（light/dark/system）+ palette 双轴解耦；palette 是**外部 .css 文件**，运行时 fetch 后 inject 进 `<style>`，支持 CSP nonce、SSR-safe、TanStack-friendly（peer dep 只 React）。

**评价**: 思路接近"把 palette 变成可热插的资源"。对 tan-admin 这种"单租户单 brand"杀鸡用牛刀，但**SSR 注入 `<style>` + 运行时 setProperty** 的双层模式可以照搬，只是把 palette 文件源换成 env 计算结果。

---

### 案例 3: tweakcn（jnsahaj/tweakcn，9.7k stars）

**URL**: https://github.com/jnsahaj/tweakcn

**模式**: 业内事实标准的 shadcn 主题生成器；用 culori 做 OKLCH 转换、4 位小数精度（PR #96 修过精度 bug——2 位小数会让色彩肉眼可辨偏移）。

**关键经验**:
- OKLCH 转 hex/rgb 一定要 ≥ 4 位小数（`oklch(0.2166 0.0215 292.85)` 才不漂移）
- Tailwind v3 不支持 OKLCH（[tailwindlabs/tailwindcss#14499](https://github.com/tailwindlabs/tailwindcss/issues/14499)），v4 才行——本仓库已 v4，无忧
- tweakcn 输出的就是直接覆盖 `:root`/`.dark` 里 28 个变量的 CSS 块

**评价**: 单 brand 情况下，可以让运营在 tweakcn UI 调出 OKLCH，复制 `--primary` 那行的值塞进 `VITE_BRAND_PRIMARY_OKLCH`——把 tweakcn 当**取色器**用，不需要它的 runtime。

---

## OKLCH light/dark 派生函数推荐

### 库选型

| 库 | min+gz 实测 | OKLCH | tree-shake | 评价 |
|---|---|---|---|---|
| **culori/fn** | ~10–15 KB（仅 oklch + rgb + formatCss） | ✅ 一等公民 | ✅ `culori/fn` 入口 | **首选**；Tailwind v4 内部就用它 |
| colorjs.io | ~30 KB+ | ✅ | 弱 | 学术派、API 漂亮但偏大 |
| chroma-js | ~60 KB | ❌（仅 LAB） | ✅ | OKLCH 不一等公民，不选 |
| colord + plugin | ~3 KB + 1KB plugin | ✅（plugin） | ✅ | 体积冠军；只做格式转换够，做派生略弱 |

**结论**：**culori/fn** 树摇后约 10 KB，胜在生态对齐 Tailwind v4 + 数学严谨。

### 派生算法（30 行内）

```ts
// src/lib/brand-color.ts
import { useMode, modeOklch, formatCss } from "culori/fn";
const oklch = useMode(modeOklch);

type OklchTuple = { l: number; c: number; h: number };

function parseOklchEnv(input: string): OklchTuple {
  // 接受 "oklch(0.62 0.18 250)" 或 "0.62 0.18 250"
  const m = input.match(/([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) throw new Error(`Invalid OKLCH: ${input}`);
  return { l: +m[1], c: +m[2], h: +m[3] };
}

export function deriveBrandPair(lightInput: string, darkInput?: string) {
  const light = parseOklchEnv(lightInput);
  // 显式 dark 优先；否则算法派生：lightness 反转到 [0.55, 0.85] 区间，chroma 略降以避免高 L 时溢出 sRGB
  const dark = darkInput
    ? parseOklchEnv(darkInput)
    : {
        l: Math.min(0.85, Math.max(0.55, 1 - light.l + 0.1)),
        c: light.c * 0.85,
        h: light.h,
      };
  const fmt = (t: OklchTuple) =>
    formatCss({ mode: "oklch", l: t.l, c: t.c, h: t.h });
  return { lightCss: fmt(light), darkCss: fmt(dark) };
}
```

> 算法只是兜底，**生产建议双值**：`VITE_BRAND_PRIMARY_OKLCH` + `VITE_BRAND_PRIMARY_DARK_OKLCH`，dark 缺省才走派生。理由：1) light primary L=0.45 时反转得到 0.55+0.1=0.65 看着可能"暗模式不够亮"；2) 设计师对品牌色 dark 变体通常有定调（不是机械反转）。

### 进阶替代：纯 CSS 不要库

CSS 原生 **relative color syntax** 已主流支持（Safari 16.4+ / Chrome 111+，与 Tailwind v4 浏览器 baseline 一致）：

```css
:root { --brand-primary: oklch(0.62 0.18 250); }
.dark {
  /* 完全不用 JS：浏览器原生派生 */
  --primary: oklch(from var(--brand-primary) calc(1 - l + 0.1) calc(c * 0.85) h);
}
```

> 优势：零 JS、零包体；劣势：派生公式锁死在 CSS 里，复杂度上来不好维护。tan-admin 当前规模建议**先走 culori/fn**，等需求稳定再考虑搬到 CSS。

---

## `@theme inline` 桥接验证

**结论：已验证可行，但要在正确层级注入**。

### 工作原理

Tailwind v4 的 `@theme inline { --color-primary: var(--primary); }` 在编译期做的事：把所有 `bg-primary` 之类工具类生成 `background-color: var(--primary)`，**不创建 `--color-primary` 这个全局 CSS 变量**（这是 inline 关键字的语义；详见 [SO 解答](https://stackoverflow.com/questions/79705933/should-i-use-theme-or-theme-inline)）。

所以：
- 想在运行时**全局**改主色 → 改 `--primary`（仍是普通 CSS 变量，可被 `:root` 上层级覆盖）
- 改 `--color-primary` 没用，inline 不暴露它

### tan-admin 推荐结构

```css
/* src/styles.css */
:root {
  /* 中层桥接：brand var 是单一真相源 */
  --brand-primary: oklch(0.205 0 0);          /* 默认值（中性灰，等价当前默认） */
  --brand-primary-foreground: oklch(0.985 0 0);

  /* shadcn token 改成 var-of-var，保留 fallback */
  --primary: var(--brand-primary);
  --primary-foreground: var(--brand-primary-foreground);
  --ring: var(--brand-primary);                /* 选用品牌色或单独保留 */
  --sidebar-primary: var(--brand-primary);
  --sidebar-primary-foreground: var(--brand-primary-foreground);
  --sidebar-ring: var(--brand-primary);
  /* ... 其余 27 个 token 不动 */
}

.dark {
  --brand-primary: oklch(0.78 0.15 250);       /* 默认 dark 派生值 */
  --brand-primary-foreground: oklch(0.18 0 0);
  /* --primary / --ring / --sidebar-* 已在 :root 里指向 --brand-primary，dark 无需重复 */
}
```

然后 SSR 在 `__root.tsx` 的 `head()` 里 push 一段 styles 覆盖 `:root` 和 `.dark` 的 `--brand-primary`：

```tsx
// src/routes/__root.tsx
import { env } from "#/env";
import { deriveBrandPair } from "#/lib/brand-color";

export const Route = createRootRoute({
  head: () => {
    const { lightCss, darkCss } = deriveBrandPair(
      env.VITE_BRAND_PRIMARY_OKLCH,
      env.VITE_BRAND_PRIMARY_DARK_OKLCH,
    );
    return {
      meta: [
        { name: "theme-color", content: lightCss, media: "(prefers-color-scheme: light)" },
        { name: "theme-color", content: darkCss, media: "(prefers-color-scheme: dark)" },
      ],
      styles: [
        { children: `:root{--brand-primary:${lightCss};} .dark{--brand-primary:${darkCss};}` },
      ],
    };
  },
});
```

### 已知非问题（cross-checked）

- **shadcn-ui/ui PR #10264 / #10373** 讨论的是 v3 的 `hsl(var(--primary))` 包裹错误处理 OKLCH—— **与 v4 + `@theme inline` 无关**，本仓库不会踩。
- **tailwindlabs#19570** 的 "circular reference" 是 Figma 插件导出的 `--text-base: var(--text-base)` 完全自我引用，不是 `--color-primary: var(--primary)` 这种正常的 alias—后者一切正常。

### 反例（别这么写）

```css
/* ❌ 把品牌色硬编码进 @theme inline，无法运行时覆盖 */
@theme inline {
  --color-primary: oklch(0.62 0.18 250);
}
```

inline 关键字下，硬编码的值"消失了"——不会变成 `--color-primary` 全局变量，于是运行时无从下手。

---

## `theme-color` meta + manifest 的 PWA 最佳实践

### 优先级链

| 阶段 | 决策面 | 说明 |
|---|---|---|
| PWA 启动 splash（已安装到桌面） | manifest.json `theme_color` + `background_color` | 单值，启动那 1–2 秒生效 |
| 运行时 status / address bar | `<meta name="theme-color">` | 一旦 DOM 解析到，立即接管 manifest 值 |
| 系统 dark mode | `<meta>` + `media="(prefers-color-scheme: dark)"` 双 meta | iOS Safari / Android Chrome 都支持 |

### TanStack Start 注入（meta 用 head() 即可）

```ts
head: () => ({
  meta: [
    { name: "theme-color", content: brandLight, media: "(prefers-color-scheme: light)" },
    { name: "theme-color", content: brandDark,  media: "(prefers-color-scheme: dark)" },
  ],
}),
```

`HeadContent` 组件已在 `<head>` 里渲染（参考 [TanStack Router head docs](https://tanstack.com/router/latest/docs/guide/document-head-management)），SSR 出来就是两条 `<meta>`。

> ⚠️ **iOS PWA 标题栏色**：[StackOverflow #79882684](https://stackoverflow.com/questions/79882684) 实测 iOS Safari 对 `theme-color` 支持**不稳定**（特别是 dark mode 下），不要承诺像素级一致；Android Chrome 比较守规矩。

### manifest 是动态还是静态

- **静态**（vite-plugin-pwa 默认）：build 时把 `theme_color` 写死，多 brand 部署需要每次 rebuild
- **动态**（推荐 SaaS 场景）：把 `/manifest.json` 路由化成 server fn 输出 `application/manifest+json`，SSR 时根据 env 算 `theme_color`
- **Data URL**（[dev.to/progressier](https://dev.to/progressier/create-a-pwa-app-manifest-dynamically-1b4b)）：`<link rel="manifest" href="data:application/manifest+json,...">`，零额外请求；适合 manifest 内容随 user / tenant 变的极端动态场景

tan-admin 当前**单租户私有化**为主，建议 v1：build-time 静态写 `theme_color = VITE_BRAND_PRIMARY_OKLCH 转 hex`，SaaS 模式将来再上动态 manifest。

### `background_color` vs `theme_color`

[MDN](https://developer.mozilla.org/en-US/docs/Web/Manifest/background_color) + [progressier 解释](https://dev.to/progressier/differences-between-backgroundcolor-and-themecolor-in-a-pwa-manifest-bj0):

- `background_color`: splash 画布底色（启动那秒）
- `theme_color`: status bar 色（splash 阶段 + 部分运行时 fallback）
- 通常**两者设同色**最稳

---

## 风险 / 反模式

1. **不要硬编码 hex 再算 OKLCH**：双值会随时间 drift。env 只存 OKLCH 一份真相，hex/rgb 派生在 build 或 server 端按需算。
2. **不要在 `@theme inline` 里直接写品牌色字面量**：会失去运行时覆盖能力（见上文反例）。
3. **不要把所有 28 个 token 都换成 `var(--brand-primary)`**：destructive / chart-* / muted 等不该跟随品牌色——只动 `--primary` / `--primary-foreground` / `--ring` / `--sidebar-primary` / `--sidebar-primary-foreground` / `--sidebar-ring` 这 6 个就够了。
4. **不要忘 sRGB gamut 检查**：高 chroma 的 OKLCH（c > 0.2）在某些 hue 上会超出 sRGB → 浏览器 clamp 后视觉偏色。culori 有 `clampGamut("p3")` / `clampGamut("rgb")` 可在 server 端预先约束（但 Tailwind v4 baseline 浏览器全支持 P3 + OKLCH 相对色，不算硬约束）。
5. **不要给品牌色加新 env flag**：和 CLAUDE.md "feature 由 plan 决定，不再加 env flag" 冲突——主色是**部署级常量**（甲方 logo 固定），不是 per-org feature；env 一份 `VITE_BRAND_PRIMARY_OKLCH` 就够。
6. **不要 SSR 注入后又在 client useEffect 里 setProperty 覆盖**：会闪烁。一次 SSR 注入到 `<style>` + 浏览器 cascade 自动接管，足够。
7. **dark 派生算法不要乱用 chroma boost**：高 L 时 chroma 必须降（OKLCH 高亮度高彩度色不存在于 sRGB）；本研究的派生函数已用 `c * 0.85` 兜底，但**不替代设计师调色**。

---

## 关键参考链接

- shadcn 官方 v4 theming: https://v4.shadcn.com/docs/theming
- shadcn customization skill: https://github.com/shadcn-ui/ui/blob/HEAD/skills/shadcn/customization.md
- `@theme` vs `@theme inline` 区别: https://stackoverflow.com/questions/79705933/should-i-use-theme-or-theme-inline
- TanStack Start head 管理: https://tanstack.com/router/latest/docs/guide/document-head-management
- TanStack Start theming 实践: https://www.ishchhabra.com/writing/ssr-theming
- culori 树摇指南: https://culorijs.org/guides/tree-shaking
- meta theme-color media query: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/theme-color
- PWA manifest theme_color: https://developer.mozilla.org/en-US/docs/Web/Manifest/background_color
- tweakcn 主题生成器: https://github.com/jnsahaj/tweakcn
- shadcn-theme-provider（双轴 SSR-safe）: https://github.com/brokeboiflex/shadcn-theme-provider
- CSS 原生 relative oklch: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/oklch
