import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FormDrawer } from "#/components/form-drawer";
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
import type { AdminUser } from "./_shared";

/**
 * Add user to organization — site-admin only direct addMember (bypasses the
 * invitation flow). Reuses the cross-org list from
 * `orpc.organizationsAdmin.list` so the operator picks among all orgs the
 * platform manages, not only those the operator already belongs to.
 */
const ADD_MEMBER_ROLES = ["owner", "admin", "member"] as const;
type AddMemberRole = (typeof ADD_MEMBER_ROLES)[number];

interface OrganizationOption {
	id: string;
	name: string;
	slug: string | null;
}

interface AddToOrganizationDrawerProps {
	user: AdminUser;
	onOpenChange: (open: boolean) => void;
}

export function AddToOrganizationDrawer({
	user,
	onOpenChange,
}: AddToOrganizationDrawerProps) {
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
