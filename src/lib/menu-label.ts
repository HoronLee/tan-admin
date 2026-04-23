import * as m from "#/paraglide/messages";

/**
 * Menu.meta.title 的双模解析：
 *   - `"menu."` 开头 → 视为 paraglide i18n key，动态查出当前 locale 的翻译
 *   - 其它值 → 当作硬编码显示文本原样返回（租户自建菜单走这条）
 *
 * Paraglide 把带点的 JSON key 编译成字符串命名的导出，所以 `m["menu.dashboard"]()`
 * 在运行时可用。若 key 不存在则退化为原字符串，避免渲染出空字符串。
 */
export function resolveMenuLabel(title: string | undefined): string | undefined {
	if (!title) return undefined;
	if (title.startsWith("menu.") && title in m) {
		const fn = (m as unknown as Record<string, () => string>)[title];
		if (typeof fn === "function") {
			const resolved = fn();
			if (resolved) return resolved;
		}
	}
	return title;
}
