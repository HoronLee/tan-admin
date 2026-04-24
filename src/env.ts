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

		// --- Product-shape switch (server + client single source) ---
		// `private` = 甲方交付 / 私有化部署（seed 默认组织 + 自动加入，禁止自建 org）
		// `saas`    = 公开 B2B SaaS workspace 模型（Slack / Notion / Linear 型）
		// 只影响产品交付形态，不影响隔离模型——底层始终是 BA organization 的
		// multi-workspace（shared tables + organizationId 过滤）。真·多租户
		// （schema/DB 隔离）不在本项目范畴。详见 spec/backend/product-modes.md。
		//
		// 为啥挂在 `client` / 用 VITE_ 前缀？前后端都要读这个值（服务端鉴权 +
		// 客户端 UI 门控）。Vite 只内联 `VITE_*` 进浏览器 bundle，Node 进程
		// 照样能 `process.env.VITE_*`。比双份（PRODUCT_MODE + VITE_PRODUCT_MODE）
		// 少一处 drift 风险——值本身也不是 secret，暴露无害。
		VITE_PRODUCT_MODE: z.enum(["private", "saas"]).default("private"),

		// --- Brand (R6) — same single-source pattern as VITE_PRODUCT_MODE ---
		// 品牌显示名与 logo URL 是 100% 公开信息，一份 VITE_ 前缀走天下。
		VITE_BRAND_NAME: z.string().min(1).optional(),
		VITE_BRAND_LOGO_URL: z.string().url().optional(),
		VITE_BRAND_LOGO_DARK_URL: z.string().url().optional(),
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
		VITE_PRODUCT_MODE:
			typeof import.meta.env !== "undefined"
				? import.meta.env.VITE_PRODUCT_MODE
				: process.env.VITE_PRODUCT_MODE,
		VITE_BRAND_NAME:
			typeof import.meta.env !== "undefined"
				? import.meta.env.VITE_BRAND_NAME
				: process.env.VITE_BRAND_NAME,
		VITE_BRAND_LOGO_URL:
			typeof import.meta.env !== "undefined"
				? import.meta.env.VITE_BRAND_LOGO_URL
				: process.env.VITE_BRAND_LOGO_URL,
		VITE_BRAND_LOGO_DARK_URL:
			typeof import.meta.env !== "undefined"
				? import.meta.env.VITE_BRAND_LOGO_DARK_URL
				: process.env.VITE_BRAND_LOGO_DARK_URL,
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
