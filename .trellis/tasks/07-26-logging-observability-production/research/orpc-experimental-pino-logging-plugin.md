# Research: `@orpc/experimental-pino` LoggingHandlerPlugin (v1.14.8)

- **Query**: Exact API of `LoggingHandlerPlugin` — constructor options, what it logs, level mapping, requestId, attaching to `RPCHandler` / `OpenAPIHandler`, redaction, experimental caveats
- **Scope**: external (library), verified against installed source
- **Date**: 2026-07-26
- **Primary source**: installed package source, not docs. `node_modules/@orpc/experimental-pino/dist/index.mjs` + `index.d.mts` (v1.14.8). The published README is the generic oRPC monorepo README and contains **no usage example** for this package — only a one-line blurb at line 67. Treat the source below as the contract.

## Findings

### Package facts

| Field | Value |
|---|---|
| Version installed | `1.14.8` (matches the rest of `@orpc/*`) |
| Import path | `@orpc/experimental-pino` (single entry, `"exports": { "." : ... }`) |
| Module type | ESM-only (`"type": "module"`, only `import`/`default` conditions — **no CJS build**) |
| `sideEffects` | `false` |
| peerDependency | `pino >= 10.1.0` — repo has `pino@10.3.1` ✅ |
| deps | `@orpc/server`, `@orpc/shared`, `@orpc/client` all pinned exactly to `1.14.8` |

### Public exports

```ts
export { CONTEXT_LOGGER_SYMBOL, LoggingHandlerPlugin, getLogger };
export type { LoggerContext, LoggingHandlerPluginOptions };
```

### Constructor options (complete — there are only four)

```ts
interface LoggingHandlerPluginOptions<T extends Context> {
  /** @default pino()  — a bare `pino()` with zero config if omitted */
  logger?: Logger;
  /** @default () => crypto.randomUUID() */
  generateId?: (options: StandardHandlerInterceptorOptions<T>) => string;
  /** @default false */
  logRequestResponse?: boolean;
  /** @default false */
  logRequestAbort?: boolean;
}
```

Note the two `false` defaults: **out of the box the plugin logs errors only.** No request-received / request-handled lines unless `logRequestResponse: true`.

`generateId` receives the full `StandardHandlerInterceptorOptions<T>` (`{ prefix?, context, request }`), so a correlation ID can be pulled off an inbound header, e.g. `({ request }) => request.headers['x-request-id'] ?? crypto.randomUUID()`.

### What it actually logs, per request

Source: `dist/index.mjs:21-116`. The plugin's `init()` unshifts one interceptor into each of `rootInterceptors`, `interceptors`, and `clientInterceptors`.

**Root interceptor** (`index.mjs:25-80`) creates a child logger and pins bindings:

```js
const logger = (context[CONTEXT_LOGGER_SYMBOL] ?? this.logger).child({
  rpc: { id: this.generateId(interceptorOptions), system: ORPC_NAME }  // ORPC_NAME === "orpc"
});
if (!logger.bindings().req) {
  logger.setBindings({
    req: {
      url: interceptorOptions.request.url,        // a URL object, not a string
      method: interceptorOptions.request.method,
      headers: {                                   // ONLY these three, hardcoded
        'content-type':        request.headers['content-type'],
        'content-length':      request.headers['content-length'],
        'content-disposition': request.headers['content-disposition'],
      }
    }
  });
}
```

Two things follow from this:

1. **Header capture is not configurable.** The three header names are hardcoded. No `authorization`, no `cookie`, no `user-agent`, no `x-request-id` — so there is nothing sensitive to redact in what *this plugin* emits.
2. **`if (!logger.bindings().req)` is an escape hatch**: if you hand it a logger that already has a `req` binding (or seed one via `CONTEXT_LOGGER_SYMBOL`), the plugin will not overwrite it. That is the supported way to control the `req` shape.

The emitted lines:

| Condition | Level | Payload |
|---|---|---|
| `logRequestResponse` && entry | `info` | `"request received"` |
| `logRequestResponse` && matched | `info` | `{ msg: "request handled", res: { status } }` |
| `logRequestResponse` && no route | `info` | `"no matching procedure found"` |
| any throw in root interceptor | `error` | the error object |
| throw in procedure interceptor | `error` | the error object |
| throw that *is* the abort reason | `info` | the error object (downgraded from error) |
| `logRequestAbort` && already aborted | `info` | `` `request was aborted before handling (${reason})` `` |
| `logRequestAbort` && aborts mid-flight | `info` | `` `request is aborted (${reason})` `` |
| async-iterator (SSE/stream) error | `error` / `info` if abort | the error object |

**Client interceptor** (`index.mjs:94-115`) adds the procedure path to the bindings once the route is resolved:

```js
logger.setBindings({ rpc: { ...logger.bindings().rpc, method: path.join('.') } });
```

So a fully-populated line carries `rpc: { id, system: "orpc", method: "user.list" }` plus the `req` block.

### Answers to the specific questions

- **Status → log level mapping: there is none.** `result.response.status` is written as the `res.status` *field* on an `info` line regardless of value. A 500 that was converted to a response (rather than thrown) logs at `info`. Level escalation to `error` happens only on a thrown error reaching an interceptor.
- **Duration: not measured, not logged.** There is no timer anywhere in the source. If the task needs latency (and the repo's `logConfig.slowThresholdMs` in `src/lib/config.server.ts:79` implies it does), that must come from an interceptor you write, not from this plugin.
- **Request start + end events: yes, but both gated behind the single `logRequestResponse` flag** — you cannot enable end-only.
- **Redaction / field customization: none on the plugin.** Configure `redact` on the pino instance you pass in (the repo already does this at `src/lib/observability/logger.ts:26-29`). Since the plugin only emits three benign content-* headers, existing `req.headers.authorization` / `req.headers.cookie` redact paths won't have anything to match from this source.
- **requestId / correlation: `generateId`**, surfaced as the `rpc.id` binding.

### Attaching to `RPCHandler` and `OpenAPIHandler`

Both handlers are built on `StandardHandler`, whose options carry a `plugins` array (`@orpc/server/dist/shared/server.BqadksTP.d.mts:46-62`):

```ts
interface StandardHandlerOptions<TContext extends Context> {
  plugins?: StandardHandlerPlugin<TContext>[];
  interceptors?: ...;
  rootInterceptors?: ...;
  clientInterceptors?: ...;
}
```

`LoggingHandlerPlugin<T> implements StandardHandlerPlugin<T>`, so it goes in `plugins` — **the same array for both handlers**, no adapter-specific wiring:

```ts
import { RPCHandler } from '@orpc/server/fetch'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { LoggingHandlerPlugin } from '@orpc/experimental-pino'
import { logger } from '#/lib/observability/logger'

const loggingPlugin = () => new LoggingHandlerPlugin({
  logger,
  logRequestResponse: true,
  generateId: ({ request }) => request.headers['x-request-id'] ?? crypto.randomUUID(),
})

const rpcHandler = new RPCHandler(router, {
  interceptors: serverInterceptors,
  plugins: [loggingPlugin()],
})

const openapiHandler = new OpenAPIHandler(router, {
  interceptors: serverInterceptors,
  plugins: [loggingPlugin(), new SmartCoercionPlugin({ ... }), new OpenAPIReferencePlugin({ ... })],
})
```

Repo insertion points: `src/routes/api.rpc.$.ts:6-8` (currently passes `interceptors` only — needs a `plugins` key added) and `src/routes/api.$.ts:12-14` (already has a `plugins` array; append).

Two instances are shown above because the plugin holds per-instance config; a single shared instance also works since `init()` only mutates the options object it's handed. Sharing one is fine and slightly cheaper.

### Plugin ordering semantics

`CompositeStandardHandlerPlugin` (`@orpc/server/dist/shared/server.ZxHCEN1h.mjs:7-17`):

```js
this.plugins = [...plugins].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
```

`LoggingHandlerPlugin` declares no `order`, so it sorts as `0`. Each plugin `init()` **unshifts** onto the interceptor arrays, so among plugins the *last* to init ends up outermost. Any `interceptors` you passed explicitly in the handler options are already in the array before plugins run, so the logging interceptor lands **outside** `serverInterceptors` — it will see errors those interceptors rethrow.

### Sharing the request logger with your own code

`getLogger(context)` reads `context[CONTEXT_LOGGER_SYMBOL]` and returns the request-scoped child (with `rpc.id` and `req` bindings already attached), or `undefined` outside a request. Available inside procedures and interceptors:

```ts
import { getLogger } from '@orpc/experimental-pino'

const log = getLogger(context)   // Logger | undefined
log?.info({ orgId }, 'workspace switched')
```

The reverse also works: seeding `context[CONTEXT_LOGGER_SYMBOL]` yourself before the handler runs makes the plugin `.child()` off *your* logger instead of the constructor-injected one (`index.mjs:26`) — the hook for per-tenant or per-user bindings.

## Caveats / Not Found

- **`experimental-` prefix means no semver stability promise.** The package is versioned in lockstep with the rest of `@orpc/*` (`1.14.8`) and its deps are exact-pinned to `1.14.8`, so a mismatched `@orpc/server` bump will pull a duplicate copy. Upgrade all `@orpc/*` together.
- **ESM-only.** No CJS condition in `exports`. Fine for this repo (`"type": "module"`), but it cannot be `require()`d from the `createRequire` escape hatch used in `src/lib/observability/logger.ts:49`.
- **No published usage documentation.** The bundled README does not document the plugin; orpc.dev may have a page but it was not reachable from the installed artifacts. Everything above is read off the shipped source.
- **`logRequestAbort` has a documented memory caveat**, quoted from `index.d.mts:41`: "If a signal is used for multiple requests, this may lead to un-efficient memory usage (listeners never removed)." The `addEventListener('abort', ..., { once: true })` at `index.mjs:47-49` is never explicitly removed on normal completion.
- **`req.url` is logged as a URL object**, not a string — pino will serialize it via its default object handling. Verify the shape in output before writing log queries against it.
- Adjacent but out of scope: oRPC ships a separate first-party OpenTelemetry package, `@orpc/otel`, and `@orpc/shared` already exports span helpers (`runWithSpan`, `startSpan`, `getGlobalOtelConfig`). Not currently a dependency of this repo. See [[otel-node-sdk-bootstrap]].
- Related: [[pino-graceful-shutdown-and-pino-roll]] for the logger instance this plugin should be handed.
