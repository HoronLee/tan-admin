import { createFileRoute } from "@tanstack/react-router";
import { RPCApiHandler } from "@zenstackhq/server/api";
import { TanStackStartHandler } from "@zenstackhq/server/tanstack-start";
import { schema } from "zenstack/schema";
import { authDb } from "#/db";
import { getSessionUser } from "#/lib/auth/session";

const handler = TanStackStartHandler({
	apiHandler: new RPCApiHandler({ schema }),
	getClient: async (request) => {
		// Bind the principal on every request — including unauthenticated ones,
		// where we pass `undefined` so that `auth() == null` in zmodel triggers
		// `@@deny('all', auth() == null)` predictably (no reliance on default semantics).
		const sessionContext = await getSessionUser(request);
		return authDb.$setAuth(sessionContext?.policyAuth);
	},
});

export const Route = createFileRoute("/api/model/$")({
	server: {
		handlers: {
			HEAD: handler,
			GET: handler,
			POST: handler,
			PUT: handler,
			PATCH: handler,
			DELETE: handler,
		},
	},
});
