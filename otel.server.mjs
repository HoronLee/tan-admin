const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()
const sdkDisabled = /^(1|true)$/i.test(process.env.OTEL_SDK_DISABLED ?? '')

if (endpoint && !sdkDisabled) {
  // Business logs stay on pino. NodeSDK otherwise enables the OTLP logs signal
  // by default when an OTLP endpoint exists, which is outside this rollout.
  process.env.OTEL_LOGS_EXPORTER = 'none'

  const [{ NodeSDK, resources }, { getNodeAutoInstrumentations }] =
    await Promise.all([
      import('@opentelemetry/sdk-node'),
      import('@opentelemetry/auto-instrumentations-node'),
    ])

  const resource = resources.defaultResource().merge(
    resources.resourceFromAttributes({
      ...(process.env.APP_VERSION && {
        'service.version': process.env.APP_VERSION,
      }),
      ...(process.env.APP_ENV && {
        'deployment.environment.name': process.env.APP_ENV,
      }),
    }),
  )

  const sdk = new NodeSDK({
    resource,
    serviceName:
      process.env.OTEL_SERVICE_NAME ?? process.env.APP_NAME ?? 'tan-servora',
    instrumentations: [
      getNodeAutoInstrumentations({
        // logger.ts already injects active trace/span fields through its pino
        // mixin. Enabling this instrumentation would duplicate those fields.
        '@opentelemetry/instrumentation-pino': { enabled: false },
      }),
    ],
  })

  sdk.start()

  let shutdownPromise
  globalThis.__otelShutdown = () => {
    shutdownPromise ??= sdk.shutdown()
    return shutdownPromise
  }
}
