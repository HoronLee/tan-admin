import "#/polyfill";

import { RPCHandler } from "@orpc/server/fetch";
import { createFileRoute } from "@tanstack/react-router";
import {
	createAccessLogInterceptor,
	withRequestLogger,
} from "#/orpc/access-log";
import { serverInterceptors } from "#/orpc/interceptors";
import router from "#/orpc/router";

const handler = new RPCHandler(router, {
	// Access line first so it times the full chain, error handling inside.
	interceptors: [createAccessLogInterceptor(), ...serverInterceptors],
});

async function handle({ request }: { request: Request }) {
	const { response } = await handler.handle(request, {
		prefix: "/api/rpc",
		context: withRequestLogger({ headers: request.headers }),
	});

	return response ?? new Response("Not Found", { status: 404 });
}

export const Route = createFileRoute("/api/rpc/$")({
	server: {
		handlers: {
			HEAD: handle,
			GET: handle,
			POST: handle,
			PUT: handle,
			PATCH: handle,
			DELETE: handle,
		},
	},
});
