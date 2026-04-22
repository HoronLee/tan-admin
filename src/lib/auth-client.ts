import {
	adminClient,
	multiSessionClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ac, adminRole, member, owner } from "#/lib/permissions";

export const authClient = createAuthClient({
	baseURL:
		import.meta.env.VITE_APP_URL ??
		(typeof window !== "undefined" ? window.location.origin : undefined),
	plugins: [
		adminClient(),
		organizationClient({
			ac,
			roles: { owner, admin: adminRole, member },
		}),
		multiSessionClient(),
	],
});
