# chore(deps): bump zenstack 3.6.0 → 3.6.2 + unpin server/tanstack-query

## Goal

把 ZenStack 整套从 3.6.0 升到 3.6.2（patch 升级），同时把当初无意中钉死成精确版本的 `@zenstackhq/server` 和 `@zenstackhq/tanstack-query` 改回 `^3.6.2`，让后续 patch 自动跟进。

这是后续 "B 方案影子机制" 改造前的 chore 步骤——隔离依赖升级风险，不和重构搅在一起。

## What I already know

- 当前依赖（`package.json`）：
  - `@zenstackhq/cli           ^3.6.0`
  - `@zenstackhq/orm           ^3.6.0`
  - `@zenstackhq/plugin-policy ^3.6.0`
  - `@zenstackhq/schema        ^3.6.0`
  - `@zenstackhq/server         3.6.0`  ← 钉死
  - `@zenstackhq/tanstack-query 3.6.0`  ← 钉死
- 钉死原因：当初是 LLM 习惯写死，**不是 incident 驱动**。可以无负担解开。
- 3.6.0 → 3.6.2 之间的 release notes：
  - 3.6.1：CLI 加 `--random-prisma-schema-name`（并行安全）；ORM 接受 plain date string
  - 3.6.2：Nuxt h3 peer 修复（与 TanStack Start 无关）；policy delegate base model post-update SQL fix；ORM m2m join 表 PG schema 修复
- 我们的 `zenstack/schema.zmodel` 不使用 delegate / inherit（已 grep 确认），3.6.2 的 policy 修复对我们 0 影响
- 我们也没有 m2m 显式 join 表（业务表暂只有 Menu），3.6.2 的 ORM 修复对我们 0 影响
- 结论：**纯 bug fix patch，安全升级**

## Assumptions

- pnpm-lock.yaml 升级后能正常解析，无 peer 冲突
- `pnpm zen generate` 重生 `zenstack/{schema,models,input}.ts` 与升级前 diff 应仅有版本号 / 内部注释级别变化
- `pnpm tsc --noEmit` 通过（patch 升级不应改公开类型）
- dev server 启动 + 登录一次能正常工作（policy 引擎仍生效）

## Requirements

- [ ] 把 6 个 `@zenstackhq/*` 包升到 `^3.6.2`
- [ ] 把 `@zenstackhq/server` 和 `@zenstackhq/tanstack-query` 从精确版本改回 caret range
- [ ] `pnpm zen generate` 重生成产物，diff 只允许版本/内部注释变化
- [ ] `pnpm tsc --noEmit` 通过
- [ ] `pnpm test` 通过
- [ ] dev server 启动正常（运行 `pnpm dev` 验证 boot 不崩、登录页可达）
- [ ] commit 信息按 conventional commit：`chore(deps): bump zenstack 3.6.0 → 3.6.2 + unpin server/tanstack-query`

## Acceptance Criteria

- [ ] `package.json` 6 个 zenstack 包全部为 `^3.6.2`
- [ ] `pnpm-lock.yaml` 已更新，无遗留 3.6.0 引用
- [ ] `pnpm tsc --noEmit` 0 报错
- [ ] `pnpm test` 全绿
- [ ] `pnpm zen generate` 输出无 warning，产物 diff 已 review
- [ ] `pnpm dev` 启动到 `:3000`，能访问登录页（`/auth/login` 等）

## Definition of Done

- [ ] 上述全部 Acceptance Criteria 通过
- [ ] commit 已创建（不 push）
- [ ] CLAUDE.md / spec 无需更新（patch 升级不改契约）

## Out of Scope

- ❌ 不做 lib/auth/ 目录重构（PR-2 单独做）
- ❌ 不做 BA 影子 codegen 机制（PR-3 单独做）
- ❌ 不升其它依赖（package.json 里其它包不动）
- ❌ 不动 zmodel 里的影子声明（保留现状直到 PR-3 决定）

## Technical Approach

```bash
pnpm up "@zenstackhq/cli@^3.6.2" \
        "@zenstackhq/orm@^3.6.2" \
        "@zenstackhq/plugin-policy@^3.6.2" \
        "@zenstackhq/schema@^3.6.2" \
        "@zenstackhq/server@^3.6.2" \
        "@zenstackhq/tanstack-query@^3.6.2"

pnpm zen generate
pnpm tsc --noEmit
pnpm test
pnpm dev   # 手动 smoke test 后 Ctrl+C
```

如果 `pnpm up` 不能一次性把钉死的两个包改回 caret（pnpm 行为差异），fallback：

1. 手改 `package.json` 把 `"@zenstackhq/server": "3.6.0"` → `"^3.6.2"`，对 tanstack-query 同样
2. 跑 `pnpm install`
3. 验证 `package.json` 中 6 个包统一为 `^3.6.2`

## Decision (ADR-lite)

**Context**: ZenStack 提示新版本 3.6.2 可用；同时发现 server/tanstack-query 被钉死成精确版本但无 incident 记录支持这个钉死决策。

**Decision**: 一次性升到 3.6.2 并解开钉死，单独成 PR，不与即将进行的 lib/auth 目录重构 / ba-shadow codegen 混合。

**Consequences**:
- 优点：依赖始终跟最新 patch；后续重构 PR 不背依赖锅；有问题 git revert 单一 commit 即可。
- 风险：极低（patch + 内部 bug fix）；本仓库不命中 3.6.2 修复的两个具体 bug，但跟进新版仍有未来收益。

## Technical Notes

- 受影响文件：仅 `package.json` + `pnpm-lock.yaml` + `zenstack/{schema,models,input}.ts`（zen generate 产出）
- 不需要数据库迁移（patch 升级不改 schema 引擎）
- 不需要清空 node_modules（pnpm up 增量更新）
- 后续 PR 计划：
  - PR-2：`refactor(lib): extract auth/ and email/ subdirectories`（直接深路径，不做 barrel）
  - PR-3：`feat(auth): add ba-shadow codegen pipeline`（_better-auth.zmodel + scripts/ba-shadow.mjs + auth/codegen.ts + CI drift check）
