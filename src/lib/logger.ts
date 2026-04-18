import { createRequire } from "node:module";
import { trace } from "@opentelemetry/api";
import pino from "pino";
import { appConfig } from "#/config/app";
import { logConfig } from "#/config/log";

const isDev = appConfig.env === "dev";

const pinoOptions: pino.LoggerOptions = {
	level: logConfig.level,

	base: {
		service: appConfig.name,
		instanceId: appConfig.instanceId,
	},

	timestamp: pino.stdTimeFunctions.isoTime,

	formatters: {
		level(label) {
			return { level: label };
		},
	},

	redact: {
		paths: [...logConfig.redactPaths],
		censor: "[Redacted]",
	},

	mixin() {
		const span = trace.getActiveSpan();
		if (span) {
			const ctx = span.spanContext();
			return {
				traceId: ctx.traceId,
				spanId: ctx.spanId,
				traceFlags: ctx.traceFlags,
			};
		}
		return {};
	},
};

// Vite SSR can't reliably spawn the worker thread that pino's `transport`
// option requires, so we use createRequire to load CJS packages synchronously
// (pino-pretty) or with top-level await (pino-roll).
async function buildStream(): Promise<pino.DestinationStream> {
	const require = createRequire(import.meta.url);

	if (isDev) {
		// Dev: colorized single-line pretty output to stdout
		try {
			const pretty = require("pino-pretty") as (
				opts: object,
			) => pino.DestinationStream;
			return pretty({
				colorize: true,
				translateTime: "SYS:HH:MM:ss.l",
				ignore: "pid,hostname",
				sync: true,
				singleLine: true,
			});
		} catch {
			return pino.destination(1);
		}
	}

	// Prod: always write JSON to stdout; optionally also write to rotating file
	if (!logConfig.file) {
		return pino.destination(1);
	}

	// pino-roll: size/frequency-based rotation + retain N files + gzip
	try {
		const pinoRoll = require("pino-roll") as (
			opts: object,
		) => Promise<pino.DestinationStream>;
		const fileStream = await pinoRoll({
			file: logConfig.file,
			size: logConfig.maxSize,
			frequency: "daily",
			mkdir: true,
			symlink: true,
			limit: { count: logConfig.maxFiles },
			dateFormat: "yyyy-MM-dd",
			sync: false,
		});
		// multistream: stdout (JSON) + rotating file
		return pino.multistream([
			{ stream: pino.destination(1), level: logConfig.level },
			{ stream: fileStream, level: logConfig.level },
		]);
	} catch {
		return pino.destination(1);
	}
}

// Top-level await (ESM) — ensures stream is ready before any log call
export const logger = pino(pinoOptions, await buildStream());

export function createModuleLogger(module: string) {
	return logger.child({ module });
}
