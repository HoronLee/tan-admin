import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import type { LucideIcon } from "lucide-react";
import {
	BookOpenIcon,
	BuildingIcon,
	FileTextIcon,
	KeyIcon,
	LayoutDashboardIcon,
	ListIcon,
	LockIcon,
	MenuIcon,
	SettingsIcon,
	ShieldIcon,
	UsersIcon,
} from "lucide-react";
import { useEffect } from "react";
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
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "#/components/ui/sidebar";
import { Skeleton } from "#/components/ui/skeleton";
import { orpc } from "#/orpc/client";
import {
	type MenuNode,
	menuStore,
	parseMenuMeta,
	setMenus,
} from "#/stores/menu";

const ICON_MAP: Record<string, LucideIcon> = {
	LayoutDashboard: LayoutDashboardIcon,
	Users: UsersIcon,
	Shield: ShieldIcon,
	Key: KeyIcon,
	Menu: MenuIcon,
	Settings: SettingsIcon,
	Building: BuildingIcon,
	FileText: FileTextIcon,
	Lock: LockIcon,
	List: ListIcon,
	BookOpen: BookOpenIcon,
};

function resolveIcon(iconName: string | undefined): LucideIcon | null {
	if (!iconName) return null;
	return ICON_MAP[iconName] ?? null;
}

interface MenuItemProps {
	node: MenuNode;
	pathname: string;
}

function SubMenuItems({
	nodes,
	pathname,
}: {
	nodes: MenuNode[];
	pathname: string;
}) {
	return (
		<SidebarMenuSub>
			{nodes
				.filter((child) => !child.meta?.hideInMenu)
				.map((child) => {
					const isActive =
						child.path !== null &&
						(pathname === child.path || pathname.startsWith(`${child.path}/`));
					const Icon = resolveIcon(child.meta?.icon);
					return (
						<SidebarMenuSubItem key={child.id}>
							<SidebarMenuSubButton asChild isActive={isActive}>
								<Link to={child.path ?? "#"}>
									{Icon && <Icon className="size-4" />}
									<span>{child.meta?.title ?? child.name ?? child.path}</span>
								</Link>
							</SidebarMenuSubButton>
						</SidebarMenuSubItem>
					);
				})}
		</SidebarMenuSub>
	);
}

function MenuItem({ node, pathname }: MenuItemProps) {
	const hasVisibleChildren =
		!node.meta?.hideChildrenInMenu &&
		node.children &&
		node.children.filter((c) => !c.meta?.hideInMenu).length > 0;

	const isActive =
		node.path !== null &&
		(pathname === node.path || pathname.startsWith(`${node.path}/`));

	const Icon = resolveIcon(node.meta?.icon);
	const label = node.meta?.title ?? node.name ?? node.path ?? String(node.id);

	if (hasVisibleChildren && node.children) {
		return (
			<SidebarMenuItem>
				<SidebarMenuButton isActive={isActive}>
					{Icon && <Icon className="size-4" />}
					<span>{label}</span>
				</SidebarMenuButton>
				<SubMenuItems nodes={node.children} pathname={pathname} />
			</SidebarMenuItem>
		);
	}

	return (
		<SidebarMenuItem>
			<SidebarMenuButton asChild isActive={isActive}>
				<Link to={node.path ?? "#"}>
					{Icon && <Icon className="size-4" />}
					<span>{label}</span>
				</Link>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

function SidebarSkeleton() {
	return (
		<SidebarGroup>
			<SidebarGroupContent>
				<div className="flex flex-col gap-2 px-2 py-1">
					{Array.from({ length: 5 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
						<Skeleton key={i} className="h-8 w-full rounded-md" />
					))}
				</div>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}

function SidebarEmpty() {
	return (
		<SidebarGroup>
			<SidebarGroupContent>
				<p className="px-4 py-6 text-center text-sm text-muted-foreground">
					暂无可访问的菜单
				</p>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}

export default function AppSidebar() {
	const { pathname } = useLocation();

	const { data, isPending } = useQuery(
		orpc.getUserMenus.queryOptions({ input: {} }),
	);

	const { menus } = useStore(menuStore);

	useEffect(() => {
		if (!data) return;
		// data is an array of Menu nodes from ZenStack; parse meta JSON field
		const parsed: MenuNode[] = (data as unknown[]).map((item) =>
			mapMenuNode(item),
		);
		setMenus(parsed);
	}, [data]);

	return (
		<Sidebar>
			<SidebarHeader>
				<div className="flex flex-col gap-0.5 px-2 py-1.5">
					<p className="text-xs font-semibold tracking-[0.18em] text-sidebar-foreground/60 uppercase">
						Admin
					</p>
					<p className="text-base font-semibold text-sidebar-foreground">
						Tan Admin
					</p>
				</div>
			</SidebarHeader>
			<SidebarContent>
				{isPending ? (
					<SidebarSkeleton />
				) : menus.length === 0 ? (
					<SidebarEmpty />
				) : (
					<SidebarGroup>
						<SidebarGroupLabel>导航</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{menus
									.filter((node) => !node.meta?.hideInMenu)
									.map((node) => (
										<MenuItem key={node.id} node={node} pathname={pathname} />
									))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				)}
			</SidebarContent>
		</Sidebar>
	);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapMenuNode(raw: unknown): MenuNode {
	const item = raw as Record<string, unknown>;
	return {
		id: item.id as number,
		name: (item.name as string | null) ?? null,
		path: (item.path as string | null) ?? null,
		component: (item.component as string | null) ?? null,
		order: (item.order as number) ?? 0,
		parentId: (item.parentId as number | null) ?? null,
		meta: parseMenuMeta(item.meta),
		children: Array.isArray(item.children)
			? (item.children as unknown[]).map((c) => mapMenuNode(c))
			: undefined,
	};
}
