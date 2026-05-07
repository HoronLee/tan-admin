# Research: Better Auth `databaseHooks.user.create.after` —— 区分 admin createUser vs signUpEmail 路径

- **Query**: 在 BA 的 `databaseHooks.user.create.after(user, ctx)` 里如何稳定识别本次创建来自 admin plugin 的 `admin.createUser` vs 公开 `signUpEmail`，从而只对 admin 路径强制 `emailVerified=true`？
- **Scope**: external（better-auth ^1.6.5 源码 + 官方文档 + 社区 issue）
- **Date**: 2026-05-07
- **BA version under inspection**: 安装于 `node_modules/better-auth@1.6.5`、`@better-auth/core@1.6.5`

---

## 背景

`tan-servora` 在 `databaseHooks.user.create.after` 里挂了业务逻辑（创建 personal org 等）。我们现在还想加一条逻辑：当用户由超管通过 `admin.createUser` 创建时，**绕过邮件验证流程**，直接 `emailVerified=true`；但**不能**误把公开 `signUpEmail` 路径的初始 unverified 状态翻转，否则会破坏正常的注册 + 验证邮件流程。

BA 1.6.5 的 hook 机制核心事实：

- **同一个 hook 数组**会被 admin / signUp / OAuth 等所有 user-create 路径共享触发；admin plugin **没有**独立的 `onUserCreated` 回调（只在 `init()` 里注入了一个共享的 `databaseHooks.user.create.before` 用来填默认 role）。
- **两条路径都调相同的 `internalAdapter.createUser`**（`node_modules/better-auth/dist/api/routes/sign-up.mjs:218` 与 `node_modules/better-auth/dist/plugins/admin/routes.mjs:161`）→ 同一 `createWithHooks(data, "user", …)` → 同一 user-level hook。

因此区分必须发生在 **hook 内部**，靠第二参 `ctx`。

---

## Findings

### 子问题 1（首选机制）：hook 第二参里有什么字段可识别请求路径？

**结论：有，且就是 `ctx.path`，admin createUser = `"/admin/create-user"`，signUpEmail = `"/sign-up/email"`。**

#### 官方类型签名

`commit 63fbd91`（feat: add context to database hooks #1180，2025-02-20）将 `databaseHooks.user.create.{before,after}` 第二参定义为 `GenericEndpointContext`：

```ts
// packages/better-auth/src/types/options.ts （diff from 63fbd91）
before?: (
  user: User,
  context?: GenericEndpointContext,
) => Promise<...>
after?: (user: User, context?: GenericEndpointContext) => Promise<void>;
```

`GenericEndpointContext` 在 1.6.5 dist 里为：

```ts
// node_modules/.pnpm/@better-auth+core@1.6.5/.../@better-auth/core/dist/types/context.d.mts:53-55
type GenericEndpointContext<Options extends BetterAuthOptions = BetterAuthOptions> =
  EndpointContext<string, any> & {
    context: AuthContext<Options>;
  };
```

`EndpointContext`（`better-call`）暴露了 `path`、`body`、`headers`、`request`、`query` 等字段。Better-Auth 在 `to-auth-endpoints.mjs:56-66` 把它实际填充为：

```js
// node_modules/better-auth/dist/api/to-auth-endpoints.mjs:56-66
let internalContext = {
  ...context,
  context: { ...authContext, returned: void 0, responseHeaders: void 0, session: null },
  path: endpoint.path,                    // <— 关键字段
  headers: context?.headers ? new Headers(context?.headers) : void 0
};
// :72
return ... runWithEndpointContext(internalContext, ...)
```

`runWithEndpointContext` 把 `internalContext` 整体放进 AsyncLocalStorage（`@better-auth/core/dist/context/endpoint-context.mjs:25-27`）。

`createWithHooks` 取 store 时拿到的就是这个 `internalContext`：

```js
// node_modules/better-auth/dist/db/with-hooks.mjs:7
const context = await getCurrentAuthContext().catch(() => null);
// ...
// :32-38
const toRun = hooks[model]?.create?.after;
if (toRun) await queueAfterTransactionHook(async () => {
  await withSpan(`db create.after ${model}`, { ... }, () => toRun(created, context));
});
```

故 hook 拿到的 `context.path` 就是 `endpoint.path`。

#### admin createUser 的 path 值

```js
// node_modules/better-auth/dist/plugins/admin/routes.mjs:129
const createUser = (opts) => createAuthEndpoint("/admin/create-user", { ... }, async (ctx) => { ... });
```

#### signUpEmail 的 path 值

```js
// node_modules/better-auth/dist/api/routes/sign-up.mjs:21
const signUpEmail = () => createAuthEndpoint("/sign-up/email", { ... }, async (ctx) => { ... });
```

#### 官方文档对 `ctx.path` 路由分支用法的背书

来源：<https://www.better-auth.com/docs/concepts/hooks>（"Hooks | Better Auth"，2026-05 抓取）

> Since `before` and `after` each accept a single `createAuthMiddleware` call, use conditional checks on `ctx.path` to handle multiple endpoints within the same hook.

文档示例就是 `if (ctx.path === "/reset-password")` / `if (ctx.path.startsWith("/sign-up"))` 这种分支写法。**这与我们要做的事完全同构**。

#### 注意点

1. `context` 参数在类型层是 **`GenericEndpointContext | null | undefined`**。在某些纯服务端入口（比如 seed 里直接 `auth.api.createUser` 而**完全不进 endpoint 链**的极端场景）下可能拿不到——但 `to-auth-endpoints.mjs:47-138` 显示 `auth.api.*` 也走同一个 `runWithEndpointContext` 包装，`internalContext.path = endpoint.path` 总会被设上。我们的代码即便走 seed 也是经 `auth.api.createUser`，所以 `ctx.path === "/admin/create-user"` 同样成立。
2. PR #2521（fix(admin): Pass `ctx` to user create db hook，2025-07-19 merged）专门修了 admin 路径**没有把 ctx 透传给 hook** 的旧 bug。我们用的 1.6.5 已经包含此修复——dist 里 admin createUser 调 `internalAdapter.createUser(...)` 时不再需要显式传 ctx，因为 ctx 已经通过 AsyncLocalStorage 提供。
3. Issue #3389 / PR #3418（2025-07）还修了 admin 路径**不触发 user.create.before** 的 bug。1.6.5 已包含修复，所以 admin createUser 会触发 before 和 after **两个** hook。
4. **transaction 时序**：dist `with-hooks.mjs:33` 用 `queueAfterTransactionHook` 把 after hook 排到 commit 之后执行（参见 issue #7260 + 1.6 的修复）；这意味着 hook 里能 `await ctx.context.internalAdapter.updateUser(user.id, { emailVerified: true })`，不会撞上 v1.3.10 那段 "user 还没 commit" 的旧坑。

#### 推荐写法（在子问题 1 已经成立）

```ts
databaseHooks: {
  user: {
    create: {
      after: async (user, ctx) => {
        // ctx?.path 形态见上文证据
        if (ctx?.path === "/admin/create-user" && !user.emailVerified) {
          await ctx.context.internalAdapter.updateUser(user.id, {
            emailVerified: true,
          });
        }
        // 注意：signUpEmail 路径(ctx?.path === "/sign-up/email")保持原样，不要碰 emailVerified
      },
    },
  },
},
```

> 备选写得更稳健一点：用 `startsWith("/admin/")` 或集中常量列出所有 "管理员显式授信" 的入口（例如未来加 `/admin/import-users`），避免日后遗漏。

---

### 子问题 2（备选机制 1）：admin plugin 是否有独立 hook（如 `onUserCreated` / `afterCreateUser`）？

**结论：没有。** admin plugin 完全复用全局 `databaseHooks.user.create.{before,after}`。

证据：admin plugin 在 1.6.5 dist 里的全部 hook 注册：

```js
// node_modules/better-auth/dist/plugins/admin/admin.mjs:25-55
init() {
  return { options: { databaseHooks: {
    user: { create: { async before(user) {
      return { data: { role: options?.defaultRole ?? "user", ...user } };
    } } },
    session: { create: { async before(session, ctx) { /* ban check */ } } }
  } } };
},
hooks: { after: [{
  matcher(context) { return context.path === "/list-sessions"; },
  handler: createAuthMiddleware(async (ctx) => { /* filter impersonated */ })
}] },
endpoints: { setRole: ..., createUser: createUser(opts), ... },
```

除了 `databaseHooks.user.create.before` (填 role) 和 `databaseHooks.session.create.before` (ban 检查)，admin plugin 没有暴露任何用户级别的 after-create 钩子；类型声明 `node_modules/better-auth/dist/plugins/admin/admin.d.mts:11-91` 也只列出这些。也就是说**没法绕开** `databaseHooks.user.create.after`、在 admin plugin 内部"独立"处理。

---

### 子问题 3（备选机制 2）：admin createUser 入参是否能直接传 `emailVerified` 让管理员显式标记 verified？

**结论：可行但不正式。** `createUserBodySchema` 没有显式列 `emailVerified`，但 `data: Record<string, any>` 字段会被原封不动 spread 进 `internalAdapter.createUser` 调用，**且不经过 `parseUserInput` 过滤**，所以 `data.emailVerified = true` 会直接落库。

证据：

```js
// node_modules/better-auth/dist/plugins/admin/routes.mjs:107-113
const createUserBodySchema = z.object({
  email: z.string()...,
  password: z.string().optional(),
  name: z.string()...,
  role: z.union([z.string(), z.array(z.string())]).optional(),
  data: z.record(z.string(), z.any()).optional(),
});
// :161-166
const user = await ctx.context.internalAdapter.createUser({
  email,
  name: ctx.body.name,
  role: (ctx.body.role && parseRoles(ctx.body.role)) ?? opts?.defaultRole ?? "user",
  ...ctx.body.data,
});
```

而 `internalAdapter.createUser` 类型是 `Omit<User, "id"|"createdAt"|"updatedAt"|"emailVerified"> & Partial<User> & Record<string, any>`（`@better-auth/core/dist/types/context.d.mts:61`）—— 显式允许 `Partial<User>`，包括 `emailVerified`。

#### 官方文档侧的措辞

来源：<https://better-auth.vercel.app/docs/plugins/admin>

> `data` Record — Extra fields for the user. Including custom additional fields.

也就是 `data` 官方语义是 "extra fields for the user"。

#### 已知坑

- Issue #3602（Optional data field in `auth.api.createUser()` is non-functional）和 issue #4651（Create User from Admin doesn't respect plugins）都指出：`data` 里的字段如果**不是** BA core schema 标准字段、**且也没在 `user.additionalFields`** 里声明，Adapter 层会丢掉。`emailVerified` 是 core schema 里的字段（`User` 类型上就有），不属于 additionalFields——理论上不会被丢掉，但**行为依赖具体 adapter 实现**。
- 本项目用 ZenStack v3 + Kysely，Better-Auth 的 user 表是 `@@ignore` 的影子模型，BA 自己直接走它内置的 Kysely adapter；从 BA 源码看 `data` 不会再过一层 schema 过滤，所以 `data.emailVerified` 应该能落。

#### 这条机制的优缺点

| 维度 | 评价 |
|---|---|
| 显式性 | 调用方需要每次都传，容易漏；如果 UI/server-fn 有多个入口就要全部记得加 |
| 与官方语义对齐 | "data" 官方说法是 "extra fields"，把 `emailVerified` 塞这里有点歪用 |
| 失败时的兜底 | 如果未来 admin plugin 收紧 `data` 的过滤逻辑，会静默失效 |
| 优势 | 不依赖 hook 时序、对 ZenStack 友好（不用查 path） |

**结论**：作为 last-resort 可行，但不是首选。

---

### 子问题 4（补充）：`auth.api.sendVerificationEmail` 在已存在 unverified 用户上的行为

#### endpoint 行为

```js
// node_modules/better-auth/dist/api/routes/email-verification.mjs:88-108
const sendVerificationEmail = createAuthEndpoint("/send-verification-email", { ... }, async (ctx) => {
  if (!ctx.context.options.emailVerification?.sendVerificationEmail) {
    throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.VERIFICATION_EMAIL_NOT_ENABLED);
  }
  const { email } = ctx.body;
  const session = await getSessionFromCtx(ctx);
  if (!session) {
    const user = await ctx.context.internalAdapter.findUserByEmail(email);
    if (!user || user.user.emailVerified) {
      // **email enumeration protection: 静默返回 status:true，不发邮件**
      await createEmailVerificationToken(ctx.context.secret, email, ...);
      return ctx.json({ status: true });
    }
    await sendVerificationEmailFn(ctx, user.user); // 真实发邮件
    return ctx.json({ status: true });
  }
  if (session?.user.email !== email) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.EMAIL_MISMATCH);
  if (session?.user.emailVerified) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.EMAIL_ALREADY_VERIFIED);
  await sendVerificationEmailFn(ctx, session.user);
  return ctx.json({ status: true });
});
```

要点：

1. **未登录调用 + 用户已 verified 或不存在** → 静默成功，不会触发 `emailVerification.sendVerificationEmail` hook。这是有意的 enumeration 防护。
2. **未登录调用 + 用户存在且 unverified** → 调 `sendVerificationEmailFn`，触发 `options.emailVerification.sendVerificationEmail` hook 真实发邮件。
3. **已登录调用 + email 与 session.user.email 不同** → 400。
4. **已登录调用 + 自己已 verified** → 400 `EMAIL_ALREADY_VERIFIED`。

#### Throttle / rate-limit

BA 默认对 `/send-verification-email` 加了 special rule：

```js
// node_modules/better-auth/dist/api/rate-limiter/index.mjs:185-198
function getDefaultSpecialRules() {
  return [
    { pathMatcher(path) {
        return path.startsWith("/sign-in") || path.startsWith("/sign-up")
            || path.startsWith("/change-password") || path.startsWith("/change-email");
      }, window: 10, max: 3 },
    { pathMatcher(path) {
        return path === "/request-password-reset"
            || path === "/send-verification-email"
            || path.startsWith("/forget-password")
            || path === "/email-otp/send-verification-otp"
            || path === "/email-otp/request-password-reset";
      }, window: 60, max: 3 },
  ];
}
```

**默认 60 秒窗口、上限 3 次**。如果用户在前端反复点 "重发"，第 4 次起会被 BA 自身拒绝（429）。这能解释 "resend 后仍然登录失败" 的部分案例：用户连点导致 token 没真正发出去，看起来像是没收到邮件。

#### 对主流程的影响

不阻塞——但 PRD 里如果想做 "重发验证邮件" UI，要：

1. 加客户端节流（按钮 disable 60s）。
2. 区分服务端 200（不一定真发了）vs 429（被限流）。
3. 注意 enumeration protection 也会让 "用户不存在" 看起来 200。

---

## Recommendation

**用机制 1（`ctx?.path === "/admin/create-user"`）作为主方案，放在现有的 `databaseHooks.user.create.after` 里。**

理由：

1. **官方明确支持**：`GenericEndpointContext` 类型签名 + 官方 hooks 文档示范的就是这种 `ctx.path` 分支写法，未来 BA 升级也不会突然抽掉。
2. **范围最准**：精确到 admin plugin 的 createUser 端点，不会污染 signUp / OAuth / personal-org 等其他路径。
3. **无副作用**：不需要让前端调用方记住传特殊参数，也不会被 ZenStack 类的 schema 过滤干扰。
4. **transaction 友好**：1.6 的 `queueAfterTransactionHook` 保证 user 已 commit，可以在 hook 里直接 `updateUser` 翻 emailVerified。

**伪代码（落地实现时要 cross-check 现有 hook 不冲突）：**

```ts
// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { admin as adminPlugin } from "better-auth/plugins";

export const auth = betterAuth({
  // ...
  plugins: [adminPlugin(/* opts */)],
  databaseHooks: {
    user: {
      create: {
        after: async (user, ctx) => {
          // 1. admin 路径强制 verified
          if (ctx?.path === "/admin/create-user" && !user.emailVerified) {
            await ctx.context.internalAdapter.updateUser(user.id, {
              emailVerified: true,
            });
          }

          // 2. 其余既有逻辑（personal org / membership 等）保持不变
          // 注意 issue #7260：1.6 已修复 transaction 时序，可以放心 await ctx.context.internalAdapter.*
        },
      },
    },
  },
});
```

**仍然要注意的边界情况：**

- **seed 脚本**：CLAUDE.md 说 super-admin seed 走 `internalAdapter.createUser`（直接绕过 endpoint 链）。这条路径 `ctx` 会是 `null`（因为没有 `runWithEndpointContext`），所以 hook 里的 `ctx?.path` 检测**不会**误命中——这正合我们的本意（seed 自己已经手动 `emailVerified=true`，不需要 hook 再翻）。
- **之后再加新管理员入口**（比如 `/admin/import-users` 之类）时，记得扩展条件或换成 `ctx?.path?.startsWith("/admin/")` 的更宽匹配；但要先确认目标 endpoint 也走 `internalAdapter.createUser` 而非别的路径。
- **OAuth 注册路径**（`/callback/:id` / `/sign-in/social`）触发的是 `createOAuthUser`，调的是 `createWithHooks`，**也会**进 user.create.after。如果业务希望 OAuth 注册也保持 unverified-by-default，则**不要**写成 `ctx?.path !== "/sign-up/email"`（白名单反向）；保持现在的"只匹配 admin 白名单"的写法最安全。
- **`emailVerified` 翻为 true 后**前端如果还指望调 `sendVerificationEmail` 重发邮件，会被静默吞（见子问题 4）；UI 应该 hide 掉 admin-created 用户的"重发"按钮，或者让其改走"管理员重置密码 + 直接登录"流程。

**机制 3（`data: { emailVerified: true }` 通过 createUser 入参）作为可选 fallback**：在 hook 路径检测因极端原因失效时（比如未来 BA 改实现），可以让前端 admin UI 的 createUser 调用同时传 `data: { emailVerified: true }` 双保险。这条不阻塞主方案。

---

## Caveats / Not found

- **未确认**：1.6.5 的 `internalAdapter.createUser` 在透传 `data.emailVerified` 时，是否会被 `parseUserInput` 之外的 adapter-level transform（如 ZenStack `customTransformInput`）干预。本项目 BA 表 `@@ignore`、ZenStack 不参与 BA 表写入，所以在我们这套大概率 OK，但没有跑实际 e2e 验证。
- **未追**：`auth.api.createUser`（直接服务端调用）路径是否仍然走 `to-auth-endpoints.mjs` 的 `runWithEndpointContext` 包装。从 `to-auth-endpoints.mjs:46-138` 看是肯定的（`api[key] = async (context) => { ... runWithEndpointContext(internalContext, ...) }`），但没单独 e2e 测试。
- **未量化**：BA 的 `runInBackgroundOrAwait`（用在 sendVerificationEmail）在我们的 SMTP/Resend 配置下是否会真的 fire-and-forget；如果 SMTP 调用同步失败会怎样回流到 endpoint，没有进一步研究。

## Related Specs

- `.trellis/spec/backend/email-infrastructure.md` —— EMAIL_TRANSPORT 配置 / dev `@dev.com` 邮箱免验证约定（与本研究互补）。
- `.trellis/spec/backend/authorization-boundary.md` —— BA 是身份层、ZenStack 是业务层，本改动只触及身份层（user.emailVerified），不需要 ZenStack policy 调整。
- `.trellis/spec/backend/personal-org.md` —— 现有 `databaseHooks.user.create.after` 已经做 personal org 创建，需要确认我们新加的逻辑不会与之顺序耦合。

## External References

- 官方 hooks 文档：<https://www.better-auth.com/docs/concepts/hooks>（`ctx.path` 分支用法的官方背书）
- 官方 admin plugin 文档：<https://better-auth.vercel.app/docs/plugins/admin>（`data` 字段语义、`customSyntheticUser` 的存在）
- commit `63fbd91` (feat: add context to database hooks #1180)：<https://github.com/better-auth/better-auth/commit/63fbd910> —— `databaseHooks` 第二参 `GenericEndpointContext` 的引入
- PR #2521 (fix(admin): Pass `ctx` to user create db hook)：<https://github.com/better-auth/better-auth/pull/2521> —— 1.6.x 已包含
- PR #3418 (fix(admin): before hook not triggering on create user)：<https://github.com/better-auth/better-auth/pull/3418>
- Issue #7260 (databaseHooks.user.create.after FK violation, transaction timing)：<https://github.com/better-auth/better-auth/issues/7260> —— 1.6 起改用 `queueAfterTransactionHook`，本研究的写法不会撞上旧坑
- Issue #6791 (auth.api.createOrganization in databaseHooks)：<https://github.com/better-auth/better-auth/issues/6791> —— 与本任务无直接关系，但说明 `auth.api.*` 调用在 hook 内仍然会走权限检查；翻 emailVerified 用 `internalAdapter.updateUser` 即可绕过
- Issue #3602 (`data` field non-functional)：<https://github.com/better-auth/better-auth/issues/3602> —— 解释 `data` 字段失效场景，对子问题 3 的判断有参考价值
- Issue #5879 (user cannot login after admin createUser)：<https://github.com/better-auth/better-auth/issues/5879> —— 印证 admin createUser 默认 `emailVerified=false`，未发验证邮件就会卡住登录
