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
import { ADMIN_ROLES, type AdminRole } from "./_shared";

interface CreateUserDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: () => void;
}

export function CreateUserDrawer({
	open,
	onOpenChange,
	onCreated,
}: CreateUserDrawerProps) {
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
