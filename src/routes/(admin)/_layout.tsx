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
import AppSidebar from "#/components/layout/AppSidebar";
import AppTabbar from "#/components/layout/AppTabbar";
import ThemeToggle from "#/components/ThemeToggle";
import { Separator } from "#/components/ui/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "#/components/ui/sidebar";
import BetterAuthHeader from "#/integrations/better-auth/header-user";
import { getSessionUser } from "#/lib/auth-session";
import { findMenuByPath, menuStore } from "#/stores/menu";
import { addTab } from "#/stores/tabbar";

const requireAuth = createServerFn({ method: "GET" }).handler(async () => {
	const headers = new Headers(getRequestHeaders() as Record<string, string>);
	const session = await getSessionUser(headers);
	return Boolean(session);
});

export const Route = createFileRoute("/(admin)/_layout")({
	beforeLoad: async () => {
		const authenticated = await requireAuth();
		if (!authenticated) {
			throw redirect({ to: "/login" });
		}
	},
	component: AdminLayout,
});

function useTabSync() {
	const { pathname } = useLocation();
	const { menus } = useStore(menuStore);

	useEffect(() => {
		// Resolve title from dynamic menu tree; fallback to last pathname segment
		const menuNode = findMenuByPath(menus, pathname);
		const menuTitle = menuNode?.meta?.title;
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

function AdminLayout() {
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
							Management
						</p>
						<h1 className="text-base font-semibold">
							Administration Workspace
						</h1>
					</div>
					<div className="flex items-center gap-2">
						<ThemeToggle />
						<BetterAuthHeader />
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
