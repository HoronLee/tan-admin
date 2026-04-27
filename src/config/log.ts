import type { Level } from "pino";
import { appConfig } from "#/config/app";
import { env } from "#/lib/env";

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
