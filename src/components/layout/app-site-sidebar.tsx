import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import {
	BuildingIcon,
	ChevronRightIcon,
	LayoutDashboardIcon,
	type LucideIcon,
	MenuIcon,
	UsersIcon,
} from "lucide-react";
import { useEffect } from "react";
import { BrandMark } from "#/components/brand-mark";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "#/components/ui/collapsible";
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
import { resolveMenuLabel } from "#/lib/menu/menu-label";
import { orpc } from "#/orpc/client";
import * as m from "#/paraglide/messages";
import {
	type MenuNode,
	menuStore,
	parseMenuMeta,
	setMenus,
} from "#/stores/menu";

const ICON_MAP: Record<string, LucideIcon> = {
	Building: BuildingIcon,
	LayoutDashboard: LayoutDashboardIcon,
	Menu: MenuIcon,
	Users: UsersIcon,
};

function resolveIcon(iconName: string | undefined): LucideIcon | null {
	return iconName ? (ICON_MAP[iconName] ?? null) : null;
}

function containsActivePath(node: MenuNode, pathname: string): boolean {
	if (
		node.path &&
		(pathname === node.path || pathname.startsWith(`${node.path}/`))
	) {
		return true;
	}
	return (node.children ?? []).some((child) =>
		containsActivePath(child, pathname),
	);
}

function SiteMenuItems({
	nodes,
	pathname,
}: {
	nodes: MenuNode[];
	pathname: string;
}) {
	return (
		<SidebarMenu>
			{nodes
				.filter((node) => !node.meta?.hideInMenu)
				.map((node) => (
					<SiteMenuItem key={node.id} node={node} pathname={pathname} />
				))}
		</SidebarMenu>
	);
}

function SiteMenuItem({
	node,
	pathname,
}: {
	node: MenuNode;
	pathname: string;
}) {
	const children = (node.children ?? []).filter(
		(child) => !child.meta?.hideInMenu,
	);
	const label =
		resolveMenuLabel(node.meta?.title) ??
		node.name ??
		node.path ??
		String(node.id);
	const Icon = resolveIcon(node.meta?.icon);
	const isActive = Boolean(
		node.path &&
			(pathname === node.path || pathname.startsWith(`${node.path}/`)),
	);

	if (children.length > 0 && !node.meta?.hideChildrenInMenu) {
		return (
			<Collapsible
				asChild
				className="group/collapsible"
				defaultOpen={containsActivePath(node, pathname)}
			>
				<SidebarMenuItem>
					<CollapsibleTrigger asChild>
						<SidebarMenuButton isActive={isActive}>
							{Icon && <Icon className="size-4" />}
							<span>{label}</span>
							<ChevronRightIcon className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
						</SidebarMenuButton>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<SidebarMenuSub>
							{children.map((child) => (
								<SiteMenuSubItem
									key={child.id}
									node={child}
									pathname={pathname}
								/>
							))}
						</SidebarMenuSub>
					</CollapsibleContent>
				</SidebarMenuItem>
			</Collapsible>
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

function SiteMenuSubItem({
	node,
	pathname,
}: {
	node: MenuNode;
	pathname: string;
}) {
	const children = (node.children ?? []).filter(
		(child) => !child.meta?.hideInMenu,
	);
	const label =
		resolveMenuLabel(node.meta?.title) ??
		node.name ??
		node.path ??
		String(node.id);
	const Icon = resolveIcon(node.meta?.icon);
	const isActive = Boolean(
		node.path &&
			(pathname === node.path || pathname.startsWith(`${node.path}/`)),
	);

	if (children.length > 0 && !node.meta?.hideChildrenInMenu) {
		return (
			<Collapsible
				asChild
				className="group/collapsible"
				defaultOpen={containsActivePath(node, pathname)}
			>
				<SidebarMenuSubItem>
					<CollapsibleTrigger asChild>
						<SidebarMenuSubButton isActive={isActive}>
							{Icon && <Icon className="size-4" />}
							<span>{label}</span>
							<ChevronRightIcon className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
						</SidebarMenuSubButton>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<SidebarMenuSub>
							{children.map((child) => (
								<SiteMenuSubItem
									key={child.id}
									node={child}
									pathname={pathname}
								/>
							))}
						</SidebarMenuSub>
					</CollapsibleContent>
				</SidebarMenuSubItem>
			</Collapsible>
		);
	}

	return (
		<SidebarMenuSubItem>
			<SidebarMenuSubButton asChild isActive={isActive}>
				<Link to={node.path ?? "#"}>
					{Icon && <Icon className="size-4" />}
					<span>{label}</span>
				</Link>
			</SidebarMenuSubButton>
		</SidebarMenuSubItem>
	);
}

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
			? (item.children as unknown[]).map(mapMenuNode)
			: undefined,
	};
}

export default function AppSiteSidebar() {
	const { pathname } = useLocation();
	const { data, isPending } = useQuery(
		orpc.navigation.get.queryOptions({ input: { surface: "SITE" } }),
	);
	const { menus } = useStore(menuStore);

	useEffect(() => {
		if (!data) return;
		setMenus((data as unknown[]).map(mapMenuNode));
	}, [data]);

	return (
		<Sidebar>
			<SidebarHeader>
				<div className="flex flex-col gap-0.5 px-2 py-1.5">
					<p className="text-xs font-semibold tracking-[0.18em] text-sidebar-foreground/60 uppercase">
						Platform Admin
					</p>
					<BrandMark size="md" className="text-sidebar-foreground" />
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>{m.sidebar_nav_label()}</SidebarGroupLabel>
					<SidebarGroupContent>
						{isPending ? (
							<div className="px-4 py-6 text-center text-sm text-muted-foreground">
								{m.common_loading()}
							</div>
						) : menus.length === 0 ? (
							<div className="px-4 py-6 text-center text-sm text-muted-foreground">
								{m.sidebar_empty()}
							</div>
						) : (
							<SiteMenuItems nodes={menus} pathname={pathname} />
						)}
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
		</Sidebar>
	);
}
