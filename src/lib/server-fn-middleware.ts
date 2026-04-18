import * as Sentry from "@sentry/tanstackstart-react";
import { createMiddleware } from "@tanstack/react-start";
import { Prisma } from "#/generated/prisma/client";
import { createModuleLogger } from "#/lib/logger";

const log = createModuleLogger("server-fn");
const DB_UNAVAILABLE_CODES = new Set([
	"ECONNREFUSED",
	"ENOTFOUND",
	"P1000",
	"P1001",
	"P1002",
	"P1017",
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
	return /(ECONNREFUSED|ENOTFOUND|P1000|P1001|P1002|P1017|Can't reach database server|Authentication failed)/i.test(
		text,
	);
}

function isDbUnavailableError(error: unknown): boolean {
	if (
		error instanceof Prisma.PrismaClientInitializationError ||
		error instanceof Prisma.PrismaClientRustPanicError
	) {
		return true;
	}

	if (error instanceof Prisma.PrismaClientKnownRequestError) {
		return DB_UNAVAILABLE_CODES.has(error.code);
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
