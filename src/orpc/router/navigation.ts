import * as z from "zod";
import { auth } from "#/lib/auth/server";
import { MenuSurfaceSchema } from "#/lib/menu/menu-surface";
import { authed } from "#/orpc/middleware/auth";

const NavigationInput = z.object({
	surface: MenuSurfaceSchema.default("WORKSPACE"),
	organizationId: z.string().min(1).nullable().optional(),
});

interface NavigationContext {
	headers?: Headers;
	user?: { role?: string | null };
	session?: { activeOrganizationId?: string | null };
}

interface MenuNode {
	id: number;
	parentId: number | null;
	requiredPermission: string | null;
	children?: MenuNode[];
	[key: string]: unknown;
}

function buildTree(rows: MenuNode[]): MenuNode[] {
	const byParent = new Map<number | null, MenuNode[]>();
	for (const row of rows) {
		const siblings = byParent.get(row.parentId) ?? [];
		siblings.push(row);
		byParent.set(row.parentId, siblings);
	}

	function attachChildren(node: MenuNode): MenuNode {
		return {
			...node,
			children: (byParent.get(node.id) ?? []).map(attachChildren),
		};
	}

	return (byParent.get(null) ?? []).map(attachChildren);
}

export const get = authed
	.input(NavigationInput.default({ surface: "WORKSPACE" }))
	.handler(async ({ context, input, errors }) => {
		const ctx = context as NavigationContext;
		const headers = ctx.headers ?? new Headers();
		const isSiteAdmin = ctx.user?.role === "admin";
		const activeOrganizationId = ctx.session?.activeOrganizationId ?? undefined;

		if (input.surface === "SITE" && !isSiteAdmin) {
			throw errors.FORBIDDEN({ message: "需要站点管理员权限。" });
		}

		let targetOrganizationId: string | null = null;
		if (input.surface === "WORKSPACE") {
			if (isSiteAdmin) {
				targetOrganizationId =
					input.organizationId !== undefined
						? input.organizationId
						: (activeOrganizationId ?? null);
			} else {
				if (!activeOrganizationId) return [];
				if (
					input.organizationId !== undefined &&
					input.organizationId !== activeOrganizationId
				) {
					throw errors.FORBIDDEN({
						message: "普通用户只能读取当前激活组织的菜单。",
					});
				}
				targetOrganizationId = activeOrganizationId;
			}
		}

		const scopeWhere =
			targetOrganizationId === null
				? { organizationId: null }
				: {
						OR: [
							{ organizationId: null },
							{ organizationId: targetOrganizationId },
						],
					};

		const rows = (await context.db.menu.findMany({
			where: {
				status: "ACTIVE",
				surface: input.surface,
				...scopeWhere,
			},
			orderBy: { order: "asc" },
		})) as MenuNode[];

		const permissionResults = new Map<string, boolean>();
		async function canView(requiredPermission: string): Promise<boolean> {
			if (isSiteAdmin) return true;
			const cached = permissionResults.get(requiredPermission);
			if (cached !== undefined) return cached;
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
			permissionResults.set(requiredPermission, result.success);
			return result.success;
		}

		async function filterNode(node: MenuNode): Promise<MenuNode | null> {
			if (
				node.requiredPermission &&
				!(await canView(node.requiredPermission))
			) {
				return null;
			}

			const children = await Promise.all((node.children ?? []).map(filterNode));
			return {
				...node,
				children: children.filter((child): child is MenuNode => child !== null),
			};
		}

		const filtered = await Promise.all(buildTree(rows).map(filterNode));
		return filtered.filter((node): node is MenuNode => node !== null);
	});
