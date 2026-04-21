/**
 * Better Auth access control — statements DSL + role definitions.
 *
 * Used by both the server (auth.ts plugins config) and the client
 * (auth-client.ts organizationClient config).
 */
import { createAccessControl } from "better-auth/plugins/access";

const statement = {
	user: ["read", "write", "delete"],
	menu: ["read", "write", "delete"],
	organization: ["read", "write", "delete"],
} as const;

export const ac = createAccessControl(statement);

/** Full access — organization owner */
export const owner = ac.newRole({
	user: ["read", "write", "delete"],
	menu: ["read", "write", "delete"],
	organization: ["read", "write", "delete"],
});

/** Administrative access — cannot delete organization */
export const adminRole = ac.newRole({
	user: ["read", "write"],
	menu: ["read", "write"],
	organization: ["read"],
});

/** Default member — read only */
export const member = ac.newRole({
	user: ["read"],
	menu: ["read"],
	organization: ["read"],
});
