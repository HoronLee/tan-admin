import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import type router from "#/orpc/router";

type AppRouter = typeof router;

function stripTrailingSlash(url: string) {
	return url.replace(/\/$/, "");
}

function serverOrigin() {
	const configured =
		process.env.SERVER_URL ??
		process.env.VITE_APP_URL ??
		process.env.BETTER_AUTH_URL;
	if (configured) return stripTrailingSlash(configured);

	const headers = new Headers(
		getRequestHeaders() as unknown as Record<string, string>,
	);
	const host = headers.get("x-forwarded-host") ?? headers.get("host");
	if (!host) return "http://localhost:3000";

	const proto =
		headers.get("x-forwarded-proto") ??
		(host.startsWith("localhost") || host.startsWith("127.0.0.1")
			? "http"
			: "https");
	return `${proto}://${host}`;
}

function serverHeaders() {
	return new Headers(getRequestHeaders() as unknown as Record<string, string>);
}

const getORPCClient = createIsomorphicFn()
	.server((): RouterClient<AppRouter> => {
		const link = new RPCLink({
			url: () => `${serverOrigin()}/api/rpc`,
			headers: serverHeaders,
		});
		return createORPCClient(link);
	})
	.client((): RouterClient<AppRouter> => {
		const link = new RPCLink({
			url: `${window.location.origin}/api/rpc`,
		});
		return createORPCClient(link);
	});

export const client: RouterClient<AppRouter> = getORPCClient();

export const orpc = createTanstackQueryUtils(client);
