# 优化 active organization role 查询：技术设计

## Current contract

`getSessionUser` 把 Better Auth session 的 active org 与 member role 合并进 `policyAuth`，随后 `authDb.$setAuth` 用它执行 ZenStack policy。role 是授权输入，不是展示缓存。

## Candidate design

- 在 Better Auth `session.additionalFields` 增加 nullable `activeOrganizationRole`，由 PostgreSQL session row 持久化。
- 不采用 `customSession` 作为“缓存”：官方行为是 custom response field 不进入 cookie cache，回调仍会在每次取 session 时执行，不能消除 member lookup。
- `databaseHooks.session.create.before` 一次查询 earliest member 的 organizationId + role，同时写入两个 session 字段。
- `databaseHooks.session.update.before` 覆盖 Better Auth `setActiveOrganization` 的 `internalAdapter.updateSession`，当 activeOrganizationId 变化时同步解析对应 member role；无 membership 时清空 active org/role并 fail closed。
- `getSessionUser` 只从 session field 读取 role；缺失/非法 role 不当作 owner，按无 org-role 处理。

## Mutation consistency matrix

| Mutation path | Required sync |
|---|---|
| session create | 写 active org + role |
| set active organization | 同一 session 更新 org + role |
| update member role | 目标用户全部 active sessions 更新 role |
| remove member | 目标用户该 org 的 sessions 清空 org + role |
| leave organization | 不能只清当前 token；需覆盖该用户全部 sessions |
| owner transfer raw SQL | 被降级 owner 的全部 sessions 更新 |
| organization dissolve/raw SQL | 受影响 sessions 清空 |
| multi-session/impersonation | 按 userId + orgId 更新全部 token，不能只依赖请求 token |

## Hook coverage gate

Better Auth organization hooks 已覆盖 role update/remove，但 installed plugin 的 leave path 不触发同一 after hook，且项目有 raw SQL transfer/dissolve。实施前必须验证以下方案之一能覆盖所有路径：

1. 可用的 Better Auth member database hooks + organization hooks；
2. 项目自有 leave/dissolve service wrapper，所有入口统一调用；
3. 可由受控 migration 管理的 PostgreSQL trigger。

若三者都不能在当前部署流程中可靠覆盖，不能上线持久化 role；保留现状 member lookup，并记录基线结果。这是授权一致性门槛，不是实现失败。

## Rollback

- `activeOrganizationRole` 保持 nullable，旧 session 可自然回填。
- 若同步失败，`getSessionUser` 临时回退到 `auth.api.getActiveMember`，而不是相信 stale session field。
- 不启用 cookieCache/secondaryStorage；否则 role 变更会新增 cookie freshness 窗口。

