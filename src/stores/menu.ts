import { Store } from "@tanstack/store";

export interface MenuMeta {
	title?: string;
	icon?: string;
	activeIcon?: string;
	activePath?: string;
	affixTab?: boolean;
	badge?: string;
	hideChildrenInMenu?: boolean;
	hideInBreadcrumb?: boolean;
	hideInMenu?: boolean;
	hideInTab?: boolean;
	iframeSrc?: string;
	ignoreAccess?: boolean;
	link?: string;
	openInNewWindow?: boolean;
}

export interface MenuNode {
	id: number;
	name: string | null;
	path: string | null;
	component: string | null;
	order: number;
	parentId: number | null;
	meta: MenuMeta | null;
	children?: MenuNode[];
}

interface MenuState {
	menus: MenuNode[];
	loaded: boolean;
}

export const menuStore = new Store<MenuState>({ menus: [], loaded: false });

export function setMenus(menus: MenuNode[]): void {
	menuStore.setState(() => ({ menus, loaded: true }));
}

export function resetMenus(): void {
	menuStore.setState(() => ({ menus: [], loaded: false }));
}

/**
 * Parse raw JSON value from ZenStack/Prisma into MenuMeta or null.
 * Prisma JsonValue can be string | number | boolean | null | object | array.
 * We only accept plain objects.
 */
export function parseMenuMeta(raw: unknown): MenuMeta | null {
	if (raw === null || raw === undefined) return null;
	if (typeof raw !== "object" || Array.isArray(raw)) return null;
	const obj = raw as Record<string, unknown>;
	return {
		title: typeof obj.title === "string" ? obj.title : undefined,
		icon: typeof obj.icon === "string" ? obj.icon : undefined,
		activeIcon: typeof obj.activeIcon === "string" ? obj.activeIcon : undefined,
		activePath: typeof obj.activePath === "string" ? obj.activePath : undefined,
		affixTab: typeof obj.affixTab === "boolean" ? obj.affixTab : undefined,
		badge: typeof obj.badge === "string" ? obj.badge : undefined,
		hideChildrenInMenu:
			typeof obj.hideChildrenInMenu === "boolean"
				? obj.hideChildrenInMenu
				: undefined,
		hideInBreadcrumb:
			typeof obj.hideInBreadcrumb === "boolean"
				? obj.hideInBreadcrumb
				: undefined,
		hideInMenu:
			typeof obj.hideInMenu === "boolean" ? obj.hideInMenu : undefined,
		hideInTab: typeof obj.hideInTab === "boolean" ? obj.hideInTab : undefined,
		iframeSrc: typeof obj.iframeSrc === "string" ? obj.iframeSrc : undefined,
		ignoreAccess:
			typeof obj.ignoreAccess === "boolean" ? obj.ignoreAccess : undefined,
		link: typeof obj.link === "string" ? obj.link : undefined,
		openInNewWindow:
			typeof obj.openInNewWindow === "boolean"
				? obj.openInNewWindow
				: undefined,
	};
}

/**
 * Find a menu node by pathname (recursive DFS).
 * Returns null if not found.
 */
export function findMenuByPath(
	menus: MenuNode[],
	pathname: string,
): MenuNode | null {
	for (const m of menus) {
		if (m.path === pathname) return m;
		if (m.children) {
			const hit = findMenuByPath(m.children, pathname);
			if (hit) return hit;
		}
	}
	return null;
}
