# refactor: product positioning — tan-admin → tan-servora

## Goal

把项目从"TanStack 后台管理模板"重新定位为**全栈 SaaS / ToB 快速开发脚手架**，以 Better Auth organization plugin 的 **workspace 模型** 为身份层基座。落地动作包括：项目改名 `tan-admin → tan-servora`、路由组三分拆（site / workspace / marketing）、删除 `TEAM_ENABLED` env flag 改为 plan gating、引入 personal org 自动建立钩子、统一 plan metadata 字段、相关 spec 与文档全面同步。

本次不做：Stripe 集成、email 模板切换（Task 2）、org UI 组件手搓（Task 2）。

**路由 URL 规则**：`(site)/` 改为 `site/`（无括号，URL 带 `/site/` 前缀）；`(workspace)/` 和 `(marketing)/` 保留括号组（URL 不变）。目的是浏览器地址栏区分超管/业务面。

## Requirements

### 1. 项目改名 `tan-admin` → `tan-servora`

- `package.json#name`
- `README.md` 标题 + 所有引用
- `CLAUDE.md` / `AGENTS.md` / `.trellis/spec/**` 里所有项目名提及
- `src/env.ts` 里 `VITE_APP_TITLE` 默认值（如果提到 admin）
- `.trellis/workspace/HoronLee/journal-*.md` 不改（历史记录保持原貌）
- GitHub repo rename 留给用户手动做；代码里不硬编码 repo URL
- 搜索确认：`grep -ri "tan-admin"` 全部替换（只 exclude `.trellis/workspace/`）

### 2. 路由组三分拆

目标结构：

```
src/routes/
├── auth/                     # 裸页：login / signup / forgot-password / verify-email / $path
│                             # 已登录访问时 redirect /dashboard
├── (marketing)/              # 空壳组：URL 不带前缀（括号组）；index 占位欢迎页
│   └── index.tsx             # → /
├── site/                     # super-admin only：无括号，URL 带 /site/ 前缀
│   └── _layout.tsx + _layout/
│       ├── users/            # → /site/users（BA listUsers）
│       ├── organizations/    # → /site/organizations（全平台 org）
│       └── metrics/          # → /site/metrics（占位）
└── (workspace)/              # org member：括号组，URL 不带前缀
    └── _layout.tsx + _layout/
        ├── dashboard/                    # → /dashboard
        ├── settings/
        │   ├── organization/
        │   │   ├── general.tsx           # → /settings/organization
        │   │   ├── members.tsx           # → /settings/organization/members
        │   │   ├── menus.tsx             # → /settings/organization/menus ⭐ 从 /menus 挪来
        │   │   └── billing.tsx           # → /settings/organization/billing（占位）
        │   └── profile/                  # → /settings/profile
        └── invitations/                  # → /invitations
```

**迁移动作**（当前 `(admin)/_layout/*` 拆到两边）：

| 当前路径 | 目标路径 | URL | 理由 |
|---|---|---|---|
| `(admin)/_layout/dashboard` | `(workspace)/_layout/dashboard` | `/dashboard` | workspace 面板默认首页 |
| `(admin)/_layout/users` | `site/_layout/users` | `/site/users` | 全平台用户 = site-admin |
| `(admin)/_layout/organizations` | `site/_layout/organizations` | `/site/organizations` | 全平台 org = site-admin |
| `(admin)/_layout/organization` | `(workspace)/_layout/settings/organization/general` | `/settings/organization` | 当前 org 自管 |
| `(admin)/_layout/invitations` | `(workspace)/_layout/invitations` | `/invitations` | 用户自己的 invitation 列表 |
| `(admin)/_layout/menus` | `(workspace)/_layout/settings/organization/menus` | `/settings/organization/menus` | 动态菜单管理挪到 org 设置下，owner only |
| `(admin)/_layout/settings/$path` | `(workspace)/_layout/settings/$path` | `/settings/*` | BA UI settings |

**权限 gating**：
- `site/_layout.tsx` 的 `beforeLoad`：`auth.api.userHasPermission({ permissions: { user: ["list"] } })` 不通过 → redirect `/dashboard`
- `(workspace)/_layout.tsx` 的 `beforeLoad`：session 存在 + `activeOrganizationId` 存在 → 否则 redirect `/auth/sign-in`
- `(workspace)/_layout/settings/organization/menus.tsx` 的 `beforeLoad`：当前用户在 activeOrg 里是 `owner` 角色 → 否则 redirect `/dashboard`（只有 owner 能管菜单）
- `(marketing)/` 无 gating
- `auth/*`：已登录用户 redirect `/dashboard`

### 3. 删除 `TEAM_ENABLED` env flag

- `src/env.ts`：删除 `TEAM_ENABLED`（server）+ `VITE_TEAM_ENABLED`（client）声明
- `.env.local` / `.env.example`：删除对应行
- `src/lib/auth.ts`：`teams.enabled: true` 写死（产品支持 team 概念）
- `src/lib/auth.ts`：新增 `maximumTeams: async ({ organizationId }) => getTeamLimitByPlan(organizationId)` — 根据 `organization.metadata.plan` 返回数字
- `src/components/layout/AppSidebar.tsx`：`getDisabledReason("/teams")` 改成读当前 org 的 plan（从 `authClient.useActiveOrganization()` 拿）
- spec 更新：`frontend/layout-guidelines.md` 里 "Teams 菜单 gating" 段落重写

### 4. 引入 plan metadata

- 枚举值固定为：`"free" | "personal_pro" | "team_pro" | "enterprise"`
- 写入点：
  - **seed**（private 模式）：默认 org 写 `metadata: { type: "team", plan: "enterprise" }`
  - **personal org 自动建**：`metadata: { type: "personal", plan: "free" }`
  - **saas 注册流程**：用户 emailVerified → 自动建 personal org
- 读取点：
  - `maximumTeams` / 其他 gating
  - Billing 页展示
  - Sidebar gating
- spec 新增：`backend/plan-gating.md` — 定义枚举、gating helper、写入规则

### 5. Personal org 钩子

- 位置：`src/lib/auth.ts` 的 `databaseHooks.user.update.after`
- 触发条件：`user.emailVerified: false → true` 时
- 动作：
  1. 查是否已有该用户的 personal org（`member.userId + org.metadata.type === "personal"`）—— 幂等
  2. 无则调用 `auth.api.createOrganization({ body: { name: "Personal", slug: \`personal-\${user.id}\`, userId: user.id, ... } })`
  3. 更新 session `activeOrganizationId = newOrg.id`（如果当前 session 存在且 activeOrg 为 null）
- **private 模式**：跳过此钩子 —— private 模式走现有的"auto-join 默认 org"逻辑
- **saas 模式**：执行此钩子
- `organizationHooks.beforeDeleteOrganization`：拦截 personal org 删除（除非删号同步删）
- `organizationHooks.beforeCreateInvitation`：拦截 personal org 的邀请

### 6. Spec / 文档同步

- **`backend/product-modes.md`**：
  - 更新 §2 signature — 删除 `TEAM_ENABLED`，改为"team 通过 plan gating"
  - 更新 §3 contract — env 表格删行
  - 新增段落说明 personal org 注册流程
- **`backend/plan-gating.md`**（新建）：
  - 枚举定义、gating helper、seed 写入规则、升级/降级流程
- **`backend/personal-org.md`**（新建）：
  - 钩子位置、slug 规则、metadata 约定、UI 层约束（邀请/删除/转让拦截）
- **`frontend/route-organization.md`**（新建）：
  - 三组路由约定、`_layout/` 嵌套规则（已有，链接过去）
  - 权限 gating 点、redirect 策略
- **`frontend/layout-guidelines.md`**：
  - "Teams 菜单 gating" 段落改为读 plan
  - 三组路由示例更新
- **`frontend/i18n.md`**：
  - 路径示例里的 `(admin)/` 全替换为 `(workspace)/` 或 `(site)/`
- **`frontend/quality-guidelines.md`**：
  - env 表里删除 `TEAM_ENABLED`
  - 示例里的 `VITE_TEAM_ENABLED` 全删
- **`AGENTS.md`** 项目定位段落重写：
  - 项目名 `tan-admin` → `tan-servora`
  - 删除 `TEAM_ENABLED` 说明
  - 加入 plan gating + personal org 流程说明

### 7. Sidebar 拆分 + menus 挪位

- **新增 `src/components/layout/AppSiteSidebar.tsx`**：静态菜单（users / organizations / metrics），硬编码 const 数组，不读 `menuStore`
- **保留 `src/components/layout/AppSidebar.tsx`**：现有动态菜单逻辑不动，只挂 `(workspace)/_layout.tsx`
- **两个 sidebar 共用 shadcn `Sidebar` primitive**；site 变体顶部加 "Platform Admin" 标识让超管一眼知道自己在运营面
- **menus 管理 UI 挪位**：`(admin)/_layout/menus/index.tsx` → `(workspace)/_layout/settings/organization/menus.tsx`
  - 路由 `beforeLoad` 做 owner-only gate
  - DB Menu 表里的 `/menus` 记录在 seed 里更新为 `/settings/organization/menus`（或直接删 seed 记录，因为 menus 管理页可以走静态 sidebar entry 而不是 DB 菜单——见下）
- **settings 侧栏是否需要子导航**：`/settings/organization/{general,members,menus,billing}` 这几个页面建议用 TabsNav 而不是 sidebar 子项，避免 sidebar 嵌套太深。具体视觉留到实现阶段定
- **`Menu` DB 表 schema 不动**，不加 `scope` 字段；site-admin 菜单纯静态

### 8. 代码迁移 checklist

- `src/env.ts` 删 `TEAM_ENABLED` / `VITE_TEAM_ENABLED`
- `src/lib/auth.ts` 写死 `teams.enabled: true` + 新增 `maximumTeams` 函数 + 新增 personal org 钩子 + invitation/delete 拦截
- `src/routes/(admin)` → `src/routes/(workspace)` + `src/routes/site`（用 `git mv` 保历史；site 无括号）
- `src/routes/(marketing)/index.tsx` 新建（空壳）
- `src/routes/index.tsx` 根路由逻辑更新（未登录 → marketing，已登录 → workspace）
- 更新所有 `createFileRoute("/(admin)/_layout/...")` 的路径参数（注意 site 组无括号）
- 更新 sidebar / tabbar 里的硬编码路径（如果有）
- `src/seed.ts` 默认 org 加 `metadata: { type: "team", plan: "enterprise" }` + menus 表更新 `/menus` → `/settings/organization/menus`
- `AppSidebar.getDisabledReason` 改读 plan
- 新增 `AppSiteSidebar.tsx`，挂到 `site/_layout.tsx`

## Acceptance Criteria

- [ ] `grep -ri "tan-admin" --exclude-dir=.trellis/workspace --exclude-dir=node_modules` 无匹配（除历史文档）
- [ ] `grep -r "TEAM_ENABLED\|VITE_TEAM_ENABLED" --exclude-dir=node_modules` 无匹配
- [ ] `pnpm dev` 启动后：
  - 未登录访问 `/` → `(marketing)/index.tsx` 欢迎页
  - 已登录访问 `/` → redirect `/dashboard`（`(workspace)/`）
  - 普通 member 访问 `/site/users` → redirect `/dashboard`
  - super-admin 访问 `/site/users` → 正常渲染（看到 `AppSiteSidebar` 静态菜单）
  - workspace 页面（如 `/dashboard`）看到的是 `AppSidebar`（动态菜单）
  - org owner 访问 `/settings/organization/menus` → 正常渲染
  - org member（非 owner）访问 `/settings/organization/menus` → redirect `/dashboard`
- [ ] `PRODUCT_MODE=private` + `pnpm db:seed` → 默认 org 的 metadata 含 `plan: "enterprise"`
- [ ] `PRODUCT_MODE=saas` 新用户注册 → emailVerified 后自动有 personal org（`metadata.type === "personal"`, `slug === "personal-${userId}"`）
- [ ] personal org 尝试删除 / 邀请成员 → hook 拦截返回 APIError
- [ ] `pnpm check`（biome）+ `pnpm typecheck`（tsc）全绿
- [ ] spec 新增 3 个文件 + 更新 5 个文件
- [ ] `AGENTS.md` 项目定位段落重写完成

## Definition of Done

- 所有 Acceptance Criteria 勾选
- `pnpm check` / `tsc --noEmit` 零 error
- 手动烟测 private / saas 两种模式 happy path
- spec 文件交叉引用无死链
- `AGENTS.md` + `README.md` 项目名一致
- git commit 按逻辑分组（建议：rename 一个、路由拆分一个、team flag 一个、personal org 一个、spec 一个）

## Technical Approach

- 路由迁移用 `git mv` 保文件历史
- personal org 钩子用 `databaseHooks.user.update.after`（BA 官方推荐位置）
- plan gating helper：`src/lib/plan.ts` 导出 `getPlanLimits(plan)` + `canUseFeature(org, feature)`
- 拦截用 `organizationHooks.before*` + 抛 `APIError`（BA 官方模式）
- spec 文件遵循既有"契约密度优先"风格（单文件 ≤ 350 行，见 feedback_spec_density memory）
- 不发 shadcn registry（用户明确推迟）—— 组件写法耦合项目基建 OK

## Decision (ADR-lite)

**Context**: tan-admin 原定位是"后台管理模板"，但项目实际演进成"全栈 SaaS/ToB 脚手架"，底层 workspace 模型能同时服务私有化交付和公开 SaaS，名字与现实脱节；路由组单一、env flag 把业务决策当部署配置写死。

**Decision**:
1. 项目改名 `tan-admin` → `tan-servora`
2. 路由拆三组 + auth 裸页：`(marketing)` / `(site)` / `(workspace)` + `auth/`
3. 删 `TEAM_ENABLED`，team 通过 `organization.metadata.plan` gate
4. 注册即建 personal org（saas 模式），slug `personal-${userId}`，emailVerified 后触发
5. 统一 plan 枚举 `free | personal_pro | team_pro | enterprise`

**Consequences**:
- 老的 `(admin)/` 路径全部失效，所有内部链接要改（有 lint 帮助）
- `/menus` URL 变 `/settings/organization/menus`，DB 菜单表中该记录的 `path` 在 seed 里更新
- `TEAM_ENABLED` 读取方从 env 变 DB，性能影响小（org 已在 session 缓存）
- personal org 增加 DB 行数（每 saas 用户 1 个 org）—— 可接受
- 改名需要协调 GitHub repo rename，但代码内不硬编码 URL 所以影响可控
- 两个 sidebar 组件独立维护，小增量代码；视觉/样式共用 shadcn primitive 保持一致
- menus 改 owner-only gate，普通 admin 看不到该入口（符合"菜单是产品架构"的语义定位）
- **暂不支持**：Stripe 计费、plan 自助升降级（都在 Task 2 或以后）

## Out of Scope

- **Stripe 集成**：Billing 页面只展示 plan + "联系销售"按钮，不接支付
- **email 模板切 BA UI 基座**：Task 2 专门做
- **org UI 组件手搓**（InviteMemberDialog / MembersTable / PlanBadge 等）：Task 2 专门做
- **发 shadcn registry**：推迟，不在近期规划
- **Plan 自助升降级 UI**：Task 2 或更后
- **Marketing 页面内容**（pricing 表、about、blog）：本次只做空壳 index
- **GitHub repo 改名**：留给用户手动操作
- **历史 workspace 文档改名**：`.trellis/workspace/HoronLee/journal-*.md` 保持原貌

## Technical Notes

### Key files involved

**env / config**:
- `src/env.ts` — 删 `TEAM_ENABLED` / `VITE_TEAM_ENABLED`
- `.env.local` / `.env.example` — 同步
- `package.json` — `name` 字段改

**auth**:
- `src/lib/auth.ts` — `teams.enabled: true` 写死；新增 `maximumTeams`、personal org 钩子、invitation/delete 拦截
- `src/lib/auth-client.ts` — 无需改（client plugin 跟着 server 走）
- `src/seed.ts` — 默认 org metadata 加 plan

**routes**:
- `src/routes/(admin)/` → `src/routes/(workspace)/` + `src/routes/(site)/`（git mv）
- `src/routes/(marketing)/index.tsx` — 新建
- `src/routes/index.tsx` — 根路由重定向逻辑
- `src/routes/auth/*.tsx` — 已登录 redirect 逻辑（可能已有）

**components**:
- `src/components/layout/AppSidebar.tsx` — `getDisabledReason` 改读 plan；只挂 `(workspace)/_layout.tsx`
- `src/components/layout/AppSiteSidebar.tsx`（新增）— site-admin 静态菜单
- 新增 `src/lib/plan.ts` — gating helper

**spec**:
- `.trellis/spec/backend/product-modes.md` — 更新
- `.trellis/spec/backend/plan-gating.md` — 新建
- `.trellis/spec/backend/personal-org.md` — 新建
- `.trellis/spec/frontend/route-organization.md` — 新建
- `.trellis/spec/frontend/layout-guidelines.md` — 更新
- `.trellis/spec/frontend/i18n.md` — 更新（路径示例）
- `.trellis/spec/frontend/quality-guidelines.md` — 更新（env 表）
- `AGENTS.md` — 项目定位重写
- `README.md` — 标题 + 引用

### Constraints

- `#/*` alias 由 `package.json#imports` 声明，改 `name` 不影响 alias
- BA admin plugin 权限基于 `user: ["list"]` 等，现有 access control 已定义
- ZenStack policy 不受此 task 影响（不动 schema）
- Paraglide 消息 `messages/zh.json` 有路由 label，可能需要 `menu.xxx` 键更新

### Reference links

- **BA org plugin docs**: `docs/reference/better-auth-plugin-organization.md` (70KB，实现时必读)
- **BA admin plugin docs**: `docs/reference/better-auth-plugin-admin.md` (22KB)
- 上个 task（`04-23-product-mode-rename`）已落地 `PRODUCT_MODE` 改名
- TanStack Router route group + `_layout/` 嵌套规则：`frontend/layout-guidelines.md` §TanStack Router 章节

### 关键 BA API 签名（实现 personal org / plan gating 时对照）

**`maximumTeams` 动态函数**（`auth.ts` 写入，docs/reference/better-auth-plugin-organization.md §Team Configuration Options）:
```ts
teams: {
  enabled: true,
  maximumTeams: async ({ organizationId, session }, ctx) => {
    const plan = await getPlanForOrg(organizationId);
    return plan === "team_pro" ? 10 : plan === "enterprise" ? Infinity : 0;
  },
}
```

**`organizationHooks.beforeDeleteOrganization`** 拦截 personal org 删除（§Organization Hooks）:
```ts
organizationHooks: {
  beforeDeleteOrganization: async ({ organization, user }) => {
    if ((organization.metadata as any)?.type === "personal") {
      throw new APIError("BAD_REQUEST", { message: "Personal org cannot be deleted" });
    }
  },
  beforeCreateInvitation: async ({ invitation, inviter, organization }) => {
    if ((organization.metadata as any)?.type === "personal") {
      throw new APIError("BAD_REQUEST", { message: "Personal org cannot invite members" });
    }
  },
}
```

**Server-side create organization**（§Create an organization — 无 session headers 时走 server only）:
```ts
await auth.api.createOrganization({
  body: {
    name: "Personal",
    slug: `personal-${user.id}`,
    userId: user.id,  // serverOnly: session headers 不存在时使用
    metadata: { type: "personal", plan: "free" },
  },
});
```

**`databaseHooks.user.update.after`** 触发 personal org（§Active Organization + Better Auth database-hooks 通用模式）:
```ts
databaseHooks: {
  user: {
    update: {
      after: async (user, ctx) => {
        // 只在 emailVerified false→true 时触发；幂等：查是否已有 personal org
        if (env.PRODUCT_MODE !== "saas") return;
        if (!user.emailVerified) return;
        const existing = /* 查 member table + org.metadata.type === "personal" */;
        if (existing) return;
        await auth.api.createOrganization({ body: { ...above } });
      },
    },
  },
},
```

**Site-admin permission check**（`site/_layout.tsx` beforeLoad — docs/reference/better-auth-plugin-admin.md §Access Control Usage）:
```ts
await auth.api.userHasPermission({
  headers: request.headers,
  body: { permissions: { user: ["list"] } },
});
```

**组织 owner 检查**（menus 页 beforeLoad — organization plugin §Get Active Member Role）:
```ts
const { data: { role } } = await authClient.organization.getActiveMemberRole();
if (role !== "owner") throw redirect({ to: "/dashboard" });
```

### Implementation plan (建议 commit 分组)

1. `chore: rename tan-admin → tan-servora` —— package.json / README / 文档全局搜索替换（不改代码逻辑）
2. `refactor(env): drop TEAM_ENABLED, use plan metadata gating` —— env.ts / auth.ts / AppSidebar / seed 同步
3. `refactor(routes): split (admin)/ into site/ + (workspace)/, add (marketing)/ placeholder` —— git mv + createFileRoute 路径改 + redirect 逻辑 + menus 挪到 settings/organization 下
4. `feat(layout): static AppSiteSidebar + owner-only menus gate` —— 新增 AppSiteSidebar + menus 页 beforeLoad
5. `feat(auth): auto-provision personal org on email verification (saas mode)` —— auth.ts hook + 拦截
6. `docs(spec): product positioning — new route org + plan gating + personal org` —— spec 新建 + 更新
7. `docs(agents): update project positioning in AGENTS.md` —— AGENTS.md 段落重写
