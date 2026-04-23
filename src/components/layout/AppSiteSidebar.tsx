import { Link, useLocation } from "@tanstack/react-router";
import {
	Building2Icon,
	FileTextIcon,
	type LucideIcon,
	Users2Icon,
} from "lucide-react";
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

// Site-admin 面的 sidebar 是静态的：页面固定、运营人员不会改。不走
// DB menuStore，避免给超管"看起来可配置但其实不该动"的错觉。
// 和 AppSidebar (workspace 动态菜单) 共用 shadcn Sidebar primitive，
// 视觉一致；顶部换成 "Platform Admin" 标识以区分。
interface SiteMenuItem {
	path: string;
	label: string;
	icon: LucideIcon;
}

const SITE_MENU: SiteMenuItem[] = [
	{ path: "/site/users", label: "Users", icon: Users2Icon },
	{ path: "/site/organizations", label: "Organizations", icon: Building2Icon },
	// Metrics 页占位，留到 future work
	{ path: "/site/metrics", label: "Metrics", icon: FileTextIcon },
];

export default function AppSiteSidebar() {
	const { pathname } = useLocation();

	return (
		<Sidebar>
			<SidebarHeader>
				<div className="flex flex-col gap-0.5 px-2 py-1.5">
					<p className="text-xs font-semibold tracking-[0.18em] text-sidebar-foreground/60 uppercase">
						Platform Admin
					</p>
					<p className="text-base font-semibold text-sidebar-foreground">
						Tan Servora
					</p>
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Site</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{SITE_MENU.map((item) => {
								const isActive =
									pathname === item.path ||
									pathname.startsWith(`${item.path}/`);
								return (
									<SidebarMenuItem key={item.path}>
										<SidebarMenuButton asChild isActive={isActive}>
											<Link to={item.path}>
												<item.icon className="size-4" />
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
