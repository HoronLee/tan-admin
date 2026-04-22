# Logging Guidelines

> Structured server-side logging contract for TanStack Start + Vite SSR.

---

## Overview

Backend logging standardized on `pino` via `src/lib/logger.ts`.

- Use `createModuleLogger("module-name")` in server modules.
- Prefer structured fields (`{ err, title, requestId }`) over string concatenation.
- `APP_ENV=dev` → single-line colorized stdout via `pino-pretty`.
- `APP_ENV=prod` → JSON to stdout + optional rotating file via `pino-roll` when `LOG_FILE` is set.
- Base metadata intentionally minimal: `service` and `instanceId` only. Do **not** attach `version` / `env` to every line.

**Allowed exception**: `instrument.server.mjs` may use `console.warn` during early bootstrap when the logger isn't yet safe to initialize.

---

## Scenario: Structured Pino logging in Vite SSR backend

### 1. Scope / Trigger

When changing: server boundary logging (route handlers / oRPC / MCP / auth) · logger transport for dev/prod · env wiring for logging config · trace correlation with Sentry/OTel.

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

Boundary handlers log caught failures with structured error payloads:

```ts
log.error({ err: error }, "oRPC handler error");
log.error({ err: error }, "MCP handler error");
```

### 3. Contracts

#### Env contract

All logging env keys declared in `src/env.ts` + validated with Zod:

- `APP_NAME?: string`
- `APP_ENV?: "dev" | "prod" | "test"`
- `APP_INSTANCE_ID?: string`
- `LOG_LEVEL?: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent"`
- `LOG_FILE?: string`
- `LOG_MAX_SIZE?: string`
- `LOG_MAX_FILES?: number`

#### Runtime contract

- Non-`VITE_` server vars must be read from `process.env`.
- `import.meta.env` is only valid for `VITE_*` on the client/Vite boundary.
- `appConfig.env` maps runtime into the project enum: `dev`, `prod`, `test`.

#### Output contract

Each normal server log line contains: `level`, `time`, `msg`, `service`, `instanceId`, `module` (when child logger), `traceId`/`spanId`/`traceFlags` (when active span).

Sensitive values must be redacted to `[Redacted]`.

### 4. Validation Matrix

| Condition | Expected |
|---|---|
| `APP_ENV` invalid | env parsing fails at startup |
| `LOG_FILE` unset | stdout only |
| `LOG_FILE` set in prod | stdout JSON + rotating file |
| No active OTel span | trace fields omitted gracefully |
| Missing `VITE_SENTRY_DSN` | warn once during bootstrap; app continues |
| Raw token/cookie/password in meta | logger redact layer masks it |
| Server env read from `import.meta.env` | treat as bug; move to `process.env` mapping in `src/env.ts` |

### 5. Good / Bad Cases

```ts
// ✅ Structured error with module logger
const log = createModuleLogger("orpc");
log.error({ err: error }, "oRPC handler error");

// ✅ Debug with module context
const log = createModuleLogger("demo:prisma");
log.debug("getTodos called");

// ❌ Unstructured / leaky
console.error(error);                             // no structure, no redaction
console.log("env=%s version=%s", env, version);  // noisy metadata
log.info({ headers: request.headers }, "request received");  // leaks cookies/auth
```

### 6. Tests Required

1. **Dev output**: `pnpm dev` → logs colorized and single-line when `APP_ENV=dev`.
2. **Prod output**: `APP_ENV=prod` + `LOG_FILE=logs/app.log` → stdout JSON + rotating file under `logs/` with `current.log` symlink.
3. **Boundary error path**: trigger one oRPC/MCP error → log line contains `module` and structured `err`.
4. **Auth integration**: trigger a BA action → `better-auth` module logger writes through shared logger.
5. **Trace correlation**: with Sentry/OTel active → `traceId` / `spanId` fields appear.

### 7. Wrong vs Correct

```ts
// ❌ runtimeEnv: import.meta.env — server vars won't resolve in Vite SSR
runtimeEnv: import.meta.env

// ❌ transport without pre-initialized stream
const transport = pino.transport({ target: "pino-pretty" });

// ✅ Per-var mapping with server/client split
runtimeEnv: {
  APP_ENV:        process.env.APP_ENV,
  LOG_FILE:       process.env.LOG_FILE,
  VITE_APP_TITLE: import.meta.env.VITE_APP_TITLE,
}

// ✅ Stream initialized before logger exported
const pretty = require("pino-pretty");
export const logger = pino(pinoOptions, await buildStream());
```

Why correct: server envs resolve reliably in Vite SSR; stream initialization happens before the logger is exported; transport behavior matches actual runtime model.

---

## Redaction Rules

Always redact or avoid logging:

- `authorization`
- `cookie` / `set-cookie`
- `password`
- `token` / `refreshToken` / `accessToken`
- `DATABASE_URL`

Do not attach full request headers or full auth/session objects unless explicitly sanitized first.
