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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { authClient } from "#/lib/auth/client";
import { translateAuthError } from "#/lib/auth/errors";
import { requireSiteAdmin } from "#/lib/auth/guards";
import { orpc } from "#/orpc/client";
import * as m from "#/paraglide/messages";

export const Route = createFileRoute("/site/_layout/users/")({
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

// ---------------------------------------------------------------------------
// Edit user — thin wrapper around authClient.admin.updateUser (the server
// endpoint adminUpdateUser). Accepts an arbitrary `data` payload per BA
// schema; we only surface name/email/role here because that's what the
// listing currently shows. Other user additionalFields (status/nickname/
// avatar) are edited elsewhere.
// ---------------------------------------------------------------------------
function EditUserDrawer({
	user,
	onOpenChange,
	onSuccess,
}: {
	user: AdminUser;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}) {
	const [form, setForm] = useState<{
		name: string;
		email: string;
		role: AdminRole;
	}>({
		name: user.name,
		email: user.email,
		role: (user.role as AdminRole | undefined) ?? "user",
	});
	const [submitting, setSubmitting] = useState(false);

	async function handleSubmit() {
		// Diff-only payload — BA rejects empty data{} with NO_DATA_TO_UPDATE,
		// and sending unchanged fields still triggers verification-email flows
		// on email change. Sending only the deltas keeps side-effects scoped.
		const patch: Record<string, string> = {};
		if (form.name !== user.name) patch.name = form.name;
		if (form.email !== user.email) patch.email = form.email;
		const currentRole = user.role ?? "user";
		if (form.role !== currentRole) patch.role = form.role;

		if (Object.keys(patch).length === 0) {
			toast.info(m.site_users_edit_no_change());
			return;
		}

		setSubmitting(true);
		const { error } = await authClient.admin.updateUser({
			userId: user.id,
			data: patch,
		});
		setSubmitting(false);
		if (error) {
			toast.error(translateAuthError(error));
			return;
		}
		toast.success(m.site_users_edit_success());
		onSuccess();
	}

	return (
		<FormDrawer
			open={true}
			onOpenChange={onOpenChange}
			title={m.site_users_edit_title({ name: user.name })}
			submitText={m.site_users_edit_submit()}
			submitting={submitting}
			onSubmit={handleSubmit}
		>
			<div className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="edit-name">{m.site_users_edit_field_name()}</Label>
					<Input
						id="edit-name"
						value={form.name}
						onChange={(e) => setForm({ ...form, name: e.target.value })}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="edit-email">{m.site_users_edit_field_email()}</Label>
					<Input
						id="edit-email"
						type="email"
						value={form.email}
						onChange={(e) => setForm({ ...form, email: e.target.value })}
					/>
				</div>
				<div className="space-y-2">
					<Label>{m.site_users_edit_field_role()}</Label>
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

// ---------------------------------------------------------------------------
// Reset password — delegates to authClient.admin.setUserPassword. The new
// password is not emailed; operators are expected to communicate it through
// an out-of-band channel (phone/IM) or instruct the user to run a normal
// password-reset flow afterwards.
// ---------------------------------------------------------------------------
function ResetPasswordDrawer({
	user,
	onOpenChange,
}: {
	user: AdminUser;
	onOpenChange: (open: boolean) => void;
}) {
	const [newPassword, setNewPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);

	async function handleSubmit() {
		if (newPassword.length < 8) {
			toast.error(m.site_users_password_reset_error_length());
			return;
		}
		setSubmitting(true);
		const { error } = await authClient.admin.setUserPassword({
			userId: user.id,
			newPassword,
		});
		setSubmitting(false);
		if (error) {
			toast.error(translateAuthError(error));
			return;
		}
		toast.success(m.site_users_password_reset_success());
		onOpenChange(false);
	}

	return (
		<FormDrawer
			open={true}
			onOpenChange={onOpenChange}
			title={m.site_users_password_reset_title({ name: user.name })}
			submitText={m.site_users_password_reset_submit()}
			submitting={submitting}
			onSubmit={handleSubmit}
		>
			<div className="space-y-2">
				<Label htmlFor="new-password-input">
					{m.site_users_password_reset_label()}
				</Label>
				<Input
					id="new-password-input"
					type="password"
					value={newPassword}
					onChange={(e) => setNewPassword(e.target.value)}
					placeholder={m.site_users_password_reset_placeholder()}
					minLength={8}
				/>
				<p className="text-xs text-muted-foreground">
					{m.site_users_password_reset_hint()}
				</p>
			</div>
		</FormDrawer>
	);
}

// ---------------------------------------------------------------------------
// User sessions dialog — lists active sessions via
// authClient.admin.listUserSessions, and offers per-row + bulk revoke via
// revokeUserSession / revokeUserSessions.
//
// Kept as a plain Dialog (no DataTable) because we only need ~5 columns and
// simple actions; DataTable's pagination/filtering is overkill for
// per-user session counts.
// ---------------------------------------------------------------------------
interface AdminSession {
	id: string;
	token: string;
	ipAddress?: string | null;
	userAgent?: string | null;
	createdAt: Date | string;
	expiresAt: Date | string;
}

function UserSessionsDialog({
	user,
	onOpenChange,
}: {
	user: AdminUser;
	onOpenChange: (open: boolean) => void;
}) {
	const sessionsKey = ["admin", "users", user.id, "sessions"] as const;
	const queryClient = useQueryClient();
	const [confirmAllOpen, setConfirmAllOpen] = useState(false);

	const { data, isPending } = useQuery({
		queryKey: sessionsKey,
		queryFn: async () => {
			const { data, error } = await authClient.admin.listUserSessions({
				userId: user.id,
			});
			if (error) throw new Error(error.message);
			return data;
		},
	});

	const sessions = (data?.sessions ?? []) as unknown as AdminSession[];

	const revokeOne = useMutation({
		mutationFn: async (sessionToken: string) => {
			const { error } = await authClient.admin.revokeUserSession({
				sessionToken,
			});
			if (error) throw new Error(error.message);
		},
		onSuccess: () => {
			toast.success(m.site_users_sessions_revoke_one_success());
			queryClient.invalidateQueries({ queryKey: sessionsKey });
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const revokeAll = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.admin.revokeUserSessions({
				userId: user.id,
			});
			if (error) throw new Error(error.message);
		},
		onSuccess: () => {
			toast.success(m.site_users_sessions_revoke_all_success());
			queryClient.invalidateQueries({ queryKey: sessionsKey });
			setConfirmAllOpen(false);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	return (
		<>
			<Dialog open={true} onOpenChange={onOpenChange}>
				<DialogContent className="sm:max-w-3xl">
					<DialogHeader>
						<DialogTitle>
							{m.site_users_sessions_title({ name: user.name })}
						</DialogTitle>
						<DialogDescription>
							{m.site_users_sessions_desc()}
						</DialogDescription>
					</DialogHeader>

					<div className="max-h-[60vh] overflow-y-auto">
						{isPending ? (
							<p className="py-8 text-center text-sm text-muted-foreground">
								{m.common_loading()}
							</p>
						) : sessions.length === 0 ? (
							<p className="py-8 text-center text-sm text-muted-foreground">
								{m.site_users_sessions_empty()}
							</p>
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>{m.site_users_sessions_col_ip()}</TableHead>
										<TableHead>{m.site_users_sessions_col_ua()}</TableHead>
										<TableHead>
											{m.site_users_sessions_col_created_at()}
										</TableHead>
										<TableHead>
											{m.site_users_sessions_col_expires_at()}
										</TableHead>
										<TableHead className="text-right">
											{m.site_users_sessions_col_actions()}
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{sessions.map((s) => (
										<TableRow key={s.id}>
											<TableCell className="font-mono text-xs">
												{s.ipAddress ?? "—"}
											</TableCell>
											<TableCell
												className="max-w-[260px] truncate text-xs text-muted-foreground"
												title={s.userAgent ?? undefined}
											>
												{s.userAgent ?? "—"}
											</TableCell>
											<TableCell className="text-xs">
												{formatDateTime(s.createdAt)}
											</TableCell>
											<TableCell className="text-xs">
												{formatDateTime(s.expiresAt)}
											</TableCell>
											<TableCell className="text-right">
												<Button
													variant="ghost"
													size="sm"
													onClick={() => revokeOne.mutate(s.token)}
													disabled={revokeOne.isPending}
												>
													{m.site_users_sessions_revoke_one()}
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							{m.common_close()}
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={() => setConfirmAllOpen(true)}
							disabled={sessions.length === 0 || revokeAll.isPending}
						>
							{m.site_users_sessions_revoke_all()}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<ConfirmDialog
				open={confirmAllOpen}
				onOpenChange={setConfirmAllOpen}
				title={m.site_users_sessions_revoke_all_confirm_title()}
				description={m.site_users_sessions_revoke_all_confirm_desc()}
				confirmText={m.site_users_sessions_revoke_all()}
				confirming={revokeAll.isPending}
				onConfirm={() => revokeAll.mutate()}
			/>
		</>
	);
}

function formatDateTime(value: Date | string): string {
	try {
		return new Date(value).toLocaleString();
	} catch {
		return String(value);
	}
}

// ---------------------------------------------------------------------------
// Add user to organization — site-admin only direct addMember (bypasses the
// invitation flow). Reuses the cross-org list from
// `orpc.organizationsAdmin.list` so the operator picks among all orgs the
// platform manages, not only those the operator already belongs to.
// ---------------------------------------------------------------------------

const ADD_MEMBER_ROLES = ["owner", "admin", "member"] as const;
type AddMemberRole = (typeof ADD_MEMBER_ROLES)[number];

interface OrganizationOption {
	id: string;
	name: string;
	slug: string | null;
}

function AddToOrganizationDrawer({
	user,
	onOpenChange,
}: {
	user: AdminUser;
	onOpenChange: (open: boolean) => void;
}) {
	const [organizationId, setOrganizationId] = useState<string>("");
	const [role, setRole] = useState<AddMemberRole>("member");

	const orgListQuery = useQuery(
		orpc.organizationsAdmin.list.queryOptions({ input: {} }),
	);
	const organizations = (orgListQuery.data ?? []) as OrganizationOption[];

	const addMutation = useMutation({
		mutationFn: async () => {
			await orpc.organizationsAdmin.addMember.call({
				userId: user.id,
				organizationId,
				role,
			});
		},
		onSuccess: () => {
			toast.success(m.site_users_add_to_org_success());
			onOpenChange(false);
		},
		onError: (err: Error) => {
			toast.error(err.message);
		},
	});

	function handleSubmit() {
		if (!organizationId) {
			toast.error(m.site_users_add_to_org_error_no_org());
			return;
		}
		addMutation.mutate();
	}

	const roleLabels: Record<AddMemberRole, string> = {
		owner: m.site_users_add_to_org_role_owner(),
		admin: m.site_users_add_to_org_role_admin(),
		member: m.site_users_add_to_org_role_member(),
	};

	return (
		<FormDrawer
			open={true}
			onOpenChange={onOpenChange}
			title={m.site_users_add_to_org_title({ name: user.name })}
			description={m.site_users_add_to_org_desc()}
			submitText={m.site_users_add_to_org_submit()}
			submitting={addMutation.isPending}
			onSubmit={handleSubmit}
		>
			<div className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="add-to-org-org">
						{m.site_users_add_to_org_field_org()}
					</Label>
					<Select
						value={organizationId}
						onValueChange={setOrganizationId}
						disabled={orgListQuery.isPending || organizations.length === 0}
					>
						<SelectTrigger id="add-to-org-org">
							<SelectValue
								placeholder={
									orgListQuery.isPending
										? m.site_users_add_to_org_org_loading()
										: organizations.length === 0
											? m.site_users_add_to_org_org_empty()
											: m.site_users_add_to_org_field_org_placeholder()
								}
							/>
						</SelectTrigger>
						<SelectContent>
							{organizations.map((org) => (
								<SelectItem key={org.id} value={org.id}>
									{org.name}
									{org.slug ? (
										<span className="ml-2 text-xs text-muted-foreground">
											({org.slug})
										</span>
									) : null}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-2">
					<Label htmlFor="add-to-org-role">
						{m.site_users_add_to_org_field_role()}
					</Label>
					<Select
						value={role}
						onValueChange={(v) => setRole(v as AddMemberRole)}
					>
						<SelectTrigger id="add-to-org-role">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{ADD_MEMBER_ROLES.map((r) => (
								<SelectItem key={r} value={r}>
									{roleLabels[r]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
		</FormDrawer>
	);
}
