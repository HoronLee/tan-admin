import {
	formatCss,
	formatHex,
	modeOklch,
	modeRgb,
	type Oklch,
	useMode,
} from "culori/fn";

/**
 * 品牌色派生工具（同构 pure functions —— 无 fs / network / env 副作用）。
 *
 * 单一真相源是 `BRAND_PRIMARY_OKLCH`（裸三元组 "L C H"，无 VITE_ 前缀，
 * 服务端 env，由 `config.server.ts` 在 boot 时一次性派生喂给本模块）。
 * 本模块负责：
 *   1. 解析裸三元组 / `oklch(...)` 字符串 → 结构化 OKLCH 三元组。
 *   2. 算法派生 dark mode 兜底值（甲方未配 `BRAND_PRIMARY_DARK_OKLCH` 时）。
 *   3. 根据主色 lightness 自动挑前景色（黑/白）。
 *   4. 一次性产出 web 用 `oklch(...)` 字面量 + 邮件用 hex（PR2 消费）。
 *
 * culori `culori/fn` entry 是 tree-shake 友好入口（参 culorijs.org/guides/tree-shaking），
 * 必须先 `useMode(modeOklch)` / `useMode(modeRgb)` 注册才能 parse + format。
 *
 * 不允许静默 fallback —— `parseOklchTriplet` 失败直接抛错，让甲方知道 env 写错。
 *
 * 不带 server-only marker：算法本身没有 server-only 依赖，client 端理论上也能
 * 复用（虽然当前 PR1 只在 server 端被 `config.server.ts` 调用）。env 读取逻辑
 * 留在 `config.server.ts` —— server-only 边界守在那一层。
 */

// culori `useMode` 是其内部 mode-registry 注册函数，与 React hooks 同名但语义无关。
// biome-ignore lint/correctness/useHookAtTopLevel: culori mode registration, not a React hook
useMode(modeOklch);
// biome-ignore lint/correctness/useHookAtTopLevel: culori mode registration, not a React hook
useMode(modeRgb);

export interface OklchTriplet {
	l: number;
	c: number;
	h: number;
}

export interface BrandPair {
	lightCss: string;
	darkCss: string;
	lightForegroundCss: string;
	darkForegroundCss: string;
	lightHex: string;
	darkHex: string;
}

/**
 * 现状中性灰，与 `src/styles.css` 的默认 `--primary` 完全一致。
 * 不传 `BRAND_PRIMARY_OKLCH` 时回归到这个值，UI 与现状无差。
 */
export const DEFAULT_LIGHT_OKLCH = "0.205 0 0";
export const DEFAULT_DARK_OKLCH = "0.922 0 0";

const TRIPLET_REGEX = /([\d.]+)\s+([\d.]+)\s+([\d.]+)/;

/**
 * 接受 `"0.55 0.18 264"` 或 `"oklch(0.55 0.18 264)"` 形态裸三元组。
 * 失败时抛错，绝不静默 fallback。
 */
export function parseOklchTriplet(input: string): OklchTriplet {
	const trimmed = input.trim();
	const match = trimmed.match(TRIPLET_REGEX);
	if (!match) {
		throw new Error(
			`Invalid OKLCH triplet: ${JSON.stringify(input)}. Expected "L C H" or "oklch(L C H)" with three numbers.`,
		);
	}
	const l = Number.parseFloat(match[1]);
	const c = Number.parseFloat(match[2]);
	const h = Number.parseFloat(match[3]);
	if (
		!Number.isFinite(l) ||
		!Number.isFinite(c) ||
		!Number.isFinite(h) ||
		l < 0 ||
		l > 1 ||
		c < 0
	) {
		throw new Error(
			`Invalid OKLCH triplet values: ${JSON.stringify(input)}. L must be in [0,1], C must be >= 0.`,
		);
	}
	return { l, c, h };
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * Light → Dark 算法兜底：
 * - lightness 反转再略提亮：`clamp(1 - L + 0.1, 0.55, 0.85)`
 * - chroma 略降避免高 L 时溢出 sRGB：`c * 0.85`
 * - hue 保持
 *
 * 这是兜底——设计师有定调时优先走 `BRAND_PRIMARY_DARK_OKLCH` 显式覆盖。
 */
export function deriveDarkFromLight(light: OklchTriplet): OklchTriplet {
	return {
		l: clamp(1 - light.l + 0.1, 0.55, 0.85),
		c: light.c * 0.85,
		h: light.h,
	};
}

/**
 * 选前景色：lightness > 0.5 用近黑、否则用近白。
 * 阈值 0.5 是 WCAG 对比的实践经验值（AAA 一般要求 L 差 > 0.4）。
 *
 * 返回的两个 oklch 字面量与 `src/styles.css` 中**原 `--primary-foreground`**
 * 字面值完全一致（dark mode `oklch(0.205 0 0)`、light mode `oklch(0.985 0 0)`），
 * 保证 BRAND_PRIMARY_* 未配置时默认视觉与现状零偏差（PRD AC 第 1 条）。
 *
 * 注意阈值字面值不取 `--foreground` 的 0.145：那是文档/页面正文色，
 * 不是 button-on-primary 的对比色。原 shadcn neutral baseColor 设计中，
 * primary-foreground 走的是"次浅" 0.205 而非"最深" 0.145。
 */
export function pickForegroundCss(primary: OklchTriplet): string {
	return primary.l > 0.5 ? "oklch(0.205 0 0)" : "oklch(0.985 0 0)";
}

function tripletToOklch(t: OklchTriplet): Oklch {
	return { mode: "oklch", l: t.l, c: t.c, h: t.h };
}

/**
 * 一次性产出 brand pair（web + 邮件 + foreground 全套）。
 * 在 `config.server.ts` 模块顶部调一次即可，不在每次请求重算。
 */
export function deriveBrandPair(
	lightInput: string,
	darkInput?: string,
): BrandPair {
	const light = parseOklchTriplet(lightInput);
	const dark = darkInput
		? parseOklchTriplet(darkInput)
		: deriveDarkFromLight(light);

	const lightOklch = tripletToOklch(light);
	const darkOklch = tripletToOklch(dark);

	return {
		lightCss: formatCss(lightOklch),
		darkCss: formatCss(darkOklch),
		lightForegroundCss: pickForegroundCss(light),
		darkForegroundCss: pickForegroundCss(dark),
		// formatHex 内部 sRGB gamut clip，邮件输出安全（Outlook 经典版 / 国内 webmail 不支持 oklch）
		lightHex: formatHex(lightOklch),
		darkHex: formatHex(darkOklch),
	};
}
