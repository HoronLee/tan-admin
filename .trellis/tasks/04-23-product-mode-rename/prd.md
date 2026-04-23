# 产品形态 flag 重命名（TENANCY_MODE → ???）

## Goal

tan-admin 的定位已明确：**面向"甲方交付（私有化部署）"和"公开 B2B SaaS"两种业务形态的快速开发脚手架**。

当前 `TENANCY_MODE=single|multi` / `VITE_TENANCY_MODE` 的命名**误导架构读者**，让人误以为是"单租户 vs 多租户"的隔离模型切换。实际上它只是"产品交付形态"的开关——底层始终是 BA organization 的 multi-workspace 模型（shared tables + `organizationId` 过滤），隔离由 ZenStack policy 在业务层兜底，与此 flag 无关。

一次性完成：env schema / 默认值 / 业务代码引用 / CLAUDE.md / spec 文档 / i18n 中的字面引用，全部对齐新命名与新定位描述。

## What I already know

### 项目定位（主人确认）

- tan-admin = **快速开发脚手架**，服务两类业务：
  1. 甲方私有化交付：一家公司一个后台，seed 默认组织 + 超管，用户注册自动入伙，不能自建 org
  2. 公开 B2B SaaS（workspace 模型，像 Slack / Notion / Linear）：任何人注册即成为自己 workspace 的 owner
- 严格物理多租户（schema-per-tenant / DB-per-tenant）**不在本项目范畴**。workspace 模式 99% B2B 场景够用。

### 当前 flag 状态

- `TENANCY_MODE: z.enum(["single", "multi"]).default("single")` + `VITE_TENANCY_MODE` mirror
- `TEAM_ENABLED: z.stringbool().default(false)` + `VITE_TEAM_ENABLED` mirror
- `TEAM_ENABLED` 是**正交**开关（workspace 内是否启用 team 子分组），与产品形态无关，不在本次重命名范围内——但其周边文档中"多租户"字样需要清理。

### 当前 touchpoint 清单（grep 盘点完整）

**源码（引用 flag 的文件）**：
- `src/env.ts`（17 处：server schema + VITE mirror + `process.env` hydration）
- `src/lib/auth.ts`（`allowUserToCreateOrganization: env.TENANCY_MODE === "multi"` + `databaseHooks.user.create.after` 中 `if (env.TENANCY_MODE !== "single") return`）
- `src/seed.ts`（8 处：default-org 建表条件 + logger 字段）
- `src/components/layout/AppSidebar.tsx:93`（`VITE_TEAM_ENABLED`）
- `src/orpc/router/organizations-admin.ts`（3 处：list / create / dissolve 的 single 分支）
- `src/routes/(admin)/_layout/organizations/index.tsx`（3 处：`isSingleMode` 判断 + 注释）
- `src/routes/(admin)/_layout/settings/organization/index.tsx:268`（`isSingleTenancy` 常量）
- `src/routes/(admin)/_layout/teams/index.tsx`（3 处：gating + 错误提示 + 英文注释）

**文档**：
- `AGENTS.md`（= CLAUDE.md，L33-38 env 块 + L70 spec 引用）
- `.env.example`（L23-30 env block + 注释）
- `.env.local`（主人私有，需同步改）
- `.trellis/spec/backend/index.md:20`（索引表条目）
- `.trellis/spec/backend/tenancy-modes.md`（**文件名 + 内容整体重构**——改名 + 重写开头定位段 + "多租户"字样统一清理）
- `.trellis/spec/backend/email-infrastructure.md`（引用复核）
- `.trellis/spec/backend/authorization-boundary.md`（引用复核）
- `.trellis/spec/frontend/layout-guidelines.md`（引用复核）

**i18n**：
- `messages/zh.json:38` `sidebar_team_disabled_tooltip`（字面含 `TEAM_ENABLED=true`，若文本语义保留无需改；但 spec 里定义的"功能未启用"提示是否应改为产品形态感知的话术，待定）

**docs/research**：
- `docs/research/plugin-organization-deep.md`（概念段可能提"多租户"，视情况补"workspace vs 真多租户"澄清段）

**历史 task 归档**：`.trellis/tasks/archive/**` — 不动。

## Assumptions (temporary)

- `TEAM_ENABLED` / `VITE_TEAM_ENABLED` 不改名（正交开关）。只在描述它的文档里把"多租户"字样替换为"workspace / 多工作空间"。
- 不做向后兼容 env alias（本地项目、还没发版，直接 breaking 改）。如果已有部署，deploy 前先改 `.env.local` / 生产 env。
- 不动 DB schema（BA organization 表结构保持）；不动 migration；不改业务逻辑语义，只改 flag 名与文档。

## Open Questions

### Q1（Blocking）：新 flag 名定哪个？

（详见 ## Research Notes，选一个即可）

## Requirements (evolving — 待 Q1 决定后填充)

- 选定新 flag 名（待 Q1）
- env.ts schema + VITE mirror 重命名
- 所有源码引用替换（7 个文件，约 20+ 处）
- 所有文档 / spec / 注释同步更新
- spec 文件 `tenancy-modes.md` 改名 + 首段重写（产品形态定位而非"多租户"）
- `.env.example` 注释块重写（描述两种形态的部署场景）
- CLAUDE.md 中"产品形态开关"段重写
- i18n 复核（按需调整）
- `docs/research/plugin-organization-deep.md` 加"workspace vs 真多租户"概念澄清（顺手）

## Acceptance Criteria (evolving)

- [ ] 全项目 `rg "TENANCY_MODE|VITE_TENANCY_MODE|多租户"` 零命中（历史 task 归档除外）
- [ ] `pnpm check`（Biome）通过
- [ ] `pnpm typecheck`（TS）通过
- [ ] `pnpm dev` 能起（env schema 变更后不 boot 失败）
- [ ] `pnpm db:seed` 在新 flag 两个值下都能正常工作（private 建默认 org，saas 只建超管）
- [ ] spec 文件改名后 cross-ref（backend/index.md 等）不失效

## Definition of Done

- 全项目单次 grep 清零
- Biome / TS / build 绿
- CLAUDE.md / spec / .env.example 三处描述一致，读者不会再误解为"物理多租户"
- 已把 "workspace 模式 vs 真多租户" 的概念在 spec 或 research 层面留存一段，避免未来再次混淆

## Out of Scope

- **不做**真·多租户架构改造（schema-per-tenant / RLS / DB 分片）
- **不改** `TEAM_ENABLED` 的命名
- **不改** BA organization 插件的使用方式
- **不改** DB schema / migration
- **不加**对旧 flag 名的向后兼容 alias（breaking rename，文档提示主人改本地 .env.local）
- **不拆**成多 PR/task——主人明确要一次性全搞定

## Research Notes

### Workspace 模式 vs 真·多租户（概念基线，同时会落到 research 文档）

| 维度 | workspace 模式（本项目）| 真·多租户 |
|---|---|---|
| 数据布局 | 共享表 + `organizationId` 过滤 | schema / DB 隔离 |
| 行级过滤 | 业务层 + ZenStack policy 自动注入 | RLS / 连接路由 |
| 爆炸半径 | 共享资源，需应用层限流 | 天然隔离 |
| 合规 / 单租户导出 | 不原生支持 | 支持 |
| 典型产品 | Slack / Notion / Linear / GitHub Org | Shopify / Salesforce / Auth0 |

### Feasible 命名方案

#### Approach A（推荐）：`PRODUCT_MODE=private|saas`

- server：`PRODUCT_MODE: z.enum(["private", "saas"]).default("private")`
- client mirror：`VITE_PRODUCT_MODE`
- 语义：一眼看出"这是一个什么形态的产品"，与主人表述的"甲方交付 vs 公开 SaaS"完美对齐
- 行为映射：
  - `private` → `allowUserToCreateOrganization=false`、注册自动入伙默认 org、UI 隐藏建 org / 解散 org
  - `saas` → `allowUserToCreateOrganization=true`、注册后引导建自己 workspace、UI 暴露创建
- Pro：产品形态这一层抽象值钱——未来 SaaS 独有行为（billing gating / onboarding 引导 / 使用额度）都能挂在同一 flag 上
- Con：与 `APP_ENV=dev|prod` 同级，但语义正交（APP_ENV 是环境、PRODUCT_MODE 是形态），不会混淆

#### Approach B：`DEPLOYMENT_MODE=private|saas`

- 同 A，换名 `DEPLOYMENT_MODE`
- Con：与 `APP_ENV` 意思更容易串（"deployment" 可能被读成"部署环境"），不如 `PRODUCT_MODE` 明确

#### Approach C：细粒度拆 `ALLOW_USER_CREATE_ORG` + `AUTO_JOIN_DEFAULT_ORG`

- 两个独立布尔 flag，直接描述行为
- Pro：行为精确、组合自由（比如未来有"允许建 org 但也自动加入默认 org"的奇葩场景）
- Con：失去"产品形态"高阶语义；未来每多一条形态差异就要加一个 flag，最终会收敛回形态 enum；当前无此需求下增加认知负担

#### Approach D：保留 `TENANCY_MODE`，只修订文档语义

- 代码零改动，只把 CLAUDE.md / spec 里"多租户"字样全替换成"产品形态 / workspace 模式"
- Pro：零代码 churn
- Con：命名本身仍是技术债，下一个读 code 的人（包括半年后的主人）还是会被误导；背离主人诉求（"一次性全部搞定"）

### 倾向

**A（`PRODUCT_MODE=private|saas`）**。符合主人 mental model（甲方 vs 公开 SaaS）、抽象层级合适、未来可扩展。

## Technical Approach (pending Q1 confirmation)

1. **env.ts**：重命名 `TENANCY_MODE` → 新名、`VITE_TENANCY_MODE` → `VITE_<新名>`，更新 default 值（如 `"single"` → `"private"`）
2. **源码批量替换**：
   - `env.TENANCY_MODE === "single"` → `env.PRODUCT_MODE === "private"`
   - `env.TENANCY_MODE === "multi"` → `env.PRODUCT_MODE === "saas"`
   - `env.VITE_TENANCY_MODE` → `env.VITE_PRODUCT_MODE`
   - `isSingleMode` / `isSingleTenancy` 变量名 → `isPrivateMode` / `isPrivateDeploy`
3. **文档**：
   - spec `tenancy-modes.md` → `product-modes.md`，首段重写强调"产品形态（非物理多租户）"
   - CLAUDE.md "产品形态开关"段重写
   - `.env.example` 注释块重写
   - `backend/index.md` 索引条目更新
   - 其他 spec 中 cross-ref 更新
4. **i18n**：`sidebar_team_disabled_tooltip` 文本保留（`TEAM_ENABLED` 没改名，不受影响）
5. **research 文档顺手补一段**：`plugin-organization-deep.md` 开头加"workspace vs 真·多租户"澄清段，避免未来再次混淆
6. **验证**：`rg "TENANCY_MODE|VITE_TENANCY_MODE"` 零命中（排除 archive）+ `pnpm check` + `pnpm typecheck` + `pnpm dev` 起得来 + `pnpm db:seed` 两种 PRODUCT_MODE 都跑通

## Decision (ADR-lite) — pending

**Context**: ...
**Decision**: ...
**Consequences**: ...
