import "@tanstack/react-start/server-only";

import { auth } from "#/lib/auth";

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;
type SessionUser = NonNullable<SessionResult>["user"];

export interface AuthSessionContext {
	session: NonNullable<SessionResult>;
	user: SessionUser;
	policyAuth: {
		userId: string;
		isAdmin: boolean;
	};
	activeOrganizationId: string | undefined;
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
	const activeOrganizationId =
		(session.session as { activeOrganizationId?: string })
			.activeOrganizationId ?? undefined;

	return {
		session,
		user: session.user,
		policyAuth: {
			userId: session.user.id,
			isAdmin,
		},
		activeOrganizationId,
	};
}
