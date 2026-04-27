/**
 * Logging-related TanStack Start `createMiddleware` units (server functions).
 *
 * Currently empty: structured error logging for server fns is co-located in
 * `./error.ts` (`serverFnErrorMiddleware`) because it shares state with the
 * Sentry capture + DB-unavailable fail-fast path. Pure success-path access
 * logging (latency, args summary) is not yet in scope; if added, define a
 * dedicated middleware here and chain it via `createStart` in
 * `src/start.ts`.
 *
 * Logger factory: `src/lib/observability/logger.ts#createModuleLogger`.
 */

export {};
