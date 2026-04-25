# Error Handling

> End-to-end typed error contract for the tan-servora backend.

---

## Overview

- Every procedure derives from a shared `base` in `src/orpc/errors.ts` that declares the standard error codes.
- Procedures throw via `errors.CODE({...})` or `new ORPCError('CODE', {...})`; clients narrow with `isDefinedError(error)`.
- Boundary interceptors (`src/orpc/interceptors.ts`) upgrade Zod failures into typed errors, log failures, capture unknown failures to Sentry, rethrow `INTERNAL_ERROR`.
- DB procedures compose `pub` (with `ormErrorMiddleware`) to map ZenStack `ORMError` into typed oRPC errors.
- `createServerFn` calls are covered by a global `functionMiddleware` in `src/start.ts`.
- `instrument.server.mjs` is Sentry-init only (loaded via `--import`); no custom `uncaughtException`/`unhandledRejection` — Node defaults + Sentry handle them.
- **Startup fail-fast**: `src/db.ts` calls `db.$connect()` at module load; top-level `await` throws → Node exits before serving.
- **Runtime fail-fast**: `server-fn-middleware.ts` detects DB unavailability (recurses into `ORMError.cause`) and `process.exit(1)` after Sentry flush.
- MCP keeps its JSON-RPC envelope contract unchanged.

## Standard Error Codes

Source: `src/orpc/errors.ts`.

| Code | HTTP | `data` shape | Usage |
|------|------|--------------|-------|
| `BAD_REQUEST` | 400 | — | Malformed input (e.g. FK violation from ORM mapping) |
| `UNAUTHORIZED` | 401 | — | Caller is not authenticated |
| `FORBIDDEN` | 403 | — | Authenticated but not permitted |
| `NOT_FOUND` | 404 | — | Resource does not exist |
| `CONFLICT` | 409 | — | Resource-state conflict (e.g. unique constraint) |
| `INPUT_VALIDATION_FAILED` | 422 | `{ formErrors: string[], fieldErrors: Record<string, string[] \| undefined> }` | Zod validation failure (produced by interceptor) |
| `RATE_LIMITED` | 429 | `{ retryAfter: number }` | Rate-limit breach |
| `INTERNAL_ERROR` | 500 | — | Unexpected internal failure |

```ts
export const base = os.errors({
  UNAUTHORIZED: { status: 401, message: "Authentication required." },
  FORBIDDEN: { status: 403, message: "You do not have permission to perform this action." },
  NOT_FOUND: { status: 404, message: "Resource not found." },
  CONFLICT: { status: 409, message: "Resource conflict." },
  INPUT_VALIDATION_FAILED: {
    status: 422,
    message: "Input validation failed.",
    data: z.object({
      formErrors: z.array(z.string()),
      fieldErrors: z.record(z.string(), z.array(z.string()).optional()),
    }),
  },
  RATE_LIMITED: {
    status: 429,
    message: "Too many requests. Please try again later.",
    data: z.object({ retryAfter: z.number().int().positive() }),
  },
  INTERNAL_ERROR: { status: 500, message: "An unexpected error occurred." },
});
```

## Procedure Builders

### `base`

Use for procedures that do not touch the database. Derive every procedure from `base` (not raw `os`).

```ts
// src/orpc/router/todos.ts
import { base } from "#/orpc/errors";

export const listTodos = base.input(z.object({})).handler(() => todos);
```

### `pub`

Use for procedures that query/mutate the DB. Wraps `base` with `ormErrorMiddleware`.

Source: `src/orpc/middleware/orm-error.ts`.

```ts
export const pub = base.use(ormErrorMiddleware);
```

### `authed`

Use for endpoints requiring a signed-in user. Composes `pub` with `authMiddleware` (reads `context.headers`, calls Better Auth `auth.api.getSession`; `UNAUTHORIZED` when no session).

Source: `src/orpc/middleware/auth.ts`.

```ts
export const authed = pub.use(authMiddleware);
```

## ORM Error Mapping (Single Source of Truth)

Source of truth: `src/lib/zenstack-error-map.ts`. Both backend middleware and frontend error reporter import the same `mapZenStackReasonToCode(reason, dbErrorCode)` — never two inline switches.

| `ORMErrorReason` | App code | Rationale |
|------------------|----------|-----------|
| `not-found` | `NOT_FOUND` | `update` / `delete` on missing row |
| `rejected-by-policy` | `FORBIDDEN` | `@@allow/@@deny` policy denied the op (PolicyPlugin) |
| `invalid-input` | `INPUT_VALIDATION_FAILED` | ORM-side argument validation failure |
| `db-query-error` + SQLSTATE `23505` | `CONFLICT` | Unique constraint violation |
| `db-query-error` + SQLSTATE `23503` | `BAD_REQUEST` | Foreign-key violation |
| Other `db-query-error` SQLSTATEs | `INTERNAL_ERROR` | Unmapped — default to internal |
| `config-error` / `not-supported` / `internal-error` | `INTERNAL_ERROR` | Surfaces as internal |

```ts
export function mapZenStackReasonToCode(
  reason: ZenStackErrorReason,
  dbErrorCode?: string,
): AppErrorCode {
  if (reason !== "db-query-error") return ZENSTACK_REASON_CODE_MAP[reason];
  if (dbErrorCode === SQLSTATE_UNIQUE_VIOLATION) return "CONFLICT";
  if (dbErrorCode === SQLSTATE_FOREIGN_KEY_VIOLATION) return "BAD_REQUEST";
  return "INTERNAL_ERROR";
}
```

### Backend side: `ormErrorMiddleware`

Source: `src/orpc/middleware/orm-error.ts`.

```ts
const mappedCode = mapZenStackReasonToCode(err.reason, dbErrorCode);
switch (mappedCode) {
  case "NOT_FOUND": throw errors.NOT_FOUND({ message: "Resource not found.", cause: err });
  case "FORBIDDEN": throw errors.FORBIDDEN({ cause: err });
  case "INPUT_VALIDATION_FAILED": throw errors.INPUT_VALIDATION_FAILED({ message: err.message, data: flattenFieldErrors(err), cause: err });
  case "CONFLICT": throw errors.CONFLICT({ message: "Resource already exists.", cause: err });
  case "BAD_REQUEST": throw errors.BAD_REQUEST({ cause: err });
  default: throw err; // boundary interceptor → INTERNAL_ERROR
}
```

`INTERNAL_ERROR` is not thrown inline — rethrow the raw `ORMError` and let the boundary interceptor capture it to Sentry + remap.

## ZenStack HTTP Error Contract (Dual-Stack Gotcha)

The ZenStack Server Adapter at `/api/model/**` **does not pass through** `ormErrorMiddleware`. It converts the raw `ORMError` into an HTTP response:

```json
{
  "body": {
    "error": {
      "status": 403,
      "message": "...",
      "reason": "rejected-by-policy",
      "model": "Role",
      "rejectedByPolicy": true,
      "rejectReason": "no-access",
      "dbErrorCode": "23505"
    }
  }
}
```

After deserialization by `@zenstackhq/client-helpers/fetch.js`, the client sees the same `{ reason, dbErrorCode, message }` under `error.info`. Frontend reuses the **same mapping constants** via `getZenStackHttpError(error)` + `mapZenStackReasonToCode(reason, dbErrorCode)`.

**Why not unify the wire format into an oRPC `ORPCError`?** Rewriting adapter responses breaks ZenStack's official contract (upgrades become brittle); one extra branch in `reportError` is cheap. Both stacks converge on the same 7-code enum via one shared mapping function. See `04-20-crud-autogen-hooks` D1 for full rationale.

## Where the Mapping Must Be Reused

- Backend `src/orpc/middleware/orm-error.ts` → `mapZenStackReasonToCode` (not a local switch).
- Frontend `src/lib/error-report.ts` → `getZenStackHttpError` + `mapZenStackReasonToCode`.
- Unit tests: `src/lib/zenstack-error-map.test.ts` must cover all 7 reasons plus `db-query-error` × {23505, 23503, other SQLSTATE}.

**Common mistake**: adding a new `dbErrorCode` mapping in `orm-error.ts` alone and forgetting `zenstack-error-map.ts`. Fix: always edit `zenstack-error-map.ts` first; the middleware delegates. Grep `mapZenStackReasonToCode` before touching either file — at most two call sites.

## Boundary Interceptor Chain

Source: `src/orpc/interceptors.ts`; wired in `src/routes/api.$.ts` and `src/routes/api.rpc.$.ts` via `interceptors: serverInterceptors`.

1. **Zod → `INPUT_VALIDATION_FAILED`**: If the thrown error is `BAD_REQUEST` whose `cause` is `ValidationError`, rebuild a `ZodError` from `cause.issues` and re-throw as `INPUT_VALIDATION_FAILED` carrying `{ formErrors, fieldErrors }` from `z.flattenError(...)`.
2. **Structured log + unknown remap**: Every error is logged via the `orpc` module logger as `log.error({ err }, "oRPC handler error")`. If the error is not a defined `ORPCError`, it is `Sentry.captureException(error)` and remapped to `new ORPCError("INTERNAL_ERROR", ...)`.

Typed errors (the ones on `base`) are considered expected signals and are **not** reported to Sentry.

```ts
export const serverInterceptors = [
  onError((error) => {
    if (error instanceof ORPCError && error.code === "BAD_REQUEST" && error.cause instanceof ValidationError) {
      const zodError = new z.ZodError(error.cause.issues as z.core.$ZodIssue[]);
      throw new ORPCError("INPUT_VALIDATION_FAILED", {
        status: 422,
        message: z.prettifyError(zodError),
        data: z.flattenError(zodError),
        cause: error.cause,
      });
    }
  }),
  onError((error) => {
    log.error({ err: error }, "oRPC handler error");
    if (error instanceof ORPCError && error.defined === true) return;
    Sentry.captureException(error);
    throw new ORPCError("INTERNAL_ERROR", {
      status: 500,
      message: "An unexpected error occurred.",
      cause: error,
    });
  }),
];
```

## Server Function Global Middleware

Sources: `src/start.ts`, `src/lib/server-fn-middleware.ts`.

`createServerFn` does not pass through oRPC interceptors, so we register a global TanStack Start middleware:

- `src/start.ts`: `startInstance = createStart(() => ({ functionMiddleware: [serverFnErrorMiddleware] }))`
- `serverFnErrorMiddleware` (`type: "function"`) wraps `await next()` in `try/catch`
- On failure: `log.error({ err, serverFn: { id, name } }, ...)` + `Sentry.captureException` + rethrow
- DB-unavailable signatures (`ECONNREFUSED` / `ENOTFOUND` / `ETIMEDOUT` / `EHOSTUNREACH` / `ENETUNREACH`, or `ORMError` with `config-error` / connection-level cause) → log `fatal` + `process.exit(1)` after Sentry flush

```ts
export const serverFnErrorMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next, serverFnMeta }) => {
    try {
      return await next();
    } catch (error) {
      log.error({ err: error, serverFn: serverFnMeta }, "server function error");
      Sentry.captureException(error);
      throw error;
    }
  },
);
```

## Process-Level Fatal Fallback

Sources: `instrument.server.mjs`, `instrument.critical.mjs`.

Final safety net for failures outside request/function middleware (bootstrap, detached async):

- `process.on("uncaughtException" | "unhandledRejection", ...)` → structured fatal JSON line + `Sentry.captureException` + `Sentry.flush(2000)` + `exit(1)`
- Startup/interval critical dependency checks (`instrument.critical.mjs`): Postgres (`DATABASE_URL`) at startup + every 15s; Redis (`REDIS_URL`) and Kafka (`KAFKA_BROKERS`) when present. Any failed check → `criticalDependencyUnavailable` → exit.

## Client-Side Consumption

Source: `src/lib/error-report.ts`.

Frontend catches route through `reportError(error, options?)`:

- `isDefinedError(error)` narrows to typed codes; `FORBIDDEN` / `NOT_FOUND` / `CONFLICT` / `RATE_LIMITED` / `UNAUTHORIZED` / `INTERNAL_ERROR` → user-facing toast.
- `INPUT_VALIDATION_FAILED` is intentionally silent — callers render field errors inline (e.g. with TanStack Form).
- Non-typed errors → `Sentry.captureException` + fallback toast.

```ts
try {
  await orpc.users.create.call(input);
} catch (err) {
  reportError(err);
}
```

Root-level fallback: `src/routes/__root.tsx` declares `errorComponent: RootErrorFallback`.

### BA 客户端错误走 `translateAuthError`（不走 `reportError`）

Better Auth 客户端（`authClient.*`）抛出的错误结构是 `{ code: string, message, status }`，**不是** `ORPCError`，`isDefinedError()` 识别不到。

| 错误来源 | catch 处理 |
|---|---|
| oRPC typed errors | `reportError(error)` |
| BA client errors / hooks throw | `translateAuthError(error)` → 中文 toast |

混合页面：先 `"code" in error && /^[A-Z_]+$/.test(error.code)` 判定走 BA 分支，否则走 `reportError`。

**锚点**：`src/lib/auth/errors.ts`（集中映射 BA code → 中文；BA 升级时一处改完）。

## MCP Error Envelope Contract (unchanged)

On MCP handler failure, return the JSON-RPC error envelope with code `-32603` and HTTP status `500`. Separate from oRPC typed errors.

Source: `src/utils/mcp-handler.ts`.

```ts
return Response.json(
  {
    jsonrpc: "2.0",
    error: {
      code: -32603,
      message: "Internal server error",
      data: error instanceof Error ? error.message : String(error),
    },
    id: null,
  },
  { status: 500, headers: { "Content-Type": "application/json" } },
);
```

## Boundary Validation Rule

Validate request input at boundary declarations (`os.input(...)`, `.inputValidator(...)`, MCP `inputSchema`). Boundary Zod errors are auto-upgraded to `INPUT_VALIDATION_FAILED` by the interceptor chain.

```ts
base.input(z.object({ name: z.string() })).handler(({ input }) => ...)
```

## Catch Narrowing Pattern

Narrow error values before serialization/logging: `error instanceof Error ? error.message : String(error)`.

## Forbidden / Anti-Patterns

- Throwing raw strings instead of `Error` / `ORPCError`.
- Defining procedures directly on `os` (must derive from `base`).
- Manually mapping ZenStack `ORMError` reasons inside handlers when `pub` already handles them.
- Reporting typed (`.defined === true`) errors to Sentry — they are expected signals.
- Returning internal stack/error internals in public responses — `INTERNAL_ERROR` is opaque on purpose.
- Displaying raw `INPUT_VALIDATION_FAILED` toast; render `fieldErrors` inline instead.
- Handling server function errors ad hoc per route when a global `functionMiddleware` enforces one contract.
- Empty `catch {}` that swallows exceptions.

---

## Common Mistake: `import.meta.env` in Node.js Scripts

`import.meta.env` is a **Vite-only** API. Node.js scripts (`tsx src/seed.ts`, `vitest`, etc.) see `undefined`, so any property access throws:

```
TypeError: Cannot read properties of undefined (reading 'VITE_APP_TITLE')
```

**Fix**: guard every `VITE_*` read in `src/env.ts` `runtimeEnv` with a `typeof` check:

```ts
VITE_APP_TITLE:
  typeof import.meta.env !== "undefined"
    ? import.meta.env.VITE_APP_TITLE
    : process.env.VITE_APP_TITLE,
```

**Rule**: every new `VITE_*` in `runtimeEnv` **must** use this guard — not bare `import.meta.env.*`.

### Evidence

Source: `src/orpc/errors.ts`, `src/orpc/middleware/{orm-error,auth}.ts`, `src/orpc/interceptors.ts`, `src/routes/api.{$,rpc.$}.ts`, `src/start.ts`, `src/lib/{server-fn-middleware,error-report,auth-errors}.ts`, `src/routes/__root.tsx`, `src/utils/mcp-handler.ts`, `instrument.server.mjs`.
