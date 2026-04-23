import {
	createFileRoute,
	Outlet,
	redirect,
	useLocation,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
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
import { auth } from "#/lib/auth";
import { addTab } from "#/stores/tabbar";

// Site-admin 面专属：只允许超管进入（`user:list` 权限是 BA admin plugin 的
// 标志性 statement，有它基本就是平台运营角色）。普通 member 试图进 `/site/*`
// 直接被打回 dashboard。Commit 4 会把这里的 AppSidebar 换成 AppSiteSidebar
// (静态菜单) 并加上 "Platform Admin" 标识。
const requireSiteAdmin = createServerFn({ method: "GET" }).handler(async () => {
	const headers = new Headers(getRequestHeaders() as Record<string, string>);
	try {
		const result = await auth.api.userHasPermission({
			headers,
			body: { permissions: { user: ["list"] } },
		});
		return Boolean(result?.success);
	} catch {
		return false;
	}
});

export const Route = createFileRoute("/site/_layout")({
	beforeLoad: async () => {
		const ok = await requireSiteAdmin();
		if (!ok) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: SiteLayout,
});

function useTabSync() {
	const { pathname } = useLocation();

	useEffect(() => {
		// site-admin 菜单静态，tab 标题直接用末段路径
		const fallbackTitle =
			pathname.split("/").filter(Boolean).at(-1) ?? pathname;
		addTab({
			path: pathname,
			title: fallbackTitle,
			closable: pathname !== "/site/users",
		});
	}, [pathname]);
}

function SiteLayout() {
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
							Platform Admin
						</p>
						<h1 className="text-base font-semibold">Site Administration</h1>
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
