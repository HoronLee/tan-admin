import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		SERVER_URL: z.string().url().optional(),
		APP_NAME: z.string().min(1).optional(),
		APP_VERSION: z.string().min(1).optional(),
		APP_ENV: z.enum(["dev", "prod", "test"]).optional(),
		APP_INSTANCE_ID: z.string().min(1).optional(),
		LOG_LEVEL: z
			.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
			.optional(),
		LOG_SLOW_THRESHOLD_MS: z.coerce.number().int().positive().optional(),
		LOG_FILE: z.string().min(1).optional(),
		LOG_MAX_SIZE: z.string().min(1).optional(),
		LOG_MAX_FILES: z.coerce.number().int().positive().optional(),
	},

	/**
	 * The prefix that client-side variables must have. This is enforced both at
	 * a type-level and at runtime.
	 */
	clientPrefix: "VITE_",

	client: {
		VITE_APP_TITLE: z.string().min(1).optional(),
	},

	/**
	 * What object holds the environment variables at runtime. This is usually
	 * `process.env` or `import.meta.env`.
	 *
	 * Server-side vars (no VITE_ prefix) are only available in `process.env` in
	 * Vite — `import.meta.env` only exposes VITE_* prefixed vars to avoid
	 * leaking secrets to the client bundle.
	 */
	runtimeEnv: {
		// Server vars — read from process.env
		SERVER_URL: process.env.SERVER_URL,
		APP_NAME: process.env.APP_NAME,
		APP_VERSION: process.env.APP_VERSION,
		APP_ENV: process.env.APP_ENV,
		APP_INSTANCE_ID: process.env.APP_INSTANCE_ID,
		LOG_LEVEL: process.env.LOG_LEVEL,
		LOG_SLOW_THRESHOLD_MS: process.env.LOG_SLOW_THRESHOLD_MS,
		LOG_FILE: process.env.LOG_FILE,
		LOG_MAX_SIZE: process.env.LOG_MAX_SIZE,
		LOG_MAX_FILES: process.env.LOG_MAX_FILES,
		// Client vars — read from import.meta.env (Vite injects VITE_* only)
		VITE_APP_TITLE: import.meta.env.VITE_APP_TITLE,
	},

	/**
	 * By default, this library will feed the environment variables directly to
	 * the Zod validator.
	 *
	 * This means that if you have an empty string for a value that is supposed
	 * to be a number (e.g. `PORT=` in a ".env" file), Zod will incorrectly flag
	 * it as a type mismatch violation. Additionally, if you have an empty string
	 * for a value that is supposed to be a string with a default value (e.g.
	 * `DOMAIN=` in an ".env" file), the default value will never be applied.
	 *
	 * In order to solve these issues, we recommend that all new projects
	 * explicitly specify this option as true.
	 */
	emptyStringAsUndefined: true,
});
