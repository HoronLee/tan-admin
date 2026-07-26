import "@tanstack/react-start/server-only";

import * as Sentry from "@sentry/tanstackstart-react";
import { logStream } from "#/lib/observability/logger";

declare global {
	/**
	 * Installed by the OpenTelemetry preload when tracing is enabled. It hangs
	 * off `globalThis` because the preload runs outside the app module graph and
	 * has no way to hand a reference to application code.
	 */
	var __otelShutdown: (() => Promise<void>) | undefined;
}

const OTEL_SHUTDOWN_TIMEOUT_MS = 2000;
const SENTRY_FLUSH_TIMEOUT_MS = 2000;

let flushed = false;
let hooksRegistered = false;

/**
 * Flush every buffered log line to its destination, synchronously.
 *
 * `logger.flush(cb)` must not be used for this: pino delegates to the
 * destination and falls through to the callback when the stream has no `flush`
 * method. `pino.multistream()` has `flushSync` and `end` but no `flush`, so
 * awaiting it would return immediately having written nothing. `process.exit()`
 * stops the event loop, so the synchronous path is the only one that survives.
 *
 * Terminal: the streams are closed afterwards, so call this immediately before
 * exiting and never on a path that keeps serving.
 */
export function flushLogsSync(): void {
	if (flushed) return;
	flushed = true;

	const stream = logStream as {
		flushSync?: () => void;
		end?: () => void;
	};

	try {
		// SonicBoom's end() is async and clears the buffer, so the sync flush has
		// to come first. multistream's end() flushSyncs each child before closing
		// it; the flushSync above already covered them, and both are safe twice.
		if (typeof stream.flushSync === "function") stream.flushSync();
		if (typeof stream.end === "function") stream.end();
	} catch {
		// We're on the way out and the logger is the thing that failed — there is
		// nowhere left to report this.
	}
}

async function withTimeout(
	work: Promise<unknown>,
	timeoutMs: number,
): Promise<void> {
	let timer: NodeJS.Timeout | undefined;
	try {
		await Promise.race([
			work,
			// Deliberately not unref'd: this timer is the guarantee that a hung
			// drain still reaches the log flush. An unref'd one lets Node exit the
			// moment nothing else holds the loop open, skipping the rest of the
			// shutdown. `clearTimeout` below releases it as soon as the race ends.
			new Promise<void>((resolve) => {
				timer = setTimeout(resolve, timeoutMs);
			}),
		]);
	} catch {
		// A failed drain must not block the ones after it.
	} finally {
		if (timer) clearTimeout(timer);
	}
}

/**
 * Drain telemetry then logs, in the only order that works: OTel's shutdown is
 * async and needs a live event loop, Sentry's flush likewise, and the pino
 * flush is synchronous and must be last because it closes the streams.
 */
export async function drainTelemetryAndLogs(): Promise<void> {
	if (typeof globalThis.__otelShutdown === "function") {
		await withTimeout(globalThis.__otelShutdown(), OTEL_SHUTDOWN_TIMEOUT_MS);
	}

	if (typeof Sentry.flush === "function") {
		await withTimeout(
			Sentry.flush(SENTRY_FLUSH_TIMEOUT_MS),
			SENTRY_FLUSH_TIMEOUT_MS,
		);
	}

	flushLogsSync();
}

/**
 * Register SIGTERM/SIGINT handlers so an orchestrator-initiated stop drains
 * buffered logs instead of truncating them. Idempotent — `src/server.ts` calls
 * it at module load.
 *
 * Exit codes follow the 128+signal convention so process supervisors can tell a
 * signalled shutdown from a crash.
 */
export function registerShutdownHooks(): void {
	if (hooksRegistered) return;
	hooksRegistered = true;

	const handle = (signal: "SIGTERM" | "SIGINT") => {
		void (async () => {
			await drainTelemetryAndLogs();
			process.exit(signal === "SIGINT" ? 130 : 143);
		})();
	};

	process.once("SIGTERM", () => handle("SIGTERM"));
	process.once("SIGINT", () => handle("SIGINT"));
}
