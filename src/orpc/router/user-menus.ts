/**
 * getUserMenus — returns the menu tree the current user is allowed to see.
 *
 * `requiredPermission` semantics:
 *   - `null`                 → always visible to any authenticated user
 *   - `"site:admin"`         → visible only to site-level admins
 *                              (admin plugin `user.role === "admin"`)
 *   - `"<resource>:<action>"` → visible to members whose active-org role has
 *                              the permission via Better Auth organization AC
 *                              (`auth.api.hasPermission`)
 *
 * The three modes exist because two different authority systems exist:
 * site-level admin (admin plugin) vs per-org role (organization plugin).
 * See `.trellis/spec/backend/authorization-boundary.md` for the split.
 */
import * as z from "zod";
import { auth } from "#/lib/auth/server";
import { authed } from "#/orpc/middleware/auth";

// Recursively include up to 6 levels of menu children
function buildInclude(depth: number): object {
	if (depth <= 0) return {};
	return {
		children: {
			where: { status: "ACTIVE" },
			orderBy: { order: "asc" as const },
			include: buildInclude(depth - 1),
		},
	};
}

interface MenuNode {
	id: number;
	requiredPermission: string | null;
	children?: MenuNode[];
	[key: string]: unknown;
}

export const getUserMenus = authed
	.input(z.object({}).optional())
	.handler(async ({ context }) => {
		const ctx = context as { headers?: Headers };
		const headers = ctx.headers ?? new Headers();

		// Pull all ACTIVE root menus with nested children
		const roots = (await context.db.menu.findMany({
			where: { parentId: null, status: "ACTIVE" },
			orderBy: { order: "asc" },
			include: buildInclude(5),
		})) as MenuNode[];

		const session = await auth.api.getSession({ headers });
		const isSiteAdmin =
			(session?.user as { role?: string | null } | undefined)?.role === "admin";
		const activeOrganizationId = (
			session?.session as { activeOrganizationId?: string } | undefined
		)?.activeOrganizationId;

		async function checkPermission(
			requiredPermission: string,
		): Promise<boolean> {
			// Site-admin-only menu: gated by the admin plugin's user.role, not
			// by any org-level AC. Keeps the sidebar honest — non-admins never
			// see these entries even though the route gate would also catch them.
			if (requiredPermission === "site:admin") {
				return isSiteAdmin;
			}

			// No active org → cannot satisfy any org-gated permission
			if (!activeOrganizationId) return false;

			const [resource, action] = requiredPermission.split(":");
			if (!resource || !action) return false;

			const result = await auth.api.hasPermission({
				headers,
				body: {
					organizationId: activeOrganizationId,
					permissions: { [resource]: [action] },
				},
			});
			return result.success;
		}

		async function filterNode(node: MenuNode): Promise<MenuNode | null> {
			if (node.requiredPermission) {
				const allowed = await checkPermission(node.requiredPermission);
				if (!allowed) return null;
			}

			const filteredChildren = await Promise.all(
				(node.children ?? []).map(filterNode),
			);
			return {
				...node,
				children: filteredChildren.filter((c): c is MenuNode => c !== null),
			};
		}

		const filtered = await Promise.all(roots.map(filterNode));
		return filtered.filter((n): n is MenuNode => n !== null);
	});
