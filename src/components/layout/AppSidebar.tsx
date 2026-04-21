import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboardIcon, ShieldIcon } from "lucide-react";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "#/components/ui/sidebar";

const adminNavItems = [
	{
		to: "/dashboard",
		label: "Dashboard",
		icon: LayoutDashboardIcon,
	},
	{
		to: "/roles",
		label: "Roles",
		icon: ShieldIcon,
	},
] as const;

export default function AppSidebar() {
	const { pathname } = useLocation();

	return (
		<Sidebar>
			<SidebarHeader>
				<div className="flex flex-col gap-0.5 px-2 py-1.5">
					<p className="text-xs font-semibold tracking-[0.18em] text-sidebar-foreground/60 uppercase">
						Admin
					</p>
					<p className="text-base font-semibold text-sidebar-foreground">
						Tan Admin Console
					</p>
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Management</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{adminNavItems.map((item) => {
								const Icon = item.icon;
								const isActive =
									pathname === item.to || pathname.startsWith(`${item.to}/`);
								return (
									<SidebarMenuItem key={item.to}>
										<SidebarMenuButton asChild isActive={isActive}>
											<Link to={item.to}>
												<Icon />
												<span>{item.label}</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
		</Sidebar>
	);
}
