import { useState } from "react";
import { FormDrawer } from "#/components/form-drawer";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { ADMIN_ROLES, type AdminRole, type AdminUser } from "./_shared";

interface ChangeRoleDrawerProps {
	user: AdminUser;
	onOpenChange: (open: boolean) => void;
	onSubmit: (role: AdminRole) => void;
	submitting: boolean;
}

export function ChangeRoleDrawer({
	user,
	onOpenChange,
	onSubmit,
	submitting,
}: ChangeRoleDrawerProps) {
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
