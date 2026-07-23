/**
 * Resolve the persisted authorization role from a Better Auth session.
 *
 * This is intentionally fail-closed. A session without an active organization
 * or without a non-empty persisted role must not acquire an organization role
 * from a stale or guessed value.
 */
export function resolveActiveOrganizationRole(input: {
	activeOrganizationId?: unknown;
	activeOrganizationRole?: unknown;
}): string | undefined {
	if (
		typeof input.activeOrganizationId !== "string" ||
		input.activeOrganizationId.length === 0
	) {
		return undefined;
	}

	if (
		typeof input.activeOrganizationRole !== "string" ||
		input.activeOrganizationRole.trim().length === 0
	) {
		return undefined;
	}

	return input.activeOrganizationRole;
}
