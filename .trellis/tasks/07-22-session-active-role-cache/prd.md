# 优化 active organization role 查询

## Goal

减少 `getSessionUser` 为解析 active organization role 发起的额外 Better Auth 查询，同时保证 ZenStack policy 使用的角色不会因缓存失效遗漏而变得过期或过度授权。

## Background

- `src/lib/auth/session.ts:29` 先调用 `auth.api.getSession`，随后在 `:45-51` 对每个有 active org 的请求调用 `auth.api.getActiveMember`。
- `activeOrganizationRole` 会进入 `policyAuth`，直接决定 `Menu` 等业务表的 owner 写权限，因此属于授权数据而非普通展示缓存。
- 当前 Better Auth 配置没有启用 `session.cookieCache`，也没有 session additional field；session 由 PostgreSQL 持久化。
- Context7 与 Better Auth 1.6.x 源码确认：`customSession` 只改写 `getSession` 返回值，自定义返回字段不会进入 cookie cache，回调仍在每次 session 获取时执行。单独使用 `customSession` 不能消除 member-role 查询。
- Better Auth 的 `setActiveOrganization` 最终调用 `internalAdapter.updateSession`，会经过 `databaseHooks.session.update`；member role update/remove 有 organization hooks，但 leave、transfer raw SQL、多 session 等路径需要单独覆盖。

## Requirements

- S1. 实施前记录 `getSessionUser` 当前查询次数与调用路径，避免以未经验证的估算作为成功标准。
- S2. 目标是移除 request hot path 中的 `auth.api.getActiveMember`；不得用仍然逐请求查询 member 的 `customSession` 伪装成缓存优化。
- S3. 推荐方案将 `activeOrganizationRole` 作为 Better Auth session additional field 持久化，并由 session create/update hooks 维护 active org 与 role 的一致组合。
- S4. active org 切换必须原子地产生匹配该 org 的 role；无 active org 或 membership 校验失败时，两字段都清空并按无权限处理。
- S5. 角色更新、成员移除/离开、owner transfer、组织删除必须同步所有受影响的 active sessions；multi-session 下不能只更新发起操作的 token。
- S6. 任何缺失、无法解析或发现不一致的 role 都必须 fail closed，不得沿用旧 owner 权限。
- S7. Better Auth schema 变化必须通过 `pnpm ba:shadow` 生成影子 schema，再由正常 `pnpm db:push` 流程落库；不手改生成文件。
- S8. 本任务不顺带启用 cookie cache。未来启用时必须另行设计 role 变更后的 cookie 失效窗口。

## Acceptance Criteria

- [ ] `getSessionUser` 在已有 session 上不再调用 `auth.api.getActiveMember`，且 policyAuth role 与 active org 匹配。
- [ ] 新 session、切换 active org、清空 active org均得到正确的 role 字段。
- [ ] member role 升降级后，该用户所有指向该 org 的 session 都立即反映新角色。
- [ ] member remove/leave、owner transfer、organization delete 后不存在仍携带旧 owner 权限的 session。
- [ ] 多 session、无 active org、已删除 membership、并发 role change 均有 DB-backed integration 覆盖。
- [ ] `pnpm ba:shadow`、`pnpm db:generate`、`pnpm check`、`pnpm test`、`pnpm test:integration` 通过。

## Out of Scope

- 不启用 Better Auth session cookie cache或 secondary storage。
- 不把 Better Auth 的 member/organization 表交给 ZenStack 管理。
- 不为了减少查询绕过 Better Auth session 校验、过期或 impersonation 语义。

## Open Question

- 第三项是否以“完成测量后仍必须实现零额外 member 查询”为交付目标，还是允许测量显示收益不足或同步风险过高时，以保留现状并记录基线作为合格结论？

