import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRouterClient } from "#/orpc/client-types";

const mocks = vi.hoisted(() => ({
	getRequestHeaders: vi.fn<() => Headers>(),
}));

vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: mocks.getRequestHeaders,
}));

vi.mock("#/orpc/router", async () => {
	const { os } =
		await vi.importActual<typeof import("@orpc/server")>("@orpc/server");

	return {
		default: {
			requestId: os
				.$context<{ headers: Headers }>()
				.handler(async ({ context }) => {
					await Promise.resolve();
					return context.headers.get("x-request-id");
				}),
		},
	};
});

type HeaderTestClient = {
	requestId: () => Promise<string | null>;
};

beforeEach(() => {
	delete globalThis.$client;
	mocks.getRequestHeaders.mockReset();
	vi.resetModules();
});

afterEach(() => {
	delete globalThis.$client;
	vi.unstubAllGlobals();
});

describe("oRPC server client registration", () => {
	it("registers one in-process router client without replacing an existing one", async () => {
		const registered = {} as AppRouterClient;
		globalThis.$client = registered;

		await import("#/orpc/server-client");

		expect(globalThis.$client).toBe(registered);
	});

	it("resolves headers for every call and isolates concurrent requests", async () => {
		const headersStorage = new AsyncLocalStorage<Headers>();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		mocks.getRequestHeaders.mockImplementation(() => {
			const headers = headersStorage.getStore();
			if (!headers) throw new Error("request headers are unavailable");
			return headers;
		});

		await import("#/orpc/server-client");
		const { client: sharedClient } = await import("#/orpc/client");
		const client = sharedClient as unknown as HeaderTestClient;
		const callWithRequestId = (requestId: string) =>
			headersStorage.run(new Headers({ "x-request-id": requestId }), () =>
				client.requestId(),
			);

		await expect(
			Promise.all([
				callWithRequestId("request-a"),
				callWithRequestId("request-b"),
			]),
		).resolves.toEqual(["request-a", "request-b"]);
		expect(mocks.getRequestHeaders).toHaveBeenCalledTimes(2);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
