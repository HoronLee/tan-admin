import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppRouterClient } from "#/orpc/client-types";

vi.mock("#/orpc/router", () => {
	throw new Error("src/orpc/client.ts imported the server router at runtime");
});

afterEach(() => {
	delete globalThis.$client;
	vi.unstubAllGlobals();
	vi.resetModules();
	vi.restoreAllMocks();
});

describe("oRPC isomorphic client", () => {
	it("uses the registered server client without importing the router", async () => {
		const registered = {} as AppRouterClient;
		globalThis.$client = registered;

		const { client } = await import("#/orpc/client");

		expect(client).toBe(registered);
	});

	it("fails clearly instead of making an HTTP self-call during SSR", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const { client } = await import("#/orpc/client");

		await expect(client.navigation.get({ surface: "SITE" })).rejects.toThrow(
			"oRPC server client is not registered; RPCLink cannot run during SSR.",
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("keeps browser requests on the public /api/rpc transport", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 404 }));
		vi.stubGlobal("fetch", fetchMock);
		vi.stubGlobal("window", {
			location: { origin: "https://app.example.test" },
		});

		const { client } = await import("#/orpc/client");
		await client.navigation.get({ surface: "SITE" }).catch(() => undefined);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const request = fetchMock.mock.calls[0]?.[0];
		const url = request instanceof Request ? request.url : String(request);
		expect(url).toMatch(/^https:\/\/app\.example\.test\/api\/rpc/);
	});
});
