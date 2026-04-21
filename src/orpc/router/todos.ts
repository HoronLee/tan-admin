import * as z from "zod";
import { db } from "#/db";
import { authed } from "#/orpc/middleware/auth";

export const listTodos = authed
	.input(z.object({}).optional())
	.handler(async () => {
		return await db.todo.findMany({ orderBy: { createdAt: "desc" } });
	});

export const addTodo = authed
	.input(z.object({ title: z.string().min(1) }))
	.handler(async ({ input }) => {
		return await db.todo.create({ data: { title: input.title } });
	});
