# Error Handling

> End-to-end typed error contract for the tan-admin backend.

---

## Overview

Error handling is built on oRPC's native typed errors:

- Every procedure derives from a shared `base` in `src/orpc/errors.ts` that declares the standard error codes.
- Procedures throw via `errors.CODE({...})` or `new ORPCError('CODE', {...})`; clients narrow with `isDefinedError(error)`.
- A boundary interceptor chain in `src/orpc/interceptors.ts` upgrades Zod validation failures into typed errors, logs every failure, captures unknown failures to Sentry, and rethrows `INTERNAL_ERROR`.
- Prisma-backed procedures additionally compose `pub` (from `src/orpc/middleware/prisma-error.ts`) to map known Prisma error codes.
- `createServerFn` calls are covered by a global TanStack Start `functionMiddleware` in `src/start.ts`.
- `instrument.server.mjs` is limited to Sentry initialisation only (loaded via `--import`). It does **not** install custom `uncaughtException`/`unhandledRejection` handlers; Node's default behaviour (print + `exit(1)`) is relied upon for unhandled rejections, with Sentry already initialised to capture them.
- Startup fail-fast: `src/db.ts` calls `prisma.$connect()` at module load time. If the database is unreachable the top-level `await` throws, Node exits before the server accepts traffic.
- Runtime fail-fast: `server-fn-middleware.ts` detects Prisma unavailability errors during request handling and calls `process.exit(1)` after flushing Sentry.
- MCP keeps its existing JSON-RPC envelope contract unchanged.

## Standard Error Codes

Source: `src/orpc/errors.ts`.

| Code | HTTP | `data` shape | Usage |
|------|------|--------------|-------|
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

Use for procedures that query/mutate Prisma. Wraps `base` with `prismaErrorMiddleware`.

Source: `src/orpc/middleware/prisma-error.ts`.

```ts
export const pub = base.use(prismaErrorMiddleware);
```

## Prisma Error Mapping

Source: `src/orpc/middleware/prisma-error.ts`.

| Prisma code | Typed error | Rationale |
|-------------|-------------|-----------|
| `P2002` (unique constraint) | `CONFLICT` | Duplicate key on create/update |
| `P2025` (record not found) | `NOT_FOUND` | `where` matched zero rows |
| Other `PrismaClientKnownRequestError` | unchanged | Logged with `code` + `meta`; surfaces as `INTERNAL_ERROR` at the boundary |

```ts
export const prismaErrorMiddleware = base.middleware(async ({ next, errors }) => {
  try {
    return await next();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      log.warn({ err, code: err.code, meta: err.meta }, "prisma known request error");
      if (err.code === "P2002") throw errors.CONFLICT({ message: "Resource already exists.", cause: err });
      if (err.code === "P2025") throw errors.NOT_FOUND({ message: "Resource not found.", cause: err });
    }
    throw err;
  }
});
```

## Boundary Interceptor Chain

Source: `src/orpc/interceptors.ts`; wired in `src/routes/api.$.ts` and `src/routes/api.rpc.$.ts` via `interceptors: serverInterceptors`.

1. **Zod → `INPUT_VALIDATION_FAILED`**: If the thrown error is `BAD_REQUEST` whose `cause` is `ValidationError`, rebuild a `ZodError` from `cause.issues` and re-throw as `INPUT_VALIDATION_FAILED` carrying `{ formErrors, fieldErrors }` from `z.flattenError(...)`.
2. **Structured log + unknown remap**: Every error is logged via the `orpc` module logger as `log.error({ err }, "oRPC handler error")`. If the error is not a defined `ORPCError`, it is captured with `Sentry.captureException(error)` and remapped to `new ORPCError("INTERNAL_ERROR", ...)`.

Typed errors (the ones on `base`) are considered expected application signals and are **not** reported to Sentry.

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

- `src/start.ts` exports `startInstance = createStart(() => ({ functionMiddleware: [serverFnErrorMiddleware] }))`
- `serverFnErrorMiddleware` (`type: "function"`) wraps `await next()` in `try/catch`
- On failure: `log.error({ err, serverFn: { id, name } }, "server function error")` + `Sentry.captureException(error)` + rethrow
- If the error matches DB-unavailable signatures (`ECONNREFUSED`, `ENOTFOUND`, `P1001`, `P1002`, Prisma init/panic), middleware logs `fatal` and schedules `process.exit(1)` after Sentry flush.

```ts
export const startInstance = createStart(() => ({
  functionMiddleware: [serverFnErrorMiddleware],
}));
```

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

The process-level handlers are a final safety net for failures that happen outside request/function middleware (for example during bootstrap or detached async paths):

- Register `process.on("uncaughtException", ...)` and `process.on("unhandledRejection", ...)`
- Emit one structured fatal JSON line via `console.error` (logger is not available this early)
- `Sentry.captureException(...)`
- Attempt `Sentry.flush(2000)` when available
- Exit with status code `1` to let the orchestrator restart the process
- Additionally, startup and interval critical dependency checks run via a generic checker (`instrument.critical.mjs`) triggered from `instrument.server.mjs`:
  - Postgres (`DATABASE_URL`) is checked at startup and every 15s
  - Redis (`REDIS_URL`) and Kafka (`KAFKA_BROKERS`) are checked when those env vars are present
  - Any failed check triggers `criticalDependencyUnavailable` and exits the process

```js
process.on("uncaughtException", (error) => {
  void flushAndExit(error, "uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  void flushAndExit(reason, "unhandledRejection");
});
```

## Client-Side Consumption

Source: `src/lib/error-report.ts`.

All frontend catches must route through `reportError(error, options?)`:

- `isDefinedError(error)` narrows to typed codes; `FORBIDDEN` / `NOT_FOUND` / `CONFLICT` / `RATE_LIMITED` / `UNAUTHORIZED` / `INTERNAL_ERROR` → user-facing toast.
- `INPUT_VALIDATION_FAILED` is intentionally silent — callers render field errors inline (e.g. with TanStack Form) because a top-level toast would be redundant.
- Non-typed errors → `Sentry.captureException` + fallback toast.

```ts
try {
  await orpc.users.create.call(input);
} catch (err) {
  reportError(err);
}
```

Root-level fallback: `src/routes/__root.tsx` declares `errorComponent: RootErrorFallback`, so uncaught render errors produce a branded error page with retry + home navigation.

## MCP Error Envelope Contract (unchanged)

On MCP handler failure, return the JSON-RPC error envelope with code `-32603` and HTTP status `500`. This path is separate from oRPC typed errors.

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

Validate request input at boundary declarations (`os.input(...)`, `.inputValidator(...)`, MCP `inputSchema`). Boundary Zod errors are automatically upgraded to `INPUT_VALIDATION_FAILED` by the interceptor chain.

```ts
base.input(z.object({ name: z.string() })).handler(({ input }) => ...)
```

## Catch Narrowing Pattern

In generic catches, narrow error values before serialization/logging.

```ts
data: error instanceof Error ? error.message : String(error)
```

## Forbidden / Anti-Patterns

- Throwing raw strings instead of `Error` / `ORPCError`.
- Defining procedures directly on `os` (must derive from `base`).
- Manually mapping Prisma error codes inside handlers when `pub` already handles them.
- Reporting typed (`.defined === true`) errors to Sentry — they are expected signals.
- Returning internal stack/error internals in public responses — keep defaults; `INTERNAL_ERROR` is opaque on purpose.
- Displaying raw `INPUT_VALIDATION_FAILED` toast; render the `fieldErrors` inline instead.
- Handling server function errors ad hoc per route when a global `functionMiddleware` can enforce one contract.
- Empty `catch {}` that swallows exceptions.

### Evidence

Source: `src/orpc/errors.ts`, `src/orpc/middleware/prisma-error.ts`, `src/orpc/interceptors.ts`, `src/routes/api.$.ts`, `src/routes/api.rpc.$.ts`, `src/start.ts`, `src/lib/server-fn-middleware.ts`, `src/lib/error-report.ts`, `src/routes/__root.tsx`, `src/utils/mcp-handler.ts`, `instrument.server.mjs`.
