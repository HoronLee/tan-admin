/**
 * Access logging for TanStack Start server functions, the third request
 * boundary next to the two oRPC fetch handlers (whose access line lives in
 * `src/orpc/access-log.ts`).
 *
 * `serverFnErrorMiddleware` (./error.ts) still owns error detail, Sentry
 * capture, and DB-unavailable fail-fast. This middleware writes only the
 * bounded access fields for both successful and failed invocations, then
 * rethrows failures unchanged.
 *
 * Logger factory: `src/lib/observability/logger.ts#createModuleLogger`.
 */

import { createMiddleware } from "@tanstack/react-start";
import {
	getRequestHeaders,
	getResponseStatus,
} from "@tanstack/react-start/server";
import { logConfig } from "#/lib/config.server";
import { resolveAccessLogLevel } from "#/lib/observability/access";

let logPromise:
	| Promise<
			ReturnType<typeof import("#/lib/observability/logger").createModuleLogger>
	  >
	| undefined;

async function getLog() {
	// Dynamic import for the same reason as ./error.ts: keep the logger's
	// top-level await out of this middleware's import graph.
	logPromise ??= import("#/lib/observability/logger").then(
		({ createModuleLogger }) => createModuleLogger("server-fn"),
	);
	return logPromise;
}

function requestIdFromHeaders(): string | undefined {
	try {
		const headers = getRequestHeaders();
		return headers?.get("x-request-id") ?? undefined;
	} catch {
		// Outside a request scope (tests, scripts) there is nothing to correlate.
		return undefined;
	}
}

function statusFromError(error: unknown): number {
	if (
		typeof error === "object" &&
		error !== null &&
		"status" in error &&
		typeof error.status === "number" &&
		Number.isInteger(error.status) &&
		error.status >= 400 &&
		error.status < 600
	) {
		return error.status;
	}

	return 500;
}

export const serverFnAccessMiddleware = createMiddleware({
	type: "function",
}).server(async ({ next, method, serverFnMeta }) => {
	const requestId = requestIdFromHeaders();
	const path = serverFnMeta.id;
	const started = performance.now();

	const result = await next().catch(async (error: unknown) => {
		const durationMs = Math.round(performance.now() - started);
		const status = statusFromError(error);
		const { level, slow } = resolveAccessLogLevel({
			status,
			durationMs,
			slowThresholdMs: logConfig.slowThresholdMs,
		});

		const log = await getLog();
		log[level](
			{
				requestId,
				method,
				path,
				status,
				durationMs,
				...(slow && { slow: true }),
			},
			"server function failed",
		);

		throw error;
	});

	const durationMs = Math.round(performance.now() - started);
	const status = getResponseStatus();
	const { level, slow } = resolveAccessLogLevel({
		status,
		durationMs,
		slowThresholdMs: logConfig.slowThresholdMs,
	});

	const log = await getLog();
	log[level](
		{
			requestId,
			method,
			path,
			status,
			durationMs,
			...(slow && { slow: true }),
		},
		"server function completed",
	);

	return result;
});
