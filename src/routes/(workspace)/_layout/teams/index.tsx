import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontalIcon, PlusIcon, UserPlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "#/components/confirm-dialog";
import { DataTable } from "#/components/data-table/data-table";
import { FormDrawer } from "#/components/form-drawer";
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
import { authClient } from "#/lib/auth/client";
import { translateAuthError } from "#/lib/auth/errors";
import { planAllowsTeams } from "#/lib/auth/plan";
import * as m from "#/paraglide/messages";

export const Route = createFileRoute("/(workspace)/_layout/teams/")({
	component: TeamsPage,
});

interface Team {
	id: string;
	name: string;
	organizationId: string;
	createdAt: Date | string;
	updatedAt?: Date | string;
}

interface TeamMember {
	id: string;
	teamId: string;
	userId: string;
	createdAt: Date | string;
}

interface OrgMember {
	id: string;
	role: string;
	createdAt: Date | string;
	user: { id: string; name: string; email: string; image?: string | null };
}

function TeamsPage() {
	const { data: activeOrg } = authClient.useActiveOrganization();
	const plan = (activeOrg as { plan?: string | null } | null | undefined)?.plan;
	if (!planAllowsTeams(plan)) {
		return <TeamsDisabledCard />;
	}
	return <TeamsEnabledView />;
}

function TeamsDisabledCard() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{m.teams_disabled_title()}</CardTitle>
				<CardDescription>{m.teams_disabled_plan_hint()}</CardDescription>
			</CardHeader>
		</Card>
	);
}

function TeamsEnabledView() {
	const { data: activeOrg, isPending: orgPending } =
		authClient.useActiveOrganization();

	if (orgPending) {
		return (
			<div className="text-sm text-muted-foreground">{m.common_loading()}</div>
		);
	}

	if (!activeOrg) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>{m.teams_no_active_org_title()}</CardTitle>
					<CardDescription>{m.teams_no_active_org_desc()}</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return <TeamsSection orgId={activeOrg.id} />;
}

function TeamsSection({ orgId }: { orgId: string }) {
	const queryClient = useQueryClient();

	const { data, isPending } = useQuery({
		queryKey: ["organization", "teams", orgId],
		queryFn: async () => {
			const { data, error } = await authClient.organization.listTeams({
				query: { organizationId: orgId },
			});
			if (error) throw new Error(translateAuthError(error));
			return data;
		},
	});

	const teams = (data ?? []) as unknown as Team[];

	// --- Create ---
	const [createOpen, setCreateOpen] = useState(false);
	const [createForm, setCreateForm] = useState({ name: "" });
	const createMutation = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.organization.createTeam({
				name: createForm.name,
				organizationId: orgId,
			});
			if (error) throw new Error(translateAuthError(error));
		},
		onSuccess: () => {
			toast.success(m.teams_created_toast());
			queryClient.invalidateQueries({
				queryKey: ["organization", "teams", orgId],
			});
			setCreateOpen(false);
			setCreateForm({ name: "" });
		},
		onError: (err: Error) => toast.error(err.message),
	});

	// --- Rename ---
	const [renameTarget, setRenameTarget] = useState<Team | null>(null);
	const [renameName, setRenameName] = useState("");
	const renameMutation = useMutation({
		mutationFn: async () => {
			if (!renameTarget) return;
			const { error } = await authClient.organization.updateTeam({
				teamId: renameTarget.id,
				data: { name: renameName },
			});
			if (error) throw new Error(translateAuthError(error));
		},
		onSuccess: () => {
			toast.success(m.teams_updated_toast());
			queryClient.invalidateQueries({
				queryKey: ["organization", "teams", orgId],
			});
			setRenameTarget(null);
			setRenameName("");
		},
		onError: (err: Error) => toast.error(err.message),
	});

	// --- Delete ---
	const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
	const deleteMutation = useMutation({
		mutationFn: async (teamId: string) => {
			const { error } = await authClient.organization.removeTeam({
				teamId,
				organizationId: orgId,
			});
			if (error) throw new Error(translateAuthError(error));
		},
		onSuccess: () => {
			toast.success(m.teams_deleted_toast());
			queryClient.invalidateQueries({
				queryKey: ["organization", "teams", orgId],
			});
			setDeleteTarget(null);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	// --- Members drawer ---
	const [membersTarget, setMembersTarget] = useState<Team | null>(null);

	const columns: ColumnDef<Team>[] = [
		{
			accessorKey: "name",
			header: m.teams_col_name(),
			cell: ({ row }) => (
				<span className="font-medium">{row.original.name}</span>
			),
		},
		{
			accessorKey: "createdAt",
			header: m.teams_col_created_at(),
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground">
					{new Date(row.original.createdAt).toLocaleString()}
				</span>
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
						<DropdownMenuItem onSelect={() => setMembersTarget(row.original)}>
							{m.teams_action_manage_members()}
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() => {
								setRenameTarget(row.original);
								setRenameName(row.original.name);
							}}
						>
							{m.teams_action_rename()}
						</DropdownMenuItem>
						<DropdownMenuItem
							variant="destructive"
							onSelect={() => setDeleteTarget(row.original)}
						>
							{m.teams_action_delete()}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		},
	];

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<div>
					<CardTitle>{m.teams_page_title()}</CardTitle>
					<CardDescription>{m.teams_page_desc()}</CardDescription>
				</div>
				<Button size="sm" onClick={() => setCreateOpen(true)}>
					<PlusIcon className="size-4" />
					{m.teams_create_button()}
				</Button>
			</CardHeader>
			<CardContent>
				<DataTable
					columns={columns}
					data={teams}
					loading={isPending}
					rowKey={(row) => row.id}
					emptyText={m.teams_empty()}
				/>
			</CardContent>

			{/* Create */}
			<FormDrawer
				open={createOpen}
				onOpenChange={setCreateOpen}
				title={m.teams_create_title()}
				submitText={m.teams_create_submit()}
				submitting={createMutation.isPending}
				onSubmit={() => createMutation.mutate()}
			>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="team-name">{m.teams_field_team_name()}</Label>
						<Input
							id="team-name"
							value={createForm.name}
							onChange={(e) => setCreateForm({ name: e.target.value })}
							placeholder={m.teams_field_team_name_placeholder()}
						/>
					</div>
				</div>
			</FormDrawer>

			{/* Rename */}
			{renameTarget && (
				<FormDrawer
					open={true}
					onOpenChange={(open) => {
						if (!open) {
							setRenameTarget(null);
							setRenameName("");
						}
					}}
					title={m.teams_rename_title({ name: renameTarget.name })}
					submitText={m.common_save()}
					submitting={renameMutation.isPending}
					onSubmit={() => renameMutation.mutate()}
				>
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="team-rename">{m.teams_field_team_name()}</Label>
							<Input
								id="team-rename"
								value={renameName}
								onChange={(e) => setRenameName(e.target.value)}
							/>
						</div>
					</div>
				</FormDrawer>
			)}

			{/* Delete */}
			<ConfirmDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null);
				}}
				title={m.teams_delete_title()}
				description={
					deleteTarget ? (
						<>
							{m.teams_delete_desc_prefix()}{" "}
							<span className="font-medium">{deleteTarget.name}</span>
							{m.teams_delete_desc_suffix()}
						</>
					) : null
				}
				confirmText={m.teams_delete_confirm()}
				confirming={deleteMutation.isPending}
				onConfirm={() => {
					if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
				}}
			/>

			{/* Members */}
			{membersTarget && (
				<TeamMembersDrawer
					orgId={orgId}
					team={membersTarget}
					onOpenChange={(open) => {
						if (!open) setMembersTarget(null);
					}}
				/>
			)}
		</Card>
	);
}

function TeamMembersDrawer({
	orgId,
	team,
	onOpenChange,
}: {
	orgId: string;
	team: Team;
	onOpenChange: (open: boolean) => void;
}) {
	const queryClient = useQueryClient();

	const { data: teamMembersData, isPending: membersPending } = useQuery({
		queryKey: ["organization", "teams", orgId, team.id, "members"],
		queryFn: async () => {
			const { data, error } = await authClient.organization.listTeamMembers({
				query: { teamId: team.id },
			});
			if (error) throw new Error(translateAuthError(error));
			return data;
		},
	});

	const { data: orgMembersData } = useQuery({
		queryKey: ["organization", "members", orgId],
		queryFn: async () => {
			const { data, error } = await authClient.organization.listMembers({
				query: { organizationId: orgId },
			});
			if (error) throw new Error(translateAuthError(error));
			return data;
		},
	});

	const teamMembers = (teamMembersData ?? []) as unknown as TeamMember[];
	const orgMembers = ((orgMembersData?.members ?? []) as unknown as OrgMember[])
		// Enrich team-member rows with user info via the org-member list.
		.reduce(
			(acc, m) => {
				acc[m.user.id] = m;
				return acc;
			},
			{} as Record<string, OrgMember>,
		);

	const teamMemberUserIds = new Set(teamMembers.map((m) => m.userId));
	const addableOrgMembers = Object.values(orgMembers).filter(
		(m) => !teamMemberUserIds.has(m.user.id),
	);

	const [addOpen, setAddOpen] = useState(false);
	const [selectedUserId, setSelectedUserId] = useState("");

	const invalidateMembers = () => {
		queryClient.invalidateQueries({
			queryKey: ["organization", "teams", orgId, team.id, "members"],
		});
	};

	const addMutation = useMutation({
		mutationFn: async (userId: string) => {
			const { error } = await authClient.organization.addTeamMember({
				teamId: team.id,
				userId,
				organizationId: orgId,
			});
			if (error) throw new Error(translateAuthError(error));
		},
		onSuccess: () => {
			toast.success(m.teams_members_added_toast());
			invalidateMembers();
			setAddOpen(false);
			setSelectedUserId("");
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const removeMutation = useMutation({
		mutationFn: async (userId: string) => {
			const { error } = await authClient.organization.removeTeamMember({
				teamId: team.id,
				userId,
				organizationId: orgId,
			});
			if (error) throw new Error(translateAuthError(error));
		},
		onSuccess: () => {
			toast.success(m.teams_members_removed_toast());
			invalidateMembers();
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const rows = teamMembers.map((tm) => ({
		tm,
		user: orgMembers[tm.userId]?.user,
	}));

	const columns: ColumnDef<(typeof rows)[number]>[] = [
		{
			id: "user",
			header: m.teams_members_col_member(),
			cell: ({ row }) => {
				const u = row.original.user;
				if (!u) {
					return (
						<span className="text-sm text-muted-foreground">
							{m.teams_members_user_left_org({
								userId: row.original.tm.userId,
							})}
						</span>
					);
				}
				return (
					<div className="flex flex-col">
						<span className="font-medium">{u.name}</span>
						<span className="text-xs text-muted-foreground">{u.email}</span>
					</div>
				);
			},
		},
		{
			accessorKey: "tm.createdAt",
			header: m.teams_members_col_joined(),
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground">
					{new Date(row.original.tm.createdAt).toLocaleString()}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<Button
					variant="ghost"
					size="sm"
					disabled={removeMutation.isPending}
					onClick={() => removeMutation.mutate(row.original.tm.userId)}
				>
					{m.common_remove()}
				</Button>
			),
		},
	];

	return (
		<>
			<FormDrawer
				open={true}
				onOpenChange={onOpenChange}
				title={m.teams_members_title({ name: team.name })}
				width="lg"
			>
				<div className="flex justify-end pb-3">
					<Button
						size="sm"
						onClick={() => setAddOpen(true)}
						disabled={addableOrgMembers.length === 0}
					>
						<UserPlusIcon className="size-4" />
						{m.teams_members_add()}
					</Button>
				</div>
				<DataTable
					columns={columns}
					data={rows}
					loading={membersPending}
					rowKey={(row) => row.tm.id}
					emptyText={m.teams_members_empty()}
				/>
			</FormDrawer>

			<FormDrawer
				open={addOpen}
				onOpenChange={(open) => {
					setAddOpen(open);
					if (!open) setSelectedUserId("");
				}}
				title={m.teams_members_add_title()}
				submitText={m.teams_members_add_submit()}
				submitting={addMutation.isPending}
				onSubmit={() => {
					if (selectedUserId) addMutation.mutate(selectedUserId);
				}}
			>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label>{m.teams_members_add_from_org()}</Label>
						<Select
							value={selectedUserId}
							onValueChange={(v) => setSelectedUserId(v)}
						>
							<SelectTrigger>
								<SelectValue placeholder={m.teams_members_add_placeholder()} />
							</SelectTrigger>
							<SelectContent>
								{addableOrgMembers.map((member) => (
									<SelectItem key={member.user.id} value={member.user.id}>
										{member.user.name}（{member.user.email}）
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{addableOrgMembers.length === 0 && (
							<p className="text-xs text-muted-foreground">
								{m.teams_members_add_none()}
							</p>
						)}
					</div>
				</div>
			</FormDrawer>
		</>
	);
}
