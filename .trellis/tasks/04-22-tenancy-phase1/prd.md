# Phase 1: tenancy 模式 + 组织管理深化 + i18n + 邮件

## Goal

将 tan-admin 从"identity-layer 骨架"升级到"可交付产品底座"：

- 明确**单/多租户产品形态开关**（TENANCY_MODE + TEAM_ENABLED），一套代码同时支持"交付单租户产品"和"多租户 SaaS 运营"两种商业模式
- 补齐 BA organization 插件的**最后一公里 UI**（组织设置 / 解散 / Transfer ownership / Teams 管理 / 租户管理）
- 落地**邮件基础设施**（Resend + react-email + i18n 模板），解锁邮箱验证 / 密码重置 / 组织邀请 / 所有权转让
- 全站 **zh-CN i18n 落地**，English 仅保留接口占位
- 清理 seed 策略，按产品形态决定首次部署后的默认状态

完成后，tan-admin 可以直接作为光伏电站管理、MES、CRM 等**交付型 toB 产品**的底座，也可以通过 env 切换成多租户 SaaS（如未来做 PaaS）。

---

## Requirements

### R1. TENANCY_MODE 产品形态开关

| 值 | 含义 | seed 行为 | UI 差异 |
|---|---|---|---|
| `single`（默认） | 交付型单租户产品 | 建 1 个 default org + super-admin owner | 隐藏"创建组织"按钮；`/tenants` 页只读；OrganizationSwitcher 不显示切换（只有 1 个） |
| `multi` | 多租户 SaaS | 不建 default org；super-admin 在 UI 建 org | 暴露"创建组织"入口（any 用户）；`/tenants` 页 super-admin 可 CRUD；OrganizationSwitcher 正常切换 |

### R2. TEAM_ENABLED 团队功能开关

| 值 | 含义 | BA 行为 | UI 差异 |
|---|---|---|---|
| `false`（默认） | 不启用 teams | `organization({ teams: { enabled: false } })` | Teams 菜单灰显 + tooltip "功能未启用，请设置 env TEAM_ENABLED=true" |
| `true` | 启用 teams | BA teams 端点开放 | Teams 菜单正常，`/teams` 页可 CRUD |

默认矩阵：

```
TENANCY_MODE=single + TEAM_ENABLED=false   ← 默认（交付产品）
TENANCY_MODE=multi  + TEAM_ENABLED=false   ← 小 SaaS
TENANCY_MODE=multi  + TEAM_ENABLED=true    ← 企业级 SaaS
```

### R3. seed 重构

- `single` 模式：建 default org（slug="default"，name 来自 `SEED_DEFAULT_ORG_NAME` env，默认"默认组织"）+ super-admin owner
- `multi` 模式：只建 super-admin（role="admin" 站点级），不建任何 org
- seed 的 Menu `meta.title` 直接存 i18n key（如 `"menu.dashboard"`），不存中文字面
- **seed 默认幂等 safe 模式**：所有表都走 upsert；菜单新增/更新但不删除 —— 运营在 UI 新建的菜单不会被抹
- **CLI flag `--reset-menus`**：加了才会 `TRUNCATE Menu`。仅用于开发 / 重大迁移
- seed 启动时打印清晰 banner：当前模式 + 影响表清单 + 是否 reset
- 生产首次部署必须跑 seed 建骨架；后续部署跑不跑都安全

### R4. signUp 自动入组 hook

`single` 模式下，新用户通过 `/signup` 注册后，用 `databaseHooks.user.create.after` 自动把用户加入 default org 的 member 表（role="member"）。

**实现约束**（研究已验证）：

- hook 里**只能走共享 `pool` 的 raw SQL 幂等 INSERT**（`INSERT ... ON CONFLICT DO NOTHING`），**禁止调 `auth.api.createOrganization`**（BA issue #6791：嵌套调用会死锁）
- BA #7260 已修复 after-hook 在事务提交后执行，幂等 INSERT 作为兜底仍保留
- `auth.ts` 的 `allowUserToCreateOrganization` 跟 TENANCY_MODE 绑定：`single=false`（用户不能自建 org） / `multi=true`（用户可自建）

`multi` 模式下：用户注册后不自动入组；UI 引导他们"创建自己的组织"或"等待邀请"。

### R5. 邮件基础设施

#### R5.1 EmailTransport 抽象层（核心架构决策）

不绑死单一邮件服务商，抽象 `EmailTransport` 接口，支持三种 driver：

| driver | 场景 | 底层实现 |
|---|---|---|
| `console` | 本地开发 | log.info 打印 verify URL，不真发邮件 |
| `smtp`（**生产首推**） | 国内部署 | `nodemailer` + SMTP 配置（阿里云邮件推送 / 腾讯企业邮 / QQ / 163 等） |
| `resend` | 海外部署 / 不走国内 | `resend-node` HTTP API |

env：

```bash
EMAIL_TRANSPORT=console       # dev: console / prod-cn: smtp / prod-global: resend
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Tan Admin     # 发件人显示名（可选）

# SMTP 模式
SMTP_HOST=smtpdm.aliyun.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=...                 # ⚠️ 授权码 / SMTP 密码，不是邮箱登录密码

# Resend 模式
RESEND_API_KEY=re_xxx
```

生产启动时 zod refine 校验：`EMAIL_TRANSPORT=smtp` 时 `SMTP_*` 必填；`EMAIL_TRANSPORT=resend` 时 `RESEND_API_KEY` 必填。

#### R5.2 模板：react-email（JSX）

- 目录：`src/emails/*.tsx`
- 首批 4 封邮件：`verify-email.tsx` / `reset-password.tsx` / `invite-member.tsx` / `transfer-ownership.tsx`
- 预览命令：`pnpm email:dev`（package.json scripts 加 `"email:dev": "email dev"`）
- 公共 Layout `src/emails/components/email-layout.tsx`（brand header / footer / 署名）
- `render(<Template />)` 产出 HTML 字符串，三种 transport 都能用

#### R5.3 dev 跳过策略

- env `EMAIL_VERIFICATION_SKIP_LIST`（逗号分隔邮箱列表），命中则自动标 emailVerified，不走验证流
- `EMAIL_TRANSPORT=console` 时所有邮件只打 log，不真发
- 典型 dev `.env.local`：
  ```
  EMAIL_TRANSPORT=console
  EMAIL_VERIFICATION_SKIP_LIST=admin@tan-admin.local
  ```
- 典型国内生产 `.env`：
  ```
  EMAIL_TRANSPORT=smtp
  SMTP_HOST=smtpdm.aliyun.com
  SMTP_PORT=465
  SMTP_SECURE=true
  SMTP_USER=noreply@yourdomain.com
  SMTP_PASS=xxx
  EMAIL_FROM=noreply@yourdomain.com
  EMAIL_VERIFICATION_SKIP_LIST=   # 生产为空
  ```

### R6. 邮箱验证

`auth.ts` 开启：

```ts
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true,
  autoSignInAfterVerification: true,
  sendVerificationEmail: async ({ user, url, token }) => {
    await sendEmail({ type: "verify", to: user.email, props: { url, userName: user.name } });
  },
}
```

### R7. 组织管理 UI 深化

补齐当前缺失：

- **组织设置页** `/settings/organization`：改 name / slug / logo / 业务画像字段（见 R8）。调 `auth.api.updateOrganization`
- **Logo 上传（data-url 方案）**：
  - `<input type="file" accept="image/*">` + FileReader 读取 + 前端 `browser-image-compression` 压缩到 200KB 以内
  - 输出 base64 data-url 存 `organization.logo` 字段（BA 默认是 `string?`，兼容 URL 和 data-url）
  - 前端显示时 `<img src={org.logo}>` 直接渲染（URL 或 data-url 浏览器都认）
  - **不建对象存储基建**；将来要切 S3 只改上传逻辑，字段不变
- **解散组织**：危险操作，ConfirmDialog 要求输入组织 slug 确认。`single` 模式禁用；`multi` 模式下最后一个用户所在 org 禁用
- **Transfer ownership**：复用 `inviteMember({ role: "owner" })` + `organizationHooks.beforeAcceptInvitation` 做原子降/升级
  - 前端 UI：成员列表每行"转让所有权"按钮（仅 owner 可见）
  - 区分展示：role=owner 的邀请在列表中显示为"所有权转让邀请"
  - 邮件模板独立：`transfer-ownership.tsx`（强调"接受后你将成为该组织所有者"）

### R8. organization additionalFields 业务画像

用 BA schema.organization.additionalFields 直接扩展 organization 表（不用 metadata JSON）：

```ts
organization({
  schema: {
    organization: {
      additionalFields: {
        plan: { type: "string", defaultValue: "free" },
        industry: { type: "string" },
        billingEmail: { type: "string" },
      },
    },
  },
})
```

UI 层面组织设置页暴露这些字段（可编辑）。

### R9. Teams 管理 UI（TEAM_ENABLED 门控）

- 路径：`/teams`
- 功能：列表 / 创建 / 改名 / 删 / 添加成员（从 org member 选） / 移除成员
- `TEAM_ENABLED=false` 时菜单灰显 + tooltip，点击不跳转
- BA API：`createTeam` / `listTeams` / `updateTeam` / `removeTeam` / `addTeamMember` / `removeTeamMember` / `listTeamMembers`

### R10. 全局组织列表（super-admin only）

**命名澄清**："租户"概念在 BA 体系下**已被 organization 取代**，代码层不再引入独立的"Tenant"概念。TENANCY_MODE env 保留仅作为产品形态标签。

- 路径：`/organizations`（不是 `/tenants`；与当前 org 的 `/organization` 单数明确区分）
- i18n key：`m.admin_organizations_list()` → "组织列表"
- 门控：`user.role === "admin"`（站点级 admin plugin）
- 功能：
  - 列出**所有** organization（直查 `db.organization` via Kysely `$qbRaw`，绕过 BA listOrganizations 的用户级过滤）
  - 创建新 org（`multi` 模式，`single` 模式不暴露创建按钮）
  - 查看 org 详情（成员数 / 邀请数 / 创建时间 / plan / industry）
  - 解散 org（`multi` 模式，严重确认）
- 新 oRPC handler：`src/orpc/router/organizations-admin.ts`，前置 `requireSuperAdmin` middleware

### R11. 多 owner 边界校验

- 邀请 role=owner 时不阻止（这是 transfer ownership 的正常流程）
- `updateMemberRole` 把 owner 改为 admin 时：**必须保证 org 至少有 1 个 owner**，否则报错"不能移除最后一个所有者"
- `removeMember` 移除 owner：同样校验至少 1 个 owner

### R12. cancelPendingInvitationsOnReInvite 开启

配置 `organization({ cancelPendingInvitationsOnReInvite: true })`，避免 UI 出现同邮箱多条 pending 邀请。

### R13. i18n 全站落地

- 所有 `.tsx` 硬编码中文字符串迁移到 Paraglide message key（`m.xxx()`）；当前库内共 22 处硬编码中文散落在 6 个通用组件
- `project.inlang/settings.json` 调整：`baseLocale: "zh"`，`locales: ["zh", "en"]`，**删除 `messages/de.json`**（研究发现默认 scaffold 留了 `de`）
- `messages/zh.json`：完整填写
- `messages/en.json`：空占位（每个 key 的值留 `""`），保证类型签名存在
- Paraglide runtime 默认 locale = `"zh"`
- ✅ **做**语言切换 UI（顶栏 LocaleSwitcher，Paraglide 5 最新实践）—— 2026-04-22 用户决策调整；实施见 S10
- **Menu.meta.title 直接切 i18n key**（已确认）：
  - seed 写死 i18n key（如 `"menu.users"` / `"menu.dashboard"`）
  - sidebar 渲染策略（注意：Paraglide 生成的是具名导出，动态索引必须走 `_index.js`）：
    ```tsx
    import * as m from "#/paraglide/messages";
    const t = node.meta?.title;
    const label = t?.startsWith("menu.") && t in m
      ? (m[t as keyof typeof m] as () => string)()
      : t;
    ```
  - 运营在 `/menus` 新建菜单时可继续填中文字面 —— fallback 自动生效（不以 `menu.` 开头或 key 不存在时直接显示原文）
  - 两种路径共存，代码不分叉
- 邮件模板也走 i18n：`m.email_verify_title()` / `m.email_verify_body()` 等

### R14. BA 错误消息汉化

BA 抛的错误是英文。前端在 toast 前过一层 `translateAuthError(code)`，常见 code 映射到中文文案：

- `INVALID_EMAIL_OR_PASSWORD` → "邮箱或密码错误"
- `USER_ALREADY_EXISTS` → "该邮箱已被注册"
- `EMAIL_NOT_VERIFIED` → "请先验证邮箱后再登录"
- `INVITATION_EXPIRED` → "邀请已过期"
- ... 完整映射见 implement 阶段收集

---

## Acceptance Criteria

### 核心形态开关

- [ ] `TENANCY_MODE=single` 全新部署后 seed 建 1 个 default org + super-admin，能登录看到 sidebar
- [ ] `TENANCY_MODE=single` 下 `/organizations` 页只读，禁用"新建"按钮，列表只有 default org 一条
- [ ] `TENANCY_MODE=multi` 全新部署后 seed 只建 super-admin，登录后引导创建 org
- [ ] `TENANCY_MODE=multi` 下普通用户 signUp 后，UI 显示"创建组织"或"等待邀请"引导
- [ ] `TEAM_ENABLED=false` 时 sidebar 的 Teams 菜单灰显，tooltip 显示提示
- [ ] `TEAM_ENABLED=true` 时 `/teams` 页可 CRUD

### 邮件

- [ ] EmailTransport 三 driver 都可用：`console` log / `smtp` 真发 / `resend` 真发
- [ ] 注册新用户触发 verify email
  - dev（`console` transport）→ log 打印 verify URL
  - prod（`smtp` 或 `resend` transport）→ 真实发出
- [ ] 白名单邮箱（含 SEED_SUPER_ADMIN_EMAIL）跳过验证
- [ ] 生产启动时 env 交叉校验
  - `EMAIL_TRANSPORT=smtp` 缺 `SMTP_HOST/USER/PASS` → 启动失败
  - `EMAIL_TRANSPORT=resend` 缺 `RESEND_API_KEY` → 启动失败
  - `NODE_ENV=production` + `EMAIL_TRANSPORT=console` → 启动失败
- [ ] `pnpm email:dev` 可预览所有 4 封邮件
- [ ] 4 封邮件渲染出中文文案（verify / reset / invite / transfer），且 SMTP 和 Resend 都能发
- [ ] 邀请成员，对方收到邀请邮件，接受流程完整
- [ ] SMTP 模式手动验证至少一个国内提供商（QQ 授权码 或 阿里云邮件推送）可发信

### 组织管理深化

- [ ] 组织设置页可改 name / slug / logo / plan / industry
- [ ] 解散组织 ConfirmDialog 要求输入 slug 确认
- [ ] Transfer ownership：owner 点"转让所有权" → 对方收到邮件 → 接受 → owner 变更成功；原 owner 降为 admin
- [ ] 移除/降级最后一个 owner 报错"不能移除最后一个所有者"
- [ ] 重复邀请同一邮箱时旧邀请自动取消（cancelPendingInvitationsOnReInvite）

### i18n

- [ ] 所有页面中文文案（sidebar / 表单 / 按钮 / 错误提示 / 邮件）
- [ ] `messages/en.json` 存在且 key 齐全（值可为空）
- [ ] Paraglide 编译无 warning
- [ ] Menu seed 存 i18n key，sidebar 渲染正常
- [ ] BA 错误消息翻译覆盖常见 10+ code

### 权限边界

- [ ] `/organizations` 普通用户访问 403
- [ ] 站点级 admin / 组织级 owner 两套 role 互不干扰（已有契约不回退)

### 组织深化

- [ ] 组织设置页 logo 上传 ≤200KB，超限前端报错
- [ ] 上传 logo 后 sidebar / header 头像正确渲染（data-url）
- [ ] Transfer ownership 完整流：owner 发起 → 邮件 → 接受 → 原子切换
- [ ] 拒绝"移除最后一个 owner"（updateMemberRole 或 removeMember）

---

## Definition of Done

- 所有 acceptance criteria 打勾
- `pnpm check` 无 error
- `pnpm test` 全绿（含新加的邮件/tenancy 单测）
- 三种 tenancy 矩阵组合各手动验证一遍
- 新增文档：
  - `.trellis/spec/backend/email-infrastructure.md`（邮件传输 + 模板契约）
  - `.trellis/spec/frontend/i18n.md`（Paraglide 使用规范）
  - `.trellis/spec/backend/tenancy-modes.md`（两开关的执行契约）
- `docs/research/plugin-organization-deep.md` 追加"04-22 实施反馈"段，记录 additionalFields / cancelPendingInvitationsOnReInvite 的真实行为
- CLAUDE.md 补充"首次部署 seed 流程"章节

---

## Technical Approach

### 新增 env（`src/env.ts`）

```ts
// 产品形态
TENANCY_MODE: z.enum(["single", "multi"]).default("single"),
TEAM_ENABLED: z.coerce.boolean().default(false),

// Seed（SEED_SKIP 已移除，seed 幂等默认安全）
SEED_DEFAULT_ORG_NAME: z.string().default("默认组织"),
SEED_DEFAULT_ORG_SLUG: z.string().default("default"),

// 邮件 transport
EMAIL_TRANSPORT: z.enum(["console", "smtp", "resend"]).default("console"),
EMAIL_FROM: z.string().email().default("noreply@localhost"),
EMAIL_FROM_NAME: z.string().optional(),
EMAIL_VERIFICATION_SKIP_LIST: z.string().default(""),

// SMTP
SMTP_HOST: z.string().optional(),
SMTP_PORT: z.coerce.number().default(465),
SMTP_SECURE: z.coerce.boolean().default(true),
SMTP_USER: z.string().optional(),
SMTP_PASS: z.string().optional(),

// Resend
RESEND_API_KEY: z.string().optional(),

// 交叉校验（superRefine）
// - EMAIL_TRANSPORT=smtp 时 SMTP_HOST/USER/PASS 必填
// - EMAIL_TRANSPORT=resend 时 RESEND_API_KEY 必填
// - NODE_ENV=production 时不允许 EMAIL_TRANSPORT=console
```

### 新增依赖

```
# SMTP 传输
nodemailer
@types/nodemailer (dev)

# Resend 传输
resend

# 邮件模板
@react-email/components
@react-email/render
react-email (dev, for preview)

# Logo 上传压缩
browser-image-compression
```

### 新增文件树

> **路径修正**（研究发现）：本仓库不存在 `src/integrations/better-auth/` 目录；BA 接入点散落在 `src/lib/auth.ts` / `src/lib/auth-client.ts` / `src/lib/auth-session.ts` / `src/components/auth/*`。下方所有新文件放 `src/lib/` 和 `src/emails/`。
>
> **清理项**：未跟踪的 `src/routes/(admin)/tenants/`（放在 `_layout/` 外层不会渲染）在 S6 中删除。

```
src/
├── emails/
│   ├── components/email-layout.tsx
│   ├── verify-email.tsx
│   ├── reset-password.tsx
│   ├── invite-member.tsx
│   └── transfer-ownership.tsx
├── lib/
│   ├── email.ts              # sendEmail 高层 API
│   ├── email-transport.ts    # 三 driver 工厂（console / smtp / resend）+ boot-time 校验
│   └── auth-errors.ts        # translateAuthError code 映射表
├── orpc/router/
│   ├── organizations-admin.ts  # super-admin 跨 org 管理
│   └── teams.ts                # teams CRUD（包装 BA 原生 endpoint）
├── routes/(admin)/_layout/
│   ├── organizations/index.tsx         # super-admin 组织列表（全局，不是 /tenants）
│   ├── teams/index.tsx                 # teams 管理
│   └── settings/organization/index.tsx # 当前 org 设置（新建，不是已有）
```

### 修改清单

- `src/lib/auth.ts`：加 `requireEmailVerification` / `sendVerificationEmail` / `sendResetPassword` / `cancelPendingInvitationsOnReInvite` / `schema.organization.additionalFields` / `organizationHooks.beforeAcceptInvitation`（transfer ownership）/ `databaseHooks.user.create.after`（single 模式自动入组）/ `allowUserToCreateOrganization`（跟 TENANCY_MODE 绑定）
- `src/lib/auth-client.ts`：**必须加 `inferOrgAdditionalFields` 客户端插件**打通 TS（否则访问 `org.plan` 类型不通）；同步 teams.enabled
- `src/seed.ts`：按 TENANCY_MODE 分支；去 TRUNCATE，改 upsert；加 CLI flag 解析
- `src/env.ts`：新增 12 个 env + `.superRefine()` 交叉校验（若 `@t3-oss/env-core 0.13.11` 的 `createFinalSchema` 不可用，则 fallback 在 `src/lib/email-transport.ts` 工厂里做 boot-time assert）
- `src/components/layout/AppSidebar.tsx`：Teams 菜单灰显 + tooltip；菜单文案走 `m[key]` 动态索引
- `project.inlang/settings.json`：`baseLocale: "zh"`，`locales: ["zh", "en"]`，删 `messages/de.json`
- `messages/zh.json` / `messages/en.json`：新建或填充

---

## Decision (ADR-lite)

### Context

tan-admin 作为 toB 外包底座，需要同时支持"交付单租户产品"和"多租户 SaaS 运营"两种场景。identity-layer 完成了 BA organization/admin 插件集成，但产品形态开关、组织管理末端 UI、邮件基建、i18n 都缺失，无法直接交付。

### Decision

1. 用 env 开关 **正交**控制租户形态（TENANCY_MODE）和团队功能（TEAM_ENABLED），不耦合
2. 邮件走 **EmailTransport 抽象**：`console`（dev）/ `smtp`（国内生产首推）/ `resend`（海外生产）三 driver，**默认首推 SMTP + 阿里云邮件推送**（国内送达率 + 合规 + 成本）
3. 邮件模板用 **react-email**（JSX），三 transport 共用
4. Transfer ownership 复用 BA invitation 机制（role=owner），不建独立业务表
5. Team **不做 leader/role**，保持 BA 原生语义
6. 业务画像字段用 BA `schema.organization.additionalFields`，不用 metadata JSON
7. Logo 上传用 **data-url base64**（200KB 限），不建对象存储基建
8. i18n 用 Paraglide（已集成），Phase 1 只落 zh-CN 文案，en-US 保留空 key 占位
   - **2026-04-22 修订**：语言切换 UI 纳入 Phase 1 范围（顶栏 LocaleSwitcher），en-US 空 key 占位仍保留；实施动作归集至 S10 子任务，需先研究 Paraglide 5 最新 locale 切换实践（URL strategy / cookie strategy / SSR hydration 等）再下手
9. **"租户" 概念与 BA organization 合并**：不引入独立 Tenant 实体，super-admin 全局视图叫 `/organizations`
10. dev 模式邮件跳过：**env 白名单 + console transport 组合**，不用后缀匹配
11. seed **默认幂等 safe 模式**，破坏性操作走 CLI flag（`--reset-menus`）；删除 SEED_SKIP env（本来就不必要）

### Consequences

- **正向**：单/多租户一套代码，通过 env 切换，不分叉
- **负向**：首次部署必须理解 TENANCY_MODE 语义（需要 CLAUDE.md 补文档）
- **负向**：BA 错误消息汉化映射表需要持续维护（BA 更新时要同步）
- **正向**：react-email 模板 JSX 化，设计师也能改（实际上还是前端改，但比 HTML 拼接强太多）
- **风险**：i18n 迁移工作量估计偏大（全项目 grep 中文），实际可能超预期。buffer 预留 0.5 天

---

## Out of Scope（Phase 2+ 再做）

- 审计日志（organizationHooks 记录操作历史）
- 面包屑（MenuMeta 已预留字段）
- 2FA / email-otp 插件
- captcha 插件（上线前必做，但不在 Phase 1）
- generic-oauth（SSO，企业客户要时再做）
- api-key 插件（开放平台时做）
- 用户会话管理 UI（admin listUserSessions / revoke）
- Impersonate UI 按钮（后端 ready，UI 可以留到 Phase 2）
- Dynamic Access Control（运行时建 role）
- 真实业务仪表盘数据（Dashboard 首页）
- Teams 的 leader 概念（团队负责人字段）
- 多 owner 场景的"主 owner"概念（BA 允许多 owner，不强行单主）
- 组织 logo 上传（需对象存储基建，Phase 1 用 URL 字符串）
- 邮件模板非技术人员可改（Loops / Postmark template）
- 面向客户的 landing page / marketing 站

---

## Technical Notes

### 重点坑位（预埋，实施时注意）

1. **BA 的 `sendVerificationEmail` 回调在事务外调用**：邮件失败不会回滚注册。需要在 send 失败时 log + 允许用户手动触发"重发验证邮件"
2. **organizationHooks.beforeAcceptInvitation 返回值格式**：必须 `return { data: invitation }` 而非直接 return，否则 BA 报错
3. **Kysely `$qbRaw` 查 organization 表**（listAll）需要手动 join member 聚合人数；或接受 N+1（运营场景数量有限）
4. **Paraglide 在 SSR 环境的 locale 传递**：TanStack Start server function 里需要从 request.headers 读 `Accept-Language` 或直接默认 zh
5. **react-email 的 `render` 函数在 Node vs Edge runtime 返回值不同**：确认项目是 Node runtime（当前 TanStack Start 默认是）
6. **seed 的 additionalFields 默认值**：`auth:migrate` 生成的 DDL 包含默认值，seed 不用显式填 `plan: "free"`
7. **cancelPendingInvitationsOnReInvite 与 Transfer ownership 的冲突**：如果 owner 对同邮箱发 role=member + 后改 role=owner，前者会被取消 —— 这是预期行为，不是 bug
8. **BA 没有 `beforeRemoveMember` / `beforeUpdateMemberRole` hook**：多 owner 保护（R11）必须写在 oRPC wrapper 层，不能靠 hook
9. **`TEAM_ENABLED` 的 boolean 解析坑**：`z.coerce.boolean("false") === true`！用 `z.stringbool()`（zod 3.25+）或 `z.enum(["true","false"]).transform(v => v === "true")` 规避
10. **TanStack Start 运行在 Node runtime**（不是 Edge），nodemailer / react-email render 可用；未来迁 Vercel Edge 再重估

### 研究反馈（2026-04-22，S0 吸收）

Research sub-agent 摸底 8 项关键 surprise，已融入本 PRD 对应章节：

1. ✅ `src/integrations/better-auth/` 目录**不存在**，实际接入在 `src/lib/auth*.ts` —— 文件树已修正
2. ✅ Paraglide `baseLocale: "en"` + 含 `de.json` —— R13 已加 settings 调整与删除指引
3. ✅ Menu i18n 必须用 `m[key as keyof typeof m]()` 走 `_index.js`（Paraglide 具名导出） —— R13 代码样例已更新
4. ✅ `env.ts` 当前无 superRefine，`@t3-oss/env-core 0.13.11` createFinalSchema 不保证可用 —— 修改清单已给 fallback 方案
5. ✅ `allowUserToCreateOrganization` 跟 TENANCY_MODE 绑定（single=false / multi=true） —— R4 已加约束
6. ✅ 未跟踪的 `src/routes/(admin)/tenants/` 占位要删 —— S6 已纳入
7. ✅ `auth-client.ts` 必须加 `inferOrgAdditionalFields` —— 修改清单已标红
8. ✅ signUp hook 只走 raw SQL 幂等 INSERT，不调 `auth.api.createOrganization`（#6791） —— R4 已强制约束

研究产物：`.trellis/tasks/04-22-tenancy-phase1/research/` 下 7 份文件（current-auth-setup / current-seed / current-paraglide / current-org-ui / current-env-zod / email-libs-usage / ba-hooks-usage），实施时子代会自动读。

### SMTP 提供商配置速查（R5 实施参考）

| 提供商 | HOST | PORT | SECURE | 认证关键字 | 限额 / 场景 |
|---|---|---|---|---|---|
| **阿里云邮件推送**（生产首推） | `smtpdm.aliyun.com` | 465 | true | 发信地址 + SMTP 密码（控制台生成） | 按量 ¥0.5/1000 封 |
| **腾讯云邮件推送（SendCloud）** | `sendcloud.smtp.qcloud.com` | 465 | true | API_USER + API_KEY | 按量 |
| **腾讯企业邮** | `smtp.exmail.qq.com` | 465 | true | 邮箱 + 客户端专用密码 | 按订阅 |
| **QQ 邮箱（个人）** | `smtp.qq.com` | 465 | true | 邮箱 + **授权码**（邮箱设置页生成，**不是登录密码**） | 500 封/日，**仅测试** |
| **163 / 126** | `smtp.163.com` | 465 | true | 邮箱 + 授权码 | 500 封/日，**仅测试** |

### 各 SMTP 的坑

1. **QQ 邮箱授权码不是登录密码**：在邮箱设置 → 账户 → POP3/SMTP → 生成授权码。忘了会卡死
2. **阿里云邮件推送需要**：控制台配发信域名 + 验证 DNS TXT 记录 + 创建发信地址（`noreply@yourdomain.com`）+ 生成 SMTP 密码
3. **465 vs 587 vs 25**：465 用 SSL（secure=true），587 用 STARTTLS（secure=false + requireTLS），25 明文（生产禁用）。serverless 不支持 25 端口
4. **From 地址必须和 SMTP_USER 同域**：阿里云 / 腾讯云严查，跨域发信会被拒
5. **生产必须配 SPF + DKIM**：不配容易进收件人垃圾箱。DNS 侧配置，不在代码

### 参考链接

不确定的时候可以用jina mcp读取链接

- BA admin doc（最新）：https://better-auth.com/docs/plugins/admin
- BA organization doc（最新）：https://better-auth.com/docs/plugins/organization
- react-email: https://react.email/
- nodemailer: https://nodemailer.com/
- Resend Node SDK: https://resend.com/docs/send-with-nodejs
- 阿里云邮件推送 SMTP: https://help.aliyun.com/document_detail/29459.html
- 腾讯企业邮 SMTP: https://service.exmail.qq.com/cgi-bin/help
- 本项目已有研究：
  - `docs/research/plugin-organization-deep.md`（04-21 抓取，Phase 1 完成后加反馈段）
  - `docs/research/plugin-admin-deep.md`
  - `.trellis/spec/backend/authorization-boundary.md`（身份 vs 业务层契约）
  - `.trellis/spec/frontend/layout-guidelines.md`（侧栏 / tabbar / 动态菜单）

### 估算

粗估 **3.5-5.5 工作日**，拆 subtask：

1. **S1**: env 开关 + seed 重构（幂等 + --reset-menus） + signUp hook（0.5 天）
2. **S2**: 邮件基建（EmailTransport 抽象 + nodemailer SMTP + Resend + 4 封 react-email 模板 + dev skip list）（1-1.5 天，比原估多 0.5 天因加了 SMTP driver）
3. **S3**: 组织设置页 + additionalFields + logo data-url 上传 + 解散保护（0.5-1 天）
4. **S4**: Transfer ownership（hook + 邮件 + UI）（0.5-1 天）
5. **S5**: Teams UI + TEAM_ENABLED 门控灰显（0.5 天）
6. **S6**: `/organizations` 全局组织列表（super-admin）（0.5 天）
7. **S7**: i18n 全站迁移（含 Menu key 切换） + BA 错误翻译表（1 天）
8. **S8**: 文档 + spec 更新（email-infrastructure / i18n / tenancy-modes 三份 spec）（0.5 天）

建议按 subtask 分 PR 合并，每个 S 独立可测试可回滚。
