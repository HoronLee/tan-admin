import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getRequestHeaders: vi.fn<() => Headers>(),
	getResponseStatus: vi.fn<() => number>(),
	lines: [] as Array<{
		level: string;
		fields: Record<string, unknown>;
		msg: string;
	}>,
	logConfig: { slowThresholdMs: 3000 },
}));

vi.mock("@tanstack/react-start", () => ({
	createMiddleware: () => ({
		server: (middleware: unknown) => middleware,
	}),
}));

vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: mocks.getRequestHeaders,
	getResponseStatus: mocks.getResponseStatus,
}));

vi.mock("#/lib/config.server", () => ({
	logConfig: mocks.logConfig,
}));

vi.mock("#/lib/observability/logger", () => ({
	createModuleLogger: (module: string) => ({
		info(fields: Record<string, unknown>, msg: string) {
			mocks.lines.push({ level: "info", fields: { module, ...fields }, msg });
		},
		warn(fields: Record<string, unknown>, msg: string) {
			mocks.lines.push({ level: "warn", fields: { module, ...fields }, msg });
		},
		error(fields: Record<string, unknown>, msg: string) {
			mocks.lines.push({ level: "error", fields: { module, ...fields }, msg });
		},
	}),
}));

import { serverFnAccessMiddleware } from "#/middleware/logging";

type MiddlewareOptions = {
	next: () => Promise<unknown>;
	method: "GET" | "POST";
	serverFnMeta: { id: string; name: string; filename?: string };
};

const runAccessMiddleware = serverFnAccessMiddleware as unknown as (
	options: MiddlewareOptions,
) => Promise<unknown>;

beforeEach(() => {
	mocks.getRequestHeaders.mockReset();
	mocks.getRequestHeaders.mockReturnValue(
		new Headers({ "x-request-id": "request-123" }),
	);
	mocks.getResponseStatus.mockReset();
	mocks.getResponseStatus.mockReturnValue(200);
	mocks.lines.length = 0;
	mocks.logConfig.slowThresholdMs = 3000;
});

describe("serverFnAccessMiddleware", () => {
	it("logs one successful server-function access line with the request ID", async () => {
		await expect(
			runAccessMiddleware({
				next: async () => "done",
				method: "POST",
				serverFnMeta: { id: "save-user", name: "saveUser" },
			}),
		).resolves.toBe("done");

		expect(mocks.lines).toHaveLength(1);
		expect(mocks.lines[0]).toMatchObject({
			level: "info",
			msg: "server function completed",
		});
		expect(mocks.lines[0]?.fields).toMatchObject({
			module: "server-fn",
			requestId: "request-123",
			method: "POST",
			path: "save-user",
			status: 200,
		});
		expect(mocks.lines[0]?.fields.serverFn).toBeUndefined();
		expect(mocks.lines[0]?.fields.durationMs).toBeTypeOf("number");
		expect(Object.keys(mocks.lines[0]?.fields ?? {}).sort()).toEqual([
			"durationMs",
			"method",
			"module",
			"path",
			"requestId",
			"status",
		]);
	});

	it("escalates a slow successful server function to warn", async () => {
		mocks.logConfig.slowThresholdMs = -1;

		await runAccessMiddleware({
			next: async () => undefined,
			method: "GET",
			serverFnMeta: { id: "slow-fn", name: "slowFn" },
		});

		expect(mocks.lines[0]).toMatchObject({ level: "warn" });
		expect(mocks.lines[0]?.fields).toMatchObject({ slow: true });
	});

	it("logs a 5xx access line and rethrows failures unchanged", async () => {
		const failure = new Error("server function failed");

		await expect(
			runAccessMiddleware({
				next: async () => {
					throw failure;
				},
				method: "POST",
				serverFnMeta: { id: "save-user", name: "saveUser" },
			}),
		).rejects.toBe(failure);

		expect(mocks.lines).toHaveLength(1);
		expect(mocks.lines[0]).toMatchObject({
			level: "error",
			msg: "server function failed",
		});
		expect(mocks.lines[0]?.fields).toMatchObject({
			module: "server-fn",
			requestId: "request-123",
			method: "POST",
			path: "save-user",
			status: 500,
		});
		expect(mocks.lines[0]?.fields.durationMs).toBeTypeOf("number");
		expect(Object.keys(mocks.lines[0]?.fields ?? {}).sort()).toEqual([
			"durationMs",
			"method",
			"module",
			"path",
			"requestId",
			"status",
		]);
	});

	it("classifies an error carrying a 4xx status as warn", async () => {
		const failure = Object.assign(new Error("not found"), { status: 404 });

		await expect(
			runAccessMiddleware({
				next: async () => {
					throw failure;
				},
				method: "GET",
				serverFnMeta: { id: "load-user", name: "loadUser" },
			}),
		).rejects.toBe(failure);

		expect(mocks.lines[0]).toMatchObject({ level: "warn" });
		expect(mocks.lines[0]?.fields).toMatchObject({ status: 404 });
	});
});
