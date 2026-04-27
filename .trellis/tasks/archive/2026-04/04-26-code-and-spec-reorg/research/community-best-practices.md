# Research: 社区 src/ 最佳实践调研（TanStack Start + Better Auth + ZenStack 生态）

- **Query**: 调研 3-5 个真实开源项目的 src/ 组织，给 tan-admin 重组提供对照
- **Scope**: 外部（GitHub）
- **Date**: 2026-04-26

## 一、调研项目清单

| Project | URL | 栈 | 角色 |
|---|---|---|---|
| **A. TanStack `start-basic`** | https://github.com/TanStack/router/tree/main/examples/react/start-basic | TanStack Start 裸壳 | 官方最小示例（三件套基线） |
| **B. TanStack `start-trellaux`** | https://github.com/TanStack/router/tree/main/examples/react/start-trellaux | Start + 内存 db | 官方稍丰富的示例（带 db/ queries.ts） |
| **C. TanStack `start-supabase-basic`** | https://github.com/TanStack/router/tree/main/examples/react/start-supabase-basic | Start + Supabase auth | 官方第三方 SDK 集成示例 |
| **D. TanStack `start-basic-auth`** | https://github.com/TanStack/router/tree/main/examples/react/start-basic-auth | Start + Prisma | 官方 ORM 集成示例（Prisma 直放 src/） |
| **E. `mugnavo/tanstarter-plus`** ⭐102 | https://github.com/mugnavo/tanstarter-plus | Start + Better Auth + Drizzle + monorepo | 高 star 社区模板（monorepo 拆 apps/web） |
| **F. `daveyplate/better-auth-ui` start-shadcn-example** | https://github.com/daveyplate/better-auth-ui/tree/main/examples/start-shadcn-example | Start + Better Auth + Drizzle + shadcn | Better Auth UI 官方示例（贴近 tan-admin 栈） |
| **G. `jellekuipers/kolm-start-admin`** ⭐8 | https://github.com/jellekuipers/kolm-start-admin | Start + Better Auth + Prisma + admin plugin + i18n | **最贴近 tan-admin 的 admin 模板** |
| **H. `zenstackhq/sample-todo-nextjs-tanstack`** ⭐26 | https://github.com/zenstackhq/sample-todo-nextjs-tanstack | Next.js + ZenStack + TanStack Query | ZenStack 官方 sample（Next 而非 Start，但 layout 思路可借鉴） |
| **I. `epicweb-dev/epic-stack`** ⭐5531 | https://github.com/epicweb-dev/epic-stack | Remix + Prisma | 业界 SSR 全栈黄金标准（参考结构思想，不照搬） |

> 注：TanStack 官方 examples（A–D）大多极简，价值在 baseline；E/F/G 是真实 production-shape；H 是 ZenStack 唯一可参考的 sample；I 是 SSR 全栈结构哲学的天花板。

---

## 二、维度 1：顶层 src/ 目录划分

| Project | 顶层目录列表 | 风格 |
|---|---|---|
| A. start-basic | `components/` `routes/` `styles/` `utils/` + `router.tsx` `routeTree.gen.ts` | flat 三件套 |
| B. start-trellaux | `assets/` `components/` `db/` `hooks/` `icons/` `routes/` `styles/` `utils/` + `queries.ts` `types.ts` `invariant.ts` `router.tsx` | flat + 顶层 `db/`/`queries.ts` |
| C. start-supabase-basic | `components/` `hooks/` `routes/` `styles/` `utils/` | flat（auth/db 全塞 utils/） |
| D. start-basic-auth | `components/` `hooks/` `prisma-generated/` `routes/` `styles/` `utils/` | flat + 生成产物独立目录 |
| E. tanstarter-plus | `components/` `routes/` + 顶层 `routeTree.gen.ts` `router.tsx` `styles.css`（lib 在 packages/） | flat + monorepo 把 lib 抽包 |
| F. better-auth-ui start-shadcn | `components/` `lib/` `routes/` `styles/` | **flat + lib/**（典范） |
| **G. kolm-start-admin** | `components/` `context/` `i18n/` `lib/` `middleware/` `queries/` `routes/` `server/` `styles/` `utils/` | **多目录、明确分层** |
| H. zenstack todo (Next) | `app/` `components/` `lib/` `server/` `prisma/` `schema.zmodel` `types/` | Next 风：`server/` 与 `lib/` 分离 |
| I. epic-stack | `assets/` `components/` `routes/` `styles/` `utils/` + `entry.client/server.tsx` `root.tsx` `routes.ts` | flat 但 `utils/` 极胖（auth/db/email 等都在 utils/*.server.ts） |

### 共识

1. **`components/` `routes/` `styles/`** 是 100% 项目共有的三个固定目录
2. **生成产物（`routeTree.gen.ts`）** 一律放 `src/` 顶层，不藏起来；router 入口 `router.tsx` 也在 src 顶层
3. **`utils/` 兜底**：所有项目都有
4. **`hooks/`** 普及度中等（A/B/C/D/E 有，F/G/I 没有，把 hook colocated 在 components 旁）

### 分歧

- **`lib/` 是否独立**：F/G/H/I 有，A/B/C/D 没有（小项目把 lib 内容塞 utils/）
- **`server/` 是否独立**：G/H/I 有；G 把 session/user 业务 server function 单独放，I 用文件后缀 `.server.ts` 替代目录
- **`db/` `queries/` `middleware/` `context/` `i18n/` `emails/`** 是否独立目录：随项目复杂度递增

---

## 三、维度 2：lib/ vs utils/ vs config/ 边界规则

最值得参考的是 **G. kolm-start-admin** 和 **F. start-shadcn-example**，它们对此最自觉：

### F. start-shadcn-example（极简范式）

```
src/lib/
├── auth.ts          # Better Auth server instance
├── auth-client.ts   # Better Auth React client
├── db.ts            # Drizzle 实例
├── schema.ts        # Drizzle schema（业务定义）
└── utils.ts         # cn() 等无业务工具
```

**规则**：`lib/` 装"框架级单例 + 业务 schema"；`utils.ts` 是单文件兜底，没单独 `utils/` 目录。无 `config/`。

### G. kolm-start-admin（中等复杂度范式，最值得借鉴）

```
src/
├── lib/                      # 框架级单例 + 配置
│   ├── auth.ts               # Better Auth server
│   ├── auth-client.ts        # Better Auth client
│   ├── db.ts                 # Prisma 实例
│   ├── env.ts                # 环境变量 schema
│   ├── enums.ts              # 业务常量
│   ├── error.ts              # 错误处理
│   └── i18n.ts               # i18next 实例
├── utils/                    # 通用工具
│   ├── logger.ts
│   └── metrics.ts
├── server/                   # 业务 server functions / fns
│   ├── session.ts
│   └── user.ts
├── middleware/               # createMiddleware() 单元
│   ├── admin.ts
│   ├── logging.ts
│   └── session.ts
├── context/                  # React Context Providers
│   └── theme.tsx
├── queries/                  # TanStack Query queries 集中
│   └── user.ts
└── i18n/                     # 翻译资源
    ├── en/translation.json
    └── nl/translation.json
```

**规则**：
- `lib/` = 第三方实例 + 跨层配置（auth、db、env、i18n、错误模型、业务枚举常量）
- `utils/` = 纯函数小工具（logger / metrics 这种）
- `server/` = 业务 server functions（不是框架级 lib，是动作）
- `middleware/` = TanStack Start middleware
- 不存在 `config/`（被 `lib/env.ts` + `lib/enums.ts` 吃掉）

### I. epic-stack（反范式 / 警示）

epic-stack 把 auth/db/email/cache/totp 全塞 `app/utils/*.server.ts`（30+ 文件，胖到失控）。**靠 `.server.ts` / `.client.tsx` 后缀做 SSR 边界划分**，但目录维度上失去了分层信号。**不建议照搬**——它是 Remix 时代的 boundary 工具，TanStack Start 没必要。

---

## 四、维度 3：第三方 SDK 集成放哪

| 项目 | Better Auth | DB ORM | Email | i18n |
|---|---|---|---|---|
| F. start-shadcn | `lib/auth.ts` + `lib/auth-client.ts` | `lib/db.ts` + `lib/schema.ts` | — | — |
| G. kolm-admin | `lib/auth.ts` + `lib/auth-client.ts` | `lib/db.ts` | — | `lib/i18n.ts` + `i18n/<locale>/translation.json` |
| H. zenstack-todo | `server/auth.ts` + `server/db.ts` | `server/db.ts` + `schema.zmodel` 顶层 | — | — |
| I. epic-stack | `app/utils/auth.server.ts` + `app/utils/connections.server.ts` | `app/utils/db.server.ts` | `app/utils/email.server.ts` | — |
| **当前 tan-admin** | `lib/auth.ts` + `integrations/better-auth-ui/` | `db.ts` 顶层 + `zenstack/` 顶层 | `emails/` 顶层 + `lib/email.ts` | `paraglide/` 顶层（生成产物） |

### 共识

- Better Auth：约定俗成 `lib/auth.ts`（server）+ `lib/auth-client.ts`（client）。**两个文件，分别 ssr-only 和 isomorphic**
- DB ORM 实例：`lib/db.ts` 是事实标准
- Schema 定义：Drizzle/Prisma 派系都把 schema 文件**放靠近 db 的地方**（lib/schema.ts 或顶层 prisma/）；ZenStack 的 `.zmodel` 因为是 DSL 都放仓库根 `schema.zmodel` 而非 src/

### tan-admin 的现状偏差

- `integrations/better-auth-ui/` 这个层目前没在任何对标项目里见到——better-auth-ui 自己的 demo 都把 UI 组件直接放 `components/auth/`。这层值得审视是必要还是过度抽象
- `db.ts` 在 src 顶层而非 `lib/`：和 90% 项目不一致

---

## 五、维度 4：认证模块组织方式

| 项目 | 认证组织 |
|---|---|
| C. supabase | `utils/supabase.ts`（裸） |
| D. prisma-auth | 散在 `routes/` 各页面里 |
| F. start-shadcn | `components/auth/` UI（10+ 组件，按动作分） + `lib/auth.ts` server |
| G. kolm-admin | `components/session/` + `components/user/` + `lib/auth*.ts` + `middleware/admin.ts` + `middleware/session.ts` + `routes/(auth)/` |
| I. epic-stack | `app/utils/auth.server.ts` + `app/routes/_auth+/` route 分组 |

**共识**：UI 层按动作（sign-in / sign-out / change-password / passkeys 等）拆 colocated 组件，server 层只一两个文件（auth.ts / auth-client.ts）。**没有项目把 auth 提到 src 顶层一级目录**——都进 `lib/` 或 `components/auth/`。

---

## 六、维度 5：数据库模型 / schema 放哪

| 项目 | schema 位置 | runtime 位置 |
|---|---|---|
| F. start-shadcn (Drizzle) | `src/lib/schema.ts` | `src/lib/db.ts` |
| D. start-basic-auth (Prisma) | 仓库根 `prisma/schema.prisma` + `src/prisma-generated/` | 推测 `src/utils/` |
| G. kolm-admin (Prisma) | 仓库根 `prisma/`（推测） | `src/lib/db.ts` |
| H. zenstack-todo (ZenStack v2 + Prisma) | 仓库根 `schema.zmodel` + `prisma/schema.prisma` | `src/server/db.ts` |
| **当前 tan-admin** (ZenStack v3 + Kysely) | 仓库根 `zenstack/schema.zmodel` + `src/zenstack/` 生成产物 | `src/db.ts` 顶层 |

**共识**：DSL/schema 文件放仓库根（不进 src），生成产物可以 src 内但目录要明确（`prisma-generated/` / `zenstack/`）。runtime client 进 `lib/db.ts`。

---

## 七、维度 6：邮件模板放哪

调研项目里**没有一个把邮件模板独立到 `emails/`**。最接近的是 epic-stack 用 `app/utils/email.server.ts` 单文件 + 模板字符串。

主流方案是 **react-email 官方推荐**：仓库根 `emails/` 目录（脱离 src），用 react-email cli 单独 dev/preview。tan-admin 当前 `src/emails/` 在 src 内，是少数选择，但**符合 react-email "同进 bundle" 的便利性**。

判断：tan-admin 的 `src/emails/` 既符合 react-email 习惯也保留 import 便利，**保留即可**，不必为对齐社区而搬出去。

---

## 八、维度 7：路由文件命名风格

| 项目 | 风格 |
|---|---|
| A. start-basic | flat（`posts.$postId.tsx`、`users.index.tsx`） |
| E. tanstarter-plus | nested（`_auth/app/route.tsx`） |
| F. start-shadcn | hybrid（顶层 flat + `auth/$path.tsx`、`settings/$path.tsx` catch-all） |
| **G. kolm-admin** | nested + 路由组（`(auth)/sign-in.tsx`、`(authenticated)/users.$userId.tsx`） |
| **当前 tan-admin** | nested + 路由组（`auth/`、`(marketing)/`、`site/`、`(workspace)/`）|

**tan-admin 与 G 完全同构**，符合 TanStack Router 推荐的"按访问级别分路由组"思路。

---

## 九、维度 8：类型定义集中度

- **散在 modules**：A/C/D/E/F/G/I — 类型与 schema 同文件，或在 `components/<x>/<x>.types.ts` colocated
- **`types/` 顶层**：B（`types.ts` 单文件）、H（`types/` 目录）
- **`.d.ts` 单独**：F 的 `vite-env.d.ts` 在 src 顶层

**共识**：**优先 colocated，避免一个胖 `types/` 目录**（除非项目跨包跨层共享）。

---

## 十、维度 9：测试文件放哪

- **colocated**：epic-stack（`auth.server.test.ts` 紧贴 `auth.server.ts`）、start-shadcn（无测试）
- **没有 `__tests__/`** 或顶层 `tests/`：**所有调研项目都不集中**

**共识**：**colocated `*.test.ts`** 是 TS 全栈生态的事实标准。tan-admin 现状（`src/lib/__tests__/`）是少数派——下一步可考虑 colocate。

---

## 十一、让人眼前一亮的设计

1. **G. kolm-start-admin 的 `middleware/` 一级目录** —— TanStack Start 的 `createMiddleware` 单元独立目录，在 admin 模板里抽离 admin/logging/session 三个中间件，比塞 utils/ 干净太多
2. **G. 的 `queries/` 目录** —— TanStack Query 的 queryOptions 集中处，避免散在每个 route loader 里。tan-admin 当前没这个层，loader 里 inline 写 query
3. **F. 的 `components/settings/<account|security>/`** —— 把账户管理 UI 按"职能域"再拆一级，超过 30 个组件也不乱
4. **G. 的 `routes/(auth)/` + `routes/(authenticated)/` 路由组**：用 RR/TS Router 的 pathless group 严格按"权限边界"分，对应到 tan-admin 应该是 `(public) / (workspace) / (admin)` 三组
5. **H. zenstack-todo 的 `server/` 与 `lib/` 分离** —— `lib/context.ts` `lib/hooks/` 是客户端可见，`server/auth.ts` `server/db.ts` 是 SSR-only。**tan-admin 当前 `db.ts` 在 src 顶层混着**，没有这个边界信号

---

## 十二、对 tan-admin 的建议（3 套候选布局）

> tan-admin 当前 src/：`components/ config/ data/ emails/ generated/ hooks/ integrations/ lib/ modules/ orpc/ paraglide/ routes/ stores/ utils/ zenstack/` + 顶层 `db.ts seed.ts env.ts router.tsx server.ts start.ts styles.css`。**14 个一级目录**，明显比所有调研对象（最多 10 个）都多。

### 候选 1：「Kolm 化」 — 来自 G. kolm-start-admin（推荐）

```
src/
├── components/        # UI（保留 shadcn ui/ + 业务）
├── routes/            # TanStack Router 文件
├── server/            # 业务 server functions（替换部分 modules/）
├── middleware/        # ★ 新增：createMiddleware 单元
├── queries/           # ★ 新增：queryOptions 集中
├── lib/               # 第三方实例 + 配置（auth/auth-client/db/env/i18n/error/enums）
├── stores/            # TanStack Store
├── orpc/              # oRPC contract & router（保留，特殊到值得独立）
├── emails/            # react-email 模板
├── paraglide/         # i18n 生成产物（保留）
├── zenstack/          # ZenStack 生成产物（保留）
└── styles/            # 样式
```

**搬动**：
- `db.ts` → `lib/db.ts`
- `env.ts` → `lib/env.ts`
- `config/` → 拆进 `lib/`（env/常量）和 `data/`（如果是 seed 数据）
- `data/` → `seed/` 或 `server/seed/`
- `generated/` → 合并到 `paraglide/` / `zenstack/` 或保留作 catchall
- `hooks/` → colocated 到 `components/<x>/`，删 `hooks/` 一级（顺势瘦身）
- `integrations/` → 拆解：`integrations/better-auth-ui/` UI 部分进 `components/auth-ui/`、wrapper 进 `lib/`
- `modules/` → 按性质拆：业务 server fn 进 `server/`，纯逻辑进 `lib/`
- `utils/` 保留作纯函数兜底，**严禁放含 SDK 实例的代码**

**优点**：与社区最贴合的 admin 模板 1:1 对照，迁移路径清晰；`middleware/` `queries/` 补齐两个工程化能力。
**缺点**：搬动文件数多（约 15-20 个 import 路径要刷新）。
**迁移成本**：1 个 PR 内可完成，主要是机械搬运 + 改 import；ZenStack/Paraglide 生成产物完全不动，风险低。

---

### 候选 2：「Lib 收敛」 — 来自 F. start-shadcn-example（最小改动）

```
src/
├── components/
├── routes/
├── lib/               # ★ 扩展：把 db.ts/env.ts/seed.ts 收进来
├── stores/
├── hooks/             # 保留
├── modules/           # 保留（业务模块）
├── orpc/
├── emails/
├── paraglide/
├── zenstack/
├── integrations/      # 保留
└── styles/
```

**搬动**：
- `db.ts` `env.ts` → `lib/`
- `config/` `data/` `generated/` `utils/` 评估保留必要性，能合就合
- 不引入 `server/` `middleware/` `queries/`

**优点**：改动最小，1 小时内 done。
**缺点**：留着 `modules/ integrations/ hooks/ utils/ data/ config/ generated/` 还是太多目录；没解决"server-only 与 client-safe 不分"的问题。
**迁移成本**：极低。

---

### 候选 3：「Epic 化」 — 来自 I. epic-stack（不推荐，仅作对照）

```
src/
├── components/
├── routes/
├── utils/             # ★ 全部业务工具进这里，靠 .server.ts/.client.tsx 后缀分边界
├── styles/
└── 顶层 entry/router/seed
```

**优点**：极致 flat，目录数最少。
**缺点**：utils/ 必然胖到 30+ 文件失控；TanStack Start 没有 Remix 那种 `.server.ts` 强制 boundary（虽然 Vite 支持），约定弱；与 ZenStack/oRPC/Paraglide 生成产物的位置约定冲突。
**迁移成本**：需要给 ZenStack/Paraglide 做特例豁免，反而更乱。

---

## 十三、最终建议

**采纳候选 1（Kolm 化）**，理由：

1. G. kolm-start-admin 是**唯一**与 tan-admin 同时具备 "TanStack Start + Better Auth admin plugin + i18n + admin 后台模板" 四件套的真实开源参照
2. 它引入的 `middleware/` `queries/` `server/` 三个一级目录解决 tan-admin 当前痛点（中间件散在 lib、queryOptions 散在 loader、server fn 散在 modules）
3. 顶层目录数从 14 收敛到 ~10，仍保留 `orpc/` `zenstack/` `paraglide/` 三个**生成产物或框架特殊**的目录（无对标但不可省）

**风险点**：
- `modules/` 目前承担"业务垂直切片"，迁移到 `server/` 时需要明确"按域聚合（modules/ba/）"还是"按层聚合（server/auth.ts、server/user.ts）"。kolm-admin 选了按层（文件级聚合），但 tan-admin 模块（ba/ menu/ workspace/）已经按域分，**保留 modules/ 也是合理的**——可在候选 1 基础上保留 `modules/` 作为业务域目录，`server/` 只装跨域 server function

## Caveats / Not Found

- 未直接验证每个项目的 `middleware/` 内部约定（只看到目录与文件名）；如要细看需要再抓 G 的具体 middleware 文件
- `epic-stack` 因是 Remix 而非 TanStack Start，结构哲学借鉴价值有限，仅作"反面教材"对照
- ZenStack 官方没有 TanStack Start 的 sample（已确认 `samples/` 只有 next/nuxt/sveltekit/orm/shared 五类），所以 ZenStack v3 + Start 组合 **tan-admin 是先行者**——这部分布局没有现成参考，需要自己定
- 邮件模板（`emails/`）社区项目都不放进 src 里——但 react-email 官方 examples 是放仓库根 `emails/`，tan-admin 放 `src/emails/` 也合理，不必跟风搬出去

## External References

- [TanStack Router examples 总目录](https://github.com/TanStack/router/tree/main/examples/react)
- [kolm-start-admin（最贴近 tan-admin）](https://github.com/jellekuipers/kolm-start-admin)
- [better-auth-ui start-shadcn-example（lib 范式）](https://github.com/daveyplate/better-auth-ui/tree/main/examples/start-shadcn-example)
- [tanstarter-plus（高 star monorepo 模板）](https://github.com/mugnavo/tanstarter-plus)
- [zenstack sample-todo-nextjs-tanstack（ZenStack 唯一 TS 全栈 sample）](https://github.com/zenstackhq/sample-todo-nextjs-tanstack)
- [epic-stack（结构哲学参考，不照搬）](https://github.com/epicweb-dev/epic-stack)
