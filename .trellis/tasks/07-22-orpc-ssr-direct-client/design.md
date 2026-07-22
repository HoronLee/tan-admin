# 消除 oRPC SSR HTTP 自调用：技术设计

## Client topology

- 新增 server-only `src/orpc/server-client.ts`，runtime import `router` 并注册 `globalThis.$client = createRouterClient(router, ...)`。
- context 使用 async factory，每次调用从 TanStack Start server request context 读取 headers；全局实例不保存某一次请求的 `Headers`。
- `src/server.ts` 在 TanStack Start handler 加载前 side-effect import server registration，确保 SSR 入口先完成注册。
- `src/orpc/client.ts` 只保留 `import type router` 和 client-safe `RouterClient` 类型；使用 `globalThis.$client ?? createORPCClient(browserLink)`。
- browser link 只允许在 `window` 存在时使用；server registration 缺失时显式报错，不回退到 HTTP self-call。

## Request context contract

`createRouterClient` 的 context 必须提供 `{ headers }`，与现有 `RPCHandler` 的 `context: { headers: request.headers }` 形状一致。SSR direct client 与浏览器 transport 因此共享 middleware/auth 行为，不复制权限逻辑。

## Compatibility

- `/api/rpc` route、RPCHandler、interceptors 和浏览器请求不变。
- 删除 `serverOrigin`/`serverHeaders` 后，只有 oRPC self-call 使用的 `SERVER_URL` env/schema/spec 才移除；先全仓搜索确认没有其他消费者。
- HMR/测试环境可能重复加载 server registration，使用 `globalThis.$client ??=` 保持幂等。

## Verification strategy

- server-only module test：注册 client 后 direct call 使用当前 request headers。
- import boundary test/build：client bundle 不含 runtime router、server-only auth/db 或 `createRouterClient`。
- browser fallback test：无 server global 且有 window 时使用 fetch link；无 window 时得到明确错误。
- SSR smoke：`getUserMenus`/`navigation.get` 不产生本机 `/api/rpc` fetch。

