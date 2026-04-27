import { useState } from "react";
import { FormDrawer } from "#/components/form-drawer";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type { AdminUser } from "./_shared";

interface BanUserDrawerProps {
	user: AdminUser;
	onOpenChange: (open: boolean) => void;
	onSubmit: (reason: string) => void;
	submitting: boolean;
}

export function BanUserDrawer({
	user,
	onOpenChange,
	onSubmit,
	submitting,
}: BanUserDrawerProps) {
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
