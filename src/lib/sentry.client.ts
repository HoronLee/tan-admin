import * as Sentry from "@sentry/tanstackstart-react";
import { env } from "#/env";

let initialized = false;

/**
 * Initialize Sentry in the browser.
 *
 * Server-side Sentry is bootstrapped separately via `instrument.server.mjs`
 * (see `package.json` `dev` / `start` scripts).
 *
 * Safe to call multiple times — only runs once. No-op when:
 * - running on the server (`typeof window === "undefined"`)
 * - `VITE_SENTRY_DSN` is not configured (warns once)
 */
export function initSentryClient(): void {
	if (initialized) return;
	if (typeof window === "undefined") return;

	const dsn = env.VITE_SENTRY_DSN;
	if (!dsn) {
		// Intentional: logger is server-side only; this is a client bootstrap.
		console.warn(
			"[sentry] VITE_SENTRY_DSN is not defined. Client Sentry is not running.",
		);
		initialized = true;
		return;
	}

	Sentry.init({
		dsn,
		sendDefaultPii: true,
		tracesSampleRate: 1.0,
		replaysSessionSampleRate: 0.1,
		replaysOnErrorSampleRate: 1.0,
	});
	initialized = true;
}
