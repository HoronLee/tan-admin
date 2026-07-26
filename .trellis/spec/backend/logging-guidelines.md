# Logging Guidelines

> Structured server-side logging contract for TanStack Start + Vite SSR.

---

## Overview

Backend logging standardized on `pino` via `src/lib/observability/logger.ts`.

- Use `createModuleLogger("module-name")` in server modules.
- Prefer structured fields (`{ err, title, requestId }`) over string concatenation.
- `APP_ENV=dev` → single-line colorized stdout via `pino-pretty`.
- `APP_ENV=prod` → JSON；`LOG_OUTPUT=stdout|file|both` 显式选择 stdout / `pino-roll` 文件 / 双写。
- Base metadata intentionally minimal: `service` and `instanceId` only. Do **not** attach `version` / `env` to every line.

**Allowed exception**: `instrument.server.mjs` may use `console.warn` during early bootstrap when the logger isn't yet safe to initialize.

---

## Scenario: Structured Pino logging in Vite SSR backend

### 1. Scope / Trigger

When changing: server boundary logging (route handlers / oRPC / MCP / auth) · logger transport for dev/prod · env wiring for logging config · trace correlation with Sentry/OTel.

### 2. Signatures

```ts
export const logStream = await buildStream();
export const logger = pino(pinoOptions, logStream);

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

Boundary handlers log caught failures with structured error payloads.

**Log level rule**：按 error 类型分级，**不要**所有 caught error 都 `log.error`：

- **typed 4xx**（`ORPCError.defined === true && 400 ≤ status < 500`，如 `UNAUTHORIZED` / `FORBIDDEN` / `NOT_FOUND` / 自定 business error）—— `log.warn`。这些是客户端状态问题（过期 cookie、缺权限、查不到资源），可诊断但**不是服务故障**，污染 ERROR 面板会淹没真故障。
- **未 typed error / 5xx / 运行时崩溃** —— `log.error` + Sentry 上报。真服务故障。

```ts
// ✅ 分级
const isExpectedClientError =
  error instanceof ORPCError &&
  error.defined === true &&
  error.status >= 400 &&
  error.status < 500;
if (isExpectedClientError) {
  log.warn({ err: error }, "oRPC handler error");
} else {
  log.error({ err: error }, "oRPC handler error");
  Sentry.captureException(error);
}
```

### 3. Contracts

#### Env contract

All logging env keys declared in `src/lib/env.ts` + validated with Zod:

- `APP_NAME?: string`
- `APP_ENV?: "dev" | "prod" | "test"`
- `APP_INSTANCE_ID?: string`
- `LOG_LEVEL?: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent"`
- `LOG_OUTPUT?: "stdout" | "file" | "both"`
- `LOG_FILE?: string`
- `LOG_MAX_SIZE?: string`
- `LOG_MAX_FILES?: number`
- `LOG_SLOW_THRESHOLD_MS?: number`
- `OTEL_EXPORTER_OTLP_ENDPOINT?: URL`
- `OTEL_SDK_DISABLED?: boolean`
- `OTEL_SERVICE_NAME?: string`
- 标准 exporter / sampler 变量：`OTEL_EXPORTER_OTLP_PROTOCOL`、`OTEL_TRACES_EXPORTER`、`OTEL_METRICS_EXPORTER`、`OTEL_TRACES_SAMPLER`、`OTEL_TRACES_SAMPLER_ARG`

#### Runtime contract

- Non-`VITE_` server vars must be read from `process.env`.
- `import.meta.env` is only valid for `VITE_*` on the client/Vite boundary.
- `appConfig.env` maps runtime into the project enum: `dev`, `prod`, `test`.

#### Output contract

Each normal server log line contains: `level`, `time`, `msg`, `service`, `instanceId`, `module` (when child logger), `traceId`/`spanId`/`traceFlags` (when active span).

Sensitive values must be redacted to `[Redacted]`.

#### Access-log contract

- Outermost `src/server.ts` preserves an inbound `x-request-id` or generates one, injects it into the downstream `Request`, and echoes it on the response.
- `RPCHandler` and `OpenAPIHandler` bind that id through `CONTEXT_LOGGER_SYMBOL`; `getLogger(context)` returns the request child.
- Every access line contains only `requestId`, `method`, `path`, `status`, `durationMs`, `module`, and optional `slow`. Query strings, headers, bodies, and secrets are forbidden.
- Status mapping: `<400` info, `4xx` warn, `5xx` error. A successful request above `LOG_SLOW_THRESHOLD_MS` escalates to warn.
- `LoggingHandlerPlugin` is intentionally not instantiated with oRPC 1.14.8: its thrown-error interceptors emit unconditional error lines, duplicating access/error lines and misclassifying typed 4xx. The official `CONTEXT_LOGGER_SYMBOL` / `getLogger` context API remains in use.
- TanStack server functions use `serverFnAccessMiddleware` outside `serverFnErrorMiddleware`: every success or failure gets one bounded access line; error detail and Sentry capture remain owned by the inner error middleware, which carries the same `requestId`.

#### Output and shutdown contract

- `LOG_OUTPUT` is the only file-output switch; default is `stdout`. `LOG_FILE` alone is ignored with one boot warning.
- `file|both` requires `LOG_FILE`; validation, filesystem, or `pino-roll` ready errors fail bootstrap. stdout mode never touches a log directory.
- `pino-roll` v4 does not gzip. Use external rotation/compression when required.
- Keep `logStream`: pino v10 has no `pino.final()`, and `logger.flush(cb)` is a silent no-op for `pino.multistream()` because it has no async `flush` method.
- Shutdown order is `NodeSDK.shutdown()` (2 s guard) → `Sentry.flush(2000)` → stream `flushSync()` + `end()` → exit. SIGTERM, SIGINT, and DB-unavailable fail-fast reuse this path.
- `src/lib/db.ts` must explicitly route missing configuration / `$connect()` rejection through the process-wide database fatal helper. Nitro may catch a lazy SSR module's top-level rejection and return HTTP 500, so an uncaught `await db.$connect()` alone is not fail-fast.
- Bootstrap DB failures may occur before TanStack's request `AsyncLocalStorage` exists. Their `requestId` is therefore best-effort and may be absent; keep `phase="bootstrap"` as the stable discriminator. Runtime server-function DB failures must pass the current request ID explicitly. Never use a process-global "current request ID" fallback because concurrent requests would cross-contaminate logs.

#### OpenTelemetry contract

- Repo-root `instrument.server.mjs` dynamically initializes sibling `otel.server.mjs` before the Nitro app, but **must not** call `register("@opentelemetry/instrumentation/hook.mjs")`: the loader hook breaks Nitro route handling. Production starts with `node --import ./instrument.server.mjs .output/server/index.mjs`; no direct hook-only dependency is required.
- The standalone NodeSDK starts only when `OTEL_EXPORTER_OTLP_ENDPOINT` is non-empty and `OTEL_SDK_DISABLED` is false. No endpoint means no SDK or exporter retry noise.
- Traces and metrics use standard `OTEL_*` exporter/sampler configuration. OTel logs are forced off; Pino remains the only business-log pipeline and injects the active `traceId` / `spanId` through its mixin.
- Sentry and the standalone SDK both own the global tracer provider. When both DSN and OTLP endpoint are set, Sentry tracing wins, standalone NodeSDK stays disabled, and bootstrap emits one warning.
- Production uses Nitro's official `node-server` artifact at `.output/server/index.mjs`. Empirical evidence: ESM hook present → `/api/spec` 500 even with auto instrumentations disabled; hook absent with full NodeSDK/auto → 200, correlated Pino IDs, and a 2183-byte `/v1/traces` export through Node core HTTP instrumentation. Nitro copies `pg` / `nodemailer` into `.output/server/_libs`, so library-level coverage still needs a collector-backed DB/mail smoke. Build reports a host target (currently `darwin-arm64`); build for the deployment platform.
- `nitro()` is a production/preview adapter and must be excluded while Vitest loads the shared Vite config (`!process.env.VITEST && nitro()`). Loading it in Vitest can evaluate CommonJS React through Nitro's ESM runner and leave Nitro handles open after tests.

### 4. Validation Matrix

| Condition | Expected |
|---|---|
| `APP_ENV` invalid | env parsing fails at startup |
| `LOG_OUTPUT` absent / `stdout` | stdout only; no log directory is created |
| `LOG_OUTPUT=file|both` without `LOG_FILE` | startup fails with a corrective message |
| File destination cannot become ready | bootstrap fails; never downgrade silently to stdout |
| `LOG_FILE` set while output is stdout | file is ignored and one boot warning is emitted |
| No active OTel span | trace fields omitted gracefully |
| OTLP endpoint absent | standalone SDK is not created; no localhost exporter retries |
| OTLP endpoint and Sentry DSN both present | Sentry wins; standalone SDK disabled with one bootstrap warning |
| Raw token/cookie/password in meta | logger redact layer masks it |
| Server env read from `import.meta.env` | treat as bug; move to `process.env` mapping in `src/lib/env.ts` |
| Vitest loads shared `vite.config.ts` | Nitro plugin is excluded; tests exit cleanly without module-runner errors or open handles |

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
2. **Output policy**: stdout creates no file; file/both rotates under `LOG_FILE`; missing/unwritable file destination fails bootstrap.
3. **Access paths**: RPC, OpenAPI, and server-function success/4xx/5xx lines carry one request id with the documented level and field surface.
4. **Shutdown**: SIGTERM/SIGINT and DB-unavailable paths flush telemetry then buffered logs before exit.
5. **Redaction**: authorization/cookie/token/password values never appear in access or error output.
6. **Trace correlation**: with standalone NodeSDK active, Pino `traceId` / `spanId` equal the active exported span; without endpoint, no exporter noise.

### 7. Wrong vs Correct

```ts
// ❌ runtimeEnv: import.meta.env — server vars won't resolve in Vite SSR
runtimeEnv: import.meta.env

// ❌ transport without pre-initialized stream
const transport = pino.transport({ target: "pino-pretty" });

// ✅ Per-var mapping with server/client split
runtimeEnv: {
  APP_ENV:        process.env.APP_ENV,
  LOG_OUTPUT:     process.env.LOG_OUTPUT,
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
