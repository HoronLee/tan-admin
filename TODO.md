# TODO

来自 `06-19-architecture-layering-cleanup` 任务收尾 review 的已知后续项（当时有意不修，不影响正确性与安全性）。

已完成：

- 菜单 scope、SITE/WORKSPACE surface 与双动态 Sidebar 已由 `07-22-menu-global-scope` 实现并验证。
- oRPC SSR 已由 `07-22-orpc-ssr-direct-client` 改为 server-only in-process router client；浏览器仍走 `/api/rpc`。

## 1. `getSessionUser` 每请求多一次 `getActiveMember` 查询

- **现状**：`src/lib/auth/session.ts` 为把 `activeOrganizationRole` 桥进 ZenStack `policyAuth`，对每个带 active org 的请求额外调一次 `auth.api.getActiveMember`（一次 DB 往返）。`requireOrgMemberRole` 已复用该结果，不重复查。
- **方向**：请求量大时用 Better Auth 的 customSession 插件或 session databaseHooks 把 active-org role 缓存进 session，换 org / 改角色时刷新。
