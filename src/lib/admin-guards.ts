import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "#/lib/auth";
import { getSessionUser } from "#/lib/auth-session";

/**
 * Route `beforeLoad` gates for admin-only pages.
 *
 * Static imports of `auth` / `getSessionUser` are safe here because those
 * modules carry the `@tanstack/react-start/server-only` marker — the
 * TanStack Start compiler strips `createServerFn` handler bodies from the
 * client build, and the marker lets Import Protection catch any accidental
 * direct import from client code at build time. Dynamic `await import(...)`
 * is explicitly discouraged by the Start docs ("Can cause bundler issues").
 *
 * These gates are UX only: the server (BA plugins / ZenStack policies) is
 * the authority. A bypassed gate still fails at the mutation layer.
 */

export const requireSiteAdmin = createServerFn({ method: "GET" }).handler(
	async () => {
		const headers = new Headers(getRequestHeaders() as Record<string, string>);
		const ctx = await getSessionUser(headers);
		if (!ctx) {
			throw redirect({ to: "/auth/$path", params: { path: "sign-in" } });
		}
		if (!ctx.policyAuth.isAdmin) {
			throw redirect({ to: "/dashboard", search: { denied: "site-admin" } });
		}
		return { ok: true as const };
	},
);

export const requireOrgMemberRole = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { allowed?: string[] } | undefined) =>
			data ?? { allowed: ["admin", "owner"] },
	)
	.handler(async ({ data }) => {
		const headers = new Headers(getRequestHeaders() as Record<string, string>);
		const ctx = await getSessionUser(headers);
		if (!ctx) {
			throw redirect({ to: "/auth/$path", params: { path: "sign-in" } });
		}
		const allowed = data.allowed ?? ["admin", "owner"];
		// Site-level admin always passes — a super-admin who landed on an org
		// settings page should not be locked out even if they aren't a formal
		// member of that org.
		if (ctx.policyAuth.isAdmin) return { ok: true as const };
		if (!ctx.activeOrganizationId) {
			throw redirect({ to: "/dashboard", search: { denied: "no-active-org" } });
		}
		let role: string | undefined;
		try {
			const member = await auth.api.getActiveMember({ headers });
			role = member?.role;
		} catch {
			role = undefined;
		}
		if (!role || !allowed.includes(role)) {
			throw redirect({ to: "/dashboard", search: { denied: "org-role" } });
		}
		return { ok: true as const };
	});
