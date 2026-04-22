# Better Auth — emailOTP 插件

## 来源
- https://better-auth.com/docs/plugins/email-otp
- 抓取：2026-04-21

## 核心概念

OTP（One-Time Password）通过邮件下发 N 位数字码，覆盖 4 类场景：
- `sign-in`（无密码登录 / 二次验证入口）
- `email-verification`（注册后或主动验证邮箱）
- `forget-password`（密码重置）
- `change-email`（更换邮箱，需开 `changeEmail.enabled`）

OTP 默认 6 位、5 分钟过期、3 次尝试。

## 服务端配置（src/lib/auth.ts 视角）

```ts
import { emailOTP } from "better-auth/plugins"

export const auth = betterAuth({
  plugins: [
    emailOTP({
      // 必填：邮件下发回调
      async sendVerificationOTP({ email, otp, type }) {
        // type ∈ "sign-in" | "email-verification" | "forget-password"
        // ⚠️ 不要 await（避免 timing attack）；serverless 用 waitUntil
      },
      otpLength: 6,                          // 默认 6
      expiresIn: 300,                        // 默认 300s
      allowedAttempts: 3,                    // 超出返回 TOO_MANY_ATTEMPTS
      sendVerificationOnSignUp: false,       // 注册时是否自动下发验证 OTP
      disableSignUp: false,                  // signIn.emailOtp 时不存在用户是否拒绝
      resendStrategy: "rotate",              // "rotate" 每次新 OTP；"reuse" 复用同码 + 续期
      storeOTP: "plain",                     // "plain" | "encrypted" | "hashed" | { encrypt/decrypt } | { hash }
      overrideDefaultEmailVerification: true,// 把所有"验证邮箱"的链接换成 OTP
      changeEmail: {
        enabled: true,
        verifyCurrentEmail: true,            // 改邮箱前先验证当前邮箱
      },
      generateOTP: () => "...",              // 自定义生成
    }),
  ],
})
```

## 客户端配置（src/lib/auth-client.ts 视角）

```ts
import { emailOTPClient } from "better-auth/client/plugins"
export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
})
```

## Schema 影响（zenstack/schema.zmodel 视角）

不新增表。OTP 存储在 better-auth 已有的 `verification` 表里（hashed/plain/encrypted 看 `storeOTP` 配置）。如果配了 `secondaryStorage`，OTP 可走 Redis 等而不入 PG。

## 与本项目其它插件的协同

- 与 `emailAndPassword: { enabled: true }` 共存：用户既能用密码也能用 OTP 登录。
- 与 `admin` 插件协同：`overrideDefaultEmailVerification: true` 后，admin 创建用户的邮件验证链接换成 OTP。
- 与 `captcha` 协同：默认 captcha 拦截 `/sign-in/email`、`/sign-up/email`、`/request-password-reset`，**不拦截** `/email-otp/send-verification-otp`；如需保护 OTP 下发端点要在 captcha 的 `endpoints` 里追加。
- 与 `organization` 邀请：邀请 accept 通常走链接，不走 OTP；这里没有冲突。

## 关键 API 速查

服务端（`auth.api.*`）和客户端（`authClient.emailOtp.*` / `authClient.signIn.emailOtp`）成对存在。

| 用途 | client | server |
|---|---|---|
| 下发 OTP | `authClient.emailOtp.sendVerificationOtp({ email, type })` | `auth.api.sendVerificationOTP({ body })` |
| 校验 OTP（不消费） | `authClient.emailOtp.checkVerificationOtp({ email, type, otp })` | `auth.api.checkVerificationOTP({ body })` |
| 用 OTP 登录 | `authClient.signIn.emailOtp({ email, otp, name?, image? })` | `auth.api.signInEmailOTP({ body })` |
| 验证邮箱 | `authClient.emailOtp.verifyEmail({ email, otp })` | `auth.api.verifyEmailOTP({ body })` |
| 申请改密 | `authClient.emailOtp.requestPasswordReset({ email })` | `auth.api.requestPasswordResetEmailOTP({ body })` |
| 改密 | `authClient.emailOtp.resetPassword({ email, otp, password })` | `auth.api.resetPasswordEmailOTP({ body })` |
| 申请改邮箱 | `authClient.emailOtp.requestEmailChange({ newEmail, otp? })` | `auth.api.requestEmailChangeEmailOTP({ body, headers })` |
| 改邮箱 | `authClient.emailOtp.changeEmail({ newEmail, otp })` | `auth.api.changeEmailEmailOTP({ body, headers })` |

`/forget-password/email-otp` 已 deprecated，改用 `/email-otp/request-password-reset`。

## 注意事项 / 坑

1. **不要 await sendVerificationOTP**——文档明确："recommended to not await ... to avoid timing attacks"；serverless 必须 `waitUntil`，否则邮件可能在响应返回后被 kill。
2. `signIn.emailOtp` 在用户不存在时**自动注册**——本项目希望"管理员审批制"的话必须 `disableSignUp: true`。
3. `resendStrategy: "reuse"` 只在 `storeOTP` 可还原（plain/encrypted/自定义 encrypt+decrypt）时生效；`hashed` 模式自动降级 rotate。
4. 改邮箱默认下发到**新邮箱**；要先验证当前邮箱必须显式开 `verifyCurrentEmail: true`。
5. better-auth-ui shadcn 变体的 `<Auth />` 可能没有原生 OTP 视图（v3.4.0 时仅 sign-in/up/forgot/reset/magic-link）——OTP 登录页要么自写、要么等 UI 库新增。
