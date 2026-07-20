import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FormDrawer } from "#/components/form-drawer";
import { UserPickerCombobox } from "#/components/UserPickerCombobox";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { orpc } from "#/orpc/client";
import * as m from "#/paraglide/messages";

const ADD_MEMBER_ROLES = ["owner", "admin", "member"] as const;
type AddMemberRole = (typeof ADD_MEMBER_ROLES)[number];

export function AddOrganizationMemberDrawer({
	organization,
	onOpenChange,
	onSuccess,
}: {
	organization: { id: string; name: string };
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}) {
	const [userId, setUserId] = useState<string | null>(null);
	const [role, setRole] = useState<AddMemberRole>("member");

	const addMutation = useMutation({
		mutationFn: async () => {
			if (!userId) throw new Error(m.organizations_add_member_error_no_user());
			await orpc.organizationsAdmin.addMember.call({
				userId,
				organizationId: organization.id,
				role,
			});
		},
		onSuccess: () => {
			toast.success(m.organizations_add_member_success());
			onSuccess();
		},
		onError: (err: Error) => {
			toast.error(err.message);
		},
	});

	function handleSubmit() {
		if (!userId) {
			toast.error(m.organizations_add_member_error_no_user());
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
			title={m.organizations_add_member_title({ name: organization.name })}
			description={m.organizations_add_member_desc()}
			submitText={m.organizations_add_member_submit()}
			submitting={addMutation.isPending}
			onSubmit={handleSubmit}
		>
			<div className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="add-member-user">
						{m.organizations_add_member_field_user()}
					</Label>
					<UserPickerCombobox
						id="add-member-user"
						value={userId}
						onChange={(id) => setUserId(id)}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="add-member-role">
						{m.organizations_add_member_field_role()}
					</Label>
					<Select
						value={role}
						onValueChange={(v) => setRole(v as AddMemberRole)}
					>
						<SelectTrigger id="add-member-role">
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
