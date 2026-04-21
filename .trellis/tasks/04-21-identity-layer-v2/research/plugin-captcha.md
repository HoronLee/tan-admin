# Better Auth — captcha 插件

## 来源
- https://better-auth.com/docs/plugins/captcha
- 抓取：2026-04-21

## 核心概念

服务端中间件，在 POST 进指定 endpoints 时自动调对应 provider 的 `/siteverify` 校验客户端提交的 captcha token。校验失败拒绝请求。

支持 4 个 provider：
- Google reCAPTCHA（v2/v3，v3 走 minScore）
- Cloudflare Turnstile（推荐：免费、无 cookie、隐私友好）
- hCaptcha
- CaptchaFox

## 服务端配置（src/lib/auth.ts 视角）

```ts
import { captcha } from "better-auth/plugins"

export const auth = betterAuth({
  plugins: [
    captcha({
      provider: "cloudflare-turnstile",                  // 必填
      secretKey: process.env.TURNSTILE_SECRET_KEY!,      // 必填（src/env.ts 加 schema）
      // 可选：
      // endpoints: ["/sign-in/email", "/sign-up/email", "/request-password-reset", ...],
      // minScore: 0.5,                                  // 仅 reCAPTCHA v3
      // siteKey: process.env.HCAPTCHA_SITE_KEY,         // hCaptcha / CaptchaFox 防 token 跨站复用
      // siteVerifyURLOverride: "https://...",           // 私有/代理场景
    }),
  ],
})
```

默认拦截：`/sign-up/email`、`/sign-in/email`、`/request-password-reset`。开启了 OTP / Magic Link / Passkey / API Key 的 sign-in 端点要手动追加到 `endpoints`，否则不被保护。

## 客户端配置（src/lib/auth-client.ts 视角）

**没有专门的 client plugin**；客户端自己渲染对应 provider 的 widget，把 token 通过 `headers["x-captcha-response"]`（或 provider 约定字段）跟随请求发出。better-auth-ui shadcn 变体的 `<Auth />` 暂无内置 captcha widget，需要自写或换 npm 包变体。

## Schema 影响（zenstack/schema.zmodel 视角）

**不新增任何表**——纯中间件。

## 与本项目其它插件的协同

- 配 `emailAndPassword: { enabled: true }`：开箱即用。
- 配 `emailOTP`：默认不保护 `/email-otp/send-verification-otp`，要追加。
- 配 `magicLink`：要追加 `/sign-in/magic-link`。
- 配 `apiKey`：API Key 走 server-to-server，不应被 captcha 拦——保留默认 endpoints 即可。
- 配 `organization` 邀请 accept：默认不拦，按需追加。

## 关键代码骨架

环境变量声明（`src/env.ts`）：
```ts
export const env = createEnv({
  server: {
    TURNSTILE_SECRET_KEY: z.string().min(1),
  },
  client: {
    VITE_TURNSTILE_SITE_KEY: z.string().min(1),
  },
})
```

前端 widget（参考实现，shadcn 变体未内置）：
```tsx
import { Turnstile } from "@marsidev/react-turnstile"
<Turnstile siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY} onSuccess={(token) => setToken(token)} />
```

请求注入（authClient 的 `fetchOptions.headers`）：
```ts
authClient.signIn.email({ email, password }, {
  headers: { "x-captcha-response": token },
})
```

## 注意事项 / 坑

1. **私有化部署陷阱**：4 个 provider 全都依赖 SaaS（即便是 Turnstile 也得连 Cloudflare）。如果"完全私有化"是硬约束，captcha 拿不下，得改用基于本地行为分析的方案（如 PoW challenge），或退一步只在出网环境启用。
2. **endpoint 列表是"替换"不是"追加"**——文档原文："If set, only the specified paths will be protected"，写自定义 endpoints 时务必把默认 3 个一起写进去。
3. siteVerify 不可达时插件**直接拒绝请求**——邮件登录会全军覆没。生产部署要预先确认 captcha 服务可达性 + 加 fallback 决策。
4. better-auth-ui 的 shadcn 变体目前不内置 captcha widget；要么自写，要么用 npm 包变体（其 SignIn 内置 turnstile 渲染槽）。
5. PRD 里"私有化部署禁用 Sentinel"的替代组合（captcha + have-i-been-pwned + rate limit）依然带 SaaS 依赖（Turnstile + HIBP API），只有 rate limit 是真正本地。**这一点要在 implement 前与主人确认**。
