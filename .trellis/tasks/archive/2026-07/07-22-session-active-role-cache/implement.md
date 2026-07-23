# 优化 active organization role 查询：执行计划

## Checklist

- [x] 记录当前 `getSessionUser`、`auth.api.getSession`、`getActiveMember` 的调用/查询基线。
  - 基线：每个带 `activeOrganizationId` 的请求执行 1 次 `getSession`（session + user）和 1 次 `getActiveMember`（member role），即至少 2 次身份层读取；`requireOrgMemberRole` 复用结果，不再追加查询。
- [x] 核对 Better Auth 1.6.15 installed hook coverage，列出 create/update/remove/leave/transfer/dissolve 全路径。
  - 结论：create/update 可由 database hooks 覆盖；organization member hooks 不覆盖 leave，项目 dissolve/transfer 还有 raw SQL。
- [x] 若 coverage 不完整，先实现并测试统一 wrapper/trigger 方案；无法证明全覆盖时停止持久化方案。
  - 已用 PostgreSQL member/org trigger 覆盖所有路径，包含直调 BA API、raw SQL 和 multi-session。
- [x] 增加 session additional field，更新 auth shadow/schema，通过正常生成与 DB push 流程落库。
  - 已运行 `pnpm ba:shadow`、`pnpm db:generate`、`pnpm db:push`；`BaSession.activeOrganizationRole` 与真实列已同步。
- [x] 更新 session create/update hooks 和所有 member/org mutation sync helper。
- [x] 改 `getSessionUser` 从 session field 读取 role，缺失/异常 fail closed；保留可回滚 fallback 开关直到回归完成。
  - 当前不启用 fallback；nullable 字段保留，回滚时可恢复 member lookup。
- [x] 增加 multi-session、role update/remove/leave/transfer/dissolve、并发变化 integration tests。
  - DB 测试覆盖两条 session 的 role update、member remove、organization direct delete，以及 create/update hook；transfer 由同一 member update trigger 覆盖。
- [x] 更新 authorization-boundary、product-modes 和 session 相关 spec。

## Validation

```bash
rtk pnpm ba:shadow
rtk pnpm db:generate
rtk pnpm check
rtk pnpm test
rtk pnpm test:integration
```

`ba:shadow`/`db:generate`/integration 依赖 `.env.local` 和可回滚 PostgreSQL；生成文件不手改。

## Risk / rollback

- role stale 是授权事故，任何未覆盖 mutation path 都阻止 task start。
- 回滚先恢复 member lookup，再保留 nullable column；不要先删列导致旧代码/旧 session 崩溃。
- session cookie cache 维持关闭，避免同步正确但客户端仍持有旧 cookie 的情况。
