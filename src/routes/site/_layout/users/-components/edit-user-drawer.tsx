import { useState } from "react";
import { toast } from "sonner";
import { FormDrawer } from "#/components/form-drawer";
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
import * as m from "#/paraglide/messages";
import { ADMIN_ROLES, type AdminRole, type AdminUser } from "./_shared";

interface EditUserDrawerProps {
	user: AdminUser;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}

/**
 * Edit user — thin wrapper around authClient.admin.updateUser (the server
 * endpoint adminUpdateUser). Accepts an arbitrary `data` payload per BA
 * schema; we only surface name/email/role here because that's what the
 * listing currently shows. Other user additionalFields (status/nickname/
 * avatar) are edited elsewhere.
 */
export function EditUserDrawer({
	user,
	onOpenChange,
	onSuccess,
}: EditUserDrawerProps) {
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
