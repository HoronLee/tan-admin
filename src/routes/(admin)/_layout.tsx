import { createFileRoute, Outlet } from "@tanstack/react-router";
import AppSidebar from "#/components/layout/AppSidebar";
import ThemeToggle from "#/components/ThemeToggle";
import { Separator } from "#/components/ui/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "#/components/ui/sidebar";
import BetterAuthHeader from "#/integrations/better-auth/header-user";

export const Route = createFileRoute("/(admin)/_layout")({
	component: AdminLayout,
});

function AdminLayout() {
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
				<div className="flex-1 p-4 sm:p-6">
					<Outlet />
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
