/**
 * Auth-related TanStack Start `createMiddleware` units (server functions).
 *
 * Currently empty: server-function call sites pull session via
 * `getSessionUser(getRequestHeaders())` directly inside their handlers. If a
 * cross-cutting auth middleware becomes warranted (e.g. uniform 401 mapping
 * for every server fn), define it here and register it via `createStart` in
 * `src/start.ts`.
 *
 * Note: oRPC has its own auth middleware at `src/orpc/middleware/auth.ts` —
 * those two stacks (TanStack Start fns vs oRPC procedures) are orthogonal.
 */

export {};
