import "@tanstack/react-start/server-only";

import * as Sentry from "@sentry/tanstackstart-react";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { ORMError, ORMErrorReason } from "@zenstackhq/orm";

const DB_UNAVAILABLE_CODES = new Set([
	"ECONNREFUSED",
	"ENOTFOUND",
	"ETIMEDOUT",
	"EHOSTUNREACH",
	"ENETUNREACH",
]);

declare global {
	var __databaseUnavailableExitPromise: Promise<never> | undefined;
	var __databaseUnavailableExitScheduled: boolean | undefined;
}

export interface DatabaseUnavailableContext {
	requestId?: string;
	phase: "bootstrap" | "runtime";
	serverFn?: { id?: string; name?: string };
}

function hasDbUnavailableCode(value: unknown): boolean {
	return (
		typeof value === "object" &&
		value !== null &&
		"code" in value &&
		typeof value.code === "string" &&
		DB_UNAVAILABLE_CODES.has(value.code)
	);
}

export function isDatabaseUnavailableError(error: unknown): boolean {
	if (error instanceof ORMError) {
		if (error.reason === ORMErrorReason.CONFIG_ERROR) return true;
		return error.cause ? isDatabaseUnavailableError(error.cause) : false;
	}

	if (error instanceof Error) {
		const text = `${error.name}: ${error.message}`;
		if (
			/(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|Connection terminated|Connection refused|password authentication failed)/i.test(
				text,
			) ||
			hasDbUnavailableCode(error)
		) {
			return true;
		}

		return error.cause ? isDatabaseUnavailableError(error.cause) : false;
	}

	return hasDbUnavailableCode(error);
}

function resolveRequestId(explicit: string | undefined) {
	if (explicit) return explicit;

	try {
		return getRequestHeaders().get("x-request-id") ?? undefined;
	} catch {
		return undefined;
	}
}

async function performDatabaseUnavailableExit(
	error: unknown,
	context: DatabaseUnavailableContext,
): Promise<never> {
	const requestId = resolveRequestId(context.requestId);
	try {
		Sentry.captureException(error);
	} catch {
		// Telemetry must not be able to veto a process-fatal dependency exit.
	}

	try {
		const { createModuleLogger } = await import("#/lib/observability/logger");
		createModuleLogger("database").fatal(
			{
				err: error,
				requestId,
				phase: context.phase,
				serverFn: context.serverFn,
			},
			"database is unavailable; exiting process",
		);
	} catch {
		// The logger may itself be the failed bootstrap dependency. Exit anyway.
	}

	try {
		const { drainTelemetryAndLogs } = await import(
			"#/lib/observability/shutdown"
		);
		await drainTelemetryAndLogs();
	} catch {
		// A failed drain must never turn a fatal dependency failure into HTTP 500.
	}

	process.exit(1);
}

/**
 * Fatal database failures share one process-wide drain/exit promise. This is
 * global rather than module-local because Nitro may load the caller from a
 * lazy server chunk; duplicate requests must not start competing drains.
 */
export function exitForDatabaseUnavailable(
	error: unknown,
	context: DatabaseUnavailableContext,
): Promise<never> {
	globalThis.__databaseUnavailableExitScheduled = true;
	globalThis.__databaseUnavailableExitPromise ??=
		performDatabaseUnavailableExit(error, context);
	return globalThis.__databaseUnavailableExitPromise;
}

export function scheduleDatabaseUnavailableExit(
	error: unknown,
	context: DatabaseUnavailableContext,
): void {
	if (
		globalThis.__databaseUnavailableExitScheduled ||
		globalThis.__databaseUnavailableExitPromise
	) {
		return;
	}

	// Let the outer access middleware emit its bounded failure line before the
	// terminal drain closes the shared stream. The referenced timer guarantees
	// the process stays alive long enough to execute the fatal path.
	globalThis.__databaseUnavailableExitScheduled = true;
	setTimeout(() => {
		void exitForDatabaseUnavailable(error, context);
	}, 0);
}
