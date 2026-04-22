/**
 * /organizations — super-admin cross-tenant organization list (R10).
 *
 * Site-level admin only (admin plugin `user.role === "admin"`). The server
 * is the source of truth; this page only mirrors the gate to avoid a flash
 * of the management UI for non-admin users. `VITE_TENANCY_MODE=single`
 * hides destructive actions (server also rejects, but the UI should match).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2Icon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
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
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import { env } from "#/env";
import { requireSiteAdmin } from "#/lib/admin-guards";
import { authClient } from "#/lib/auth-client";
import { orpc } from "#/orpc/client";
import * as m from "#/paraglide/messages";

export const Route = createFileRoute("/(admin)/_layout/organizations/")({
	beforeLoad: async () => {
		await requireSiteAdmin();
	},
	component: OrganizationsPage,
});

interface OrganizationRow {
	id: string;
	name: string;
	slug: string | null;
	logo: string | null;
	plan: string | null;
	industry: string | null;
	billingEmail: string | null;
	createdAt: string;
	memberCount: number;
	isDefault: boolean;
}

function OrganizationsPage() {
	const { data: session, isPending: sessionPending } = authClient.useSession();
	const isSuperAdmin =
		(session?.user as { role?: string | null } | undefined)?.role === "admin";
	const isSingleMode = env.VITE_TENANCY_MODE === "single";

	if (sessionPending) {
		return (
			<div className="text-sm text-muted-foreground">{m.common_loading()}</div>
		);
	}

	if (!isSuperAdmin) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>{m.organizations_page_no_permission_title()}</CardTitle>
					<CardDescription>
						{m.organizations_page_no_permission_desc()}
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return <OrganizationsTable isSingleMode={isSingleMode} />;
}

function OrganizationsTable({ isSingleMode }: { isSingleMode: boolean }) {
	const queryClient = useQueryClient();
	const listQueryOptions = orpc.organizationsAdmin.list.queryOptions({
		input: {},
	});
	const { data, isPending } = useQuery(listQueryOptions);
	const rows = (data ?? []) as OrganizationRow[];

	const [createOpen, setCreateOpen] = useState(false);
	const [dissolveTarget, setDissolveTarget] = useState<OrganizationRow | null>(
		null,
	);

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: listQueryOptions.queryKey });

	const dissolveMutation = useMutation({
		mutationFn: async (organizationId: string) => {
			await orpc.organizationsAdmin.dissolve.call({ organizationId });
		},
		onSuccess: () => {
			toast.success(m.organizations_dissolved_toast());
			setDissolveTarget(null);
			invalidate();
		},
		onError: (err: Error) =>
			toast.error(err.message ?? m.organizations_dissolve_failed()),
	});

	const columns: ColumnDef<OrganizationRow>[] = [
		{
			id: "name",
			header: m.organizations_col_org(),
			cell: ({ row }) => (
				<div className="flex flex-col">
					<span className="font-medium">{row.original.name}</span>
					<span className="text-xs text-muted-foreground">
						{row.original.slug ?? "—"}
					</span>
				</div>
			),
		},
		{
			accessorKey: "plan",
			header: m.organizations_col_plan(),
			cell: ({ row }) => (
				<Badge variant="outline">{row.original.plan ?? "free"}</Badge>
			),
		},
		{
			accessorKey: "industry",
			header: m.organizations_col_industry(),
			cell: ({ row }) => (
				<span className="text-sm">{row.original.industry ?? "—"}</span>
			),
		},
		{
			accessorKey: "memberCount",
			header: m.organizations_col_member_count(),
			cell: ({ row }) => (
				<span className="text-sm">{row.original.memberCount}</span>
			),
		},
		{
			accessorKey: "createdAt",
			header: m.organizations_col_created_at(),
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground">
					{new Date(row.original.createdAt).toLocaleDateString()}
				</span>
			),
		},
		{
			id: "flags",
			header: "",
			cell: ({ row }) =>
				row.original.isDefault ? (
					<Badge variant="secondary">{m.organizations_badge_default()}</Badge>
				) : null,
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => {
				const org = row.original;
				// In single-tenancy mode dissolve is forbidden; the default org
				// is always protected. Keep the menu visible but grey out the
				// dangerous action so the user sees it exists + why.
				const canDissolve = !isSingleMode && !org.isDefault;
				return (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" className="size-8">
								<MoreHorizontalIcon className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								variant="destructive"
								disabled={!canDissolve}
								onSelect={() => {
									if (canDissolve) setDissolveTarget(org);
								}}
							>
								{m.organizations_action_dissolve()}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				);
			},
		},
	];

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<div className="flex items-center gap-2">
					<Building2Icon className="size-5 text-muted-foreground" />
					<div>
						<CardTitle>{m.organizations_page_title()}</CardTitle>
						<CardDescription>{m.organizations_page_desc()}</CardDescription>
					</div>
				</div>
				<CreateButton
					isSingleMode={isSingleMode}
					onClick={() => setCreateOpen(true)}
				/>
			</CardHeader>
			<CardContent>
				<DataTable
					columns={columns}
					data={rows}
					loading={isPending}
					rowKey={(row) => row.id}
				/>
			</CardContent>

			<CreateOrgDrawer
				open={createOpen}
				onOpenChange={setCreateOpen}
				onCreated={invalidate}
			/>

			<ConfirmDialog
				open={dissolveTarget !== null}
				onOpenChange={(open) => {
					if (!open) setDissolveTarget(null);
				}}
				title={m.organizations_dissolve_title()}
				description={
					dissolveTarget ? (
						<>
							{m.organizations_dissolve_desc_prefix()}{" "}
							<b>{dissolveTarget.name}</b>
							{m.organizations_dissolve_desc_slug({
								slug: dissolveTarget.slug ?? "—",
							})}
							{m.organizations_dissolve_desc_suffix()}
						</>
					) : null
				}
				confirmText={m.organizations_dissolve_confirm()}
				confirming={dissolveMutation.isPending}
				requireTypedConfirm={dissolveTarget?.slug ?? undefined}
				onConfirm={() => {
					if (dissolveTarget) dissolveMutation.mutate(dissolveTarget.id);
				}}
			/>
		</Card>
	);
}

function CreateButton({
	isSingleMode,
	onClick,
}: {
	isSingleMode: boolean;
	onClick: () => void;
}) {
	if (isSingleMode) {
		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<span>
							<Button size="sm" disabled>
								<PlusIcon className="size-4" />
								{m.organizations_create_button()}
							</Button>
						</span>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{m.organizations_create_disabled_tooltip()}
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}
	return (
		<Button size="sm" onClick={onClick}>
			<PlusIcon className="size-4" />
			{m.organizations_create_button()}
		</Button>
	);
}

interface CreateForm {
	name: string;
	slug: string;
	plan: string;
	industry: string;
	billingEmail: string;
}

const INITIAL_FORM: CreateForm = {
	name: "",
	slug: "",
	plan: "free",
	industry: "",
	billingEmail: "",
};

function CreateOrgDrawer({
	open,
	onOpenChange,
	onCreated,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: () => void;
}) {
	const [form, setForm] = useState<CreateForm>(INITIAL_FORM);
	const [submitting, setSubmitting] = useState(false);

	async function handleSubmit() {
		if (!form.name || !form.slug) {
			toast.error(m.organizations_create_validate());
			return;
		}
		setSubmitting(true);
		try {
			await orpc.organizationsAdmin.create.call({
				name: form.name,
				slug: form.slug,
				plan: form.plan || undefined,
				industry: form.industry || undefined,
				billingEmail: form.billingEmail || undefined,
			});
			toast.success(m.organizations_created_toast());
			onOpenChange(false);
			setForm(INITIAL_FORM);
			onCreated();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : m.organizations_create_failed(),
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<FormDrawer
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) setForm(INITIAL_FORM);
			}}
			title={m.organizations_create_drawer_title()}
			submitText={m.organizations_create_submit()}
			submitting={submitting}
			onSubmit={handleSubmit}
		>
			<div className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="org-name">{m.organizations_field_org_name()}</Label>
					<Input
						id="org-name"
						value={form.name}
						onChange={(e) => setForm({ ...form, name: e.target.value })}
						placeholder={m.organizations_field_org_name_placeholder()}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="org-slug">slug</Label>
					<Input
						id="org-slug"
						value={form.slug}
						onChange={(e) => setForm({ ...form, slug: e.target.value })}
						placeholder="my-org"
					/>
					<p className="text-xs text-muted-foreground">
						{m.organizations_field_slug_hint()}
					</p>
				</div>
				<div className="space-y-2">
					<Label htmlFor="org-plan">{m.organizations_col_plan()}</Label>
					<Input
						id="org-plan"
						value={form.plan}
						onChange={(e) => setForm({ ...form, plan: e.target.value })}
						placeholder={m.organizations_field_plan_placeholder()}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="org-industry">
						{m.organizations_field_industry_optional()}
					</Label>
					<Input
						id="org-industry"
						value={form.industry}
						onChange={(e) => setForm({ ...form, industry: e.target.value })}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="org-billing-email">
						{m.organizations_field_billing_email_optional()}
					</Label>
					<Input
						id="org-billing-email"
						type="email"
						value={form.billingEmail}
						onChange={(e) => setForm({ ...form, billingEmail: e.target.value })}
					/>
				</div>
			</div>
		</FormDrawer>
	);
}
