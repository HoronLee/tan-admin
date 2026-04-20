import * as z from "zod";
import { authed } from "#/orpc/middleware/auth";

const PermissionBodySchema = z.object({
	name: z.string().min(1),
	code: z.string().min(1),
	description: z.string().optional(),
	type: z.enum(["MENU", "BUTTON", "API"]).optional(),
	status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

export const listPermissions = authed
	.input(z.object({}))
	.handler(async ({ context }) => {
		return await context.db.permission.findMany({
			orderBy: { createdAt: "asc" },
		});
	});

export const getPermission = authed
	.input(z.object({ id: z.number().int().positive() }))
	.handler(async ({ input, context }) => {
		return await context.db.permission.findUnique({ where: { id: input.id } });
	});

export const createPermission = authed
	.input(PermissionBodySchema)
	.handler(async ({ input, context }) => {
		return await context.db.permission.create({ data: input });
	});

export const updatePermission = authed
	.input(
		z.object({
			id: z.number().int().positive(),
			data: PermissionBodySchema.partial(),
		}),
	)
	.handler(async ({ input, context }) => {
		return await context.db.permission.update({
			where: { id: input.id },
			data: input.data,
		});
	});

export const deletePermission = authed
	.input(z.object({ id: z.number().int().positive() }))
	.handler(async ({ input, context }) => {
		await context.db.permission.delete({ where: { id: input.id } });
		return { success: true };
	});
