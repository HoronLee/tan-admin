# Auth Module Layout & BA Shadow Codegen

> Better Auth 落在本项目的物理结构 + 影子 schema 自动生成流水线。

`src/lib/auth/` 是 BA 在本项目的命名空间。runtime / client / config / cli-codegen 各自一个文件，外加给 ZenStack policy 引擎用的影子 zmodel。

---

## 1. Scope / Trigger

适用以下任一场景：

- 升级 `better-auth` 或任何 `@better-auth/*` 插件
- 增删改 `user` / `organization` / 其它 BA 表的 `additionalFields`
- 启用/移除 BA 插件（`admin` / `organization` / `multiSession` / 新增）
- 业务表想 FK 到 BA 表（`Post.author → BaUser` 等）
- 新增 ZenStack policy 表达式引用 BA 字段（`auth().banned`、`organization.plan` 等）

任何上述变更**必须**重跑 `pnpm ba:shadow`，否则 ZenStack 视野里的 BA schema 会和 runtime drift。

---

## 2. Signatures

### Module structure

```
src/lib/auth/
├── config.ts     ← 单一真源：BA 全部 option（除 `database`）+ 业务 helpers
├── server.ts     ← Runtime BA 实例：thin wrapper，绑 pg.Pool
├── codegen.ts    ← CLI-only 实例：thin wrapper，绑 prismaAdapter（仅给 generate 用）
├── client.ts     ← 浏览器侧 authClient
├── session.ts    ← getSessionUser / 类型导出
├── errors.ts     ← BA error code → 中文映射（见 error-handling.md）
├── guards.ts     ← requireSiteAdmin 等 server-fn 守卫
└── plan.ts       ← plan-gating 枚举 + limits 表（见 plan-gating.md）
```

### Generated artifacts

- `zenstack/_better-auth.zmodel` —— 由 `pnpm ba:shadow` 生成；9 个 `Ba*` 影子 model（@@ignore + @@map），保留原始 @relation
- `zenstack/schema.zmodel` 顶部用 `import "_better-auth"` 引入

### Commands

| Command | 用途 | 何时跑 |
|---------|------|--------|
| `pnpm ba:shadow` | 重生 `_better-auth.zmodel` | 见 §1 任一触发 |
| `pnpm auth:migrate` | 真正建/改 BA 表 | 升级 BA / 改 plugin / 改 additionalFields 后 |
| `pnpm zen generate` | 重生 ZenStack runtime artifacts | zmodel 改后（`db:push` 也会跑） |

### Critical contract: server.ts vs codegen.ts

```ts
// src/lib/auth/server.ts (runtime — business code imports `auth` from here)
export const auth = betterAuth({
  ...authConfig,
  database: pool,            // ← 真 PG 池
});

// src/lib/auth/codegen.ts (CLI-only — `better-auth/cli generate` reads this)
export const auth = betterAuth({
  ...authConfig,
  database: prismaAdapter({}, { provider: "postgresql" }),  // ← 类型 stub
});
```

两边共享 `authConfig`——**这是影子永远和 runtime 同步的唯一保证**。绝不允许两个文件各自重新声明 plugin / additionalFields。

---

## 3. Contracts

### `authConfig` 类型契约

```ts
// src/lib/auth/config.ts
import type { BetterAuthOptions } from "better-auth";

export const authConfig = {
  emailAndPassword: { ... },
  emailVerification: { ... },
  databaseHooks: { ... },
  plugins: [admin(...), organization(...), multiSession(), tanstackStartCookies()],
  user: { additionalFields: { ... } },
  logger: { ... },
} satisfies Omit<BetterAuthOptions, "database">;
```

`satisfies Omit<BetterAuthOptions, "database">` 是**必需**的——保留字面量类型推导（`additionalFields.type: "string"` 必须窄化成 `DBFieldType` 联合，否则 server.ts/codegen.ts spread 时类型炸）。同时强制只有 `database` 缺席。

### Generated shadow contract

`zenstack/_better-auth.zmodel` 的每个 model 必须满足：

| 契约 | 实现 |
|------|------|
| 名字以 `Ba` 开头 | 后处理脚本 rename |
| `@@map("<originalTable>")` | BA generate 输出，脚本不动 |
| `@@ignore` | 后处理脚本追加 |
| 跨 model `@relation` 类型也用 `Ba*` 名 | rename 用 `\b<Name>\b` 同时改 declaration + field type |
| 文件头标注 AUTO-GENERATED | 后处理脚本写入 |

### Environment keys

| Key | Required | Used by |
|-----|----------|---------|
| `DATABASE_URL` | ✅ runtime + cli generate | server.ts (`pool`) / codegen.ts（datasource block，BA 内部读取） |
| `BETTER_AUTH_SECRET` | ✅ runtime | server.ts |
| `BETTER_AUTH_URL` | ✅ runtime | config.ts (`sendInvitationEmail` 拼 acceptUrl) |
| `VITE_PRODUCT_MODE` | ✅ runtime | config.ts (`allowUserToCreateOrganization`、ensurePersonalOrg 闸门) |

`pnpm ba:shadow` 通过 `dotenv -e .env.local` 注入；缺 `DATABASE_URL` 命令会失败——这是有意的 guardrail。

---

## 4. Validation & Error Matrix

| 触发 | 期望失败模式 | 排查 |
|------|------------|------|
| 改 `additionalFields` 但没跑 `pnpm ba:shadow` | ZenStack policy 引用新字段时类型报错 | 跑 `pnpm ba:shadow && pnpm zen generate` |
| `pnpm ba:shadow` 报 "Command better-auth not found" | 没用 `npx @better-auth/cli@latest` | 检查 package.json 里 `ba:shadow` script |
| `_better-auth.zmodel` 里某 model 缺 `@@ignore` | 后处理脚本 bug 或 model body 有奇怪嵌套 | 直接看输出文件 + 修 `scripts/ba-shadow.mjs` |
| `pnpm zen generate` 报 "Expecting EOF but found import" | `import "_better-auth"` 不在 schema.zmodel 顶部 | import 必须在 datasource/plugin 之前 |
| BA 跑得起来但 ZenStack policy 看不到 BA 字段 | runtime 改了但 codegen.ts 没共享 config | 必须从 `./config` import authConfig，不能两边各写一份 |
| `satisfies Omit<BetterAuthOptions, "database">` 报错 | BA 升级换了某个 option 名 / 某字段类型变严格 | 修正 config.ts 直到 satisfies 通过；server.ts/codegen.ts 不动 |

---

## 5. Good / Base / Bad Cases

### Good：升级 BA + 改 plugin

```bash
pnpm up better-auth @better-auth/cli       # 升级
# 在 src/lib/auth/config.ts 加新 plugin / 改 additionalFields
pnpm ba:shadow                              # 重生影子
pnpm auth:migrate                           # 真表迁移
pnpm zen generate                           # 让 ZenStack 看到新影子
pnpm tsc --noEmit && pnpm test              # 验证
```

### Base：业务表 FK 到 BaUser

```prisma
// zenstack/schema.zmodel
model Post {
  id       Int     @id @default(autoincrement())
  authorId String
  // BaUser 来自 _better-auth.zmodel（@@ignore，但关系仍可声明）
  author   BaUser  @relation(fields: [authorId], references: [id])

  @@allow('update', auth().userId == authorId)
}
```

### Bad：在 server.ts 直接写 plugin（绕过 config.ts）

```ts
// src/lib/auth/server.ts
export const auth = betterAuth({
  database: pool,
  plugins: [admin(), organization()],   // ❌ 不要这样
});
```

后果：codegen.ts 看不到这些 plugin → `_better-auth.zmodel` 不含对应表 → ZenStack policy 依赖这些表会编译报错或 silent miss。**任何会影响 BA schema 的字段必须在 config.ts**。

---

## 6. Tests Required

### 影子 codegen 流水线

- **手测（每次升 BA）**：`pnpm ba:shadow && git diff zenstack/_better-auth.zmodel`，diff 应只包含真实 schema 变更，无随机重排
- **编译断言**：`pnpm zen generate` 必须 0 warning 通过
- **类型断言**：`pnpm tsc --noEmit` 必须 0 error
- **Smoke**：`pnpm dev` 启动 + `curl /` 200 + `curl /auth/login` 307

### 后处理脚本健壮性（如改 `scripts/ba-shadow.mjs`）

| 断言点 | 期望 |
|--------|------|
| 文件头是 `// AUTO-GENERATED ...` | ✅ |
| 每个 model 名以 `Ba` 开头 | ✅ |
| 每个 model 都含 `@@ignore` | ✅ |
| `@@map(...)` 完整保留（lowercase 表名不变） | ✅ |
| `@relation` 内部 model 类型已 rename | ✅（如 `user BaUser @relation`） |
| `@relation` 内部字段名未被错误 rename | ✅（如 `fields: [userId]` 而非 `fields: [BaUserId]`） |

后处理脚本对 BA 生成器输出格式有耦合——BA 大版本升级时**重新审一次输出**，不要盲目跑。

---

## 7. Wrong vs Correct

### Wrong：双重维护（手抄影子 + runtime config）

```prisma
// zenstack/schema.zmodel
model BaUser {                       // ❌ 手抄
  id String @id
  email String @unique
  @@map("user") @@ignore
}
```

```ts
// src/lib/auth/server.ts
export const auth = betterAuth({
  user: { additionalFields: { nickname: ... } },  // 这里加了字段
});
```

后果：影子里没 `nickname`，policy 引用 `auth().nickname` 不存在；或者影子有但 BA 没建表 → migrate 时炸。**手抄注定要 drift**。

### Correct：codegen 单一真源

```prisma
// zenstack/schema.zmodel（顶部）
import "_better-auth"     // 只引用，不声明
```

```ts
// src/lib/auth/config.ts（authConfig 真源）
plugins: [organization({ schema: { organization: { additionalFields: { plan: ... } } } })],
user: { additionalFields: { nickname: ... } },
```

升级或改字段：跑 `pnpm ba:shadow`，影子和真表永远同步。

---

## Design Decision: 单一 config.ts vs 最小提取

**Context**：codegen.ts 需要和 server.ts 共享 BA 配置（plugin 列表 + additionalFields），否则生成的影子和 runtime drift。

**Options Considered**：
1. **最小提取**：只把 `plugins[]` + `additionalFields` 拎出来当 `shared`，server.ts 保留剩余配置（hooks / email / session）
2. **单一 config.ts**：除 `database` 外全部 BA option 在 config.ts；server.ts / codegen.ts 各自 thin wrapper

**Decision**：方案 2。

**理由**：
- BA 的 `generate` 不调用 hooks，仅 introspect 影响 schema 的字段——把 hooks 一起放 config.ts 零副作用
- 单一文件 = 心智负担减半：看 config.ts 就懂 BA 全貌；不需要交叉读 shared + server 才能拼出全貌
- 加 hook / 改 emailVerification 时不用纠结"该归 shared 还是 server"——一律 config.ts
- server.ts 缩到 ~10 行 thin wrapper，职责单一（绑定运行时适配器）

**Consequence**：config.ts 必须用 `satisfies Omit<BetterAuthOptions, "database">` 锁字段集，避免任何人在 config.ts 里手写 `database: pool` 把 runtime 资源耦合进来。

---

## Common Mistake：忘了 `pnpm ba:shadow`

**Symptom**：改了 `additionalFields` 后，运行时正常但 ZenStack policy 引用新字段 tsc 报错；或更隐蔽——policy 静默忽略，行为不符合预期。

**Cause**：`_better-auth.zmodel` 是手动重生（不是 hook 触发），漏跑后影子和真表 drift。

**Fix**：

```bash
pnpm ba:shadow && pnpm zen generate
```

**Prevention**：
- 升级 BA / 改 plugin 配置时，把 `pnpm ba:shadow` 放进 commit checklist
- AGENTS.md "生成产物勿手改" 已列入 `_better-auth.zmodel`，PR review 看到该文件 diff 但 `config.ts` 未变 → drift 信号
- 未来可加 CI drift check：`pnpm ba:shadow && git diff --exit-code zenstack/_better-auth.zmodel`

---

## Common Mistake：在 codegen.ts 重新声明 plugin

**Symptom**：`pnpm ba:shadow` 输出和 runtime 不一致；某个 plugin 加的 column 出现在 runtime 但影子里没有（或反之）。

**Cause**：开发者在 codegen.ts 里复制了 plugin 列表想"快速生成"，结果 codegen 真源和 server 真源分叉。

**Fix**：

```ts
// codegen.ts 唯一允许的形态
import { authConfig } from "./config";
export const auth = betterAuth({
  ...authConfig,
  database: prismaAdapter({}, { provider: "postgresql" }),
});
```

**Prevention**：codegen.ts 里**禁止**出现 `plugins:` / `additionalFields:` / 任何 BA option 字面量。Code review 看到这些就拒。
