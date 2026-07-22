# 消除 oRPC SSR HTTP 自调用

## Goal

让 TanStack Start SSR 中的 oRPC 查询直接调用同进程 router，消除对 `/api/rpc` 的回环 HTTP 往返，同时保持浏览器端 transport 与类型边界不变。

## Background

- `src/orpc/client.ts:41-54` 当前通过 `createIsomorphicFn` 分支创建 client；SSR 分支使用 `RPCLink` 调用 `serverOrigin()/api/rpc`。
- 当前两套 Sidebar 使用非 suspense `useQuery`，菜单在浏览器端请求，不是已存在的 SSR prefetch；本任务修正的是共享 client 在 loader/SSR prefetch 等服务端调用时的 transport 拓扑。
- `src/orpc/client.ts:8` 只 `import type router`，这是上一轮架构清理为避免 server router 进入 client bundle 建立的边界。
- oRPC 官方 `Optimizing SSR` 模式是在 server-only 模块用 `createRouterClient(router)` 注册共享 `globalThis.$client`，client-reachable 模块只读取该值并回退到浏览器 `RPCLink`。
- 官方明确要求共享 client 的 context 不得捕获单次请求数据；请求 headers 必须由 async context factory 在每次调用时取得。
- 当前 `/api/rpc` route 仍是浏览器和外部调用所需公开 transport，不能删除。

## Requirements

- O1. SSR 查询使用 `createRouterClient(router)`，不再构造 server-side `RPCLink` 或计算 `serverOrigin()`。
- O2. server client 注册模块必须标记 server-only，并由 `src/server.ts` 的服务端入口在 SSR handler 加载前注册。
- O3. router client context 通过每次调用执行的 async factory读取当前请求 headers，不能把某个请求的 `Headers` 存进全局实例。
- O4. `src/orpc/client.ts` 保持仅 type-import router；浏览器继续使用指向当前 origin `/api/rpc` 的 `RPCLink`。
- O5. 当 SSR 注册缺失时必须快速失败，不能静默退回 server-side HTTP；browser fallback 在 server 环境被误用时应抛出清晰错误。
- O6. 删除只为 self-call 服务的 `serverOrigin()`、`serverHeaders()` 与无其他消费者的 `SERVER_URL` env 契约，并同步相关 spec。
- O7. `/api/rpc` handler、interceptor 顺序和浏览器请求行为保持兼容。

## Acceptance Criteria

- [x] 模拟 loader/SSR prefetch 调用 `navigation.get` 时走 in-process router client，不产生发往本机 `/api/rpc` 的 fetch。
- [x] 每个 SSR 请求看到自己的 headers/session，不发生跨请求身份串线。
- [x] 浏览器端仍通过 `/api/rpc` 正常调用，且 `src/orpc/client.ts` 没有 runtime router import。
- [x] 缺少 server registration 时 SSR 测试得到明确失败，而不是依赖 `SERVER_URL`/host fallback。
- [x] `pnpm check`、`pnpm test`、`pnpm build` 通过，build 不出现新的 server-only/client import 警告。

## Out of Scope

- 不删除或改名 `/api/rpc`。
- 不重构 oRPC procedures、interceptors 或 TanStack Query key。
- 不引入新的网络 transport 或 batch 策略。
