# Personal Organization

> Executable contract for saas-mode personal org auto-provisioning。注册即建"个人工作空间"，用户感知不到"有 org"这个概念；想拉人协作时手动 `Convert to team workspace`。

---

## 1. Scope / Trigger

Triggers when work touches:

- `src/lib/auth.ts` `databaseHooks.user.update.after`（建 personal org）/ `organizationHooks.beforeDeleteOrganization|beforeCreateInvitation`（保护钩子）
- `organization.type` 字段 additionalFields 声明
- UI `<OrganizationSwitcher>` 区分 Personal 与 Workspaces
- 任何判断"当前是不是 personal org"的 server / client 代码
- 新增 "Convert to team workspace" 按钮

---

## 2. Signatures

### Schema additionalField（`src/lib/auth.ts`）

```ts
organization({
  schema: {
    organization: {
      additionalFields: {
        type: { type: "string", defaultValue: "team" },  // "team" | "personal"
      },
    },
  },
})
```

### Provision hook（`src/lib/auth.ts`）

```ts
databaseHooks: {
  user: {
    update: {
      after: async (user) => {
        if (env.PRODUCT_MODE !== "saas") return;
        if (!user.emailVerified) return;
        if (env.SEED_SUPER_ADMIN_EMAIL && user.email === env.SEED_SUPER_ADMIN_EMAIL) return;

        // 幂等查：member + org.type='personal'
        const existing = await pool.query(
          `SELECT o.id
           FROM "organization" o
           INNER JOIN "member" m ON m."organizationId" = o.id
           WHERE m."userId" = $1 AND o."type" = 'personal'
           LIMIT 1`,
          [user.id],
        );
        if (existing.rowCount) return;

        const orgId = randomUUID();
        // BA user.id 是 mixed-case nanoid（字符集 [A-Za-z0-9]），
        // 而 slug 验证是 /^[a-z0-9-]+$/，必须 toLowerCase() 归一化。
        const slug = `personal-${user.id.toLowerCase()}`;
        const displayName = user.name || user.email.split("@")[0];
        await pool.query(
          'INSERT INTO "organization" (id, name, slug, "createdAt", plan, "type") VALUES ($1, $2, $3, now(), $4, $5)',
          [orgId, `${displayName}'s Personal`, slug, "free", "personal"],
        );
        await pool.query(
          'INSERT INTO "member" (id, "organizationId", "userId", role, "createdAt") VALUES ($1, $2, $3, $4, now())',
          [randomUUID(), orgId, user.id, "owner"],
        );
      },
    },
  },
},
```

### Protection hooks（`src/lib/auth.ts` `organizationHooks`）

```ts
beforeDeleteOrganization: async ({ organization: org }) => {
  if ((org as { type?: string }).type === "personal") {
    throw new APIError("BAD_REQUEST", { message: "个人工作空间不允许删除" });
  }
},
beforeCreateInvitation: async ({ organization: org }) => {
  if ((org as { type?: string }).type === "personal") {
    throw new APIError("BAD_REQUEST", { message: "个人工作空间不支持邀请成员" });
  }
},
// ⚠️ 这里 `organization` 是 patch payload（ctx.body.data），不是现存记录。
// 要拿现存 slug 做 diff，只能从 `member.organizationId` 反查数据库。
// 与 beforeDelete/beforeCreate 的同名参数含义不对称，别搞混。
beforeUpdateOrganization: async ({ organization: patch, member }) => {
  if (patch.slug === undefined) return; // 未触及 slug，放行
  const { rows } = await pool.query<{ slug: string }>(
    'SELECT slug FROM "organization" WHERE id = $1 LIMIT 1',
    [member.organizationId],
  );
  if (rows[0]?.slug && patch.slug !== rows[0].slug) {
    throw new APIError("BAD_REQUEST", { message: "slug cannot be modified" });
  }
},
```

---

## 3. Contracts

### 触发时机

- **user.update.after** fires 在 BA 对 `user` 表做 update 之后。常见触发点：
  - 用户点击验证邮件链接 → `emailVerified: false → true`
  - `@dev.com` 邮箱 dev 自动 verify（走 raw SQL 直接 set true，**不经过 BA update flow**，因此这个 hook **不触发**）
  - super-admin 在 `/site/users` 页手动 verify 用户邮箱
  - 用户自己改资料（name / avatar 等），同样触发 → 幂等查会早退
- Hook 每次触发都**查询是否已存在 personal org**；存在则早退。所以 emailVerified 被重复 set true 也不会重复建

### 跳过规则

| 情况 | 行为 |
|---|---|
| `PRODUCT_MODE=private` | 早退（走 user.create.after 的默认 org auto-join）|
| `user.emailVerified=false` | 早退（未验证邮箱不能有 workspace）|
| `user.email === SEED_SUPER_ADMIN_EMAIL` | 早退（超管不需要个人空间）|
| 已有 personal org | 早退（幂等）|

### Slug 生成规则

**`personal-${user.id.toLowerCase()}`**，不用 name 或 email 派生。理由：
- 稳定：用户改名不影响 slug
- 唯一：user.id 是 nanoid，天然全局唯一，不会撞 slug
- 不可猜：别人看到 URL `/site/organizations/personal-xxxyyyzzz` 可以知道是某人的 personal，但拿不到 user 其他信息
- 丑但稳 > 好看但有重名风险

**为什么必须 `.toLowerCase()`**：BA user.id 是 mixed-case nanoid（字符集 `[A-Za-z0-9]`，样例 `dJwRXcFdEdfAfRgVTXUvZAVEvwUoJw5`），直接拼出的 slug 会包含大写字母，违反 `/^[a-z0-9-]+$/` 验证（前端 `org_settings_error_slug_pattern` + 未来的其他 slug 校验）。BA 的 nanoid 不含非 ASCII，`.toLowerCase()` 已足够 normalize；若未来 BA 切换 id 生成器引入非 ASCII，再补 strip。

**slug 不可变**：personal org 建好后 slug 永久固化。UI 层 slug Input 设为 readOnly/disabled，服务端 `organizationHooks.beforeUpdateOrganization` 拦截 slug diff 抛 `APIError("BAD_REQUEST", { message: "slug cannot be modified" })`。两层护栏，API 直调也过不了。

### Plan & display name

- plan：恒为 `free`（升级 plan 是用户后续操作）
- 展示名：`${user.name || email_local_part}'s Personal` — 用户改 name 后不自动同步，要手动改

### Session activeOrg 同步（关键）

建完 personal org 后，**必须**同步更新该 user 所有 active session 的 `activeOrganizationId`：

```ts
await pool.query(
  'UPDATE "session" SET "activeOrganizationId" = $1 WHERE "userId" = $2',
  [orgId, user.id],
);
```

**为什么必须同步**：BA 只在 sign-in 流程里 bootstrap 一次 `session.activeOrganizationId`（根据 member 表查一个 org 塞进去）。注册用户验证邮箱时，session 在验证之前就已经建好了（activeOrg=null），BA **不会**因为后续 emailVerified 变 true 重新 bootstrap。缺了这一步就是 bug：用户点完验证链接回 `/dashboard` → workspace guard 读 activeOrg=null → 踢去 `/onboarding` → 用户退出重登才能正常（重登触发 sign-in bootstrap）。

### Convert to team workspace（未实现，未来做）

用户从 OrganizationSwitcher 点 "Convert to team workspace"：
1. 调 `authClient.organization.update({ organizationId, data: { ... } })`
   - `type: "team"`
   - `plan: "free"`（重新让用户选 plan）
   - `name: user 填的新名`
2. 保护钩子自动失效（type 不是 personal 了）
3. UI 开放邀请、team 创建、plan 升降级

数据零迁移 —— 业务表都是 `organizationId` 过滤。

---

## 4. Validation Matrix

| Condition | Expected |
|---|---|
| `saas` 新用户 signup（未验证邮箱）| 无 personal org（user.update.after 早退）|
| `saas` 新用户点验证链接 | personal org 自动建，user 是 owner，`type=personal, plan=free, slug=personal-<userId>` |
| `saas` 同一 user 二次触发 update（例如改 nickname）| 查到已有 personal org → 早退幂等 |
| `saas` super-admin 账号 emailVerified → true | 跳过，不建 personal org |
| `private` 新用户 emailVerified → true | 跳过（走另一条路）|
| 对 personal org 调 `organization.invite-member` | APIError "个人工作空间不支持邀请成员" |
| 对 personal org 调 `organization.delete` | APIError "个人工作空间不允许删除" |
| 对 personal org 调 `organization.update` 改 `type=team` | 允许（保护钩子只拦删除/邀请，未拦 update）|
| Personal org owner 转让给他人 | 允许（未拦）—— 但这种情况罕见，UI 应隐藏按钮 |
| 删号 cascade | 用户删除时应先改 personal org 为 team 或手动删（当前未实现级联清理）|

---

## 5. Good / Bad Cases

### Good — saas 注册流程

```
用户注册 → 收验证邮件 → 点链接
  ↓ BA 更新 user.emailVerified=true
  ↓ databaseHooks.user.update.after 触发
  ↓ 查 member + org.type='personal' → 未找到
  ↓ INSERT organization(type=personal, plan=free, slug=personal-<uid>)
  ↓ INSERT member(role=owner)
  ↓ 用户进入 /dashboard 时 session.activeOrganizationId 已自动设为新建的 personal
```

### Bad — hook 不查幂等，每次都 INSERT

```ts
// ❌ INSERT 会因 slug unique 失败或创建第二个 personal org
await pool.query('INSERT INTO "organization" ...', [...]);
```

重复触发（emailVerified 被多次写）会报错或重复建。**必须先查**。

### Bad — 用 email 派生 slug

```ts
const slug = `personal-${user.email.split("@")[0]}`;  // ❌
```

问题：
- 用户改 email 后不一致
- 两个用户 `john@a.com` / `john@b.com` → `personal-john` 撞
- 邮箱里含特殊字符要转义

**恒用 user.id。**

---

## 6. Tests Required

| Test | Assertion |
|---|---|
| `auth.hook.test.ts` | `saas` + `emailVerified=true` 触发 → 查得 personal org，user 是 owner |
| `auth.hook.test.ts` | `slug === "personal-" + user.id` |
| `auth.hook.test.ts` | 第二次 update 不重复建 |
| `auth.hook.test.ts` | `private` 模式不建 personal org |
| `auth.hook.test.ts` | super-admin 不建 personal org |
| `auth.hook.test.ts` | 对 type=personal 调 invite-member → BAD_REQUEST |
| `auth.hook.test.ts` | 对 type=personal 调 delete → BAD_REQUEST |
| `auth.hook.test.ts` | type=team 的 org 不受保护钩子影响 |

---

## 7. Wrong vs Correct

### Wrong — 建 personal org 时调 BA API

```ts
// ❌ better-auth#6791 — hook 内调 auth.api.createOrganization 会死锁
await auth.api.createOrganization({ body: { ... } });
```

### Correct — raw SQL via shared pool

```ts
// ✅ 直接 INSERT，bypass BA API
await pool.query('INSERT INTO "organization" ...', [...]);
await pool.query('INSERT INTO "member" ...', [...]);
```

### Wrong — UI 不做 type 区分，全部 org 一视同仁

```tsx
<Button onClick={() => authClient.organization.inviteMember(...)}>邀请</Button>
// personal org 点击 → server 抛 BAD_REQUEST → toast 报错（UX 差）
```

### Correct — UI 层也读 type 决定显示

```tsx
const isPersonal = (activeOrg as { type?: string })?.type === "personal";
{!isPersonal && <Button onClick={...}>邀请</Button>}
```

UI 保护（隐藏按钮）+ server 保护（hook 拦）= 双保险。UI 失守还有服务端兜底。

---

## Related

- `backend/product-modes.md` — saas 模式的一部分
- `backend/plan-gating.md` — plan=free 的默认值来源
- `backend/authorization-boundary.md` — BA organization 插件拥有 organization 表
- `docs/reference/better-auth-plugin-organization.md` §Organization Hooks — `beforeDeleteOrganization` / `beforeCreateInvitation` 原文
- BA issue #6791 — nested `auth.api.*` in hooks deadlocks
