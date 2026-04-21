import { Store } from "@tanstack/store";

export interface TabItem {
	path: string;
	title: string;
	closable: boolean;
}

interface TabbarState {
	tabs: TabItem[];
	activeTab: string;
}

const DASHBOARD_TAB: TabItem = {
	path: "/dashboard",
	title: "Dashboard",
	closable: false,
};

export const tabbarStore = new Store<TabbarState>({
	tabs: [DASHBOARD_TAB],
	activeTab: "/dashboard",
});

/** Add a tab. If already exists, only switch activeTab. */
export function addTab(tab: TabItem): void {
	tabbarStore.setState((prev) => {
		const exists = prev.tabs.some((t) => t.path === tab.path);
		if (exists) {
			return { ...prev, activeTab: tab.path };
		}
		return {
			tabs: [...prev.tabs, tab],
			activeTab: tab.path,
		};
	});
}

/** Activate an existing tab (no insert). */
export function setActiveTab(path: string): void {
	tabbarStore.setState((prev) => ({ ...prev, activeTab: path }));
}

/**
 * Remove a tab by path.
 * Returns the new activeTab path — caller should navigate to it.
 * Dashboard tab is never removed.
 */
export function removeTab(path: string): string {
	if (path === DASHBOARD_TAB.path) return DASHBOARD_TAB.path;

	let nextActive = tabbarStore.state.activeTab;

	tabbarStore.setState((prev) => {
		const idx = prev.tabs.findIndex((t) => t.path === path);
		if (idx === -1) return prev;

		const newTabs = prev.tabs.filter((t) => t.path !== path);

		let newActive = prev.activeTab;
		if (prev.activeTab === path) {
			// Navigate to left neighbour, fallback to dashboard
			const leftTab = prev.tabs[idx - 1];
			newActive = leftTab?.path ?? DASHBOARD_TAB.path;
		}

		nextActive = newActive;
		return { tabs: newTabs, activeTab: newActive };
	});

	return nextActive;
}

/** Close all tabs except dashboard and the keepPath tab. */
export function removeOtherTabs(keepPath: string): void {
	tabbarStore.setState((prev) => {
		const newTabs = prev.tabs.filter((t) => !t.closable || t.path === keepPath);
		const activeStillExists = newTabs.some((t) => t.path === prev.activeTab);
		return {
			tabs: newTabs,
			activeTab: activeStillExists ? prev.activeTab : keepPath,
		};
	});
}

/** Close all tabs to the right of fromPath (exclusive). */
export function removeRightTabs(fromPath: string): void {
	tabbarStore.setState((prev) => {
		const idx = prev.tabs.findIndex((t) => t.path === fromPath);
		if (idx === -1) return prev;

		// Keep non-closable tabs (e.g. dashboard) and tabs at or before fromPath
		const filtered = prev.tabs.filter((t, i) => {
			if (!t.closable) return true;
			return i <= idx;
		});
		const activeStillExists = filtered.some((t) => t.path === prev.activeTab);
		return {
			tabs: filtered,
			activeTab: activeStillExists ? prev.activeTab : fromPath,
		};
	});
}
