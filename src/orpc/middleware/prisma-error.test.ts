import { createRouterClient, isDefinedError } from "@orpc/server";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { Prisma } from "#/generated/prisma/client";
import { pub } from "#/orpc/middleware/prisma-error";

function makeKnownRequestError(code: string, meta?: Record<string, unknown>) {
	return new Prisma.PrismaClientKnownRequestError(`mock ${code}`, {
		code,
		clientVersion: "test",
		meta,
	});
}

describe("prismaErrorMiddleware", () => {
	it("maps P2002 (unique constraint) to CONFLICT", async () => {
		const router = {
			create: pub.input(z.object({})).handler(() => {
				throw makeKnownRequestError("P2002", { target: ["email"] });
			}),
		};
		const client = createRouterClient(router);

		await expect(client.create({})).rejects.toMatchObject({
			code: "CONFLICT",
			defined: true,
			status: 409,
		});
	});

	it("maps P2025 (record not found) to NOT_FOUND", async () => {
		const router = {
			remove: pub.input(z.object({})).handler(() => {
				throw makeKnownRequestError("P2025");
			}),
		};
		const client = createRouterClient(router);

		await expect(client.remove({})).rejects.toMatchObject({
			code: "NOT_FOUND",
			defined: true,
			status: 404,
		});
	});

	it("leaves unknown Prisma codes to upstream handler", async () => {
		const router = {
			oops: pub.input(z.object({})).handler(() => {
				throw makeKnownRequestError("P2999");
			}),
		};
		const client = createRouterClient(router);

		const rejection = await client.oops({}).catch((e: unknown) => e);
		expect(isDefinedError(rejection)).toBe(false);
	});

	it("passes through non-Prisma errors", async () => {
		const router = {
			boom: pub.input(z.object({})).handler(() => {
				throw new Error("boom");
			}),
		};
		const client = createRouterClient(router);

		await expect(client.boom({})).rejects.toThrow("boom");
	});
});
