import { CONTEXT_LOGGER_SYMBOL, getLogger } from "@orpc/experimental-pino";
import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";
import {
	createAccessLogInterceptor,
	withRequestLogger,
} from "#/orpc/access-log";

type Line = { level: string; fields: Record<string, unknown>; msg: string };

function stubLogger(lines: Line[]) {
	const record =
		(level: string) => (fields: Record<string, unknown>, msg: string) => {
			lines.push({ level, fields, msg });
		};
	return {
		info: record("info"),
		warn: record("warn"),
		error: record("error"),
	};
}

function makeOptions(
	lines: Line[],
	next: () => Promise<unknown>,
): Parameters<ReturnType<typeof createAccessLogInterceptor>>[0] {
	return {
		context: { [CONTEXT_LOGGER_SYMBOL]: stubLogger(lines) },
		request: {
			method: "POST",
			url: new URL("http://localhost/api/rpc/user.list?token=secret"),
			headers: {},
		},
		next,
	} as unknown as Parameters<ReturnType<typeof createAccessLogInterceptor>>[0];
}

const ok = (status: number) => async () =>
	({
		matched: true,
		response: { status, headers: {}, body: undefined },
	}) as never;

describe("createAccessLogInterceptor", () => {
	it("binds the inbound request ID on the W2 request logger", () => {
		const context = withRequestLogger({
			headers: new Headers({ "x-request-id": "request-123" }),
		});

		expect(getLogger(context)?.bindings()).toMatchObject({
			module: "orpc",
			requestId: "request-123",
		});
	});

	it("logs one info line for a successful request", async () => {
		const lines: Line[] = [];
		const interceptor = createAccessLogInterceptor(3000);

		await interceptor(makeOptions(lines, ok(200)));

		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({ level: "info", msg: "request completed" });
		expect(lines[0]?.fields).toMatchObject({
			status: 200,
			method: "POST",
			path: "/api/rpc/user.list",
		});
		expect(lines[0]?.fields.durationMs).toBeTypeOf("number");
	});

	it("strips the query string from the logged path", async () => {
		const lines: Line[] = [];
		await createAccessLogInterceptor(3000)(makeOptions(lines, ok(200)));

		expect(JSON.stringify(lines[0]?.fields)).not.toContain("secret");
	});

	it("logs an unmatched request as a 404 warn", async () => {
		const lines: Line[] = [];
		const interceptor = createAccessLogInterceptor(3000);

		await interceptor(
			makeOptions(
				lines,
				async () => ({ matched: false, response: undefined }) as never,
			),
		);

		expect(lines[0]).toMatchObject({ level: "warn" });
		expect(lines[0]?.fields).toMatchObject({ status: 404 });
	});

	it("logs a 5xx response at error level", async () => {
		const lines: Line[] = [];
		await createAccessLogInterceptor(3000)(makeOptions(lines, ok(500)));

		expect(lines[0]).toMatchObject({ level: "error" });
	});

	it("marks a slow success as warn with slow:true", async () => {
		const lines: Line[] = [];
		// Threshold -1: any measured duration counts as slow.
		await createAccessLogInterceptor(-1)(makeOptions(lines, ok(200)));

		expect(lines[0]).toMatchObject({ level: "warn" });
		expect(lines[0]?.fields).toMatchObject({ slow: true });
	});

	it("classifies a thrown typed 4xx as warn and rethrows it unchanged", async () => {
		const lines: Line[] = [];
		const boom = new ORPCError("UNAUTHORIZED", { status: 401 });

		await expect(
			createAccessLogInterceptor(3000)(
				makeOptions(lines, async () => {
					throw boom;
				}),
			),
		).rejects.toBe(boom);

		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({ level: "warn", msg: "request failed" });
		expect(lines[0]?.fields).toMatchObject({ status: 401 });
		// The err object belongs to serverInterceptors' line, not the access line.
		expect(lines[0]?.fields.err).toBeUndefined();
	});

	it("classifies an unknown thrown error as a 500 error line and rethrows", async () => {
		const lines: Line[] = [];
		const boom = new Error("db exploded");

		await expect(
			createAccessLogInterceptor(3000)(
				makeOptions(lines, async () => {
					throw boom;
				}),
			),
		).rejects.toBe(boom);

		expect(lines[0]).toMatchObject({ level: "error" });
		expect(lines[0]?.fields).toMatchObject({ status: 500 });
	});
});
