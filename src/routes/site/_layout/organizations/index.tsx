/**
 * /organizations — super-admin cross-tenant organization list (R10).
 *
 * Site-level admin only (admin plugin `user.role === "admin"`). The server
 * is the source of truth; this page only mirrors the gate to avoid a flash
 * of the management UI for non-admin users. `VITE_PRODUCT_MODE=private`
 * hides destructive actions (server also rejects, but the UI should match).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2Icon, MoreHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "#/components/confirm-dialog";
import { DataTable } from "#/components/data-table/data-table";
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
import { authClient } from "#/lib/auth/client";
import { requireSiteAdmin } from "#/lib/auth/guards";
import { env } from "#/lib/env";
import { orpc } from "#/orpc/client";
import * as m from "#/paraglide/messages";
import {
	organizationsAdminKey,
	organizationsAdminListQueryOptions,
} from "#/queries/organizations-admin";
import { AddOrganizationMemberDrawer } from "./-components/add-organization-member-drawer";
import { CreateOrganizationButton } from "./-components/create-organization-button";
import { CreateOrganizationDrawer } from "./-components/create-organization-drawer";

export const Route = createFileRoute("/site/_layout/organizations/")({
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
	const isPrivateMode = env.VITE_PRODUCT_MODE === "private";

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

	return <OrganizationsTable isPrivateMode={isPrivateMode} />;
}

function OrganizationsTable({ isPrivateMode }: { isPrivateMode: boolean }) {
	const queryClient = useQueryClient();
	const listQueryOptions = organizationsAdminListQueryOptions();
	const { data, isPending } = useQuery(listQueryOptions);
	const rows = (data ?? []) as OrganizationRow[];

	const [createOpen, setCreateOpen] = useState(false);
	const [dissolveTarget, setDissolveTarget] = useState<OrganizationRow | null>(
		null,
	);
	const [addMemberTarget, setAddMemberTarget] =
		useState<OrganizationRow | null>(null);

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: organizationsAdminKey() });

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
				// In private mode dissolve is forbidden; the default org
				// is always protected. Keep the menu visible but grey out the
				// dangerous action so the user sees it exists + why.
				const canDissolve = !isPrivateMode && !org.isDefault;
				return (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" className="size-8">
								<MoreHorizontalIcon className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onSelect={() => setAddMemberTarget(org)}>
								{m.organizations_action_add_member()}
							</DropdownMenuItem>
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
				<CreateOrganizationButton
					isPrivateMode={isPrivateMode}
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

			<CreateOrganizationDrawer
				open={createOpen}
				onOpenChange={setCreateOpen}
				onCreated={invalidate}
			/>

			{addMemberTarget && (
				<AddOrganizationMemberDrawer
					organization={addMemberTarget}
					onOpenChange={(open) => {
						if (!open) setAddMemberTarget(null);
					}}
					onSuccess={() => {
						setAddMemberTarget(null);
						invalidate();
					}}
				/>
			)}

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
