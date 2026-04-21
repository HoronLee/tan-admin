import { db } from "#/db";
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

	const userRoles = await db.userRole.findMany({
		where: { userId: session.user.id },
		include: { role: true },
	});
	const isAdmin = userRoles.some((ur) => ur.role.code === "super-admin");

	return {
		session,
		user: session.user,
		policyAuth: {
			userId: session.user.id,
			isAdmin,
		},
	};
}
