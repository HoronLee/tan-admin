import { authDb, db } from "#/db";
import { auth } from "#/lib/auth";
import { base } from "#/orpc/errors";
import { pub } from "#/orpc/middleware/orm-error";

/**
 * Authentication + RBAC middleware.
 *
 * 1. Validates session via Better Auth.
 * 2. Queries the UserRole table (raw db — no policy) to determine isAdmin.
 * 3. Binds a policy-enforced client to the oRPC context as `db`.
 *
 * Handlers that receive `context.db` get a user-scoped ZenStack client
 * with PolicyPlugin enforcing @@allow / @@deny rules automatically.
 * UNAUTHORIZED is thrown when no session is present.
 */
export const authMiddleware = base.middleware(
	async ({ context, next, errors }) => {
		const ctx = context as { headers?: Headers };
		const headers = ctx.headers ?? new Headers();
		const session = await auth.api.getSession({ headers });

		if (!session?.user) {
			throw errors.UNAUTHORIZED({ message: "Sign in required." });
		}

		// Determine super-admin status using the raw (policy-free) client.
		const userRoles = await db.userRole.findMany({
			where: { userId: session.user.id },
			include: { role: true },
		});
		const isAdmin = userRoles.some((ur) => ur.role.code === "super-admin");

		// Create a per-request policy client bound to this user.
		const userDb = authDb.$setAuth({ userId: session.user.id, isAdmin });

		return next({
			context: {
				...ctx,
				user: session.user,
				session,
				db: userDb,
			},
		});
	},
);

/**
 * Procedure builder for authenticated endpoints.
 *
 * Chain: base → ormErrorMiddleware → authMiddleware
 */
export const authed = pub.use(authMiddleware);
