import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "#/components/confirm-dialog";
import { DataTable } from "#/components/data-table/data-table";
import { FormDrawer } from "#/components/form-drawer";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { requireOrgMemberRole } from "#/lib/auth/guards";
import { resolveMenuLabel } from "#/lib/menu-label";
import { orpc } from "#/orpc/client";

export const Route = createFileRoute(
	"/(workspace)/_layout/settings/organization/menus",
)({
	beforeLoad: async () => {
		// 菜单是 workspace 的产品架构，owner-only（site-admin 因 requireOrgMemberRole
		// 内置 isAdmin 旁路也可进，方便排障 / 交付场景的超管直接编辑）。
		await requireOrgMemberRole({ data: { allowed: ["owner"] } });
	},
	component: MenusPage,
});

type MenuType = "CATALOG" | "MENU" | "BUTTON" | "EMBEDDED" | "LINK";
type MenuStatus = "ACTIVE" | "DISABLED";

const MENU_TYPES: MenuType[] = [
	"CATALOG",
	"MENU",
	"BUTTON",
	"EMBEDDED",
	"LINK",
];
const MENU_STATUSES: MenuStatus[] = ["ACTIVE", "DISABLED"];

interface MenuMeta {
	title?: string;
	icon?: string;
	order?: number;
	hideInMenu?: boolean;
	[key: string]: unknown;
}

interface MenuNode {
	id: number;
	type: string;
	path: string | null;
	name: string | null;
	component: string | null;
	parentId: number | null;
	order: number;
	status: string;
	requiredPermission: string | null;
	organizationId: string | null;
	meta: MenuMeta | null;
	children?: MenuNode[];
}

interface FlatMenuRow extends MenuNode {
	depth: number;
}

interface MenuFormState {
	id?: number;
	name: string;
	path: string;
	type: MenuType;
	component: string;
	parentId: number | null;
	order: number;
	status: MenuStatus;
	requiredPermission: string;
	title: string;
	icon: string;
}

const EMPTY_FORM: MenuFormState = {
	name: "",
	path: "",
	type: "MENU",
	component: "",
	parentId: null,
	order: 0,
	status: "ACTIVE",
	requiredPermission: "",
	title: "",
	icon: "",
};

function flatten(nodes: MenuNode[], depth = 0, acc: FlatMenuRow[] = []) {
	for (const node of nodes) {
		acc.push({ ...node, depth });
		if (node.children?.length) flatten(node.children, depth + 1, acc);
	}
	return acc;
}

const MENUS_KEY = ["menus", "tree"] as const;

function MenusPage() {
	const queryClient = useQueryClient();
	const { data, isPending } = useQuery(
		orpc.listMenus.queryOptions({ input: {} }),
	);

	const tree = (data ?? []) as unknown as MenuNode[];
	const rows = useMemo(() => flatten(tree), [tree]);

	const [drawerOpen, setDrawerOpen] = useState(false);
	const [form, setForm] = useState<MenuFormState>(EMPTY_FORM);
	const [removeTarget, setRemoveTarget] = useState<MenuNode | null>(null);

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: MENUS_KEY });
		queryClient.invalidateQueries({ queryKey: ["orpc"] });
	};

	const createMutation = useMutation({
		...orpc.createMenu.mutationOptions(),
		onSuccess: () => {
			toast.success("Menu created");
			invalidate();
			setDrawerOpen(false);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const updateMutation = useMutation({
		...orpc.updateMenu.mutationOptions(),
		onSuccess: () => {
			toast.success("Menu updated");
			invalidate();
			setDrawerOpen(false);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const deleteMutation = useMutation({
		...orpc.deleteMenu.mutationOptions(),
		onSuccess: () => {
			toast.success("Menu deleted");
			invalidate();
			setRemoveTarget(null);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	function openCreate(parentId: number | null = null) {
		setForm({ ...EMPTY_FORM, parentId });
		setDrawerOpen(true);
	}

	function openEdit(node: MenuNode) {
		setForm({
			id: node.id,
			name: node.name ?? "",
			path: node.path ?? "",
			type: (node.type as MenuType) || "MENU",
			component: node.component ?? "",
			parentId: node.parentId,
			order: node.order ?? 0,
			status: (node.status as MenuStatus) || "ACTIVE",
			requiredPermission: node.requiredPermission ?? "",
			title: node.meta?.title ?? "",
			icon: node.meta?.icon ?? "",
		});
		setDrawerOpen(true);
	}

	function handleSubmit() {
		const meta: MenuMeta = {};
		if (form.title) meta.title = form.title;
		if (form.icon) meta.icon = form.icon;
		if (form.order) meta.order = form.order;

		const payload = {
			name: form.name || undefined,
			path: form.path || undefined,
			type: form.type,
			component: form.component || undefined,
			parentId: form.parentId ?? undefined,
			order: form.order,
			status: form.status,
			requiredPermission: form.requiredPermission || undefined,
			meta: Object.keys(meta).length ? meta : undefined,
		};

		if (form.id) {
			updateMutation.mutate({ id: form.id, data: payload });
		} else {
			createMutation.mutate(payload);
		}
	}

	const columns: ColumnDef<FlatMenuRow>[] = [
		{
			id: "name",
			header: "Name",
			cell: ({ row }) => {
				const rawTitle = row.original.meta?.title;
				const display =
					resolveMenuLabel(rawTitle ?? undefined) ?? row.original.name ?? "—";
				// System seed menus store meta.title as an i18n key (menu.xxx); show
				// the raw key as sub-label so operators know it is translated.
				const subLabel =
					rawTitle && rawTitle !== display ? rawTitle : row.original.name;
				return (
					<div
						className="flex flex-col"
						style={{ paddingLeft: `${row.original.depth * 16}px` }}
					>
						<span className="font-medium">{display}</span>
						{subLabel ? (
							<span className="text-xs text-muted-foreground">{subLabel}</span>
						) : null}
					</div>
				);
			},
		},
		{
			accessorKey: "path",
			header: "Path",
			cell: ({ row }) => (
				<code className="text-xs">{row.original.path ?? "—"}</code>
			),
		},
		{
			accessorKey: "type",
			header: "Type",
			cell: ({ row }) => <Badge variant="outline">{row.original.type}</Badge>,
		},
		{
			accessorKey: "requiredPermission",
			header: "Permission",
			cell: ({ row }) => (
				<code className="text-xs text-muted-foreground">
					{row.original.requiredPermission ?? "—"}
				</code>
			),
		},
		{
			accessorKey: "order",
			header: "Order",
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) =>
				row.original.status === "ACTIVE" ? (
					<Badge variant="outline">Active</Badge>
				) : (
					<Badge variant="secondary">Disabled</Badge>
				),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="size-8">
							<MoreHorizontalIcon className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onSelect={() => openEdit(row.original)}>
							Edit
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => openCreate(row.original.id)}>
							Add child
						</DropdownMenuItem>
						<DropdownMenuItem
							variant="destructive"
							onSelect={() => setRemoveTarget(row.original)}
						>
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		},
	];

	const parentOptions = useMemo(
		() =>
			rows.map((r) => ({
				id: r.id,
				label: r.name ?? `#${r.id}`,
				depth: r.depth,
			})),
		[rows],
	);

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<div>
					<CardTitle>Menus</CardTitle>
					<CardDescription>
						Manage the navigation tree shown in the sidebar.
					</CardDescription>
				</div>
				<Button size="sm" onClick={() => openCreate(null)}>
					<PlusIcon className="size-4" />
					New menu
				</Button>
			</CardHeader>
			<CardContent>
				<DataTable
					columns={columns}
					data={rows}
					loading={isPending}
					rowKey={(row) => row.id}
				/>
			</CardContent>

			<FormDrawer
				open={drawerOpen}
				onOpenChange={setDrawerOpen}
				title={form.id ? "Edit menu" : "New menu"}
				submitText="Save"
				submitting={createMutation.isPending || updateMutation.isPending}
				onSubmit={handleSubmit}
				width="lg"
			>
				<div className="grid grid-cols-2 gap-4">
					<Field label="Name" htmlFor="m-name">
						<Input
							id="m-name"
							value={form.name}
							onChange={(e) => setForm({ ...form, name: e.target.value })}
							placeholder="dashboard"
						/>
					</Field>
					<Field label="Display title" htmlFor="m-title">
						<Input
							id="m-title"
							value={form.title}
							onChange={(e) => setForm({ ...form, title: e.target.value })}
							placeholder="Dashboard"
						/>
					</Field>
					<Field label="Path" htmlFor="m-path">
						<Input
							id="m-path"
							value={form.path}
							onChange={(e) => setForm({ ...form, path: e.target.value })}
							placeholder="/dashboard"
						/>
					</Field>
					<Field label="Component" htmlFor="m-component">
						<Input
							id="m-component"
							value={form.component}
							onChange={(e) => setForm({ ...form, component: e.target.value })}
							placeholder="dashboard"
						/>
					</Field>
					<Field label="Type">
						<Select
							value={form.type}
							onValueChange={(v) => setForm({ ...form, type: v as MenuType })}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{MENU_TYPES.map((t) => (
									<SelectItem key={t} value={t}>
										{t}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field label="Status">
						<Select
							value={form.status}
							onValueChange={(v) =>
								setForm({ ...form, status: v as MenuStatus })
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{MENU_STATUSES.map((s) => (
									<SelectItem key={s} value={s}>
										{s}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field label="Icon" htmlFor="m-icon">
						<Input
							id="m-icon"
							value={form.icon}
							onChange={(e) => setForm({ ...form, icon: e.target.value })}
							placeholder="LayoutDashboard"
						/>
					</Field>
					<Field label="Order" htmlFor="m-order">
						<Input
							id="m-order"
							type="number"
							value={form.order}
							onChange={(e) =>
								setForm({ ...form, order: Number(e.target.value) || 0 })
							}
						/>
					</Field>
					<Field label="Parent">
						<Select
							value={form.parentId === null ? "root" : String(form.parentId)}
							onValueChange={(v) =>
								setForm({
									...form,
									parentId: v === "root" ? null : Number(v),
								})
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="root">— root —</SelectItem>
								{parentOptions
									.filter((o) => o.id !== form.id)
									.map((o) => (
										<SelectItem key={o.id} value={String(o.id)}>
											{"".padStart(o.depth * 2, "·")} {o.label}
										</SelectItem>
									))}
							</SelectContent>
						</Select>
					</Field>
					<Field
						label="Required permission"
						htmlFor="m-perm"
						className="col-span-2"
					>
						<Input
							id="m-perm"
							value={form.requiredPermission}
							onChange={(e) =>
								setForm({ ...form, requiredPermission: e.target.value })
							}
							placeholder="organization:update"
						/>
						<p className="text-xs text-muted-foreground">
							Format <code>resource:action</code> (org-scoped via
							authClient.organization.hasPermission).
						</p>
					</Field>
				</div>
			</FormDrawer>

			<ConfirmDialog
				open={removeTarget !== null}
				onOpenChange={(open) => {
					if (!open) setRemoveTarget(null);
				}}
				title="Delete menu"
				description={
					removeTarget ? (
						<>
							Delete menu <b>{removeTarget.name ?? `#${removeTarget.id}`}</b>?
							Children under this node will also be removed.
						</>
					) : null
				}
				confirmText="Delete"
				confirming={deleteMutation.isPending}
				onConfirm={() => {
					if (removeTarget) deleteMutation.mutate({ id: removeTarget.id });
				}}
			/>
		</Card>
	);
}

function Field({
	label,
	htmlFor,
	children,
	className,
}: {
	label: string;
	htmlFor?: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={`space-y-2 ${className ?? ""}`}>
			<Label htmlFor={htmlFor}>{label}</Label>
			{children}
		</div>
	);
}
