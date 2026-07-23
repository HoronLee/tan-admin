# TODO

来自 `06-19-architecture-layering-cleanup` 任务收尾 review 的已知后续项（当时有意不修，不影响正确性与安全性）。

已完成：

- 菜单 scope、SITE/WORKSPACE surface 与双动态 Sidebar 已由 `07-22-menu-global-scope` 实现并验证。
- oRPC SSR 已由 `07-22-orpc-ssr-direct-client` 改为 server-only in-process router client；浏览器仍走 `/api/rpc`。

## 1. `getSessionUser` 每请求多一次 `getActiveMember` 查询（已完成）

- `activeOrganizationRole` 已持久化到 Better Auth session，`getSessionUser` 不再请求 `getActiveMember`。
- session create/update hooks + PostgreSQL trigger 覆盖 active org 切换、role update、remove/leave、owner transfer、dissolve 和 multi-session 同步。
- 详见 [Session Authorization Context](.trellis/spec/backend/session-authorization-context.md) 和归档任务 [07-22-session-active-role-cache](.trellis/tasks/archive/2026-07/07-22-session-active-role-cache/)。
