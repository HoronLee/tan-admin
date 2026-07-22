# TODO 架构后续项：执行计划

## 顺序

1. 先完成菜单 surface/navigation 契约和管理入口设计，冻结其 query key 与输入。
2. 在菜单契约稳定后实施 oRPC SSR direct client；业务 router 只改 import/transport，不改 procedure 语义。
3. 最后实施 active role session 优化；先跑基线，再决定是否启用持久化 role，授权一致性回归必须通过。

## Checklist

- [x] 审阅父任务与三个子任务的 PRD、design、implement，确认无 open question。
- [x] 完成 `07-22-menu-global-scope`，包含 surface schema、navigation projection、双入口和 route/seed 清理。
- [x] 完成 `07-22-orpc-ssr-direct-client`，包含 server-only registration、browser fallback、build boundary。
- [ ] 完成 `07-22-session-active-role-cache`，包含基线、session field、mutation path 同步和 fail-closed 回归。
- [ ] 更新 backend/frontend spec，特别是 route organization、authorization boundary、dynamic navigation 和 oRPC SSR boundary。
- [ ] 从 `TODO.md` 删除已完成事项或改为剩余 follow-up，并保留链接到归档任务。

## 集成验证

```bash
rtk pnpm check
rtk pnpm test
rtk pnpm test:integration
rtk pnpm build
```

需要 `.env.local` 和 PostgreSQL 的命令只在对应环境执行；`test` 默认不应依赖数据库。

## Review gates

- 菜单：super-admin 不会看到其他组织的 WORKSPACE 菜单；owner 无法提交 global/other-org；SITE 在无 active org 时可用。
- SSR：每个请求的 headers/session 不串线；SSR 没有本机 `/api/rpc` fetch；browser 仍走 `/api/rpc`。
- session：角色变更、移除、离开、transfer、多 session 后没有旧 owner 权限残留；无法同步时拒绝授权。

## Rollback points

- 每个子任务独立提交，先回滚 consumer 再回滚 schema/seed。
- `surface` migration 保留默认值，回滚代码时旧 workspace projection 仍可读。
- session role field nullable；出现同步缺口时把 `getSessionUser` 切回 member lookup，不删除列。
