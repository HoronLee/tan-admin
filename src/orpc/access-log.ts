import {
	CONTEXT_LOGGER_SYMBOL,
	getLogger,
	type LoggerContext,
} from "@orpc/experimental-pino";
import { ORPCError } from "@orpc/server";
import type { RPCHandlerOptions } from "@orpc/server/fetch";
import { logConfig } from "#/lib/config.server";
import { resolveAccessLogLevel } from "#/lib/observability/access";
import { createModuleLogger } from "#/lib/observability/logger";

const fallbackLog = createModuleLogger("orpc");

type ServerInterceptor = NonNullable<
	RPCHandlerOptions<Record<never, never>>["interceptors"]
>[number];

/**
 * Seed the request-scoped logger the way `LoggingHandlerPlugin` would, minus
 * the plugin. The plugin itself is deliberately NOT used (D1 decision,
 * task 07-26): its interceptors log every thrown error at error level with no
 * status classification, which both duplicates the access line below and
 * puts typed 4xx errors on the error panel — verified empirically against
 * v1.14.8 (see access-log.chain.test.ts). `getLogger(context)` still works:
 * it only reads `CONTEXT_LOGGER_SYMBOL`, so procedures and interceptors get
 * the same request-correlated child either way.
 */
export function withRequestLogger<T extends { headers: Headers }>(
	ctx: T,
): T & LoggerContext {
	const requestId = ctx.headers.get("x-request-id") ?? crypto.randomUUID();
	return Object.assign(ctx, {
		[CONTEXT_LOGGER_SYMBOL]: fallbackLog.child({ requestId }),
	});
}

/**
 * One access line per request: `requestId` (bound on the context logger by
 * `withRequestLogger`), method, path, status, durationMs. Level follows
 * `resolveAccessLogLevel`; thrown errors are classified by their `ORPCError`
 * status so a typed 4xx stays warn on the access line too. Error *detail*
 * (the `err` object) is deliberately not logged here — `serverInterceptors`
 * owns that line.
 *
 * Field surface is intentionally minimal: no headers, no body, no query
 * string (`url.pathname` only).
 */
export function createAccessLogInterceptor(
	slowThresholdMs: number = logConfig.slowThresholdMs,
): ServerInterceptor {
	return async (options) => {
		const started = performance.now();
		const log = getLogger(options.context) ?? fallbackLog;
		const method = options.request.method;
		const path = options.request.url.pathname;

		try {
			const result = await options.next();
			const durationMs = Math.round(performance.now() - started);
			// An unmatched request leaves the handler without a response; the
			// route falls back to its own 404, which is what we account it as.
			const status = result.matched ? result.response.status : 404;
			const { level, slow } = resolveAccessLogLevel({
				status,
				durationMs,
				slowThresholdMs,
			});
			log[level](
				{ status, durationMs, method, path, ...(slow && { slow: true }) },
				"request completed",
			);
			return result;
		} catch (error) {
			const durationMs = Math.round(performance.now() - started);
			const status = error instanceof ORPCError ? error.status : 500;
			const { level, slow } = resolveAccessLogLevel({
				status,
				durationMs,
				slowThresholdMs,
			});
			log[level](
				{ status, durationMs, method, path, ...(slow && { slow: true }) },
				"request failed",
			);
			throw error;
		}
	};
}
