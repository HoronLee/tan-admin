# App Config + Pino Logger + OTel Correlation

## Goal

Introduce a typed application config module and a structured Pino-based logging system with automatic OpenTelemetry trace correlation, replacing all scattered `console.*` calls at server boundaries.

## Context

- Current project uses raw `console.error` / `console.warn` / `console.log` at boundaries.
- Sentry is already initialized via `instrument.server.mjs` and fully manages the OTel TracerProvider.
- No standalone `@opentelemetry/sdk-node` should be added (would conflict with Sentry).
- Reference: `go-wind-admin` logging middleware and `servora-kit` conf.proto for config structure inspiration.

## Requirements

### Phase 1: App Config Model (`src/config/`)

- [ ] `src/config/app.ts` — App section: name, version, env, instanceId (default `os.hostname()`)
- [ ] `src/config/log.ts` — Log section: level, redact paths, slowThresholdMs, logRequestBody flag
- [ ] `src/config/telemetry.ts` — Telemetry section: enabled, samplingRatio (reads existing Sentry env)
- [ ] `src/config/index.ts` — Re-exports unified `appConfig` object
- [ ] New env vars added to `src/env.ts`: LOG_LEVEL, APP_NAME, APP_VERSION, APP_ENV, APP_INSTANCE_ID, LOG_SLOW_THRESHOLD_MS
- [ ] `src/env.ts` remains the validation boundary; config modules consume validated values

### Phase 2: Logger Foundation (`src/lib/logger.ts`)

- [ ] Install `pino`, `pino-pretty` (devDep), `@opentelemetry/api`
- [ ] Base bindings: service name, version, env, instanceId from appConfig
- [ ] Level from appConfig.log.level
- [ ] Timestamp: ISO format
- [ ] Formatters: level as string label (not number)
- [ ] Redact: authorization, cookie, set-cookie, password, token, refreshToken, accessToken, DATABASE_URL
- [ ] Mixin: extract traceId, spanId, traceFlags from `trace.getActiveSpan()` via @opentelemetry/api
- [ ] Transport: dev → pino-pretty to stdout; prod → JSON to stdout
- [ ] Export `logger` (root) and `createModuleLogger(module: string)` (child factory)

### Phase 3: Replace console.* at Boundaries

- [ ] `src/routes/api.$.ts` — oRPC `onError` interceptor: structured error log
- [ ] `src/utils/mcp-handler.ts` — MCP catch block: structured error log
- [ ] `src/routes/api/auth/$.ts` — add request-scoped logging (optional, if auth boundary exists)
- [ ] `instrument.server.mjs` — replace `console.warn` with logger for Sentry DSN warning

### Phase 4: Request-scoped Child Loggers

- [ ] In oRPC interceptor: create child logger with requestId, method, path
- [ ] In MCP handler: create child logger with requestId, protocol

## Acceptance Criteria

- [ ] `pnpm dev` shows pretty logs with service metadata (name, version, env)
- [ ] Triggering an oRPC error produces structured error log with requestId
- [ ] With Sentry DSN set, logs include trace_id and span_id fields
- [ ] Sensitive fields (authorization, cookie, password, token) show `[Redacted]`
- [ ] `pnpm build && pnpm start` outputs JSON logs
- [ ] `pnpm check` passes with no errors
- [ ] No `console.error` / `console.warn` remains at server boundaries (except seed script)

## Out of Scope

- Audit log persistence (login/API audit to database)
- Log rotation / file output config
- pino-http middleware (TanStack Start doesn't use Express/Fastify middleware model)
- Standalone OTel SDK setup (Sentry handles this)
- Frontend logging

## Technical Notes

- Sentry's `@sentry/tanstackstart-react` registers global OTel TracerProvider — do NOT add `@opentelemetry/sdk-node`
- Use pino `mixin()` for trace correlation instead of `@opentelemetry/instrumentation-pino` (ESM monkey-patch unreliable in Vite SSR)
- `#/*` import alias defined in `package.json` imports field
- All env vars must be declared in `src/env.ts` with Zod schemas
- instanceId defaults to `os.hostname()`, overridable via `APP_INSTANCE_ID`
- pretty output derived from `NODE_ENV`, not a separate config flag
