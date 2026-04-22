import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import type { LucideIcon } from "lucide-react";
import {
	BookOpenIcon,
	Building2Icon,
	BuildingIcon,
	FileTextIcon,
	KeyIcon,
	LayoutDashboardIcon,
	ListIcon,
	LockIcon,
	MenuIcon,
	SettingsIcon,
	ShieldIcon,
	Users2Icon,
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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import { env } from "#/env";
import { orpc } from "#/orpc/client";
import * as m from "#/paraglide/messages";
import {
	type MenuNode,
	menuStore,
	parseMenuMeta,
	setMenus,
} from "#/stores/menu";

const ICON_MAP: Record<string, LucideIcon> = {
	LayoutDashboard: LayoutDashboardIcon,
	Users: UsersIcon,
	Users2: Users2Icon,
	Shield: ShieldIcon,
	Key: KeyIcon,
	Menu: MenuIcon,
	Settings: SettingsIcon,
	Building: BuildingIcon,
	Building2: Building2Icon,
	FileText: FileTextIcon,
	Lock: LockIcon,
	List: ListIcon,
	BookOpen: BookOpenIcon,
};

/**
 * Menu paths that become disabled when their feature flag is off. The map
 * is kept tiny on purpose — feature flags in this shape are the exception,
 * not the rule; adding entries implies a real product-shape switch.
 */
function getDisabledReason(path: string | null): string | null {
	if (path === "/teams" && !env.VITE_TEAM_ENABLED) {
		return m.sidebar_team_disabled_tooltip();
	}
	return null;
}

function resolveIcon(iconName: string | undefined): LucideIcon | null {
	if (!iconName) return null;
	return ICON_MAP[iconName] ?? null;
}

/**
 * Menu.meta.title in the DB is an i18n key (e.g. `menu.dashboard`). Paraglide
 * compiles JSON keys with dots as string-named exports, so dynamic access via
 * `m["menu.dashboard"]()` works at runtime. Fall back to the raw string for
 * operator-added menus that kept a plain Chinese literal.
 */
function resolveMenuLabel(title: string | undefined): string | undefined {
	if (!title) return undefined;
	if (title.startsWith("menu.") && title in m) {
		const fn = (m as unknown as Record<string, () => string>)[title];
		if (typeof fn === "function") return fn();
	}
	return title;
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
									<span>
										{resolveMenuLabel(child.meta?.title) ??
											child.name ??
											child.path}
									</span>
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
	const label =
		resolveMenuLabel(node.meta?.title) ??
		node.name ??
		node.path ??
		String(node.id);
	const disabledReason = getDisabledReason(node.path);

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

	if (disabledReason) {
		return (
			<SidebarMenuItem>
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<SidebarMenuButton
								aria-disabled="true"
								className="cursor-not-allowed opacity-50 hover:bg-transparent hover:text-sidebar-foreground/70 focus-visible:ring-0"
								onClick={(e) => {
									e.preventDefault();
								}}
							>
								{Icon && <Icon className="size-4" />}
								<span>{label}</span>
							</SidebarMenuButton>
						</TooltipTrigger>
						<TooltipContent side="right">{disabledReason}</TooltipContent>
					</Tooltip>
				</TooltipProvider>
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
					{m.sidebar_empty()}
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
						<SidebarGroupLabel>{m.sidebar_nav_label()}</SidebarGroupLabel>
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
