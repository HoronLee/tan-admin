const sentryDsn = import.meta.env?.VITE_SENTRY_DSN ?? process.env.VITE_SENTRY_DSN
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()
const otelDisabled = /^(1|true)$/i.test(process.env.OTEL_SDK_DISABLED ?? '')

// Both SDKs install a global OpenTelemetry provider. Running them independently
// would silently drop spans from one side, so keep the existing Sentry provider
// when both are configured and require an explicit deployment choice.
const startOtel = Boolean(otlpEndpoint) && !otelDisabled && !sentryDsn

// Do not register @opentelemetry/instrumentation/hook.mjs here. It rewrites
// Nitro's bundled ESM handler and makes valid requests resolve to undefined.
// Node's HTTP instrumentation still creates inbound spans without that hook.

if (sentryDsn) {
  const Sentry = await import('@sentry/tanstackstart-react')
  Sentry.init({
    dsn: sentryDsn,
    // Adds request headers and IP for users, for more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/configuration/options/#sendDefaultPii
    sendDefaultPii: true,
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 1.0,
    replaysOnErrorSampleRate: 1.0,
  })
}

if (otlpEndpoint && sentryDsn) {
  console.warn(
    '[observability] VITE_SENTRY_DSN and OTEL_EXPORTER_OTLP_ENDPOINT are both set; Sentry tracing takes precedence and the standalone OpenTelemetry NodeSDK is disabled.',
  )
}

if (startOtel) {
  await import('./otel.server.mjs')
}
