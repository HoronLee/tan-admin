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
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.string().url(),
		SEED_SUPER_ADMIN_EMAIL: z.string().email().optional(),
		SEED_SUPER_ADMIN_PASSWORD: z.string().min(8).optional(),

		// --- Tenancy / product-shape switches (R1, R2) ---
		TENANCY_MODE: z.enum(["single", "multi"]).default("single"),
		// z.coerce.boolean() treats "false" as true; use z.stringbool() instead.
		TEAM_ENABLED: z.stringbool().default(false),

		// --- Seed extras (R3) ---
		SEED_DEFAULT_ORG_NAME: z.string().default("默认组织"),
		SEED_DEFAULT_ORG_SLUG: z.string().default("default"),

		// --- Email transport (R5) ---
		EMAIL_TRANSPORT: z.enum(["console", "smtp", "resend"]).default("console"),
		EMAIL_FROM: z.string().email().default("noreply@localhost"),
		EMAIL_FROM_NAME: z.string().optional(),

		// SMTP driver
		SMTP_HOST: z.string().optional(),
		SMTP_PORT: z.coerce.number().default(465),
		SMTP_SECURE: z.stringbool().default(true),
		SMTP_USER: z.string().optional(),
		SMTP_PASS: z.string().optional(),

		// Resend driver
		RESEND_API_KEY: z.string().optional(),
	},

	/**
	 * The prefix that client-side variables must have. This is enforced both at
	 * a type-level and at runtime.
	 */
	clientPrefix: "VITE_",

	client: {
		VITE_APP_TITLE: z.string().min(1).optional(),
		VITE_APP_URL: z.string().url().optional(),
		VITE_SENTRY_DSN: z.string().url().optional(),
		// Client-visible mirror of TENANCY_MODE. Allows the frontend to gate
		// UI (e.g. disable "解散组织" in single-tenancy mode) without a loader
		// roundtrip. Keep in sync with server-side TENANCY_MODE via .env.
		VITE_TENANCY_MODE: z.enum(["single", "multi"]).default("single"),
		// Client-visible mirror of TEAM_ENABLED. Gates the Teams sidebar menu
		// and the /teams route — server-side BA plugin is the source of
		// truth, the client flag only drives UI state. Keep the two in sync
		// via .env (TEAM_ENABLED=true + VITE_TEAM_ENABLED=true).
		VITE_TEAM_ENABLED: z.stringbool().default(false),
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
		BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
		BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
		SEED_SUPER_ADMIN_EMAIL: process.env.SEED_SUPER_ADMIN_EMAIL,
		SEED_SUPER_ADMIN_PASSWORD: process.env.SEED_SUPER_ADMIN_PASSWORD,
		// Tenancy
		TENANCY_MODE: process.env.TENANCY_MODE,
		TEAM_ENABLED: process.env.TEAM_ENABLED,
		// Seed extras
		SEED_DEFAULT_ORG_NAME: process.env.SEED_DEFAULT_ORG_NAME,
		SEED_DEFAULT_ORG_SLUG: process.env.SEED_DEFAULT_ORG_SLUG,
		// Email transport
		EMAIL_TRANSPORT: process.env.EMAIL_TRANSPORT,
		EMAIL_FROM: process.env.EMAIL_FROM,
		EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
		SMTP_HOST: process.env.SMTP_HOST,
		SMTP_PORT: process.env.SMTP_PORT,
		SMTP_SECURE: process.env.SMTP_SECURE,
		SMTP_USER: process.env.SMTP_USER,
		SMTP_PASS: process.env.SMTP_PASS,
		RESEND_API_KEY: process.env.RESEND_API_KEY,
		// Client vars — Vite exposes VITE_* via import.meta.env at build time;
		// in Node.js contexts (tsx scripts, vitest) fall back to process.env.
		VITE_APP_TITLE:
			typeof import.meta.env !== "undefined"
				? import.meta.env.VITE_APP_TITLE
				: process.env.VITE_APP_TITLE,
		VITE_APP_URL:
			typeof import.meta.env !== "undefined"
				? import.meta.env.VITE_APP_URL
				: process.env.VITE_APP_URL,
		VITE_SENTRY_DSN:
			typeof import.meta.env !== "undefined"
				? import.meta.env.VITE_SENTRY_DSN
				: process.env.VITE_SENTRY_DSN,
		VITE_TENANCY_MODE:
			typeof import.meta.env !== "undefined"
				? import.meta.env.VITE_TENANCY_MODE
				: process.env.VITE_TENANCY_MODE,
		VITE_TEAM_ENABLED:
			typeof import.meta.env !== "undefined"
				? import.meta.env.VITE_TEAM_ENABLED
				: process.env.VITE_TEAM_ENABLED,
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
