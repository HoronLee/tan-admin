import * as z from "zod";
import { authed } from "#/orpc/middleware/auth";

const MenuMetaSchema = z
	.object({
		title: z.string().optional(),
		icon: z.string().optional(),
		activeIcon: z.string().optional(),
		activePath: z.string().optional(),
		order: z.number().int().optional(),
		affixTab: z.boolean().optional(),
		affixTabOrder: z.number().int().optional(),
		badge: z.string().optional(),
		badgeType: z.string().optional(),
		badgeVariants: z.string().optional(),
		hideChildrenInMenu: z.boolean().optional(),
		hideInBreadcrumb: z.boolean().optional(),
		hideInMenu: z.boolean().optional(),
		hideInTab: z.boolean().optional(),
		iframeSrc: z.string().optional(),
		ignoreAccess: z.boolean().optional(),
		keepAlive: z.boolean().optional(),
		link: z.string().optional(),
		maxNumOfOpenTab: z.number().int().optional(),
		menuVisibleWithForbidden: z.boolean().optional(),
		openInNewWindow: z.boolean().optional(),
	})
	.optional();

const MenuBodySchema = z.object({
	type: z.enum(["CATALOG", "MENU", "BUTTON", "EMBEDDED", "LINK"]).optional(),
	path: z.string().optional(),
	name: z.string().optional(),
	component: z.string().optional(),
	redirect: z.string().optional(),
	alias: z.string().optional(),
	meta: MenuMetaSchema,
	parentId: z.number().int().positive().optional(),
	status: z.enum(["ACTIVE", "DISABLED"]).optional(),
	order: z.number().int().min(0).optional(),
	/// Better Auth organization id (UUID string). null = visible across all orgs.
	organizationId: z.string().optional(),
	/// Permission key required to view this menu node (format: "resource:action").
	requiredPermission: z.string().optional(),
});

export const listMenus = authed
	.input(z.object({}).optional())
	.handler(async ({ context }) => {
		// Return the full tree rooted at top-level nodes
		return await context.db.menu.findMany({
			where: { parentId: null },
			orderBy: { order: "asc" },
			include: buildMenuInclude(5),
		});
	});

export const getMenu = authed
	.input(z.object({ id: z.number().int().positive() }))
	.handler(async ({ input, context }) => {
		return await context.db.menu.findUnique({
			where: { id: input.id },
			include: { children: true },
		});
	});

export const createMenu = authed
	.input(MenuBodySchema)
	.handler(async ({ input, context }) => {
		return await context.db.menu.create({ data: input });
	});

export const updateMenu = authed
	.input(
		z.object({
			id: z.number().int().positive(),
			data: MenuBodySchema.partial(),
		}),
	)
	.handler(async ({ input, context }) => {
		return await context.db.menu.update({
			where: { id: input.id },
			data: input.data,
		});
	});

export const deleteMenu = authed
	.input(z.object({ id: z.number().int().positive() }))
	.handler(async ({ input, context }) => {
		await context.db.menu.delete({ where: { id: input.id } });
		return { success: true };
	});

// Build recursive include up to `depth` levels for tree queries
function buildMenuInclude(depth: number): object {
	if (depth <= 0) return {};
	return {
		children: {
			orderBy: { order: "asc" },
			include: buildMenuInclude(depth - 1),
		},
	};
}
