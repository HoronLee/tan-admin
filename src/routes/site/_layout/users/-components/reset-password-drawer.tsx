import { useState } from "react";
import { toast } from "sonner";
import { FormDrawer } from "#/components/form-drawer";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { authClient } from "#/lib/auth/client";
import { translateAuthError } from "#/lib/auth/errors";
import * as m from "#/paraglide/messages";
import type { AdminUser } from "./_shared";

interface ResetPasswordDrawerProps {
	user: AdminUser;
	onOpenChange: (open: boolean) => void;
}

/**
 * Reset password — delegates to authClient.admin.setUserPassword. The new
 * password is not emailed; operators are expected to communicate it through
 * an out-of-band channel (phone/IM) or instruct the user to run a normal
 * password-reset flow afterwards.
 */
export function ResetPasswordDrawer({
	user,
	onOpenChange,
}: ResetPasswordDrawerProps) {
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
