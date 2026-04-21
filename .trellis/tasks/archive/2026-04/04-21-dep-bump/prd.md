# 全量依赖升级（2026-04）

## Goal

把 `package.json` 中 22 个 outdated 依赖一次性升到最新 stable：Tier 1 patch + Tier 2 minor + Tier 3 major。所有 breaking changes 在本 task 内修掉，产出一次性通过 lint/typecheck/test/build/db:push/dev-UI 的完整验证结果。

## Why

- 刚交付 T3（oRPC + ZenStack 双栈），后续 task 会大量 copy-paste 这个 pattern 到其它模型——在 pattern 扩散前把依赖拉到 current 更划算
- T3 发现 `baseUrl` 在 TS 5.9 已是 deprecated 告警，TypeScript 6.0 会直接移除；不升现在，几个月后 CI 可能突然红
- ZenStack 3.6 / Vitest 4 / lucide-react 1.x / Vite 8.0.9 的修复都集中在最近一两个 minor，跨度小就一起吃掉
- Maintenance burden：每 1–2 个月被动处理 outdated 远比一次性贴齐成本低

## What I already know（仓库摸底 · 2026-04-21）

- T3 刚交付，`pnpm check` / `pnpm tsc --noEmit` / `pnpm test` 全绿（除 `TS5101 baseUrl deprecated` 预存量告警）
- 22 个 outdated 里 Tier 3 major 的是：TypeScript / @types/node / Vitest / jsdom / lucide-react
- `tsconfig.json` 使用 `baseUrl: "."`（给 zenstack bare path `zenstack/schema` 用）——TS 6.0 移除时需要迁移到 `paths` 或 `package.json#imports`
- `vitest.config.ts` / `vite.config.ts` 存在，Vitest 4 若改配置 API 可能需要重写
- lucide-react 在 `src/components/layout/AppSidebar.tsx`、`Header.tsx`、其它多处使用——0.x → 1.x 若改导入路径或 prop 名需全仓替换
- 项目是 pnpm monorepo 模式的单仓（`pnpm-lock.yaml`），升级走 `pnpm update --latest` 或手动改 `package.json` + `pnpm install`

## Research Notes（Phase 1.2 填充）

_待补：TS 6 / Vitest 4 / lucide-react 1 / jsdom 29 / @types/node 25 各自的 breaking changes，产出到 `research/`。_

## Feasible approaches

### Approach A：单 PR 全升（**已选**）

**How**: 一次性 `pnpm update --latest` 拉齐所有 22 个依赖，修所有 breaking changes（TS 6 baseUrl、Vitest 4 config、lucide-react 1 imports 等）在同一 commit 内完成。最终 `pnpm check && pnpm tsc --noEmit && pnpm test && pnpm build && pnpm db:push` 全绿 + dev server 手测 `/roles` CRUD。
- Pros: 依赖关系一次吃完（如 vitest 4 ↔ vite 8.0.9 ↔ jsdom 29 互相依赖）；PR 数量最少；commit history 最清晰
- Cons: 单次回归面大；若某个 major 特别难搞会拖整批

### Approach B：按 Tier 分 commit

**How**: Tier 1 patch 一个 commit → Tier 2 minor 一个 → Tier 3 每个 major 一个。
- Pros: git bisect 粒度细；单次 blast radius 小
- Cons: 部分 major 互相依赖（vitest 4 和 jsdom 29 可能须一起升），分批反而扯皮

### Approach C：仅 Tier 1+2

**How**: 跳过所有 Tier 3 major，后续再起 task。
- Pros: 最稳
- Cons: 把 TS 6 baseUrl、Vitest 4 的债推到后面，迟早要还

## Decision (ADR-lite)

### D1 · 升级范围：**A · 全升 Tier 1+2+3**（2026-04-21）
- **Context**: T3 刚交付、仓库状态绿，有充裕窗口吃 major
- **Decision**: 所有 22 个 outdated 升到最新 stable
- **Consequences**:
  - breaking change 多；但 lint/tsc/test 能抓大部分
  - `TS5101 baseUrl deprecated` 从"告警"变成"真坏"；需在同 PR 内迁移 import 方案
  - pnpm-lock.yaml 会有大规模 diff，review 时别逐行读，看顶层变化即可

### D2 · 分批策略：**X · 单 commit 全升**（2026-04-21）
- **Context**: major 间互相依赖（vitest 4 / vite / jsdom / @types/node），分批会产生"中间态全绿但组合起来坏"的假绿
- **Decision**: 一次性 `pnpm update --latest` + 修 breaking + 验证
- **Consequences**:
  - 如中途发现某个 major 特别难（例如 lucide-react 1.x 把几十个图标改名），**允许回退到该单包到旧版**（而非整批放弃），并在 prd Consequences 记录
  - 最终 commit message 需列出每个被回退的包

### D3 · 验证门槛：**N · 完整**（2026-04-21）
- **Context**: 既然全升，验证必须兜底
- **Decision**: 跑 `pnpm check` + `pnpm tsc --noEmit` + `pnpm test` + `pnpm build`（生产构建）+ `pnpm db:push`（dry-run 确认 schema 不破）+ dev server 手测 `/roles` 完整 CRUD
- **Consequences**:
  - `pnpm build` 是新增验证项——若 Vite 8.0.9 / @tailwindcss/vite 4.2.3 打包行为变化，这里会第一时间暴露
  - dev server 手测覆盖 ZenStack hooks 序列化、shadcn 组件渲染、PolicyPlugin 在 runtime 的行为（单测抓不到）

## Requirements

1. **升级**
   - `pnpm update --latest` 拉齐所有 22 个 outdated
   - `pnpm install` 后 lock 文件同 commit

2. **breaking change 修复**
   - TypeScript 6.0：若 `baseUrl` 真被移除，迁移 `zenstack/schema` 这类 bare path import 到 `tsconfig.json#paths` 或依赖 `package.json#imports`
   - Vitest 4：若 `defineConfig` API 改版，更新 `vitest.config.ts`
   - lucide-react 1.x：按 release notes 替换被改名的图标 import
   - jsdom 29 / @types/node 25：如有 API 断裂按 error 逐个修
   - @zenstackhq/* 3.6：读 changelog 确认 `useClientQueries` / `RPCApiHandler` / `PolicyPlugin` / `$setAuth` 无签名改变；若有，同步修 `src/db.ts` / `src/zenstack/client.ts` / `src/routes/api/model/$.ts`

3. **验证**
   - `pnpm check`、`pnpm tsc --noEmit`、`pnpm test`、`pnpm build`、`pnpm db:push` 全绿
   - dev server 手测：登录 `admin@example.com` / `admin@123`，`/roles` 列表 / 新建 / 编辑 / 删除 全流程走通

4. **文档**
   - 本 PR 的 commit message 列出所有包版本跃迁
   - 若有因 breaking 导致的代码改动，按 `.trellis/spec/` 的既有结构更新相关 spec（通常是少量——如 TS config 迁移 / vitest 配置风格）

## Acceptance Criteria

- [ ] `pnpm outdated` 输出为空（或仅剩 peer-locked 不能升的）
- [ ] `pnpm check` + `pnpm tsc --noEmit` + `pnpm test` + `pnpm build` 全绿
- [ ] `pnpm db:push` 无 schema diff 误报（仅可能出现的 "already in sync"）
- [ ] Dev server `/roles` 页面登录后 C/R/U/D 四种操作均成功，toast 正确，字段验证错误正确显示
- [ ] 若有回退的包，prd "Consequences" 段落明确记录版本 + 原因

## Definition of Done

- 所有 AC 勾选完成
- `.trellis/spec/` 若有 TS config / vitest 配置等变化，对应 spec 同步更新
- `.env.local` 无新增变量（依赖升级不应引入新配置）
- `pnpm-lock.yaml` 正确提交

## Out of Scope

- 主动添加新依赖（升级只跟既有依赖的最新 stable）
- 废弃依赖的替换（例如把 jsdom 换成 happy-dom）—— 独立 task
- TanStack 生态的 major 跃迁（react-query 6 / router 2 / form 2 等）——当前都没到 major，不涉及
- better-auth / orpc / tanstack-start 等 "@latest" 标记的 deps —— 它们已经跟随 latest，本 task 只处理固定版本的 outdated
- Node.js runtime 版本升级（`engines` / CI 镜像）—— 独立 task
- React 19 / React Compiler 的 plugin 版本跃迁（未 outdated）

## Technical Notes

- 回退策略：单包回退到旧版时用 `pnpm add <pkg>@<version>` 精确钉住，避免 `^` 自动漂移
- 升 ZenStack 3.6 之前先在 `pnpm view @zenstackhq/cli` 确认 3.6.0 的 CHANGELOG 是否有 server adapter 签名变化——T3 刚落地的 `/api/model/$` 是最大的敌对面
- lucide-react 1.x 若改名图标，可用 grep 定位：`grep -r "from \"lucide-react\"" src/`
- TypeScript 6 关键迁移点：`baseUrl` / `compilerOptions.noPropertyAccessFromIndexSignature` 新默认值 / `verbatimModuleSyntax` 变化——以实际 tsc 报错为准，不预测

## References

- pnpm update --latest docs：https://pnpm.io/cli/update
- TypeScript 6.0 release notes（Phase 1.2 查）
- Vitest 4.0 migration guide（Phase 1.2 查）
- lucide-react v1 changelog（Phase 1.2 查）

---

> Brainstorm 完成（2026-04-21）。D1–D3 决策固化为 A/X/N。Task 状态转入 `in_progress`，进入 Phase 1.2 research（深挖 major 版 breaking changes）后再实施。
