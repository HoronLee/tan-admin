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
	DropdownMenuSeparator,
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
import { requireSiteAdmin } from "#/lib/admin-guards";
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/(admin)/_layout/users/")({
	beforeLoad: async () => {
		await requireSiteAdmin();
	},
	component: UsersPage,
});

type AdminRole = "admin" | "user";
const ADMIN_ROLES: AdminRole[] = ["admin", "user"];

interface AdminUser {
	id: string;
	name: string;
	email: string;
	image?: string | null;
	role?: string | null;
	banned?: boolean | null;
	banReason?: string | null;
	banExpires?: Date | string | null;
	createdAt: Date | string;
}

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
							<DropdownMenuItem
								onSelect={() => setRoleTarget(u)}
								disabled={roleMutation.isPending}
							>
								Change role
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

function CreateUserDrawer({
	open,
	onOpenChange,
	onCreated,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: () => void;
}) {
	const [form, setForm] = useState<{
		name: string;
		email: string;
		password: string;
		role: AdminRole;
	}>({ name: "", email: "", password: "", role: "user" });
	const [submitting, setSubmitting] = useState(false);

	async function handleSubmit() {
		if (!form.email || !form.password || !form.name) {
			toast.error("Name / email / password required");
			return;
		}
		setSubmitting(true);
		const { error } = await authClient.admin.createUser({
			name: form.name,
			email: form.email,
			password: form.password,
			role: form.role,
		});
		setSubmitting(false);
		if (error) {
			toast.error(error.message ?? "Create failed");
			return;
		}
		toast.success("User created");
		onOpenChange(false);
		setForm({ name: "", email: "", password: "", role: "user" });
		onCreated();
	}

	return (
		<FormDrawer
			open={open}
			onOpenChange={onOpenChange}
			title="Create user"
			submitText="Create"
			submitting={submitting}
			onSubmit={handleSubmit}
		>
			<div className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="new-name">Name</Label>
					<Input
						id="new-name"
						value={form.name}
						onChange={(e) => setForm({ ...form, name: e.target.value })}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="new-email">Email</Label>
					<Input
						id="new-email"
						type="email"
						value={form.email}
						onChange={(e) => setForm({ ...form, email: e.target.value })}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="new-password">Password</Label>
					<Input
						id="new-password"
						type="password"
						value={form.password}
						onChange={(e) => setForm({ ...form, password: e.target.value })}
						minLength={8}
					/>
				</div>
				<div className="space-y-2">
					<Label>Role</Label>
					<Select
						value={form.role}
						onValueChange={(v) => setForm({ ...form, role: v as AdminRole })}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{ADMIN_ROLES.map((r) => (
								<SelectItem key={r} value={r}>
									{r}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
		</FormDrawer>
	);
}

function ChangeRoleDrawer({
	user,
	onOpenChange,
	onSubmit,
	submitting,
}: {
	user: AdminUser;
	onOpenChange: (open: boolean) => void;
	onSubmit: (role: AdminRole) => void;
	submitting: boolean;
}) {
	const [role, setRole] = useState<AdminRole>(
		(user.role as AdminRole | undefined) ?? "user",
	);

	return (
		<FormDrawer
			open={true}
			onOpenChange={onOpenChange}
			title={`Change role — ${user.name}`}
			submitText="Save"
			submitting={submitting}
			onSubmit={() => onSubmit(role)}
		>
			<div className="space-y-2">
				<Label>Role</Label>
				<Select value={role} onValueChange={(v) => setRole(v as AdminRole)}>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{ADMIN_ROLES.map((r) => (
							<SelectItem key={r} value={r}>
								{r}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-xs text-muted-foreground">
					Site-wide role (admin plugin). Organization-level role is managed on
					the organization page.
				</p>
			</div>
		</FormDrawer>
	);
}

function BanUserDrawer({
	user,
	onOpenChange,
	onSubmit,
	submitting,
}: {
	user: AdminUser;
	onOpenChange: (open: boolean) => void;
	onSubmit: (reason: string) => void;
	submitting: boolean;
}) {
	const [reason, setReason] = useState("");

	return (
		<FormDrawer
			open={true}
			onOpenChange={onOpenChange}
			title={`Ban user — ${user.name}`}
			submitText="Ban"
			submitting={submitting}
			onSubmit={() => onSubmit(reason)}
		>
			<div className="space-y-2">
				<Label htmlFor="ban-reason">Reason (optional)</Label>
				<Input
					id="ban-reason"
					value={reason}
					onChange={(e) => setReason(e.target.value)}
					placeholder="Violation of terms"
				/>
			</div>
		</FormDrawer>
	);
}
