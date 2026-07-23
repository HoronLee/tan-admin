# Session Authorization Context

> Better Auth session 中的 active organization 与 member role 是 ZenStack policy 的授权输入。

## 1. Scope / Trigger

适用于以下变更：

- 修改 `src/lib/auth/session.ts` 的 `policyAuth` 组装；
- 修改 Better Auth `session.additionalFields` 或 `member.role` 生命周期；
- 修改 `pnpm db:push`、`pnpm auth:migrate`、`pnpm db:seed` 的身份表初始化流程。

## 2. Signatures

关键数据库字段：

```text
session.activeOrganizationId: text | null
session.activeOrganizationRole: text | null
member.organizationId: text
member.userId: text
member.role: text
```

同步入口：

```text
databaseHooks.session.create.before(session)
databaseHooks.session.update.before(session, authContext)
scripts/ensure-auth-session-role-sync.mjs
```

`pnpm db:push`、`pnpm auth:migrate`、`pnpm db:seed` 均幂等执行同步脚本。

## 3. Contracts

`getSessionUser()` 只读取 Better Auth `session` 行中的：

- `activeOrganizationId`
- `activeOrganizationRole`

它不在每个请求里调用 `auth.api.getActiveMember`。角色字段缺失、空字符串或 active organization 缺失时，返回 undefined，按无组织角色处理。

`activeOrganizationRole` 通过 `session.additionalFields` 持久化，字段保持 nullable，旧 session 在迁移期间会 fail closed，不得把旧值推断成 owner。

### Lifecycle Synchronization

| 入口 | 同步机制 | 覆盖范围 |
|---|---|---|
| session create | `databaseHooks.session.create.before` | 按 active org（或最早 member）写入 org + role |
| set active organization | `databaseHooks.session.update.before` | 校验 membership 后原子写入匹配 role；无 membership 清空两字段 |
| member role update | PostgreSQL `AFTER UPDATE OF role` trigger | 该用户指向该 org 的所有 session |
| member remove / leave | PostgreSQL `AFTER DELETE` trigger | 该用户指向该 org 的所有 session，清空 org + role |
| owner transfer raw SQL | member update trigger | 不依赖 Better Auth endpoint，事务内同步 |
| organization delete / dissolve | organization delete trigger + member delete trigger | 所有指向该 org 的 session |

触发器安装脚本为 `scripts/ensure-auth-session-role-sync.mjs`。它只负责 session role 列和数据库 invariant；Better Auth 仍是 user/member/session 的身份层 owner。

### Design Decision: Database Trigger

`organizationHooks` 在 Better Auth 1.6.15 中覆盖 member add/remove/role update，但 `leave` 直接删除 member，项目还存在超管 dissolve 和 owner transfer 的 raw SQL。仅靠 hook 或 UI wrapper 会漏掉直调 BA API 和并发 session。trigger 随 member/org 事务执行，能覆盖这些路径并避免旧 owner 权限残留。

## 4. Validation & Error Matrix

| 条件 | 处理 | 结果 |
|---|---|---|
| active org 与 role 都是非空字符串 | 直接写入 policy auth | 使用该 org role |
| 缺少 active org 或 role | 不查询 member、不猜测旧值 | role 为 undefined，按无组织权限 |
| active org 没有对应 membership | session hook 清空两字段 | 按无组织权限 |
| member role 更新 | member trigger 更新该 user + org 的全部 session | 所有 token 立即使用新 role |
| member 删除 / leave | member trigger 清空全部受影响 session | 旧权限失效 |
| organization 删除 / dissolve | organization trigger 清空该 org 的全部 session | 旧权限失效 |

## 5. Good / Base / Bad Cases

- Good：切换 active org 时由 session update hook 查询 membership，并成对写入 org + role。
- Base：旧 session 只有 `activeOrganizationId` 时，迁移后继续可读，但角色按 undefined 处理，用户重新建立 session 后回填。
- Bad：在 `getSessionUser()` 中再次调用 `auth.api.getActiveMember`，或只更新当前请求 token，都会重新引入请求热路径查询或 multi-session 旧权限。

## 6. Tests Required

- 单元测试：断言缺失 active org、缺失 role、空白 role 全部 fail closed。
- 数据库集成测试：断言 session create/update 写入匹配 role。
- 多 session 集成测试：断言 member role update 更新两个以上 token，member remove 清空所有 token。
- 组织删除集成测试：断言绕过 member hook 直接删除 organization 仍清空 session。
- 生成链路：`pnpm ba:shadow`、`pnpm db:generate`、`pnpm db:push` 均成功。

## 7. Wrong vs Correct

### Wrong

```ts
const member = await auth.api.getActiveMember({ headers });
policyAuth.activeOrganizationRole = member?.role;
```

### Correct

```ts
policyAuth.activeOrganizationRole = resolveActiveOrganizationRole(session);
```

角色字段由 session hook 和数据库 trigger 维护，读取路径只消费持久化结果。

## Forbidden Changes

- 不启用 `session.cookieCache`，否则 cookie freshness 会重新引入 role 失效窗口。
- 不在 `getSessionUser` 中恢复逐请求 `getActiveMember`，除非明确回滚本方案并同步更新本契约。
- 不把 Better Auth 表改成 ZenStack 可操作 model；影子仍是 `@@ignore`。
- 不手改 `zenstack/_better-auth.zmodel`；配置变更后必须运行 `pnpm ba:shadow`。

## Validation Commands

```bash
pnpm ba:shadow
pnpm db:generate
pnpm db:push
pnpm check
pnpm test
pnpm test:integration
```
