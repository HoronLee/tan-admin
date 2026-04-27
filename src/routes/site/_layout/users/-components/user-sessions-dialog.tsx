import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "#/components/confirm-dialog";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { authClient } from "#/lib/auth/client";
import * as m from "#/paraglide/messages";
import type { AdminUser } from "./_shared";

/**
 * User sessions dialog — lists active sessions via
 * authClient.admin.listUserSessions, and offers per-row + bulk revoke via
 * revokeUserSession / revokeUserSessions.
 *
 * Kept as a plain Dialog (no DataTable) because we only need ~5 columns and
 * simple actions; DataTable's pagination/filtering is overkill for
 * per-user session counts.
 */
interface AdminSession {
	id: string;
	token: string;
	ipAddress?: string | null;
	userAgent?: string | null;
	createdAt: Date | string;
	expiresAt: Date | string;
}

interface UserSessionsDialogProps {
	user: AdminUser;
	onOpenChange: (open: boolean) => void;
}

export function UserSessionsDialog({
	user,
	onOpenChange,
}: UserSessionsDialogProps) {
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
