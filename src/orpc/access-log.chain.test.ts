import {
	CONTEXT_LOGGER_SYMBOL,
	LoggingHandlerPlugin,
} from "@orpc/experimental-pino";
import { ORPCError, os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { createAccessLogInterceptor } from "#/orpc/access-log";

/**
 * D1 decision-gate regression. W2 is the shipped configuration: no
 * `LoggingHandlerPlugin`; a request-scoped logger is seeded through its public
 * context symbol, exactly as `withRequestLogger` does in the two routes. The
 * final test preserves the reason W1 is rejected: the plugin turns a typed
 * 4xx into extra error-level lines despite the access line being warn.
 */

type CapturedLine = Record<string, unknown> & { level: number; msg: string };

function buildHandler(mode: "w1" | "w2" = "w2") {
	const lines: CapturedLine[] = [];
	const testLogger = pino(
		{ level: "debug" },
		{
			write(chunk: string) {
				lines.push(JSON.parse(chunk));
			},
		},
	);

	const router = {
		ok: os.handler(() => "hi"),
		unauthorized: os.handler(() => {
			throw new ORPCError("UNAUTHORIZED", { status: 401 });
		}),
		explode: os.handler(() => {
			throw new Error("untyped failure");
		}),
	};

	const handler = new RPCHandler(router, {
		interceptors: [createAccessLogInterceptor(3000)],
		...(mode === "w1"
			? {
					plugins: [
						new LoggingHandlerPlugin({
							logger: testLogger,
							logRequestResponse: false,
							generateId: () => "test-request-id",
						}),
					],
				}
			: {}),
	});
	const context =
		mode === "w1"
			? { headers: new Headers({ "x-request-id": "test-request-id" }) }
			: {
					headers: new Headers({ "x-request-id": "test-request-id" }),
					[CONTEXT_LOGGER_SYMBOL]: testLogger.child({
						module: "orpc",
						requestId: "test-request-id",
					}),
				};

	return { context, handler, lines };
}

function rpcRequest(path: string) {
	return new Request(`http://localhost/rpc/${path}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-request-id": "test-request-id",
		},
		body: JSON.stringify({}),
	});
}

describe("access log through the real handler chain (D1 gate)", () => {
	it("W2 logs exactly one info access line for a successful request", async () => {
		const { context, handler, lines } = buildHandler();
		const { response } = await handler.handle(rpcRequest("ok"), {
			prefix: "/rpc",
			context: context as never,
		});

		expect(response?.status).toBe(200);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({
			level: 30,
			module: "orpc",
			msg: "request completed",
			requestId: "test-request-id",
			status: 200,
		});
	});

	it("W2 logs a thrown typed 4xx as exactly one warn access line", async () => {
		const { context, handler, lines } = buildHandler();
		const { response } = await handler.handle(rpcRequest("unauthorized"), {
			prefix: "/rpc",
			context: context as never,
		});

		expect(response?.status).toBe(401);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({
			level: 40,
			msg: "request failed",
			status: 401,
		});
		expect(lines.filter((line) => line.level >= 50)).toHaveLength(0);
	});

	it("W2 logs an untyped throw as one error access line", async () => {
		const { context, handler, lines } = buildHandler();
		const { response } = await handler.handle(rpcRequest("explode"), {
			prefix: "/rpc",
			context: context as never,
		});

		expect(response?.status).toBe(500);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({
			level: 50,
			msg: "request failed",
			status: 500,
		});
	});

	it("W2 logs an unmatched path as one warn 404 access line", async () => {
		const { context, handler, lines } = buildHandler();
		const { matched } = await handler.handle(rpcRequest("nope"), {
			prefix: "/rpc",
			context: context as never,
		});

		expect(matched).toBe(false);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({ level: 40, status: 404 });
	});

	it("rejects W1 because the plugin duplicates a typed 4xx as error", async () => {
		const { context, handler, lines } = buildHandler("w1");
		const { response } = await handler.handle(rpcRequest("unauthorized"), {
			prefix: "/rpc",
			context: context as never,
		});

		expect(response?.status).toBe(401);
		expect(
			lines.filter(
				(line) => line.msg === "request failed" && line.level === 40,
			),
		).toHaveLength(1);
		expect(lines.filter((line) => line.level >= 50).length).toBeGreaterThan(0);
	});
});
