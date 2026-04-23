import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import type { LucideIcon } from "lucide-react";
import {
	ActivityIcon,
	BellIcon,
	BookOpenIcon,
	Building2Icon,
	BuildingIcon,
	ChevronRightIcon,
	FileIcon,
	FileTextIcon,
	KeyIcon,
	LayoutDashboardIcon,
	ListIcon,
	LockIcon,
	LogInIcon,
	MailIcon,
	MenuIcon,
	SettingsIcon,
	ShieldIcon,
	TagIcon,
	Users2Icon,
	UsersIcon,
} from "lucide-react";
import { useEffect } from "react";
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
import { Skeleton } from "#/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import { authClient } from "#/lib/auth-client";
import { resolveMenuLabel } from "#/lib/menu-label";
import { planAllowsTeams } from "#/lib/plan";
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
	Bell: BellIcon,
	Mail: MailIcon,
	Tag: TagIcon,
	LogIn: LogInIcon,
	Activity: ActivityIcon,
	File: FileIcon,
};

/**
 * Menu paths that become disabled when their plan/feature gate is off. 现在读
 * active org 的 plan（不再用 env flag），`SidebarGates` 在顶层算一次后向下传。
 * 添加项意味着一个真的产品形态/plan 开关。
 */
interface SidebarGates {
	teamsDisabled: boolean;
}

function getDisabledReason(
	path: string | null,
	gates: SidebarGates,
): string | null {
	if (path === "/teams" && gates.teamsDisabled) {
		return m.sidebar_team_disabled_tooltip();
	}
	return null;
}

function resolveIcon(iconName: string | undefined): LucideIcon | null {
	if (!iconName) return null;
	return ICON_MAP[iconName] ?? null;
}

/**
 * True if `pathname` is an exact/descendant match of `node.path`, or matches
 * any nested child. Used to auto-open the branch containing the current route
 * so users land on the page without having to expand groups manually.
 */
function containsActivePath(node: MenuNode, pathname: string): boolean {
	if (node.path !== null) {
		if (pathname === node.path || pathname.startsWith(`${node.path}/`)) {
			return true;
		}
	}
	return (node.children ?? []).some((c) => containsActivePath(c, pathname));
}

interface MenuItemProps {
	node: MenuNode;
	pathname: string;
	gates: SidebarGates;
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

function MenuItem({ node, pathname, gates }: MenuItemProps) {
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
	const disabledReason = getDisabledReason(node.path, gates);

	if (hasVisibleChildren && node.children) {
		// Auto-open the branch containing the active route so users don't have
		// to expand groups manually on first load / route change.
		const defaultOpen = containsActivePath(node, pathname);
		return (
			<Collapsible
				asChild
				className="group/collapsible"
				defaultOpen={defaultOpen}
			>
				<SidebarMenuItem>
					<CollapsibleTrigger asChild>
						<SidebarMenuButton>
							{Icon && <Icon className="size-4" />}
							<span>{label}</span>
							<ChevronRightIcon className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
						</SidebarMenuButton>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<SubMenuItems nodes={node.children} pathname={pathname} />
					</CollapsibleContent>
				</SidebarMenuItem>
			</Collapsible>
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

	// Plan gating 的唯一真相源：当前 active org 的 plan 字段。未 hydrate 时
	// 默认按 "feature disabled" 走，避免首帧闪现可点击后又灰化。
	const { data: activeOrg } = authClient.useActiveOrganization();
	const gates: SidebarGates = {
		teamsDisabled: !planAllowsTeams(
			(activeOrg as { plan?: string | null } | null | undefined)?.plan,
		),
	};

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
						Workspace
					</p>
					<p className="text-base font-semibold text-sidebar-foreground">
						Tan Servora
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
										<MenuItem
											key={node.id}
											node={node}
											pathname={pathname}
											gates={gates}
										/>
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
