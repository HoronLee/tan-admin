# Online Best Practices and Local Code Trace

Date: 2026-06-19

## Sources Queried

- Context7 `/dinwwwh/orpc`
  - Source docs surfaced:
    - `https://github.com/dinwwwh/orpc/blob/main/apps/content/docs/integrations/tanstack-query.md`
    - `https://github.com/dinwwwh/orpc/blob/main/packages/react-query/README.md`
    - `https://github.com/dinwwwh/orpc/blob/main/apps/content/docs/best-practices/optimize-ssr.md`
- Context7 `/websites/zenstack_dev`
  - Source docs surfaced:
    - `https://zenstack.dev/docs/reference/server-adapters/tanstack-start`
    - `https://zenstack.dev/docs/service/client-sdk/tanstack-query`
    - `https://zenstack.dev/docs/orm/access-control/query`
- Context7 `/websites/tanstack_start`
  - Source docs surfaced:
    - `https://tanstack.com/start/latest/docs/framework/react/guide/server-functions.md`
    - `https://tanstack.com/start/latest/docs/framework/react/guide/code-execution-patterns.md`
    - `https://tanstack.com/start/latest/docs/framework/solid/guide/import-protection.md`
- Codegraph index over `/Users/horonlee/projects/node/tan-servora`
  - 214 indexed files, 2568 nodes, 5807 edges.

## Library-Level Findings

### oRPC + TanStack Query

The current oRPC integration exposes generated query and mutation helpers:

- `orpc.<router>.<procedure>.queryOptions({ input })`
- `orpc.<router>.<procedure>.mutationOptions()`
- `orpc.<router>.key()`
- `orpc.<router>.<procedure>.key({ input })`
- `orpc.<router>.<procedure>.queryKey({ input })`

Implication for this repo:

- Query factories in `src/queries/*` should wrap these helpers instead of hand-writing wide cache keys like `["orpc"]`.
- Shared oRPC reads, such as `organizationsAdmin.list`, are good first candidates for `src/queries/*`.
- Mutations should invalidate the narrowest official key that represents stale data.

### ZenStack + TanStack Start

ZenStack's TanStack Start adapter is explicitly a CRUD API mount:

- `TanStackStartHandler`
- `RPCApiHandler`
- `getClient: (request) => client.$setAuth(getSessionUser(request))`

ZenStack TanStack Query generates CRUD hooks from the schema:

- `useFindMany`
- `useCreate`
- `useUpdate`
- `useDelete`

Implication for this repo:

- Single-model business-table CRUD should default to ZenStack generated hooks plus schema policies.
- oRPC should not become the default CRUD layer for ordinary ZenStack models.
- The policy auth object passed via `$setAuth` must contain every field needed by access policies. The current `Menu` owner-write mismatch cannot be solved only in the route gate.

### TanStack Start Server Boundaries

Current TanStack Start docs use `.validator(...)`, not `.inputValidator(...)`.

Server functions can be statically imported because the build replaces server implementations with client RPC stubs, but mixed server/client helper files still need clean entrypoints. The docs also show `createServerOnlyFn`, `createClientOnlyFn`, and `createIsomorphicFn` for execution boundary control.

Implication for this repo:

- Specs and examples should use `.validator(...)`.
- Server-only DB/logger/config helpers should stay in server-only modules or inside server function handlers.
- The `logger.ts` client build warning is a boundary smell even if final client chunks do not include pino code.

## Local Code Findings From Codegraph

### Existing ZenStack Query Integration

`src/integrations/zenstack-query/client.ts` already defines `useZenStackQueries()` with endpoint `/api/model`.

Implication:

- The project already has the official place to consume generated CRUD hooks.
- Menu CRUD can migrate to this layer after policy/auth context is corrected.

### Menu Page Boundary Issue

`src/routes/(workspace)/_layout/settings/organization/menus.tsx` currently:

- calls `orpc.listMenus.queryOptions({ input: {} })`.
- uses `orpc.createMenu/updateMenu/deleteMenu.mutationOptions()`.
- invalidates `MENUS_KEY = ["menus", "tree"]` and `["orpc"]`.
- contains local form mapping, drawer state, table columns, and CRUD actions in one route file.

Implication:

- This page is the clearest example of mixed view/query/mutation/form mapping responsibilities.
- `getUserMenus` should remain oRPC because it is a permission-filtered derived tree.
- `list/get/create/update/delete Menu` should move out of oRPC once ZenStack policy can represent intended writers.

### Organization Admin Query Reuse

Both of these current consumers call `orpc.organizationsAdmin.list.queryOptions({ input: {} })` inline:

- `src/routes/site/_layout/organizations/index.tsx`
- `src/routes/site/_layout/users/-components/add-to-organization-drawer.tsx`

Implication:

- `src/queries/organizations-admin.ts` is a low-risk first query factory slice.

### Logger Import Boundary

`src/lib/observability/logger.ts` currently imports:

- `node:module`
- `@opentelemetry/api`
- `pino`
- `#/lib/config.server`

Implication:

- The file should be treated as server-only.
- Any client-reachable import path that parses this file should be removed or made explicit with server-only boundaries.

## Resulting Layer Contract

- ZenStack `/api/model`: policy-protected single-model CRUD for business tables.
- oRPC `/api/rpc`: BA `@@ignore` table management, cross-model transactions, derived permission-filtered reads, exports, batch actions, and external integrations.
- TanStack Start server functions: route-coupled server actions and UX gates.
- `src/queries`: reusable queryOptions/key factories; no React hooks inside ordinary factories.
- `src/routes`: route declarations, beforeLoad/loader, page composition, small page state.
- `src/components`: pure UI and interaction components; no direct server-only imports.
- `src/lib`: infrastructure glue; no business-domain workflows.
