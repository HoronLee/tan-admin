import {
	adminClient,
	inferOrgAdditionalFields,
	multiSessionClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "#/lib/auth";
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
			// Teams type-inference gate: BA's client plugin infers the
			// `createTeam` / `listTeams` / ... method signatures only when
			// `teams.enabled` is a literal `true`. Since `env.VITE_TEAM_ENABLED`
			// is a runtime boolean and can't feed a type-level literal, we pin
			// `enabled: true` here so the methods are always typed; the real
			// runtime gate lives on the server (auth.ts) and in the
			// `/teams` page / sidebar (env.VITE_TEAM_ENABLED).
			teams: { enabled: true },
			// Infers `plan` / `industry` / `billingEmail` from the server auth
			// config so `organization.plan` is typed on the client.
			schema: inferOrgAdditionalFields<typeof auth>(),
		}),
		multiSessionClient(),
	],
});
