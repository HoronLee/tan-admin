import * as z from "zod";
import { authed } from "#/orpc/middleware/auth";

const RoleBodySchema = z.object({
	name: z.string().min(1),
	code: z.string().min(1),
	description: z.string().optional(),
	parentId: z.number().int().positive().optional(),
	status: z.enum(["ACTIVE", "DISABLED"]).optional(),
	order: z.number().int().min(0).optional(),
});

export const listRoles = authed
	.input(z.object({}))
	.handler(async ({ context }) => {
		return await context.db.role.findMany({
			orderBy: [{ order: "asc" }, { createdAt: "asc" }],
			include: { children: true },
			where: { parentId: null },
		});
	});

export const getRole = authed
	.input(z.object({ id: z.number().int().positive() }))
	.handler(async ({ input, context }) => {
		return await context.db.role.findUnique({
			where: { id: input.id },
			include: {
				children: true,
				rolePermissions: { include: { permission: true } },
			},
		});
	});

export const createRole = authed
	.input(RoleBodySchema)
	.handler(async ({ input, context }) => {
		return await context.db.role.create({ data: input });
	});

export const updateRole = authed
	.input(
		z.object({
			id: z.number().int().positive(),
			data: RoleBodySchema.partial(),
		}),
	)
	.handler(async ({ input, context }) => {
		return await context.db.role.update({
			where: { id: input.id },
			data: input.data,
		});
	});

export const deleteRole = authed
	.input(z.object({ id: z.number().int().positive() }))
	.handler(async ({ input, context }) => {
		await context.db.role.delete({ where: { id: input.id } });
		return { success: true };
	});
