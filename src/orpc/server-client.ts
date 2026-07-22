import "@tanstack/react-start/server-only";

import { createRouterClient } from "@orpc/server";
import { getRequestHeaders } from "@tanstack/react-start/server";
import type { AppRouterClient } from "#/orpc/client-types";
import router from "#/orpc/router";

globalThis.$client ??= createRouterClient(router, {
	context: async () => ({ headers: getRequestHeaders() }),
}) satisfies AppRouterClient;
