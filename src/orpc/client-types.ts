import type { RouterClient } from "@orpc/server";
import type router from "#/orpc/router";

export type AppRouterClient = RouterClient<typeof router>;

declare global {
	var $client: AppRouterClient | undefined;
}
