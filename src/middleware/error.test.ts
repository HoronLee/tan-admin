import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	captureException: vi.fn(),
	getRequestHeaders: vi.fn<() => Headers>(),
	lines: [] as Array<{
		level: string;
		fields: Record<string, unknown>;
		msg: string;
	}>,
}));

vi.mock("@sentry/tanstackstart-react", () => ({
	captureException: mocks.captureException,
}));

vi.mock("@tanstack/react-start", () => ({
	createMiddleware: () => ({
		server: (middleware: unknown) => middleware,
	}),
}));

vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: mocks.getRequestHeaders,
}));

vi.mock("#/lib/observability/logger", () => ({
	createModuleLogger: () => ({
		error(fields: Record<string, unknown>, msg: string) {
			mocks.lines.push({ level: "error", fields, msg });
		},
		fatal(fields: Record<string, unknown>, msg: string) {
			mocks.lines.push({ level: "fatal", fields, msg });
		},
	}),
}));

import { serverFnErrorMiddleware } from "#/middleware/error";

type MiddlewareOptions = {
	next: () => Promise<unknown>;
	serverFnMeta: { id: string; name: string; filename?: string };
};

const runErrorMiddleware = serverFnErrorMiddleware as unknown as (
	options: MiddlewareOptions,
) => Promise<unknown>;

beforeEach(() => {
	mocks.captureException.mockReset();
	mocks.getRequestHeaders.mockReset();
	mocks.getRequestHeaders.mockReturnValue(
		new Headers({ "x-request-id": "request-123" }),
	);
	mocks.lines.length = 0;
});

describe("serverFnErrorMiddleware", () => {
	it("correlates the error detail with the access-log request ID", async () => {
		const failure = new Error("server function failed");

		await expect(
			runErrorMiddleware({
				next: async () => {
					throw failure;
				},
				serverFnMeta: { id: "save-user", name: "saveUser" },
			}),
		).rejects.toBe(failure);

		expect(mocks.lines).toHaveLength(1);
		expect(mocks.lines[0]).toMatchObject({
			level: "error",
			msg: "server function error",
			fields: {
				err: failure,
				requestId: "request-123",
				serverFn: { id: "save-user", name: "saveUser" },
			},
		});
		expect(mocks.captureException).toHaveBeenCalledWith(failure);
	});
});
