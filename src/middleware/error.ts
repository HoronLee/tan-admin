import * as Sentry from "@sentry/tanstackstart-react";
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import {
	isDatabaseUnavailableError,
	scheduleDatabaseUnavailableExit,
} from "#/lib/observability/database-fail-fast";

let logPromise:
	| Promise<
			ReturnType<typeof import("#/lib/observability/logger").createModuleLogger>
	  >
	| undefined;

async function getLog() {
	logPromise ??= import("#/lib/observability/logger").then(
		({ createModuleLogger }) => createModuleLogger("server-fn"),
	);
	return logPromise;
}

/**
 * Global middleware for every createServerFn() invocation.
 *
 * It mirrors oRPC's boundary behavior:
 * - structured error logging
 * - Sentry capture
 * - DB-unavailable fail-fast (process.exit so orchestrator restarts the pod)
 * - rethrow to preserve route-level error behavior
 */
export const serverFnErrorMiddleware = createMiddleware({
	type: "function",
}).server(async ({ next, serverFnMeta }) => {
	let requestId: string | undefined;
	try {
		requestId = getRequestHeaders().get("x-request-id") ?? undefined;
	} catch {
		// Non-request execution has no correlation id.
	}

	try {
		return await next();
	} catch (error) {
		const serverFn = {
			id: serverFnMeta?.id,
			name: serverFnMeta?.name,
		};
		const log = await getLog();
		log.error(
			{
				err: error,
				requestId,
				serverFn,
			},
			"server function error",
		);

		if (isDatabaseUnavailableError(error)) {
			scheduleDatabaseUnavailableExit(error, {
				phase: "runtime",
				requestId,
				serverFn,
			});
		} else {
			Sentry.captureException(error);
		}

		throw error;
	}
});
