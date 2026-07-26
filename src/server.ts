import "#/orpc/server-client";

// Server entry: wire Paraglide SSR middleware so the runtime can resolve the
// request locale (cookie / Accept-Language) before TanStack Start renders the page.
//
// Why: without this middleware, `serverAsyncLocalStorage` is unset and every SSR
// render falls back to `baseLocale`, causing a hydration mismatch after the
// client reads the PARAGLIDE_LOCALE cookie.
//
// Reference: https://inlang.com/m/gerre34r/library-inlang-paraglideJs/middleware
// TanStack Start pattern: pass the original `req` to the handler (we don't use
// router.rewrite, so the de-localized request from the middleware isn't needed).

import handler from "@tanstack/react-start/server-entry";
import { registerShutdownHooks } from "#/lib/observability/shutdown";
import { paraglideMiddleware } from "#/paraglide/server";

// SIGTERM/SIGINT would otherwise kill the process with pino's buffer unwritten.
registerShutdownHooks();

/**
 * Correlation id for every request. Injected here — the outermost boundary —
 * so all three downstream consumers read the same value from the same place:
 * oRPC handlers (`context.headers`), server functions (`getRequestHeaders()`),
 * and the SSR in-process oRPC client. Inbound ids are honoured so an upstream
 * proxy's id survives; the response echoes it for client-side correlation.
 */
function withRequestId(req: Request): { req: Request; requestId: string } {
	const inbound = req.headers.get("x-request-id");
	if (inbound !== null) return { req, requestId: inbound };

	const requestId = crypto.randomUUID();
	try {
		req.headers.set("x-request-id", requestId);
		return { req, requestId };
	} catch {
		const headers = new Headers(req.headers);
		headers.set("x-request-id", requestId);
		// Vite dev can pass a Request from another realm. Do not use that object
		// as RequestInfo here: its private state is not readable by this realm.
		return {
			req: new Request(req.url, {
				method: req.method,
				headers,
				body:
					req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
				signal: req.signal,
				// `duplex` is required by undici for a streaming request body; the
				// DOM typings do not include it yet.
				...{ duplex: "half" },
			}),
			requestId,
		};
	}
}

function echoRequestId(res: Response, requestId: string): Response {
	try {
		res.headers.set("x-request-id", requestId);
		return res;
	} catch {
		// Immutable-headers guard (e.g. redirects) — re-wrap instead.
		const clone = new Response(res.body, res);
		clone.headers.set("x-request-id", requestId);
		return clone;
	}
}

export default {
	async fetch(req: Request): Promise<Response> {
		const { req: request, requestId } = withRequestId(req);
		const res = await paraglideMiddleware(request, () =>
			handler.fetch(request),
		);
		return echoRequestId(res, requestId);
	},
};
