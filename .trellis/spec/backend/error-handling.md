# Error Handling

> Current backend error handling contracts and extension points.

---

## Overview

Error handling is boundary-focused:

- oRPC/OpenAPI path uses interceptor logging.
- MCP path wraps dispatch in try/catch and returns JSON-RPC error envelopes.
- Server-function callers handle failures with route-level try/catch.

## oRPC/OpenAPI Interceptor Pattern

Use `onError` interceptor for centralized exception capture in OpenAPI handler.

### Evidence

Source: `src/routes/api.$.ts:14-18`.

```ts
interceptors: [
  onError((error) => {
    console.error(error)
  }),
],
```

Source: shared route fallback behavior `src/routes/api.$.ts:57-64`.

```ts
const { response } = await handler.handle(request, { prefix: '/api', context: {} })
return response ?? new Response('Not Found', { status: 404 })
```

## MCP Error Envelope Contract

On MCP request failure, return JSON-RPC error envelope with code `-32603` and HTTP status `500`.

### Evidence

Source: `src/utils/mcp-handler.ts:39-55`.

```ts
} catch (error) {
  console.error('MCP handler error:', error)
  return Response.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal server error',
        data: error instanceof Error ? error.message : String(error),
      },
      id: null,
    },
    { status: 500, ... },
  )
}
```

## Server Function Caller Pattern

When server functions are invoked from route components, caller code wraps mutation calls in try/catch.

### Evidence

Source: `src/routes/demo/prisma.tsx:39-45`.

```ts
try {
  await createTodo({ data: { title } })
  router.invalidate()
} catch (error) {
  console.error('Failed to create todo:', error)
}
```

Source: server function definition with input boundary `src/routes/demo/prisma.tsx:13-18`.

```ts
const createTodo = createServerFn({ method: 'POST' })
  .inputValidator((data: { title: string }) => data)
  .handler(async ({ data }) => prisma.todo.create({ data }))
```

## Boundary Validation Rule

Validate request input at boundary declarations (oRPC `.input(z.object(...))`, server function `.inputValidator(...)`, MCP tool `inputSchema`). Avoid duplicate validation deep inside handlers.

### Evidence

Source: oRPC input validators in `src/orpc/router/todos.ts:10,15`.

```ts
os.input(z.object({})).handler(...)
os.input(z.object({ name: z.string() })).handler(...)
```

Source: MCP tool schema in `src/routes/mcp.ts:19-21`.

```ts
inputSchema: {
  title: z.string().describe('The title of the todo'),
},
```

## Catch Narrowing Pattern

In generic catches, narrow error values before serialization/logging.

### Evidence

Source: `src/utils/mcp-handler.ts:49`.

```ts
data: error instanceof Error ? error.message : String(error)
```

## Current State: Custom Error Classes

No custom backend error class hierarchy exists yet. If domain-specific errors are introduced, centralize them under one module (for example `src/orpc/errors.ts`) and keep serialization behavior consistent across protocols.

### Evidence

Source: current backend files throw/handle plain `Error` objects and interceptor logging only (`src/routes/api.$.ts`, `src/utils/mcp-handler.ts`, `src/routes/demo/prisma.tsx`).

## Client-Facing Error Surfaces

- oRPC RPC: typed client error path through oRPC transport.
- OpenAPI: HTTP status + JSON response from OpenAPI handler.
- MCP: JSON-RPC envelope (`jsonrpc`, `error`, `id`) regardless of transport route.

### Evidence

Source: protocol handlers at `src/routes/api.rpc.$.ts:7-13`, `src/routes/api.$.ts:13-25`, `src/utils/mcp-handler.ts:43-52`.

```ts
const handler = new RPCHandler(router)
const handler = new OpenAPIHandler(router, { ... })
return Response.json({ jsonrpc: '2.0', error: {...}, id: null }, { status: 500 })
```

## Forbidden / Anti-Patterns

- Empty `catch {}` that swallows exceptions.
- Throwing raw strings instead of `Error` (or typed framework errors).
- Returning internal stack/error internals directly in public API responses.

### Evidence

Source: current explicit logging in error paths (`src/routes/api.$.ts:15-17`, `src/routes/demo/prisma.tsx:43-45`, `src/utils/mcp-handler.ts:40`).

```ts
console.error(error)
console.error('Failed to create todo:', error)
console.error('MCP handler error:', error)
```
