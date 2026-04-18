# Logging Guidelines

> Current backend logging behavior and guardrails.

---

## Overview

There is no structured logger package yet. Logging currently uses:

- `console.error` / `console.warn` / `console.log`
- Sentry server instrumentation via `instrument.server.mjs`

## Current Log Levels in Practice

- `console.error`: request/handler failures and seed failures.
- `console.warn`: degraded startup (for missing optional Sentry DSN).
- `console.log`: non-request script progress (seed script).

### Evidence

Source: `src/routes/api.$.ts:15-17`, `src/utils/mcp-handler.ts:40`, `prisma/seed.ts:30-31`.

```ts
console.error(error)
console.error('MCP handler error:', error)
console.error("❌ Error seeding database:", e)
```

Source: `instrument.server.mjs:5-7` and `prisma/seed.ts:12,26`.

```ts
if (!sentryDsn) {
  console.warn('VITE_SENTRY_DSN is not defined. Sentry is not running.')
}
console.log("🌱 Seeding database...")
console.log(`✅ Created ${todos.count} todos`)
```

## Sentry Initialization Contract

Server error telemetry depends on startup preload flags and `instrument.server.mjs` initialization.

### Evidence

Source: startup script wiring in `package.json:9,16`.

```json
"dev": "... NODE_OPTIONS='--import ./instrument.server.mjs' ...",
"start": "node --import ./.output/server/instrument.server.mjs .output/server/index.mjs"
```

Source: Sentry config in `instrument.server.mjs:8-16`.

```js
Sentry.init({
  dsn: sentryDsn,
  sendDefaultPii: true,
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,
})
```

## Dev Defaults vs Production Tuning

Current Sentry sampling and PII settings are permissive for development visibility. Before production rollout, lower sample rates and review `sendDefaultPii` policy.

### Evidence

Source: `instrument.server.mjs:12-15`.

```js
sendDefaultPii: true,
tracesSampleRate: 1.0,
replaysSessionSampleRate: 1.0,
replaysOnErrorSampleRate: 1.0,
```

## Request Context and Correlation

oRPC server-side client wiring already passes request headers in context. When a structured logger is introduced, attach request ID/user info from this context (with redaction).

### Evidence

Source: `src/orpc/client.ts:15-17`.

```ts
context: () => ({
  headers: getRequestHeaders(),
}),
```

## What to Log

- Boundary failures (HTTP handlers, MCP dispatch, auth failures).
- DB write/read failures and migration/seed script failures.
- Startup degradation warnings.

### Evidence

Source: boundary error logs in `src/routes/api.$.ts`, `src/utils/mcp-handler.ts`, and seed script logs in `prisma/seed.ts`.

## What NOT to Log

Do not log:

- `DATABASE_URL`
- Auth cookies / bearer tokens / session tokens
- Raw password fields
- Full user objects containing PII

### Evidence

Source: secrets originate from env and auth flows: `src/db.ts:6`, `src/routes/api.$.ts:34-40`, `src/lib/auth.ts:5-8`.

```ts
connectionString: process.env.DATABASE_URL!
securitySchemes: {
  bearerAuth: { type: 'http', scheme: 'bearer' },
}
emailAndPassword: { enabled: true }
```

## Recommended Next Step

Adopt a structured logger (`pino` or `consola`) and inject per-request child loggers via oRPC interceptors. Until then, keep `console.*` usage scoped and explicit.

### Evidence

Source: existing centralized interceptor entry `src/routes/api.$.ts:14-18` is the natural hook point.

```ts
interceptors: [
  onError((error) => {
    console.error(error)
  }),
],
```
