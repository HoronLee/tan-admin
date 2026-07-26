/**
 * Access-log level policy, shared by the oRPC handler interceptor and the
 * server-function middleware so both boundaries classify identically.
 *
 * Mirrors the spec "Log level rule": client-state responses (4xx) are warn,
 * service faults (5xx) are error. A slow-but-successful request is escalated
 * to warn — never demoted — so latency regressions surface on the same panel
 * as client errors without polluting the error panel.
 */

export type AccessLogLevel = "info" | "warn" | "error";

export interface AccessLogClass {
	level: AccessLogLevel;
	slow: boolean;
}

export function resolveAccessLogLevel(input: {
	status: number;
	durationMs: number;
	slowThresholdMs: number;
}): AccessLogClass {
	const slow = input.durationMs > input.slowThresholdMs;

	if (input.status >= 500) return { level: "error", slow };
	if (input.status >= 400) return { level: "warn", slow };
	return { level: slow ? "warn" : "info", slow };
}
