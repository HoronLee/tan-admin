import * as z from "zod";
import { authed } from "#/orpc/middleware/auth";

export const listMyRoles = authed
	.input(z.object({}))
	.handler(async ({ context }) => {
		return await context.db.userRole.findMany({
			where: { userId: context.user.id },
			include: { role: true },
		});
	});

export const assignRole = authed
	.input(
		z.object({
			userId: z.string().min(1),
			roleId: z.number().int().positive(),
		}),
	)
	.handler(async ({ input, context }) => {
		return await context.db.userRole.create({
			data: { userId: input.userId, roleId: input.roleId },
		});
	});

export const revokeRole = authed
	.input(
		z.object({
			userId: z.string().min(1),
			roleId: z.number().int().positive(),
		}),
	)
	.handler(async ({ input, context }) => {
		await context.db.userRole.deleteMany({
			where: { userId: input.userId, roleId: input.roleId },
		});
		return { success: true };
	});
