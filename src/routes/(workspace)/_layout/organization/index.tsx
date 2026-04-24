import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontalIcon, UserPlusIcon } from "lucide-react";
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { authClient } from "#/lib/auth-client";
import { translateAuthError } from "#/lib/auth-errors";
import * as m from "#/paraglide/messages";

export const Route = createFileRoute("/(workspace)/_layout/organization/")({
	component: OrganizationPage,
});

type MemberRole = "owner" | "admin" | "member";
const ROLE_OPTIONS: MemberRole[] = ["owner", "admin", "member"];

interface Member {
	id: string;
	role: string;
	createdAt: Date | string;
	user: { id: string; name: string; email: string; image?: string | null };
}

interface Invitation {
	id: string;
	email: string;
	role: string | null;
	status: string;
	expiresAt: Date | string;
}

function OrganizationPage() {
	const { data: activeOrg, isPending: orgPending } =
		authClient.useActiveOrganization();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id;

	if (orgPending) {
		return (
			<div className="text-sm text-muted-foreground">{m.common_loading()}</div>
		);
	}

	if (!activeOrg) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>{m.organization_page_no_active_title()}</CardTitle>
					<CardDescription>
						{m.organization_page_no_active_desc()}
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	const orgType = (activeOrg as { type?: string }).type;
	const isPersonal = orgType === "personal";

	return (
		<div className="space-y-6">
			<OrgInfoSection
				orgId={activeOrg.id}
				name={activeOrg.name}
				slug={activeOrg.slug}
			/>
			<MembersSection
				orgId={activeOrg.id}
				currentUserId={currentUserId}
				canInvite={!isPersonal}
			/>
			{!isPersonal && <PendingInvitationsSection orgId={activeOrg.id} />}
			{!isPersonal && <LeaveOrganizationSection orgId={activeOrg.id} />}
		</div>
	);
}

function LeaveOrganizationSection({ orgId }: { orgId: string }) {
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [leaving, setLeaving] = useState(false);

	async function handleLeave() {
		setLeaving(true);
		const { error } = await authClient.organization.leave({
			organizationId: orgId,
		});
		setLeaving(false);
		if (error) {
			toast.error(translateAuthError(error));
			return;
		}
		toast.success(m.organization_page_leave_success_toast());
		setConfirmOpen(false);
		// Hard-navigate so BA session picks a new activeOrganizationId via
		// session.create.before on the next request. /dashboard route guard
		// will redirect to /onboarding if no other org remains.
		window.location.href = "/dashboard";
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>{m.organization_page_leave_section_title()}</CardTitle>
				<CardDescription>
					{m.organization_page_leave_section_desc()}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button
					variant="destructive"
					size="sm"
					onClick={() => setConfirmOpen(true)}
				>
					{m.organization_page_leave_button()}
				</Button>
			</CardContent>
			<ConfirmDialog
				open={confirmOpen}
				onOpenChange={(open) => {
					if (!open) setConfirmOpen(false);
				}}
				title={m.organization_page_leave_confirm_title()}
				description={m.organization_page_leave_confirm_desc()}
				confirmText={m.organization_page_leave_confirm_button()}
				variant="destructive"
				confirming={leaving}
				onConfirm={handleLeave}
			/>
		</Card>
	);
}

function OrgInfoSection({
	orgId,
	name,
	slug,
}: {
	orgId: string;
	name: string;
	slug: string;
}) {
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [form, setForm] = useState({ name, slug });
	const [submitting, setSubmitting] = useState(false);

	async function handleSubmit() {
		setSubmitting(true);
		const { error } = await authClient.organization.update({
			organizationId: orgId,
			data: { name: form.name, slug: form.slug },
		});
		setSubmitting(false);
		if (error) {
			toast.error(translateAuthError(error));
			return;
		}
		toast.success(m.organization_page_updated_toast());
		setDrawerOpen(false);
	}

	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between gap-4">
				<div>
					<CardTitle>{name}</CardTitle>
					<CardDescription>slug: {slug}</CardDescription>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						setForm({ name, slug });
						setDrawerOpen(true);
					}}
				>
					{m.organization_page_edit_button()}
				</Button>
			</CardHeader>
			<FormDrawer
				open={drawerOpen}
				onOpenChange={setDrawerOpen}
				title={m.organization_page_edit_title()}
				submitText={m.common_save()}
				submitting={submitting}
				onSubmit={handleSubmit}
			>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="org-name">{m.organization_page_name()}</Label>
						<Input
							id="org-name"
							value={form.name}
							onChange={(e) => setForm({ ...form, name: e.target.value })}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="org-slug">{m.organization_page_slug()}</Label>
						<Input
							id="org-slug"
							value={form.slug}
							onChange={(e) => setForm({ ...form, slug: e.target.value })}
						/>
					</div>
				</div>
			</FormDrawer>
		</Card>
	);
}

function MembersSection({
	orgId,
	currentUserId,
	canInvite,
}: {
	orgId: string;
	currentUserId: string | undefined;
	canInvite: boolean;
}) {
	const queryClient = useQueryClient();
	const { data, isPending } = useQuery({
		queryKey: ["organization", "members", orgId],
		queryFn: async () => {
			const { data, error } = await authClient.organization.listMembers({
				query: { organizationId: orgId },
			});
			if (error) throw new Error(error.message);
			return data;
		},
	});

	const members = (data?.members ?? []) as unknown as Member[];
	const isCurrentUserOwner = members.some(
		(m) => m.user.id === currentUserId && m.role === "owner",
	);

	const [inviteOpen, setInviteOpen] = useState(false);
	const [inviteForm, setInviteForm] = useState<{
		email: string;
		role: MemberRole;
	}>({ email: "", role: "member" });
	const [inviting, setInviting] = useState(false);

	const [roleDialog, setRoleDialog] = useState<{
		member: Member;
		role: MemberRole;
	} | null>(null);
	const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
	const [transferTarget, setTransferTarget] = useState<Member | null>(null);
	const [transferring, setTransferring] = useState(false);

	const removeMutation = useMutation({
		mutationFn: async (memberId: string) => {
			const { error } = await authClient.organization.removeMember({
				memberIdOrEmail: memberId,
				organizationId: orgId,
			});
			if (error) throw new Error(error.message);
		},
		onSuccess: () => {
			toast.success(m.organization_page_removed_toast());
			queryClient.invalidateQueries({
				queryKey: ["organization", "members", orgId],
			});
			setRemoveTarget(null);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const roleMutation = useMutation({
		mutationFn: async ({
			memberId,
			role,
		}: {
			memberId: string;
			role: MemberRole;
		}) => {
			const { error } = await authClient.organization.updateMemberRole({
				memberId,
				role,
				organizationId: orgId,
			});
			if (error) throw new Error(error.message);
		},
		onSuccess: () => {
			toast.success(m.organization_page_role_updated_toast());
			queryClient.invalidateQueries({
				queryKey: ["organization", "members", orgId],
			});
			setRoleDialog(null);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	async function handleTransferOwnership() {
		if (!transferTarget) return;
		setTransferring(true);
		const { error } = await authClient.organization.inviteMember({
			email: transferTarget.user.email,
			role: "owner",
			organizationId: orgId,
		});
		setTransferring(false);
		if (error) {
			toast.error(translateAuthError(error));
			return;
		}
		toast.success(m.organization_page_transfer_sent());
		setTransferTarget(null);
		queryClient.invalidateQueries({
			queryKey: ["organization", "invitations", orgId],
		});
	}

	async function handleInvite() {
		if (!inviteForm.email) return;
		setInviting(true);
		const { error } = await authClient.organization.inviteMember({
			email: inviteForm.email,
			role: inviteForm.role,
			organizationId: orgId,
		});
		setInviting(false);
		if (error) {
			toast.error(translateAuthError(error));
			return;
		}
		toast.success(m.organization_page_invite_sent());
		setInviteOpen(false);
		setInviteForm({ email: "", role: "member" });
		queryClient.invalidateQueries({
			queryKey: ["organization", "invitations", orgId],
		});
	}

	const columns: ColumnDef<Member>[] = [
		{
			id: "user",
			header: m.organization_page_col_user(),
			cell: ({ row }) => (
				<div className="flex flex-col">
					<span className="font-medium">{row.original.user.name}</span>
					<span className="text-xs text-muted-foreground">
						{row.original.user.email}
					</span>
				</div>
			),
		},
		{
			accessorKey: "role",
			header: m.organization_page_col_role(),
			cell: ({ row }) => <Badge variant="outline">{row.original.role}</Badge>,
		},
		{
			accessorKey: "createdAt",
			header: m.organization_page_col_joined(),
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground">
					{new Date(row.original.createdAt).toLocaleDateString()}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => {
				const canTransfer =
					isCurrentUserOwner &&
					row.original.user.id !== currentUserId &&
					row.original.role !== "owner";
				return (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" className="size-8">
								<MoreHorizontalIcon className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onSelect={() =>
									setRoleDialog({
										member: row.original,
										role: row.original.role as MemberRole,
									})
								}
							>
								{m.organization_page_action_change_role()}
							</DropdownMenuItem>
							{canTransfer && (
								<DropdownMenuItem
									onSelect={() => setTransferTarget(row.original)}
								>
									{m.organization_page_action_transfer()}
								</DropdownMenuItem>
							)}
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setRemoveTarget(row.original)}
							>
								{m.organization_page_action_remove()}
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
				<div>
					<CardTitle>{m.organization_page_members_title()}</CardTitle>
					<CardDescription>
						{m.organization_page_members_desc()}
					</CardDescription>
				</div>
				{canInvite && (
					<Button size="sm" onClick={() => setInviteOpen(true)}>
						<UserPlusIcon className="size-4" />
						{m.organization_page_invite_member()}
					</Button>
				)}
			</CardHeader>
			<CardContent>
				<DataTable
					columns={columns}
					data={members}
					loading={isPending}
					rowKey={(row) => row.id}
				/>
			</CardContent>

			<FormDrawer
				open={inviteOpen}
				onOpenChange={setInviteOpen}
				title={m.organization_page_invite_title()}
				submitText={m.organization_page_invite_submit()}
				submitting={inviting}
				onSubmit={handleInvite}
			>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="invite-email">
							{m.organization_page_col_email()}
						</Label>
						<Input
							id="invite-email"
							type="email"
							value={inviteForm.email}
							onChange={(e) =>
								setInviteForm({ ...inviteForm, email: e.target.value })
							}
							placeholder="user@example.com"
						/>
					</div>
					<div className="space-y-2">
						<Label>{m.organization_page_col_role()}</Label>
						<Select
							value={inviteForm.role}
							onValueChange={(v) =>
								setInviteForm({ ...inviteForm, role: v as MemberRole })
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{ROLE_OPTIONS.map((r) => (
									<SelectItem key={r} value={r}>
										{r}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
			</FormDrawer>

			{roleDialog && (
				<FormDrawer
					open={true}
					onOpenChange={(open) => {
						if (!open) setRoleDialog(null);
					}}
					title={m.organization_page_change_role_title({
						name: roleDialog.member.user.name,
					})}
					submitText={m.common_save()}
					submitting={roleMutation.isPending}
					onSubmit={() =>
						roleMutation.mutate({
							memberId: roleDialog.member.id,
							role: roleDialog.role,
						})
					}
				>
					<div className="space-y-2">
						<Label>{m.organization_page_col_role()}</Label>
						<Select
							value={roleDialog.role}
							onValueChange={(v) =>
								setRoleDialog({ ...roleDialog, role: v as MemberRole })
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{ROLE_OPTIONS.map((r) => (
									<SelectItem key={r} value={r}>
										{r}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</FormDrawer>
			)}

			<ConfirmDialog
				open={removeTarget !== null}
				onOpenChange={(open) => {
					if (!open) setRemoveTarget(null);
				}}
				title={m.organization_page_remove_title()}
				description={
					removeTarget ? (
						<>
							{m.organization_page_remove_desc_prefix()}{" "}
							<span className="font-medium">{removeTarget.user.name}</span>{" "}
							{m.organization_page_remove_desc_suffix()}
						</>
					) : null
				}
				confirmText={m.organization_page_remove_confirm()}
				confirming={removeMutation.isPending}
				onConfirm={() => {
					if (removeTarget) removeMutation.mutate(removeTarget.id);
				}}
			/>

			<ConfirmDialog
				open={transferTarget !== null}
				onOpenChange={(open) => {
					if (!open) setTransferTarget(null);
				}}
				title={m.organization_page_transfer_title()}
				description={
					transferTarget ? (
						<>
							{m.organization_page_transfer_desc_prefix()}{" "}
							<span className="font-medium">{transferTarget.user.email}</span>
							{m.organization_page_transfer_desc_suffix()}
						</>
					) : null
				}
				confirmText={m.organization_page_transfer_confirm()}
				variant="destructive"
				confirming={transferring}
				onConfirm={handleTransferOwnership}
			/>
		</Card>
	);
}

function PendingInvitationsSection({ orgId }: { orgId: string }) {
	const queryClient = useQueryClient();
	const { data, isPending } = useQuery({
		queryKey: ["organization", "invitations", orgId],
		queryFn: async () => {
			const { data, error } = await authClient.organization.listInvitations({
				query: { organizationId: orgId },
			});
			if (error) throw new Error(error.message);
			return data;
		},
	});

	const invitations = (data ?? []) as unknown as Invitation[];
	const pending = invitations.filter((i) => i.status === "pending");

	const cancelMutation = useMutation({
		mutationFn: async (invitationId: string) => {
			const { error } = await authClient.organization.cancelInvitation({
				invitationId,
			});
			if (error) throw new Error(error.message);
		},
		onSuccess: () => {
			toast.success(m.organization_page_invitation_canceled());
			queryClient.invalidateQueries({
				queryKey: ["organization", "invitations", orgId],
			});
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const columns: ColumnDef<Invitation>[] = [
		{
			accessorKey: "email",
			header: m.organization_page_col_email(),
			cell: ({ row }) => {
				const isTransfer = row.original.role === "owner";
				return (
					<div className="flex flex-col gap-1">
						<span>{row.original.email}</span>
						{isTransfer && (
							<span className="text-xs text-muted-foreground">
								{m.organization_page_invitation_transfer_tag()}
							</span>
						)}
					</div>
				);
			},
		},
		{
			accessorKey: "role",
			header: m.organization_page_col_role(),
			cell: ({ row }) => {
				const isTransfer = row.original.role === "owner";
				return (
					<Badge variant={isTransfer ? "destructive" : "outline"}>
						{isTransfer
							? m.organization_page_invitation_transfer_badge()
							: (row.original.role ?? "—")}
					</Badge>
				);
			},
		},
		{
			accessorKey: "expiresAt",
			header: m.organization_page_col_expires(),
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground">
					{new Date(row.original.expiresAt).toLocaleString()}
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
					disabled={cancelMutation.isPending}
					onClick={() => cancelMutation.mutate(row.original.id)}
				>
					{m.common_cancel()}
				</Button>
			),
		},
	];

	return (
		<Card>
			<CardHeader>
				<CardTitle>{m.organization_page_invitations_title()}</CardTitle>
				<CardDescription>
					{m.organization_page_invitations_desc()}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<DataTable
					columns={columns}
					data={pending}
					loading={isPending}
					rowKey={(row) => row.id}
					emptyText={m.organization_page_invitations_empty()}
				/>
			</CardContent>
		</Card>
	);
}
