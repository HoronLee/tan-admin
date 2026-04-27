# brainstorm: 代码与 spec 组织结构梳理

## Goal

把 `src/` 顶层目录的职责划分整理清楚，消除"同一概念两个落脚点 / 死目录 / lib 散文件 / spec ↔ 代码漂移"四类噪音。双向收敛——目标布局先讨论清，再同步改 code + spec。

## What I already know

### A. 死目录 / 单文件目录

| 目录 | 现状 | 处置候选 |
|------|------|----------|
| `src/modules/` | 完全空 | 删 |
| `src/zenstack/client.ts` | 305B，**0 处 import**（grep 已确认） | 删（或归 `src/integrations/zenstack-query/` 若未来用） |
| `src/utils/mcp-handler.ts` | 单文件，spec 提到但孤悬 | 并入 `src/lib/mcp/` |
| `src/hooks/use-mobile.ts` | 单文件 | 暂留（hooks 还会增长） |
| `src/data/demo-table-data.ts` | 单文件，demo 用品 | 移到 demo 路由旁 / 删 |

### B. 职责重叠（同一概念两个落脚点）

1. **邮件模板**：`src/emails/{invite-member,transfer-ownership}.tsx` (2 个) vs `src/components/email/*.tsx` (7 个 BA UI 模板 + EmailStyles)。`src/lib/email/templates.tsx` switch 同时 import 两边——劈裂无规则。
2. **`src/integrations/better-auth/*`**：frontend `directory-structure.md` 明文写有这个路径，**实际不存在**，better-auth 全在 `src/lib/auth/`。spec drift。
3. **`src/config/` vs `src/env.ts`**：env.ts 是 zod schema 真源，config/* 是带默认值与组合的运行时 facade（`appConfig`/`logConfig`/`telemetryConfig`）——合理中间层，但 spec **没文档化**这个分层。

### C. `src/lib/` 散文件未归位（已有子目录但没用）

| 散文件 | 应归到 |
|--------|--------|
| `error-report.ts` + `.test.ts` | `lib/errors/` |
| `zenstack-error-map.ts` + `.test.ts` | `lib/errors/` |
| `logger.ts` | `lib/observability/` |
| `sentry.client.ts` | `lib/observability/` |
| `menu-label.ts` | `lib/menu/` |
| `server-fn-middleware.ts` | `lib/server/` |
| `demo-store.ts` | demo 路由旁 / 删 |
| `utils.ts`（cn） | 留根（spec 明文契约） |

总计 7 个文件可归位，对外引用 ~17 处需调 import 路径。

## Assumptions (temporary)

- 主人确认选项 3（双向收敛）：先约定目标布局，再 code + spec 同步落地
- 不破坏现有 Better Auth / ZenStack / oRPC / 路由契约——只动"无业务语义的"组织结构
- 单文件目录不强行合并（hooks/）——除非确认未来不长

## Open Questions

（全部已收敛，见 Decision 段）

- ~~目标 `src/` 顶层布局~~ → **Kolm 化全配版**（14→10，新增 `server/` + `middleware/` + `queries/`，db.ts/env.ts 收 lib/）。`queries/` 是预防性投资：本项目目标场景（光伏电站管理这类业务平台）注定 list queryOptions 会被 ≥3 个入口（route loader prefetch + 选择器组件 + 跨页弹窗）共用，提前立规范避免 queryKey 漂移
- ~~emails 收口方向~~ → A'-3 极简版（双目录 + 2 条规则）
- ~~`src/zenstack/client.ts` 死文件处置~~ → **保留**，移到 `src/integrations/zenstack-query/client.ts`（ZenStack TanStack Query 入口，不是死代码）
- ~~lib 散文件归位~~ → 一刀切归位 + db.ts/env.ts 进 lib/
- ~~demo 用品~~ → 清理（demo-store / demo-table-data 移走或删）
- ~~spec 写作粒度~~ → 沿用 ≤350 行约束
- ~~HIGH/MEDIUM 强制项~~ → 经事实核查后纳入：HIGH-1 config server-only + 拆 barrel；HIGH-2 users/index.tsx 1079 行拆 7 个 Drawer/Dialog；MED-3 guards.ts server-only marker；MED-4 layout/ **5 个**（非 8 个）PascalCase 改 kebab-case；spec drift（mcp-todos / Header.tsx / integrations/better-auth）。**MED-6 取消**（emails/ 已 import EmailStyles，子代误报）

## Requirements (evolving)

- 目标 `src/` 顶层目录每个有明确单一职责，spec 落文档（14 → 11 顶层目录）
- 新增 `src/server/` 目录，`src/seed.ts` 移入为 `server/seed.ts`，未来按 domain 组织业务 server functions
- 新增 `src/middleware/` 目录，`src/lib/server-fn-middleware.ts` 拆分为 `middleware/{auth,logging,error}.ts`（仅 TanStack Start `createMiddleware`；oRPC middleware 保留在 `src/orpc/`）
- 新增 `src/queries/` 目录（空骨架 + spec 约束）：`queries/<domain>.ts` 导出 `<domain>QueryOptions(input)` 工厂；queryFn 内调 oRPC client 或 ZenStack `useZenStackQueries()`；queryKey 形如 `['<domain>', '<op>', ...input]`；mutate 后用 `invalidateQueries({ queryKey: ['<domain>'] })`
- `src/db.ts` → `src/lib/db.ts`、`src/env.ts` → `src/lib/env.ts`（顶层只剩入口文件）
- 删除空目录 `src/modules/`；`src/zenstack/client.ts` 移到 `src/integrations/zenstack-query/client.ts`
- 邮件模板按 A'-3 双目录契约（R1 = registry mirror，R2 = 自定义）
- `src/lib/` 散文件归位到对应子目录，更新所有 `#/` import
- HIGH-1 修复：`src/config/app.ts` 加 `import "@tanstack/react-start/server-only"`，拆 `src/config/index.ts` barrel（避免 server/client 模块混 re-export）
- HIGH-2 修复：`routes/site/_layout/users/index.tsx` 1079 行 → 抽 7 个 drawer 到 `users/_components/`，符合 800/50 约束
- MED-3 修复：`lib/auth/guards.ts` 加 server-only marker
- MED-4 修复：`components/layout/` 5 个 PascalCase 文件（AppSidebar / AppSiteSidebar / AppTabbar / ImpersonationBanner / OrganizationSwitcher）改 kebab-case，spec 立命名契约
- ~~MED-6 修复~~：取消（核查发现 `emails/{invite-member,transfer-ownership}.tsx` 第 20-21 行已 import `EmailStyles` from `#/components/email/email-styles`，子代误报）
- spec drift 修复：删除 `frontend/directory-structure.md` 中 `integrations/better-auth/*` 行；同步 mcp-handler / emails / lib 子目录化路径
- 新增 spec 段落：`src/lib/config.ts` server/client 分层契约（替代旧 `src/config/`）

## Acceptance Criteria (evolving)

- [ ] 目标 `src/` 布局图写进 spec（10 顶层目录定稿）
- [ ] `src/queries/` 空骨架建立 + spec 写入 queryOptions 写作约定
- [ ] `src/modules/` 移除
- [ ] `src/zenstack/client.ts` 移到 `src/integrations/zenstack-query/`
- [ ] `src/server/` 建立，`seed.ts` 进入
- [ ] `src/middleware/` 建立，`server-fn-middleware.ts` 拆分完成
- [ ] `src/db.ts` / `src/env.ts` 移到 `src/lib/`
- [ ] `src/config/` 收敛为 `src/lib/config.ts`（server/client 分离）；HIGH-1 server-only marker 落地
- [ ] HIGH-2：`users/index.tsx` 拆到 ≤ 800 行
- [ ] R1/R2 双目录契约写进 spec
- [ ] components/layout/ 5 个文件 kebab-case 化，spec 立命名契约
- [ ] `src/lib/*.ts` 散文件归位到子目录，全仓库 `#/...` import 更新
- [ ] `pnpm check` + `pnpm test` 通过
- [ ] spec drift 6 处修完，受影响 spec 文件互相一致

## Definition of Done

- 单元测试 / 类型检查 / Biome lint 全绿
- spec 与实际代码一致（grep 抽查无漂移）
- 每个 PR 独立可 revert，影响范围在描述里明确
- 无业务行为变更（纯结构 refactor）

## Out of Scope (explicit)

- 业务模型 / 路由 / oRPC 契约改动
- ZenStack schema 调整
- 任何 secret / env 变量改名
- 测试框架 / 构建工具替换
- `src/components/` 内部细分调整
- 路由树（`src/routes/`）重组——已有 spec 覆盖
- **品牌色统一注入**（独立任务）：把 `appConfig.brand.colors` 通过 `templates.tsx` 的 `buildBrandProps()` 注入到所有 9 个邮件模板的 `EmailColors` props，使"改 brand 一处全联动"。当前现状是 `email-styles.tsx` 的 `defaultColors` 硬编码、UI 主题在 `styles.css`、`brand.ts` 不含色——三套互不连通，留给下个 task 解决

## Technical Notes

- `#/*` 别名由 `package.json#imports` 声明（不是 tsconfig#paths）
- `src/lib/email/templates.tsx` 的 switch 是邮件分发收敛点，归并后只改 import
- `src/lib/auth/` 是好榜样：内部按 config/server/codegen/client/session/errors/guards/plan 分文件，可作 `lib/<domain>/` 范式
- 散文件迁移需配套 import codemod
- 受影响 spec 文件清单：
  - `backend/directory-structure.md`（mcp-handler 位置 / emails）
  - `backend/email-infrastructure.md`（模板目录契约）
  - `frontend/directory-structure.md`（better-auth 路径修复 + lib 子目录化 + config 分层）
  - 可能新增：`backend/config-layering.md` 或并入既有 spec

## Decision (ADR-lite)

**Context**: `src/` 顶层目录的职责划分被新人/AI 抱怨"不规范"。取证发现四类噪音：(A) 死目录与单文件目录、(B) 同一概念两个落脚点（邮件模板 / better-auth 路径漂移）、(C) `src/lib/` 散文件未归位、(D) shadcn registry 落地路径与项目意图不一致。

**Decision**:

### 1. 顶层布局：Kolm 化全配版（14 → 10）

```
src/
├── components/        # UI（含 ui/ data-table/ layout/ settings/ user/ auth/ email/）
├── routes/            # TanStack Router 文件路由
├── server/            # ★ 新增：业务 server functions（seed.ts 等，按 domain 组织）
├── middleware/        # ★ 新增：TanStack Start createMiddleware（auth/logging/error）
├── orpc/              # oRPC routers + 自身 middleware
├── queries/           # ★ 新增：queryOptions 工厂（按 domain 组织，跨 route+组件复用）
├── lib/               # 第三方实例 + 配置 + 业务 helpers
│   ├── auth/ email/ errors/ mcp/ menu/ observability/
│   ├── db.ts          # ← 从 src/db.ts 搬
│   ├── env.ts         # ← 从 src/env.ts 搬
│   ├── config.ts      # ← 替代 src/config/，server/client 分层（HIGH-1 修复）
│   └── utils.ts       # cn 单文件留根
├── stores/ emails/ hooks/ paraglide/
├── integrations/      # 第三方 UI 集成（tanstack-query/ + zenstack-query/）
└── 入口文件（router.tsx / server.ts / start.ts / styles.css / polyfill.ts / routeTree.gen.ts）
```

**消失**：`modules/`（删）、`utils/`（mcp-handler 进 lib/mcp/）、`data/`（清理 demo）、`zenstack/`（client.ts 进 integrations/zenstack-query/）、`config/`（收敛到 lib/config.ts）、`db.ts/env.ts`（顶层不留）。

### 1.5 server/ vs middleware/ vs orpc/ vs queries/ 四者边界

| 目录 | 工具 | 职责 | 业务示例（光伏电站平台） |
|------|------|------|--------------------------|
| `src/server/` | `createServerFn` | 路由 loader / action 紧耦合的业务 server functions | dashboard route 的 prefetch、工单提交表单 action |
| `src/middleware/` | `createMiddleware` (TanStack Start) | 跨 server function 复用的拦截器 | auth / logging / error |
| `src/orpc/` | oRPC | 跨组件复用的 typed RPC 业务动作（含 oRPC 自己的 middleware 链） | 告警确认 / 派单 / 报表导出 / 复杂功率聚合查询 |
| `src/queries/` | `queryOptions` factory | 跨 route loader + 组件 + 弹窗复用的 query 单元，统一 queryKey 命名空间 | 电站列表、设备列表、告警列表的 queryOptions |

ZenStack RPC（`/api/model/**`）是底层 entity CRUD 通道，由 ZenStack 生成 + policy 兜底，不在上述四个目录里写代码——业务侧通过 `queries/` 调用 `useZenStackQueries()` 间接使用。

类比：server fn = "Gin handler 紧绑路由"，oRPC = "纯 gRPC contract"，queries/ = "前端缓存键命名空间"——三者共存不互斥。

### 1.6 域边界：本任务不立规

水平四层（queries / server / orpc / components）已经把每个业务域天然横切到位。`src/modules/` 在 PR1 删除，**不**新建 `domains/` 或任何替代占位目录。

域私有代码（schema / 状态机 / 计算器 / 私有 hook）的归宿**留给具体业务接入时再决定**——本任务不预设规则、不当下回答，避免在没有真实业务样本的情况下硬编结构。`lib/` 保持基础设施定位（第三方 SDK 胶水 + 跨切关注点），不收纳业务域代码。

### 2. 邮件模板：A'-3 极简版（双目录 + 2 条规则）

- **R1**：`src/components/email/*.tsx` 是 BA UI shadcn registry 落地副本——只通过 `npx shadcn@latest add https://better-auth-ui.com/r/<x>-email.json` 维护；落地后手动把 `from "../../lib/utils"` 改成 `from "#/lib/utils"`（shadcn CLI 不识别 `package.json#imports` 别名）
- **R2**：`src/emails/*.tsx` 是项目自定义模板（registry 没提供的，如 `invite-member` / `transfer-ownership`），手写在这里
- 不写 wrapper 脚本（主人决议）；每次手工后处理 import path
- 共享 `email-styles.tsx` 仅在 R1 区，R2 模板从 `#/components/email/email-styles` import（已是现状）

### 3. lib 散文件归位 + 顶层文件下沉

| 散文件 | 归到 |
|--------|------|
| `src/db.ts` | `src/lib/db.ts` |
| `src/env.ts` | `src/lib/env.ts` |
| `src/config/{app,brand,log,telemetry}.ts` + `index.ts` | 收敛到 `src/lib/config.ts`（server-only 部分用 `import "@tanstack/react-start/server-only"` 隔离，HIGH-1 修复） |
| `src/seed.ts` | `src/server/seed.ts` |
| `src/lib/server-fn-middleware.ts` | 拆为 `src/middleware/{auth,logging,error}.ts` |
| `src/lib/error-report.ts` + `.test.ts` / `zenstack-error-map.ts` + `.test.ts` | `lib/errors/` |
| `src/lib/logger.ts` / `sentry.client.ts` | `lib/observability/` |
| `src/lib/menu-label.ts` | `lib/menu/` |
| `src/lib/demo-store.ts` | 清理（demo 用品） |
| `src/lib/utils.ts` | 留 lib/ 根（cn helper，spec 明文契约） |
| `src/utils/mcp-handler.ts` | `src/lib/mcp/handler.ts` |
| `src/zenstack/client.ts` | `src/integrations/zenstack-query/client.ts` |
| `src/data/demo-table-data.ts` | 删（demo 用品） |

### 4. spec drift 修复

- `frontend/directory-structure.md`：删除"UI integration `src/integrations/better-auth/*`"行（路径不存在且不必存在——BA UI hooks 直接在 `components/auth/` `components/settings/` import）
- `backend/directory-structure.md`：同步 mcp-handler 新位置（`lib/mcp/`）+ 邮件模板双目录契约
- `backend/email-infrastructure.md`：写入 R1/R2 边界规则
- `frontend/directory-structure.md`：写入 `lib/` 子目录化范式 + `config/` 派生 facade 分层

**Consequences**:

- 业务行为零变更（纯结构 refactor），test/lint/typecheck 是唯一验证
- 散文件迁移影响 **18 处** lib/ import（已实测），加上 db.ts/env.ts/seed.ts/mcp-handler.ts/zenstack-client.ts 下沉、config 收敛、middleware 拆分相关，总计预估 ~30 处 import 路径需手动 grep+改
- `src/components/email/email-styles.tsx` 视为"半 vendor"——下次 `shadcn add` 会重置 `defaultColors`；品牌色走 props 注入路径（独立任务）
- `src/zenstack/client.ts` 改名 path 后保留——它是 ZenStack TanStack Query 入口，未来代码生成会用到
- `email:dev` preview 现状不变（`--dir ./src/emails`）；BA UI registry 模板看官方站，自家模板本地 preview——天然分工
- HIGH-1 修复后，`config` 不再是模块边界陷阱：`lib/config.ts` 内部用 `import "@tanstack/react-start/server-only"` 标 server 段，client 段独立 export，barrel re-export 不再混层

**PR 拆分**（3 个独立可 revert）:

1. **PR1 — 死代码清理 + lib 散文件归位 + 顶层下沉**
   - 删 `src/modules/`，清 demo 用品
   - 移：`src/db.ts → lib/db.ts`、`src/env.ts → lib/env.ts`、`src/seed.ts → server/seed.ts`、`src/utils/mcp-handler.ts → lib/mcp/handler.ts`、`src/zenstack/client.ts → integrations/zenstack-query/client.ts`
   - 归位 lib/ 散文件（errors / observability / menu）
   - 全仓 grep 改 import；`pnpm check` + `pnpm test` 绿

2. **PR2 — middleware 拆分 + config 收敛 + queries 骨架 + HIGH/MEDIUM 修复**
   - 建 `src/middleware/`，拆 `lib/server-fn-middleware.ts` → `auth.ts / logging.ts / error.ts`
   - 建 `src/queries/`（空骨架 + README 写约定，本 PR 不迁移现有 inline queryOptions）
   - 收敛 `src/config/` → `lib/config.ts`（HIGH-1：server-only 隔离）
   - 修 HIGH-2：`users/index.tsx` 1079 行拆 drawer 到 `_components/`
   - 修 MED-3/4：guards.ts server-only marker、layout/ 5 文件 kebab-case 化（MED-6 经核已不存在，取消）

3. **PR3 — spec 同步**
   - 写 `frontend/directory-structure.md` 新布局（10 顶层 + server/middleware/queries/integrations 边界）
   - 删 better-auth 漂移行；加 lib 子目录化范式；加 `lib/config.ts` server/client 分层契约
   - 写 queries/ 写作约定（queryOptions 工厂 + queryKey 命名空间 + invalidate 模式）
- 写域边界规则：水平四层为主；`domains/` / `modules/` 不当下立规，留给具体业务接入再决定；`lib/` 保持基础设施定位，不收纳业务域代码
   - 修 `backend/directory-structure.md`（mcp-handler / emails / seed 新位置）
   - 扩 `backend/email-infrastructure.md`：A'-3 R1/R2 规则
   - components/ 命名契约（kebab-case）写进 frontend spec
   - 新增 `guides/server-fn-vs-orpc-vs-queries.md`：四层边界决策树（业务侧选型必看）

**Out 本任务**（独立 task）：品牌色统一注入；测试盲点补齐（auth/email/server-fn-middleware/logger/mcp-handler/stores/menu）。

---

## Decision 修订记录

### MED-3 撤回：`lib/auth/guards.ts` 不加 server-only marker

**原决策**（PR2 计划）：给 `src/lib/auth/guards.ts` 加 `import "@tanstack/react-start/server-only"` marker，与 `auth/{config,server,session,db}.ts` 对齐。

**撤回原因**：guards.ts 通过 `createServerFn(...).handler(...)` 导出的 `requireSiteAdmin` / `requireOrgMemberRole` 是**同构 RPC 桥**——TanStack Start 编译器会在 client bundle 中把 handler body 剥成 RPC 桩，所以 client route 的 `beforeLoad` import 它是 **预期使用模式**，不是 leak。

实测尝试加 marker 后，触发了 **5 处** route 文件的 import-protection denial：

- `routes/(workspace)/_layout/settings/organization/index.tsx`
- `routes/(workspace)/_layout/organization/index.tsx`
- `routes/(workspace)/_layout/teams/index.tsx`
- `routes/(workspace)/_layout/invitations/index.tsx`
- `routes/site/_layout/users/index.tsx`

真正需要 server-only marker 的是：`auth/server.ts`、`auth/session.ts`、`auth/config.ts`、`auth/db.ts`（已生效）。guards.ts 是它们的 RPC 桥工厂，**不能**标 server-only。

**spec 落地**：`.trellis/spec/frontend/directory-structure.md` § "决策记录 / Pitfalls" 写入此条反范式警告。

### HIGH-2 余量：UsersPage 函数体未进一步拆分

**已达成**：`routes/site/_layout/users/index.tsx` 主文件从 1079 行 → 拆 7 个 drawer / dialog 到 `users/-components/` 子目录后，主文件 ≤ 800 行（CLAUDE.md 文件级硬约束达成）。

**未达成**：`UsersPage` 函数体仍约 327 行，超 PRD 理想值（单函数 50 行）。

**为何不进一步拆**：进一步压到 50 行需要引入 `useUserMutations()` 自定义 hook + columns factory + 复杂的 props drilling 架构改造。当前业务**单 route 单消费者**，提前抽 hook 反而增加间接性，调试时多跳一层；columns factory 又会让 cell render closure 失去对 page 状态的直接访问，需要补 context。

ROI 不划算——本任务暂不做。后续若 users 路由继续生长（出现第二个使用相同 mutation 集合的位置），再触发拆分。

### MED-6 取消（前置事实核查）：`emails/*` 已 import EmailStyles

PR2 子代曾报"`src/emails/{invite-member,transfer-ownership}.tsx` 没 import EmailStyles，视觉与 BA UI 模板不一致"。事实核查发现两文件第 20-21 行**已经** `import { EmailStyles } from "#/components/email/email-styles"`，子代误报。MED-6 在 PR2 阶段直接取消，不修任何代码。

