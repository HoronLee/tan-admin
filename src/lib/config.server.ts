import "@tanstack/react-start/server-only";

import { hostname } from "node:os";
import type { Level } from "pino";
import { brandConfig } from "#/lib/config";
import { env } from "#/lib/env";

/**
 * Server-only configuration. Pulled by logger / email transport / email
 * templates. The `import "@tanstack/react-start/server-only"` marker ensures
 * Import Protection rejects accidental client-side imports at build time —
 * `node:os` and any future secret-touching configs must never reach the
 * browser bundle.
 *
 * Brand 字段透传 `lib/config.ts#brandConfig`，让服务端邮件渲染
 * (`appConfig.brand`) 与 UI (`<BrandMark>`) 共享同一值，杜绝 drift。
 */

const NODE_ENV_MAP: Record<string, "dev" | "prod" | "test"> = {
	development: "dev",
	production: "prod",
	test: "test",
};

export const appConfig = {
	name: env.APP_NAME ?? "tan-servora",
	version: env.APP_VERSION ?? "0.0.1",
	env: env.APP_ENV ?? NODE_ENV_MAP[process.env.NODE_ENV ?? ""] ?? "dev",
	instanceId: env.APP_INSTANCE_ID ?? hostname(),
	brand: brandConfig,
} as const;

const DEFAULT_REDACT_PATHS = [
	"req.headers.authorization",
	"req.headers.cookie",
	'req.headers["set-cookie"]',
	"password",
	"token",
	"refreshToken",
	"accessToken",
	"*.password",
	"*.token",
	"*.refreshToken",
	"*.accessToken",
];

export const logConfig = {
	level: (env.LOG_LEVEL ??
		(appConfig.env === "prod" ? "info" : "debug")) as Level,
	redactPaths: DEFAULT_REDACT_PATHS,
	slowThresholdMs: env.LOG_SLOW_THRESHOLD_MS ?? 3000,
	file: env.LOG_FILE,
	// e.g. "10m", "100m", "1g" — pino-roll size-based rotation
	maxSize: env.LOG_MAX_SIZE ?? "10m",
	maxFiles: env.LOG_MAX_FILES ?? 7,
} as const;

export const telemetryConfig = {
	enabled: !!import.meta.env?.VITE_SENTRY_DSN || !!process.env.VITE_SENTRY_DSN,
} as const;
