import { useState } from "react";
import { toast } from "sonner";
import { FormDrawer } from "#/components/form-drawer";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { orpc } from "#/orpc/client";
import * as m from "#/paraglide/messages";

interface CreateOrganizationForm {
	name: string;
	slug: string;
	plan: string;
	industry: string;
	billingEmail: string;
}

const INITIAL_FORM: CreateOrganizationForm = {
	name: "",
	slug: "",
	plan: "free",
	industry: "",
	billingEmail: "",
};

export function CreateOrganizationDrawer({
	open,
	onOpenChange,
	onCreated,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: () => void;
}) {
	const [form, setForm] = useState<CreateOrganizationForm>(INITIAL_FORM);
	const [submitting, setSubmitting] = useState(false);

	async function handleSubmit() {
		if (!form.name || !form.slug) {
			toast.error(m.organizations_create_validate());
			return;
		}
		setSubmitting(true);
		try {
			await orpc.organizationsAdmin.create.call({
				name: form.name,
				slug: form.slug,
				plan: form.plan || undefined,
				industry: form.industry || undefined,
				billingEmail: form.billingEmail || undefined,
			});
			toast.success(m.organizations_created_toast());
			onOpenChange(false);
			setForm(INITIAL_FORM);
			onCreated();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : m.organizations_create_failed(),
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<FormDrawer
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) setForm(INITIAL_FORM);
			}}
			title={m.organizations_create_drawer_title()}
			submitText={m.organizations_create_submit()}
			submitting={submitting}
			onSubmit={handleSubmit}
		>
			<div className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="org-name">{m.organizations_field_org_name()}</Label>
					<Input
						id="org-name"
						value={form.name}
						onChange={(e) => setForm({ ...form, name: e.target.value })}
						placeholder={m.organizations_field_org_name_placeholder()}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="org-slug">slug</Label>
					<Input
						id="org-slug"
						value={form.slug}
						onChange={(e) => setForm({ ...form, slug: e.target.value })}
						placeholder="my-org"
					/>
					<p className="text-xs text-muted-foreground">
						{m.organizations_field_slug_hint()}
					</p>
				</div>
				<div className="space-y-2">
					<Label htmlFor="org-plan">{m.organizations_col_plan()}</Label>
					<Input
						id="org-plan"
						value={form.plan}
						onChange={(e) => setForm({ ...form, plan: e.target.value })}
						placeholder={m.organizations_field_plan_placeholder()}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="org-industry">
						{m.organizations_field_industry_optional()}
					</Label>
					<Input
						id="org-industry"
						value={form.industry}
						onChange={(e) => setForm({ ...form, industry: e.target.value })}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="org-billing-email">
						{m.organizations_field_billing_email_optional()}
					</Label>
					<Input
						id="org-billing-email"
						type="email"
						value={form.billingEmail}
						onChange={(e) => setForm({ ...form, billingEmail: e.target.value })}
					/>
				</div>
			</div>
		</FormDrawer>
	);
}
