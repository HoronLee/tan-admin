/**
 * getUserMenus — returns the menu tree the current user is allowed to see.
 *
 * Logic:
 *   1. Fetch all ACTIVE root menu nodes (with nested children).
 *   2. For each node: if requiredPermission is null → always visible.
 *      Otherwise call auth.api.hasPermission (server-side) to check
 *      the current user's org membership permissions.
 *   3. If the user has no active organization, only menus without
 *      requiredPermission are returned (safe public fallback).
 *
 * Result: tree with parentId=null roots and filtered children.
 */
import * as z from "zod";
import { auth } from "#/lib/auth";
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

		// Check if user has an active organization — if not, skip permission checks
		const session = await auth.api.getSession({ headers });
		const activeOrganizationId = (
			session?.session as { activeOrganizationId?: string } | undefined
		)?.activeOrganizationId;

		async function checkPermission(
			requiredPermission: string,
		): Promise<boolean> {
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
