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
import { paraglideMiddleware } from "#/paraglide/server";

export default {
	fetch(req: Request): Promise<Response> {
		return paraglideMiddleware(req, () => handler.fetch(req));
	},
};
