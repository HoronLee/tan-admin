import {
	createFileRoute,
	Outlet,
	redirect,
	useLocation,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { useStore } from "@tanstack/react-store";
import { useEffect } from "react";
import LocaleSwitcher from "#/components/LocaleSwitcher";
import AppSidebar from "#/components/layout/AppSidebar";
import AppTabbar from "#/components/layout/AppTabbar";
import OrganizationSwitcher from "#/components/layout/OrganizationSwitcher";
import ThemeToggle from "#/components/ThemeToggle";
import { Separator } from "#/components/ui/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "#/components/ui/sidebar";
import { UserButton } from "#/components/user/user-button";
import { getSessionUser } from "#/lib/auth-session";
import { resolveMenuLabel } from "#/lib/menu-label";
import { findMenuByPath, menuStore } from "#/stores/menu";
import { addTab } from "#/stores/tabbar";

const requireAuth = createServerFn({ method: "GET" }).handler(async () => {
	const headers = new Headers(getRequestHeaders() as Record<string, string>);
	const session = await getSessionUser(headers);
	return Boolean(session);
});

export const Route = createFileRoute("/(workspace)/_layout")({
	beforeLoad: async () => {
		const authenticated = await requireAuth();
		if (!authenticated) {
			throw redirect({
				to: "/auth/$path",
				params: { path: "sign-in" },
			});
		}
	},
	component: WorkspaceLayout,
});

function useTabSync() {
	const { pathname } = useLocation();
	const { menus } = useStore(menuStore);

	useEffect(() => {
		// Resolve title from dynamic menu tree; fallback to last pathname segment.
		// Run through menu-label resolver so `menu.*` i18n keys become translated text
		// instead of leaking the raw key into the tab chip.
		const menuNode = findMenuByPath(menus, pathname);
		const menuTitle = resolveMenuLabel(menuNode?.meta?.title ?? undefined);
		const fallbackTitle =
			pathname.split("/").filter(Boolean).at(-1) ?? pathname;
		const title = menuTitle ?? fallbackTitle;

		addTab({
			path: pathname,
			title,
			closable: pathname !== "/dashboard",
		});
	}, [pathname, menus]);
}

function WorkspaceLayout() {
	useTabSync();

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
					<SidebarTrigger />
					<Separator orientation="vertical" className="h-6" />
					<div className="flex flex-1 flex-col">
						<p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
							Workspace
						</p>
						<h1 className="text-base font-semibold">Team Workspace</h1>
					</div>
					<div className="flex items-center gap-2">
						<OrganizationSwitcher />
						<LocaleSwitcher />
						<ThemeToggle />
						<UserButton size="icon" themeToggle={false} align="end" />
					</div>
				</header>
				<AppTabbar />
				<div className="flex-1 p-4 sm:p-6">
					<Outlet />
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
