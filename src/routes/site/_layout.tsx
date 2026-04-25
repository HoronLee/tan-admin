import {
	createFileRoute,
	Outlet,
	redirect,
	useLocation,
} from "@tanstack/react-router";
import { useEffect } from "react";
import LocaleSwitcher from "#/components/LocaleSwitcher";
import AppSiteSidebar from "#/components/layout/AppSiteSidebar";
import AppTabbar from "#/components/layout/AppTabbar";
import ImpersonationBanner from "#/components/layout/ImpersonationBanner";
import OrganizationSwitcher from "#/components/layout/OrganizationSwitcher";
import ThemeToggle from "#/components/ThemeToggle";
import { Separator } from "#/components/ui/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "#/components/ui/sidebar";
import { UserButton } from "#/components/user/user-button";
import { requireSiteAdmin } from "#/lib/auth/guards";
import { addTab } from "#/stores/tabbar";

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
			<AppSiteSidebar />
			<SidebarInset>
				<ImpersonationBanner />
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
