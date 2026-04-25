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
import { getSessionUser } from "#/lib/auth/session";
import { resolveMenuLabel } from "#/lib/menu-label";
import { findMenuByPath, menuStore } from "#/stores/menu";
import { addTab } from "#/stores/tabbar";

interface WorkspaceGuardResult {
	authenticated: boolean;
	hasActiveOrg: boolean;
	isAdmin: boolean;
}

const inspectWorkspaceSession = createServerFn({ method: "GET" }).handler(
	async (): Promise<WorkspaceGuardResult> => {
		const headers = new Headers(getRequestHeaders() as Record<string, string>);
		const session = await getSessionUser(headers);
		if (!session) {
			return { authenticated: false, hasActiveOrg: false, isAdmin: false };
		}
		return {
			authenticated: true,
			hasActiveOrg: Boolean(session.activeOrganizationId),
			isAdmin: session.policyAuth.isAdmin,
		};
	},
);

export const Route = createFileRoute("/(workspace)/_layout")({
	beforeLoad: async () => {
		const guard = await inspectWorkspaceSession();
		if (!guard.authenticated) {
			throw redirect({
				to: "/auth/$path",
				params: { path: "sign-in" },
			});
		}
		// saas 模式下 super-admin 不自动获得 personal org，落地 workspace 会
		// 因 activeOrganizationId=null 导致 menu / policy 全失效。分流：
		//  - super-admin → 平台后台 `/site/users`
		//  - 普通用户（理论不该出现，saas provision hook 会建 personal org）
		//    → /onboarding 占位页兜底
		if (!guard.hasActiveOrg) {
			if (guard.isAdmin) {
				throw redirect({ to: "/site/users" });
			}
			throw redirect({ to: "/onboarding" });
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
				<ImpersonationBanner />
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
