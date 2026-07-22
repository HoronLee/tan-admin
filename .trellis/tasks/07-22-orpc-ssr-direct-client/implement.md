# 消除 oRPC SSR HTTP 自调用：执行计划

## Checklist

- [ ] 盘点 `src/orpc/client.ts` 的所有消费者和 `SERVER_URL` 的全部仓库消费者。
- [ ] 新增 `src/orpc/server-client.ts`，注册带 request-scoped headers factory 的 `createRouterClient`。
- [ ] 在 `src/server.ts` 入口最早位置加载 registration，更新 client fallback 与 global type declaration。
- [ ] 将 `serverOrigin`/`serverHeaders` 及只为 self-call 服务的 env/spec 内容移除或改写。
- [ ] 同步菜单任务可能带来的 `getUserMenus` → `navigation.get` query key 变化。
- [ ] 补 direct-client、browser-fallback、header isolation 测试或可重复 smoke harness。
- [ ] 运行 check/test/build，并检查产物不出现 server-only import warning。

## Validation

```bash
rtk pnpm check
rtk pnpm test
rtk pnpm build
```

需要 DB 的导航 integration 由菜单子任务运行；本任务不把 HTTP `/api/rpc` route 删除作为验证条件。

## Risk / rollback

- registration 导入过晚会让 SSR 首次请求错误；保留显式 registration smoke test。
- context 捕获全局 headers 会造成跨请求身份泄漏；测试必须用两个不同 header 请求验证。
- rollback 顺序：先恢复 `client.ts` transport，再移除 server registration，最后清理 env/docs；不要删除 `/api/rpc`。
