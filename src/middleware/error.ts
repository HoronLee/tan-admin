import * as Sentry from "@sentry/tanstackstart-react";
import { createMiddleware } from "@tanstack/react-start";
import { ORMError, ORMErrorReason } from "@zenstackhq/orm";
import { createModuleLogger } from "#/lib/observability/logger";

const log = createModuleLogger("server-fn");
const DB_UNAVAILABLE_CODES = new Set([
	"ECONNREFUSED",
	"ENOTFOUND",
	"ETIMEDOUT",
	"EHOSTUNREACH",
	"ENETUNREACH",
]);
let exitScheduled = false;

function hasDbUnavailableCode(value: unknown): boolean {
	if (
		typeof value === "object" &&
		value !== null &&
		"code" in value &&
		typeof value.code === "string"
	) {
		return DB_UNAVAILABLE_CODES.has(value.code);
	}
	return false;
}

function hasDbUnavailableMessage(error: Error): boolean {
	const text = `${error.name}: ${error.message}`;
	return /(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|Connection terminated|Connection refused|password authentication failed)/i.test(
		text,
	);
}

function isDbUnavailableError(error: unknown): boolean {
	// ZenStack wraps driver errors as ORMError(DB_QUERY_ERROR). The real pg
	// network error sits on `cause`; recurse to look for connection codes.
	if (error instanceof ORMError) {
		if (error.reason === ORMErrorReason.CONFIG_ERROR) return true;
		if (error.cause) return isDbUnavailableError(error.cause);
		return false;
	}

	if (error instanceof Error) {
		if (hasDbUnavailableMessage(error) || hasDbUnavailableCode(error)) {
			return true;
		}

		const withCause = error as Error & { cause?: unknown };
		if (withCause.cause) {
			return isDbUnavailableError(withCause.cause);
		}
	}

	if (hasDbUnavailableCode(error)) {
		return true;
	}

	return false;
}

function scheduleProcessExit(): void {
	if (exitScheduled) return;
	exitScheduled = true;

	setTimeout(() => {
		void (async () => {
			if (typeof Sentry.flush === "function") {
				try {
					await Sentry.flush(2000);
				} catch {
					// no-op: process exits below
				}
			}
			process.exit(1);
		})();
	}, 0).unref();
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
	try {
		return await next();
	} catch (error) {
		log.error(
			{
				err: error,
				serverFn: {
					id: serverFnMeta?.id,
					name: serverFnMeta?.name,
				},
			},
			"server function error",
		);
		Sentry.captureException(error);

		if (isDbUnavailableError(error)) {
			log.fatal(
				{
					err: error,
					serverFn: {
						id: serverFnMeta?.id,
						name: serverFnMeta?.name,
					},
				},
				"database is unavailable; scheduling process exit",
			);
			scheduleProcessExit();
		}

		throw error;
	}
});
