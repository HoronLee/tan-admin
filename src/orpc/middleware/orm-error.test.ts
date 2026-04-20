import { createRouterClient, isDefinedError } from "@orpc/server";
import { ORMError, ORMErrorReason } from "@zenstackhq/orm";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { pub } from "#/orpc/middleware/orm-error";

function makeORMError(
	reason: ORMErrorReason,
	message = "mock",
	dbErrorCode?: string,
) {
	const err = new ORMError(reason, message);
	if (dbErrorCode !== undefined) {
		err.dbErrorCode = dbErrorCode;
	}
	return err;
}

describe("ormErrorMiddleware", () => {
	it("maps NOT_FOUND to NOT_FOUND", async () => {
		const router = {
			remove: pub.input(z.object({})).handler(() => {
				throw makeORMError(ORMErrorReason.NOT_FOUND);
			}),
		};
		const client = createRouterClient(router);

		await expect(client.remove({})).rejects.toMatchObject({
			code: "NOT_FOUND",
			defined: true,
			status: 404,
		});
	});

	it("maps REJECTED_BY_POLICY to FORBIDDEN", async () => {
		const router = {
			secret: pub.input(z.object({})).handler(() => {
				throw makeORMError(ORMErrorReason.REJECTED_BY_POLICY);
			}),
		};
		const client = createRouterClient(router);

		await expect(client.secret({})).rejects.toMatchObject({
			code: "FORBIDDEN",
			defined: true,
			status: 403,
		});
	});

	it("maps INVALID_INPUT to INPUT_VALIDATION_FAILED", async () => {
		const router = {
			create: pub.input(z.object({})).handler(() => {
				throw makeORMError(ORMErrorReason.INVALID_INPUT, "bad shape");
			}),
		};
		const client = createRouterClient(router);

		await expect(client.create({})).rejects.toMatchObject({
			code: "INPUT_VALIDATION_FAILED",
			defined: true,
			status: 422,
		});
	});

	it("maps db-query-error 23505 (unique) to CONFLICT", async () => {
		const router = {
			create: pub.input(z.object({})).handler(() => {
				throw makeORMError(ORMErrorReason.DB_QUERY_ERROR, "dup key", "23505");
			}),
		};
		const client = createRouterClient(router);

		await expect(client.create({})).rejects.toMatchObject({
			code: "CONFLICT",
			defined: true,
			status: 409,
		});
	});

	it("maps db-query-error 23503 (FK) to BAD_REQUEST", async () => {
		const router = {
			create: pub.input(z.object({})).handler(() => {
				throw makeORMError(ORMErrorReason.DB_QUERY_ERROR, "fk fail", "23503");
			}),
		};
		const client = createRouterClient(router);

		await expect(client.create({})).rejects.toMatchObject({
			code: "BAD_REQUEST",
			defined: true,
			status: 400,
		});
	});

	it("leaves unknown SQLSTATE codes to upstream handler", async () => {
		const router = {
			oops: pub.input(z.object({})).handler(() => {
				throw makeORMError(ORMErrorReason.DB_QUERY_ERROR, "weird", "99999");
			}),
		};
		const client = createRouterClient(router);

		const rejection = await client.oops({}).catch((e: unknown) => e);
		expect(isDefinedError(rejection)).toBe(false);
	});

	it("passes through non-ORM errors", async () => {
		const router = {
			boom: pub.input(z.object({})).handler(() => {
				throw new Error("boom");
			}),
		};
		const client = createRouterClient(router);

		await expect(client.boom({})).rejects.toThrow("boom");
	});
});
