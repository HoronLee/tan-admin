# Logging Guidelines

> Structured server-side logging contract for TanStack Start + Vite SSR.

---

## Overview

Backend logging is now standardized on `pino` via `src/lib/logger.ts`.

### Default rules

- Use `createModuleLogger("module-name")` in server modules.
- Prefer structured fields (`{ err, title, requestId }`) over string concatenation.
- Dev mode (`APP_ENV=dev`) uses single-line colorized stdout via `pino-pretty`.
- Prod mode (`APP_ENV=prod`) uses JSON to stdout and optional rotating file output via `pino-roll` when `LOG_FILE` is set.
- Base log metadata is intentionally minimal: `service` and `instanceId` only.
- Do **not** attach `version` and `env` to every line unless a specific incident requires it.

### Allowed exception

`instrument.server.mjs` may still use `console.warn` during very early bootstrap when the logger is not yet safe to initialize.

---

## Scenario: Structured Pino logging in Vite SSR backend

### 1. Scope / Trigger

Use this contract when changing any of the following:

- server boundary logging in route handlers, oRPC, MCP, or auth
- logger transport behavior for dev/prod
- env wiring for logging config
- trace correlation with Sentry / OpenTelemetry

### 2. Signatures

```ts
export const logger = pino(pinoOptions, await buildStream());

export function createModuleLogger(module: string) {
  return logger.child({ module });
}
```

Better Auth integration must bridge into the shared logger:

```ts
logger: {
  log(level, message, ...args) {
    // route Better Auth events into the module logger
  },
}
```

Boundary handlers should log caught failures with structured error payloads:

```ts
log.error({ err: error }, "oRPC handler error");
log.error({ err: error }, "MCP handler error");
```

### 3. Contracts

#### Env contract

All logging env keys must be declared in `src/env.ts` and validated with Zod:

- `APP_NAME?: string`
- `APP_ENV?: "dev" | "prod" | "test"`
- `APP_INSTANCE_ID?: string`
- `LOG_LEVEL?: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent"`
- `LOG_FILE?: string`
- `LOG_MAX_SIZE?: string`
- `LOG_MAX_FILES?: number`

#### Runtime contract

- Non-`VITE_` server vars must be read from `process.env`.
- `import.meta.env` is only valid for `VITE_*` values on the client/Vite boundary.
- `appConfig.env` maps runtime into the project enum: `dev`, `prod`, `test`.

#### Output contract

Each normal server log line should contain:

- `level`
- `time`
- `msg`
- `service`
- `instanceId`
- `module` when using a child logger
- `traceId`, `spanId`, `traceFlags` when an active span exists

Sensitive values must be redacted to `[Redacted]`.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|---|---|
| `APP_ENV` invalid | env parsing fails at startup |
| `LOG_FILE` unset | log to stdout only |
| `LOG_FILE` set in prod | stdout JSON + rotating file logs |
| no active OTel span | omit trace fields gracefully |
| missing `VITE_SENTRY_DSN` | warn once during bootstrap; app continues |
| raw token/cookie/password included in meta | logger redact layer must mask it |
| server env read from `import.meta.env` | treat as bug; move to `process.env` mapping in `src/env.ts` |

### 5. Good / Base / Bad Cases

#### Good

```ts
const log = createModuleLogger("orpc");
log.error({ err: error }, "oRPC handler error");
```

#### Base

```ts
const log = createModuleLogger("demo:prisma");
log.debug("getTodos called");
```

#### Bad

```ts
console.error(error);
console.log("env=%s version=%s", env, version);
log.info({ headers: request.headers }, "request received");
```

Why bad:
- loses structure and redaction guarantees
- adds noisy metadata to every line
- may leak secrets / cookies / auth headers

### 6. Tests Required

Required verification for logging changes:

1. **Dev output**
   - Run `pnpm dev`
   - Assert logs are colorized and single-line in `APP_ENV=dev`

2. **Prod output**
   - Set `APP_ENV=prod` and `LOG_FILE=logs/app.log`
   - Assert terminal output is JSON
   - Assert rotating file output is created under `logs/` with `current.log` symlink

3. **Boundary error path**
   - Trigger one oRPC or MCP error
   - Assert the log line contains `module` and structured `err`

4. **Auth integration**
   - Trigger one Better Auth action
   - Assert the `better-auth` module logger writes through the shared logger

5. **Trace correlation**
   - With Sentry/OTel active, assert `traceId` / `spanId` fields appear

### 7. Wrong vs Correct

#### Wrong

```ts
runtimeEnv: import.meta.env

const transport = pino.transport({
  target: "pino-pretty",
});
```

#### Correct

```ts
runtimeEnv: {
  APP_ENV: process.env.APP_ENV,
  LOG_FILE: process.env.LOG_FILE,
  VITE_APP_TITLE: import.meta.env.VITE_APP_TITLE,
}

const pretty = require("pino-pretty");
export const logger = pino(pinoOptions, await buildStream());
```

Why correct:
- server envs resolve reliably in Vite SSR
- stream initialization happens before the logger is exported
- transport behavior matches the actual runtime model

---

## Redaction Rules

Always redact or avoid logging these fields:

- `authorization`
- `cookie`
- `set-cookie`
- `password`
- `token`
- `refreshToken`
- `accessToken`
- `DATABASE_URL`

Do not attach full request headers or full auth/session objects unless they are explicitly sanitized first.
