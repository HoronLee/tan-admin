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

export const Route = createFileRoute("/(admin)/_layout/organization/")({
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

	if (orgPending) {
		return <div className="text-sm text-muted-foreground">Loading...</div>;
	}

	if (!activeOrg) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>No active organization</CardTitle>
					<CardDescription>
						Use the organization switcher in the header to pick one.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<div className="space-y-6">
			<OrgInfoSection
				orgId={activeOrg.id}
				name={activeOrg.name}
				slug={activeOrg.slug}
			/>
			<MembersSection orgId={activeOrg.id} />
			<PendingInvitationsSection orgId={activeOrg.id} />
		</div>
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
			toast.error(error.message ?? "Update failed");
			return;
		}
		toast.success("Organization updated");
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
					Edit
				</Button>
			</CardHeader>
			<FormDrawer
				open={drawerOpen}
				onOpenChange={setDrawerOpen}
				title="Edit organization"
				submitText="Save"
				submitting={submitting}
				onSubmit={handleSubmit}
			>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="org-name">Name</Label>
						<Input
							id="org-name"
							value={form.name}
							onChange={(e) => setForm({ ...form, name: e.target.value })}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="org-slug">Slug</Label>
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

function MembersSection({ orgId }: { orgId: string }) {
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

	const removeMutation = useMutation({
		mutationFn: async (memberId: string) => {
			const { error } = await authClient.organization.removeMember({
				memberIdOrEmail: memberId,
				organizationId: orgId,
			});
			if (error) throw new Error(error.message);
		},
		onSuccess: () => {
			toast.success("Member removed");
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
			toast.success("Member role updated");
			queryClient.invalidateQueries({
				queryKey: ["organization", "members", orgId],
			});
			setRoleDialog(null);
		},
		onError: (err: Error) => toast.error(err.message),
	});

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
			toast.error(error.message ?? "Invite failed");
			return;
		}
		toast.success("Invitation sent");
		setInviteOpen(false);
		setInviteForm({ email: "", role: "member" });
		queryClient.invalidateQueries({
			queryKey: ["organization", "invitations", orgId],
		});
	}

	const columns: ColumnDef<Member>[] = [
		{
			id: "user",
			header: "User",
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
			header: "Role",
			cell: ({ row }) => <Badge variant="outline">{row.original.role}</Badge>,
		},
		{
			accessorKey: "createdAt",
			header: "Joined",
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground">
					{new Date(row.original.createdAt).toLocaleDateString()}
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
						<DropdownMenuItem
							onSelect={() =>
								setRoleDialog({
									member: row.original,
									role: row.original.role as MemberRole,
								})
							}
						>
							Change role
						</DropdownMenuItem>
						<DropdownMenuItem
							variant="destructive"
							onSelect={() => setRemoveTarget(row.original)}
						>
							Remove
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
					<CardTitle>Members</CardTitle>
					<CardDescription>
						Manage who can access this organization.
					</CardDescription>
				</div>
				<Button size="sm" onClick={() => setInviteOpen(true)}>
					<UserPlusIcon className="size-4" />
					Invite member
				</Button>
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
				title="Invite member"
				submitText="Send invitation"
				submitting={inviting}
				onSubmit={handleInvite}
			>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="invite-email">Email</Label>
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
						<Label>Role</Label>
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
					title={`Change role — ${roleDialog.member.user.name}`}
					submitText="Save"
					submitting={roleMutation.isPending}
					onSubmit={() =>
						roleMutation.mutate({
							memberId: roleDialog.member.id,
							role: roleDialog.role,
						})
					}
				>
					<div className="space-y-2">
						<Label>Role</Label>
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
				title="Remove member"
				description={
					removeTarget ? (
						<>
							Remove{" "}
							<span className="font-medium">{removeTarget.user.name}</span> from
							this organization?
						</>
					) : null
				}
				confirmText="Remove"
				confirming={removeMutation.isPending}
				onConfirm={() => {
					if (removeTarget) removeMutation.mutate(removeTarget.id);
				}}
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
			toast.success("Invitation canceled");
			queryClient.invalidateQueries({
				queryKey: ["organization", "invitations", orgId],
			});
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const columns: ColumnDef<Invitation>[] = [
		{ accessorKey: "email", header: "Email" },
		{
			accessorKey: "role",
			header: "Role",
			cell: ({ row }) => (
				<Badge variant="outline">{row.original.role ?? "—"}</Badge>
			),
		},
		{
			accessorKey: "expiresAt",
			header: "Expires",
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
					Cancel
				</Button>
			),
		},
	];

	return (
		<Card>
			<CardHeader>
				<CardTitle>Pending invitations</CardTitle>
				<CardDescription>
					Invitations sent but not yet accepted.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<DataTable
					columns={columns}
					data={pending}
					loading={isPending}
					rowKey={(row) => row.id}
					emptyText="No pending invitations"
				/>
			</CardContent>
		</Card>
	);
}
