import "@tanstack/react-start/server-only";

import type { EventEmitter } from "node:events";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { trace } from "@opentelemetry/api";
import pino from "pino";
import { appConfig, logConfig } from "#/lib/config.server";

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

type RollingFileStream = pino.DestinationStream & EventEmitter;

/**
 * pino-roll: size/frequency-based rotation, retaining `LOG_MAX_FILES` files.
 * There is no compression — pino-roll v4 has no gzip option; compress rotated
 * files with an external logrotate if you need it.
 *
 * Every failure here must take the boot down: an operator who asked for file
 * output and silently got stdout has no way to notice. Two failure shapes need
 * covering, and only one of them is caught by `await` alone — option
 * validation rejects the promise, while filesystem errors (EACCES on the
 * directory, ENOENT on the path) resolve successfully under `sync: false` and
 * surface later as an `error` event. The ready/error race is what makes the
 * second kind fatal at boot rather than mid-request.
 */
async function buildFileStream(
	require: NodeJS.Require,
	file: string,
): Promise<RollingFileStream> {
	const pinoRoll = require("pino-roll") as (
		opts: object,
	) => Promise<RollingFileStream>;

	// pino-roll writes its `current.log` symlink synchronously right after
	// constructing the stream, while SonicBoom's own `mkdir` is async under
	// `sync: false` — on a fresh deployment the symlink loses that race and
	// throws ENOENT. Creating the directory here removes the race, and turns an
	// unwritable path into a clear failure at this line rather than an lstat
	// error from inside the rotation code.
	mkdirSync(dirname(file), { recursive: true });

	const fileStream = await pinoRoll({
		file,
		size: logConfig.maxSize,
		frequency: "daily",
		mkdir: true,
		symlink: true,
		limit: { count: logConfig.maxFiles },
		dateFormat: "yyyy-MM-dd",
		sync: false,
	});

	await new Promise<void>((resolve, reject) => {
		fileStream.once("ready", () => resolve());
		fileStream.once("error", reject);
	});

	// Stays attached for the lifetime of the stream. pino only registers an
	// error listener on streams it built itself, so a rotation or fd failure on
	// this one would be an unhandled 'error' event and kill the process. The
	// logger can't report it — this stream is where the logger writes.
	fileStream.on("error", (err: Error) => {
		process.stderr.write(`[pino-roll] log file stream error: ${err.message}\n`);
	});

	return fileStream;
}

// Vite SSR can't reliably spawn the worker thread that pino's `transport`
// option requires, so we use createRequire to load CJS packages synchronously
// (pino-pretty) or with top-level await (pino-roll).
async function buildStream(): Promise<pino.DestinationStream> {
	const require = createRequire(import.meta.url);

	if (isDev) {
		// Dev: colorized single-line pretty output to stdout. The fallback here is
		// a dev-convenience thing, not a production correctness one.
		try {
			const pretty = require("pino-pretty") as (
				opts: object,
			) => pino.DestinationStream;
			return pretty({
				colorize: true,
				translateTime: "SYS:HH:MM:ss.l",
				ignore: "pid,hostname,service,instanceId",
				sync: true,
				singleLine: true,
			});
		} catch {
			return pino.destination(1);
		}
	}

	if (logConfig.output === "stdout") {
		return pino.destination(1);
	}

	if (!logConfig.file) {
		// Unreachable: resolveLogOutput() rejects this combination at boot. Kept
		// so the narrowing below is real rather than asserted.
		throw new Error(
			"LOG_FILE is required when LOG_OUTPUT enables file output.",
		);
	}

	const fileStream = await buildFileStream(require, logConfig.file);

	if (logConfig.output === "file") {
		return fileStream;
	}

	return pino.multistream([
		{ stream: pino.destination(1), level: logConfig.level },
		{ stream: fileStream, level: logConfig.level },
	]);
}

/**
 * Exported because shutdown needs the destination directly: `logger.flush()`
 * is a silent no-op on a multistream (pino delegates to the stream, and
 * multistream has `flushSync`/`end` but no `flush`). See
 * `#/lib/observability/shutdown`.
 */
// Top-level await (ESM) — ensures stream is ready before any log call
export const logStream: pino.DestinationStream = await buildStream();

export const logger = pino(pinoOptions, logStream);

if (logConfig.fileIgnored) {
	logger.warn(
		"LOG_FILE is set but LOG_OUTPUT resolves to stdout — file output is disabled. Set LOG_OUTPUT=file or LOG_OUTPUT=both to enable it.",
	);
}

export function createModuleLogger(module: string) {
	return logger.child({ module });
}
