# TODO

来自 `06-19-architecture-layering-cleanup` 任务收尾 review 的已知后续项（当时有意不修，不影响正确性与安全性）。

## 1. 菜单管理页：super-admin 无法从 UI 创建全局菜单

- **现状**：`src/routes/(workspace)/_layout/settings/organization/menus.tsx` 的 create 固定写 `organizationId = activeOrganizationId`。super-admin 在有 active org 时创建的菜单会被 scope 到该 org，无法创建全局菜单（编辑已有全局菜单不受影响；全局菜单目前只能靠 seed 或直接改库）。
- **方向**：给 super-admin 加一个 scope 选择器（全局 / 当前 org），owner 仍固定本 org。policy 已支持：admin 可写任意 scope 并可 re-scope（post-update 规则）。

## 2. oRPC SSR 走 HTTP self-call 的性能开销

- **现状**：`src/orpc/client.ts` 为守住 client import 边界（只 `import type` router），SSR 分支通过 `serverOrigin()` 回环 HTTP 调 `/api/rpc`，每次 SSR 渲染多一次本机 HTTP 往返（如侧边栏的 `getUserMenus`）。
- **方向**：若 SSR 压力变大，按 oRPC 官方 "Optimizing SSR" 文档改造：在 server-only 模块注册 `globalThis.$client = createRouterClient(router)`，`client.ts` 做 `globalThis.$client ?? createORPCClient(browserLink)` fallback，消除自调开销且不破坏 import 边界。
- **部署注意**：`serverOrigin()` 的 fallback 链含 `BETTER_AUTH_URL`（公网地址）；若部署环境存在 hairpin 限制，显式设 `SERVER_URL` 指向本机。

## 3. `getSessionUser` 每请求多一次 `getActiveMember` 查询

- **现状**：`src/lib/auth/session.ts` 为把 `activeOrganizationRole` 桥进 ZenStack `policyAuth`，对每个带 active org 的请求额外调一次 `auth.api.getActiveMember`（一次 DB 往返）。`requireOrgMemberRole` 已复用该结果，不重复查。
- **方向**：请求量大时用 Better Auth 的 customSession 插件或 session databaseHooks 把 active-org role 缓存进 session，换 org / 改角色时刷新。
