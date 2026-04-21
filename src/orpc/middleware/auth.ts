import { authDb } from "#/db";
import { getSessionUser } from "#/lib/auth-session";
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
		const sessionContext = await getSessionUser(headers);

		if (!sessionContext) {
			throw errors.UNAUTHORIZED({ message: "Sign in required." });
		}

		// Create a per-request policy client bound to this user.
		const userDb = authDb.$setAuth(sessionContext.policyAuth);

		return next({
			context: {
				...ctx,
				user: sessionContext.user,
				session: sessionContext.session,
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
