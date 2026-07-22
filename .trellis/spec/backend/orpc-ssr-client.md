# oRPC SSR Client

## 1. Scope / Trigger

Use this contract whenever a client-reachable oRPC query can also run from a
TanStack Start loader or SSR prefetch. SSR calls use the in-process router;
browser calls keep the public `/api/rpc` transport. This removes loopback HTTP
without importing server code into the client bundle.

## 2. Signatures

```ts
// src/orpc/client-types.ts
export type AppRouterClient = RouterClient<typeof router>
declare global {
  var $client: AppRouterClient | undefined
}

// src/orpc/server-client.ts
globalThis.$client ??= createRouterClient(router, {
  context: async () => ({ headers: getRequestHeaders() }),
}) satisfies AppRouterClient
```

`src/server.ts` must side-effect import `#/orpc/server-client` before importing
the TanStack Start server handler.

## 3. Contracts

| Runtime | Client source | Request context | Transport |
|---|---|---|---|
| TanStack Start SSR | `globalThis.$client` | `getRequestHeaders()` per call | in-process router |
| Browser | `createORPCClient(browserLink)` | browser cookies/headers | `/api/rpc` HTTP |

- `src/orpc/client.ts` and `src/orpc/client-types.ts` may only type-import the
  router. Runtime router/auth/db imports belong in `server-client.ts`.
- The global stores a client whose context is a factory. It must never store a
  `Headers` instance captured from one request.
- `/api/rpc` remains public for browsers and external callers.
- `SERVER_URL` is not part of this topology; SSR must not recover by calling a
  configured host.
- Direct calls execute router procedure middleware, including auth and ZenStack
  binding. They do not pass through HTTP `RPCHandler` interceptors or wire
  serialization. Keep HTTP-only interceptors unchanged; choose an explicit
  in-process fetch link in a separate design if a future SSR caller requires
  handler/plugin semantics.

## 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| SSR registration exists | Call `createRouterClient` result; do not call `fetch` |
| SSR registration is missing | Throw `oRPC server client is not registered...` before `fetch` |
| Browser registration is absent | Resolve current origin and call `/api/rpc/<path>` |
| Context factory runs outside a Start request | Propagate the TanStack missing request-context error |
| Concurrent SSR requests | Each call reads its own AsyncLocalStorage-backed headers |
| Client build runtime-imports router/server module | Fail Import Protection/build review |

## 5. Good / Base / Bad Cases

- Good: server entry registers once; two concurrent calls see distinct session
  cookies; no outbound `/api/rpc` fetch occurs.
- Base: a browser without `$client` calls `/api/rpc/navigation/get` normally.
- Bad: server registration is missing and the browser link silently uses
  localhost, `BETTER_AUTH_URL`, or another deployment URL.
- Bad: module initialization reads `getRequestHeaders()` once and shares that
  `Headers` object between requests.

## 6. Tests Required

- `src/orpc/server-client.test.ts`: import registration before the shared
  client, run two concurrent header contexts, assert distinct values and zero
  `fetch` calls.
- `src/orpc/client.test.ts`: assert registered client preference, explicit SSR
  failure with zero `fetch` calls, and browser `/api/rpc` fallback.
- `pnpm build`: assert no Import Protection warning, then scan `dist/client`
  for `createRouterClient`, `getRequestHeaders`, and server router/db symbols.

## 7. Wrong vs Correct

Wrong: captures one request and permits server HTTP fallback.

```ts
const headers = getRequestHeaders()
const link = new RPCLink({ url: process.env.SERVER_URL!, headers })
```

Correct: registers server-only runtime code early and resolves request context
for every procedure call.

```ts
import "@tanstack/react-start/server-only"

globalThis.$client ??= createRouterClient(router, {
  context: async () => ({ headers: getRequestHeaders() }),
})
```
