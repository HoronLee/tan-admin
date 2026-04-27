import * as Sentry from "@sentry/tanstackstart-react";
import { env } from "#/lib/env";

let initialized = false;

export function initSentryClient(): void {
	if (initialized) return;
	if (typeof window === "undefined") return;

	initialized = true;
	const dsn = env.VITE_SENTRY_DSN;
	if (!dsn) return;

	Sentry.init({
		dsn,
		sendDefaultPii: true,
		tracesSampleRate: 1.0,
		replaysSessionSampleRate: 0.1,
		replaysOnErrorSampleRate: 1.0,
	});
}
