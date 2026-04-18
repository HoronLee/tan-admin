export const telemetryConfig = {
	enabled: !!import.meta.env?.VITE_SENTRY_DSN || !!process.env.VITE_SENTRY_DSN,
} as const;
