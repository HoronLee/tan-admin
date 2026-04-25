import { useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { authClient } from "#/lib/auth/client";
import { translateAuthError } from "#/lib/auth/errors";
import * as m from "#/paraglide/messages";

/**
 * Displays a sticky red banner whenever the current session is an
 * impersonation session (`session.impersonatedBy` is set by BA admin plugin
 * when a super-admin starts impersonating another user).
 *
 * The "Stop" button calls `authClient.admin.stopImpersonating` which restores
 * the original admin session on the server side (multiSession plugin keeps
 * both cookies; BA swaps back to the admin one). We hard-reload to
 * `/site/users` so all in-memory state (TanStack Query cache, menuStore,
 * activeOrganizationId) is rebuilt from the restored admin identity — doing
 * a soft router navigation would keep the impersonated user's menus/cache.
 */
export function ImpersonationBanner() {
	const { data } = authClient.useSession();
	const [stopping, setStopping] = useState(false);

	const impersonatedBy = data?.session?.impersonatedBy;
	if (!impersonatedBy) return null;

	const email = data?.user?.email ?? "";

	async function handleStop() {
		setStopping(true);
		const { error } = await authClient.admin.stopImpersonating();
		setStopping(false);
		if (error) {
			toast.error(translateAuthError(error));
			return;
		}
		window.location.href = "/site/users";
	}

	return (
		<div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
			<span className="truncate">
				{m.impersonation_banner_message({ email })}
			</span>
			<Button
				type="button"
				variant="destructive"
				size="sm"
				onClick={handleStop}
				disabled={stopping}
			>
				{m.impersonation_banner_stop()}
			</Button>
		</div>
	);
}

export default ImpersonationBanner;
