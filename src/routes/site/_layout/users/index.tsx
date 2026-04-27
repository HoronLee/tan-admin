import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontalIcon, UserPlusIcon } from "lucide-react";
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
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { authClient } from "#/lib/auth/client";
import { requireSiteAdmin } from "#/lib/auth/guards";
import * as m from "#/paraglide/messages";
import type { AdminRole, AdminUser } from "./-components/_shared";
import { AddToOrganizationDrawer } from "./-components/add-to-organization-drawer";
import { BanUserDrawer } from "./-components/ban-user-drawer";
import { ChangeRoleDrawer } from "./-components/change-role-drawer";
import { CreateUserDrawer } from "./-components/create-user-drawer";
import { EditUserDrawer } from "./-components/edit-user-drawer";
import { ResetPasswordDrawer } from "./-components/reset-password-drawer";
import { UserSessionsDialog } from "./-components/user-sessions-dialog";

export const Route = createFileRoute("/site/_layout/users/")({
	beforeLoad: async () => {
		await requireSiteAdmin();
	},
	component: UsersPage,
});

const USERS_KEY = ["admin", "users"] as const;

function UsersPage() {
	const queryClient = useQueryClient();
	const { data, isPending } = useQuery({
		queryKey: USERS_KEY,
		queryFn: async () => {
			const { data, error } = await authClient.admin.listUsers({
				query: { limit: 100 },
			});
			if (error) throw new Error(error.message);
			return data;
		},
	});

	const users = (data?.users ?? []) as unknown as AdminUser[];

	const [createOpen, setCreateOpen] = useState(false);
	const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);
	const [banTarget, setBanTarget] = useState<AdminUser | null>(null);
	const [removeTarget, setRemoveTarget] = useState<AdminUser | null>(null);
	const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
	const [passwordTarget, setPasswordTarget] = useState<AdminUser | null>(null);
	const [sessionsTarget, setSessionsTarget] = useState<AdminUser | null>(null);
	const [addToOrgTarget, setAddToOrgTarget] = useState<AdminUser | null>(null);

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: USERS_KEY });

	const roleMutation = useMutation({
		mutationFn: async ({
			userId,
			role,
		}: {
			userId: string;
			role: AdminRole;
		}) => {
			const { error } = await authClient.admin.setRole({ userId, role });
			if (error) throw new Error(error.message);
		},
		onSuccess: () => {
			toast.success("Role updated");
			invalidate();
			setRoleTarget(null);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const banMutation = useMutation({
		mutationFn: async ({
			userId,
			reason,
		}: {
			userId: string;
			reason: string;
		}) => {
			const { error } = await authClient.admin.banUser({
				userId,
				banReason: reason || undefined,
			});
			if (error) throw new Error(error.message);
		},
		onSuccess: () => {
			toast.success("User banned");
			invalidate();
			setBanTarget(null);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const unbanMutation = useMutation({
		mutationFn: async (userId: string) => {
			const { error } = await authClient.admin.unbanUser({ userId });
			if (error) throw new Error(error.message);
		},
		onSuccess: () => {
			toast.success("User unbanned");
			invalidate();
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const impersonateMutation = useMutation({
		mutationFn: async (userId: string) => {
			const { error } = await authClient.admin.impersonateUser({ userId });
			if (error) throw new Error(error.message);
		},
		onSuccess: () => {
			toast.success("Impersonation started");
			window.location.href = "/dashboard";
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const removeMutation = useMutation({
		mutationFn: async (userId: string) => {
			const { error } = await authClient.admin.removeUser({ userId });
			if (error) throw new Error(error.message);
		},
		onSuccess: () => {
			toast.success("User removed");
			invalidate();
			setRemoveTarget(null);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const columns: ColumnDef<AdminUser>[] = [
		{
			id: "user",
			header: "User",
			cell: ({ row }) => (
				<div className="flex flex-col">
					<span className="font-medium">{row.original.name}</span>
					<span className="text-xs text-muted-foreground">
						{row.original.email}
					</span>
				</div>
			),
		},
		{
			accessorKey: "role",
			header: "Role",
			cell: ({ row }) => (
				<Badge variant="outline">{row.original.role ?? "user"}</Badge>
			),
		},
		{
			accessorKey: "banned",
			header: "Status",
			cell: ({ row }) =>
				row.original.banned ? (
					<Badge variant="destructive">Banned</Badge>
				) : (
					<Badge variant="outline">Active</Badge>
				),
		},
		{
			accessorKey: "createdAt",
			header: "Created",
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
				const u = row.original;
				return (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" className="size-8">
								<MoreHorizontalIcon className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onSelect={() => setEditTarget(u)}>
								{m.site_users_action_edit()}
							</DropdownMenuItem>
							<DropdownMenuItem
								onSelect={() => setRoleTarget(u)}
								disabled={roleMutation.isPending}
							>
								Change role
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => setPasswordTarget(u)}>
								{m.site_users_action_reset_password()}
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => setSessionsTarget(u)}>
								{m.site_users_action_sessions()}
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => setAddToOrgTarget(u)}>
								{m.site_users_action_add_to_org()}
							</DropdownMenuItem>
							<DropdownMenuItem
								onSelect={() => impersonateMutation.mutate(u.id)}
								disabled={impersonateMutation.isPending}
							>
								Impersonate
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							{u.banned ? (
								<DropdownMenuItem
									onSelect={() => unbanMutation.mutate(u.id)}
									disabled={unbanMutation.isPending}
								>
									Unban
								</DropdownMenuItem>
							) : (
								<DropdownMenuItem
									variant="destructive"
									onSelect={() => setBanTarget(u)}
								>
									Ban
								</DropdownMenuItem>
							)}
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setRemoveTarget(u)}
							>
								Delete
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
					<CardTitle>Users</CardTitle>
					<CardDescription>
						Site-wide admin view (better-auth admin plugin).
					</CardDescription>
				</div>
				<Button size="sm" onClick={() => setCreateOpen(true)}>
					<UserPlusIcon className="size-4" />
					Create user
				</Button>
			</CardHeader>
			<CardContent>
				<DataTable
					columns={columns}
					data={users}
					loading={isPending}
					rowKey={(row) => row.id}
				/>
			</CardContent>

			<CreateUserDrawer
				open={createOpen}
				onOpenChange={setCreateOpen}
				onCreated={invalidate}
			/>

			{roleTarget && (
				<ChangeRoleDrawer
					user={roleTarget}
					onOpenChange={(open) => {
						if (!open) setRoleTarget(null);
					}}
					onSubmit={(role) =>
						roleMutation.mutate({ userId: roleTarget.id, role })
					}
					submitting={roleMutation.isPending}
				/>
			)}

			{banTarget && (
				<BanUserDrawer
					user={banTarget}
					onOpenChange={(open) => {
						if (!open) setBanTarget(null);
					}}
					onSubmit={(reason) =>
						banMutation.mutate({ userId: banTarget.id, reason })
					}
					submitting={banMutation.isPending}
				/>
			)}

			{editTarget && (
				<EditUserDrawer
					user={editTarget}
					onOpenChange={(open) => {
						if (!open) setEditTarget(null);
					}}
					onSuccess={() => {
						setEditTarget(null);
						invalidate();
					}}
				/>
			)}

			{passwordTarget && (
				<ResetPasswordDrawer
					user={passwordTarget}
					onOpenChange={(open) => {
						if (!open) setPasswordTarget(null);
					}}
				/>
			)}

			{sessionsTarget && (
				<UserSessionsDialog
					user={sessionsTarget}
					onOpenChange={(open) => {
						if (!open) setSessionsTarget(null);
					}}
				/>
			)}

			{addToOrgTarget && (
				<AddToOrganizationDrawer
					user={addToOrgTarget}
					onOpenChange={(open) => {
						if (!open) setAddToOrgTarget(null);
					}}
				/>
			)}

			<ConfirmDialog
				open={removeTarget !== null}
				onOpenChange={(open) => {
					if (!open) setRemoveTarget(null);
				}}
				title="Delete user"
				description={
					removeTarget ? (
						<>
							Permanently delete <b>{removeTarget.name}</b> (
							{removeTarget.email})? This cannot be undone.
						</>
					) : null
				}
				confirmText="Delete"
				confirming={removeMutation.isPending}
				requireTypedConfirm={removeTarget?.email}
				onConfirm={() => {
					if (removeTarget) removeMutation.mutate(removeTarget.id);
				}}
			/>
		</Card>
	);
}
