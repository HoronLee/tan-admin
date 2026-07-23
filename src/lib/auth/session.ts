import "@tanstack/react-start/server-only";

import { auth } from "#/lib/auth/server";
import { resolveActiveOrganizationRole } from "#/lib/auth/session-role";

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;
type SessionUser = NonNullable<SessionResult>["user"];

export interface AuthSessionContext {
	session: NonNullable<SessionResult>;
	user: SessionUser;
	policyAuth: {
		userId: string;
		isAdmin: boolean;
		activeOrganizationId?: string;
		activeOrganizationRole?: string;
	};
	activeOrganizationId: string | undefined;
	activeOrganizationRole: string | undefined;
}

function toHeaders(input: Request | Headers): Headers {
	return input instanceof Request ? input.headers : input;
}

export async function getSessionUser(
	input: Request | Headers,
): Promise<AuthSessionContext | null> {
	const headers = toHeaders(input);
	const session = await auth.api.getSession({ headers });

	if (!session?.user) {
		return null;
	}

	// admin plugin adds `role` field to the user; "admin" role = isAdmin
	const userRole = (session.user as { role?: string }).role;
	const isAdmin = userRole === "admin";

	// organization plugin adds `activeOrganizationId` to the session
	const sessionWithRole = session.session as {
		activeOrganizationId?: string | null;
		activeOrganizationRole?: string | null;
	};
	const activeOrganizationId =
		typeof sessionWithRole.activeOrganizationId === "string" &&
		sessionWithRole.activeOrganizationId.length > 0
			? sessionWithRole.activeOrganizationId
			: undefined;
	// The role is persisted and transactionally synchronized with the member
	// table. Missing or malformed fields intentionally fail closed instead of
	// issuing a request-time member lookup or trusting stale authorization data.
	const activeOrganizationRole = resolveActiveOrganizationRole({
		...sessionWithRole,
		activeOrganizationId,
	});

	return {
		session,
		user: session.user,
		policyAuth: {
			userId: session.user.id,
			isAdmin,
			activeOrganizationId,
			activeOrganizationRole,
		},
		activeOrganizationId,
		activeOrganizationRole,
	};
}
