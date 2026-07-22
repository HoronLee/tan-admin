import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "#/orpc/client-types";

const browserLink = new RPCLink({
	url: () => {
		if (typeof window === "undefined") {
			throw new Error(
				"oRPC server client is not registered; RPCLink cannot run during SSR.",
			);
		}

		return `${window.location.origin}/api/rpc`;
	},
});

export const client: AppRouterClient =
	globalThis.$client ?? createORPCClient(browserLink);

export const orpc = createTanstackQueryUtils(client);
