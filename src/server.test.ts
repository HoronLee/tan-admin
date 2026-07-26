import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	handlerFetch: vi.fn<(request: Request) => Promise<Response>>(),
	paraglideMiddleware:
		vi.fn<
			(request: Request, next: () => Promise<Response>) => Promise<Response>
		>(),
	registerShutdownHooks: vi.fn(),
}));

vi.mock("#/orpc/server-client", () => ({}));
vi.mock("@tanstack/react-start/server-entry", () => ({
	default: { fetch: mocks.handlerFetch },
}));
vi.mock("#/lib/observability/shutdown", () => ({
	registerShutdownHooks: mocks.registerShutdownHooks,
}));
vi.mock("#/paraglide/server", () => ({
	paraglideMiddleware: mocks.paraglideMiddleware,
}));

import server from "#/server";

beforeEach(() => {
	mocks.handlerFetch.mockReset();
	mocks.paraglideMiddleware.mockReset();
	mocks.paraglideMiddleware.mockImplementation(async (_request, next) =>
		next(),
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("server request ID boundary", () => {
	it("injects a missing request ID before downstream handlers and echoes it", async () => {
		const request = new Request("http://localhost/api/rpc/health");
		vi.stubGlobal("crypto", { randomUUID: () => "generated-request-id" });
		mocks.handlerFetch.mockImplementation(async (forwarded) => {
			expect(forwarded.headers.get("x-request-id")).toBe(
				"generated-request-id",
			);
			return new Response("ok");
		});

		const response = await server.fetch(request);

		expect(response.headers.get("x-request-id")).toBe("generated-request-id");
	});

	it("rebuilds a request when its headers are immutable", async () => {
		const request = new Request("http://localhost/api/rpc/health", {
			method: "POST",
			body: "payload",
		});
		vi.stubGlobal("crypto", { randomUUID: () => "generated-request-id" });
		vi.spyOn(request.headers, "set").mockImplementation(() => {
			throw new TypeError("immutable headers");
		});
		mocks.handlerFetch.mockImplementation(async (forwarded) => {
			expect(forwarded).not.toBe(request);
			expect(forwarded.headers.get("x-request-id")).toBe(
				"generated-request-id",
			);
			expect(await forwarded.text()).toBe("payload");
			return new Response("ok");
		});

		const response = await server.fetch(request);

		expect(response.headers.get("x-request-id")).toBe("generated-request-id");
	});

	it("preserves and echoes an inbound request ID", async () => {
		mocks.handlerFetch.mockImplementation(async (forwarded) => {
			expect(forwarded.headers.get("x-request-id")).toBe("proxy-request-id");
			return new Response("ok");
		});

		const response = await server.fetch(
			new Request("http://localhost/api/rpc/health", {
				headers: { "x-request-id": "proxy-request-id" },
			}),
		);

		expect(response.headers.get("x-request-id")).toBe("proxy-request-id");
	});
});
