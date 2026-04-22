import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getSessionUser } from "#/lib/auth-session";

const checkSession = createServerFn({ method: "GET" }).handler(async () => {
	const headers = new Headers(getRequestHeaders() as Record<string, string>);
	const session = await getSessionUser(headers);
	return Boolean(session);
});

export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		const hasSession = await checkSession();
		if (hasSession) {
			throw redirect({ to: "/dashboard" });
		}
		throw redirect({ to: "/auth/$path", params: { path: "sign-in" } });
	},
	component: () => null,
});
