import { auth } from "#/lib/auth";
import { base } from "#/orpc/errors";
import { pub } from "#/orpc/middleware/orm-error";

/**
 * Authentication middleware (authn only — no RBAC in this task).
 *
 * Reads `headers` from the procedure context, asks Better Auth for a
 * session, and attaches `user` to the context. Throws typed
 * `UNAUTHORIZED` when no session is present.
 *
 * Compose via `authed` below. Procedures that also need ORM error
 * mapping (i.e. anything that touches the DB) get it for free because
 * `pub` is already in the chain.
 */
export const authMiddleware = base.middleware(
	async ({ context, next, errors }) => {
		const ctx = context as { headers?: Headers };
		const headers = ctx.headers ?? new Headers();
		const session = await auth.api.getSession({ headers });

		if (!session?.user) {
			throw errors.UNAUTHORIZED({ message: "Sign in required." });
		}

		return next({ context: { ...ctx, user: session.user, session } });
	},
);

/**
 * Procedure builder for authenticated endpoints.
 *
 * Chain: base → ormErrorMiddleware → authMiddleware
 */
export const authed = pub.use(authMiddleware);
