# Better Auth — genericOAuth 插件

## 来源
- https://better-auth.com/docs/plugins/generic-oauth
- 抓取：2026-04-21

## 核心概念

通用 OAuth 2.0 / OIDC 适配器，用于接入**内置 socialProviders 之外**的任意 provider。两种用法：
1. **预配置 helper**：内置 Auth0 / HubSpot / Keycloak / LINE / Microsoft Entra ID / Okta / Slack / Patreon / Gumroad（开箱即用）
2. **手工配置**：填 authorizationUrl / tokenUrl / userInfoUrl 或者 discoveryUrl 自动发现

回调路由由插件自动挂：`${baseURL}/api/auth/oauth2/callback/:providerId`，**provider 后台必须配此回调**。

## 服务端配置（src/lib/auth.ts 视角）

### 用 helper（OIDC 优先）

```ts
import { betterAuth } from "better-auth"
import { genericOAuth, keycloak, microsoftEntraId } from "better-auth/plugins"

export const auth = betterAuth({
  plugins: [
    genericOAuth({
      config: [
        keycloak({
          clientId: env.KEYCLOAK_CLIENT_ID,
          clientSecret: env.KEYCLOAK_CLIENT_SECRET,
          issuer: env.KEYCLOAK_ISSUER,           // https://my-domain/realms/MyRealm
        }),
        microsoftEntraId({
          clientId: env.MS_APP_ID,
          clientSecret: env.MS_CLIENT_SECRET,
          tenantId: env.MS_TENANT_ID,            // GUID / "common" / "organizations" / "consumers"
        }),
      ],
    }),
  ],
})
```

### 手工配置（自建 IdP / 内网 SSO）

```ts
genericOAuth({
  config: [{
    providerId: "internal-sso",                  // 必须唯一
    discoveryUrl: "https://sso.internal/.well-known/openid-configuration",
    clientId: env.SSO_CLIENT_ID,
    clientSecret: env.SSO_CLIENT_SECRET,
    requireIssuerValidation: true,               // 推荐：现代 OIDC provider 都该开
    pkce: true,                                  // 推荐：default false 不安全
    scopes: ["openid", "email", "profile"],
    accessType: "offline",                       // 申请 refresh token
  }],
})
```

### 完整 GenericOAuthConfig 字段

```ts
interface GenericOAuthConfig {
  providerId: string                              // 必填，唯一，回调 URL 的 :providerId
  // 端点（discoveryUrl 优先，三选一）
  discoveryUrl?: string
  authorizationUrl?: string
  tokenUrl?: string
  userInfoUrl?: string
  // OAuth 凭证
  clientId: string
  clientSecret: string
  scopes?: string[]
  redirectURI?: string                            // 默认 ${baseURL}/api/auth/oauth2/callback/:providerId
  // 安全
  issuer?: string
  requireIssuerValidation?: boolean              // RFC 9207 mix-up 防护，强烈推荐 true
  pkce?: boolean                                 // 默认 false（!!），强烈推荐 true
  // 流程控制
  responseType?: string                          // 默认 "code"
  responseMode?: string                          // "query" / "form_post"
  prompt?: string                                // "login" / "consent" / "none"
  accessType?: string                            // "offline" 申请 refresh
  authentication?: "basic" | "post"              // token 端点鉴权方式，默认 "post"
  // 扩展点
  authorizationUrlParams?: Record<string, string> | (() => Record<string, string>)
  tokenUrlParams?: Record<string, string> | (() => Record<string, string>)
  authorizationHeaders?: Record<string, string>
  discoveryHeaders?: Record<string, string>
  getToken?: (input: { code, redirectURI }) => Promise<{ accessToken, refreshToken, accessTokenExpiresAt, scopes, raw }>
  getUserInfo?: (tokens: OAuth2Tokens) => Promise<User | null>
  mapProfileToUser?: (profile) => Partial<User>  // 字段映射
  // 注册控制
  disableImplicitSignUp?: boolean                // 必须显式 signUp 才允许新用户
  disableSignUp?: boolean                        // 完全不允许新用户注册（管理员审批制）
  overrideUserInfo?: boolean                     // 每次登录用 provider 端最新信息覆盖本地
}
```

## 客户端配置（src/lib/auth-client.ts 视角）

```ts
import { genericOAuthClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
})

// 使用：发起登录
authClient.signIn.oauth2({ providerId: "internal-sso", callbackURL: "/dashboard" })

// 使用：账号关联
authClient.oauth2.link({ providerId: "internal-sso", callbackURL: "/settings/security" })
```

## Schema 影响（zenstack/schema.zmodel 视角）

**不新增表**——OAuth 账号映射存到 better-auth 已有的 `account` 表（providerId + accountId 组合定位）。refresh token 也存这里。

## 与本项目其它插件的协同

- 与 `admin`：`disableSignUp: true` 实现 SSO 登录但限管理员预先创建用户。
- 与 `organization`：SSO 登录后自动加入 active org 不会发生；要么前端引导 `organization.create / setActive`，要么用 `organizationHooks.afterSignIn`（见 organization 插件研究）自动绑定。
- 与 `captcha`：默认 captcha endpoint 不含 `/sign-in/oauth2/*`，OAuth 登录绕过 captcha（合理：跳第三方验码）。
- 与 `genericOAuth` 自身：可以装多个 provider，互不干扰；只要 `providerId` 唯一。

## 关键代码骨架

### 自定义字段映射（解决"provider 字段名 ≠ 本地字段名"）

```ts
genericOAuth({
  config: [{
    providerId: "internal-sso",
    discoveryUrl: "...",
    clientId: "...", clientSecret: "...",
    mapProfileToUser: async (profile) => ({
      name: profile.preferred_username,
      email: profile.email,
      image: profile.picture,
      // 自定义字段（要在 user.additionalFields 声明）
      employeeId: profile["custom:employee_id"],
    }),
  }],
})
```

### 非标准 token 端点（GET 而非 POST）

```ts
getToken: async ({ code, redirectURI }) => {
  const r = await fetch(`https://provider/oauth/token?client_id=...&code=${code}&...`, { method: "GET" })
  const d = await r.json()
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    accessTokenExpiresAt: new Date(Date.now() + d.expires_in * 1000),
    scopes: d.scope?.split(" ") ?? [],
    raw: d,                                       // 必传，下游 getUserInfo 可能要读 provider-specific 字段
  }
},
```

## 注意事项 / 坑

1. **PKCE 默认关闭**——这是个比较激进的默认值。任何走公网的现代 provider 都该 `pkce: true`，否则容易被中间人替换 code。
2. **`requireIssuerValidation` 默认 false**——"backward compat"理由，但现代 IdP（Auth0 / Keycloak / Okta / Entra）都支持，应该 `true`。
3. 回调路径**不是** `/api/auth/callback/:providerId`（内置 social）而是 `/api/auth/oauth2/callback/:providerId`——配错 provider 后台会一直 invalid_redirect。
4. `accessType: "offline"` 才会拿到 refresh token；不开就只有 access token，过期后必须用户重新登录。
5. **LINE 多区域**：日本/泰国/台湾要分别申请 channel，必须用不同 `providerId`：`line({ providerId: "line-jp", ... })` `line({ providerId: "line-th", ... })`，否则只能服务一个区域。
6. `overrideUserInfo: true` 每次登录覆盖本地用户表——会**抹掉**本地 admin 改过的 nickname 等字段，慎用。
7. better-auth-ui 的 shadcn 变体里 `socialProviders` prop 只接受**内置 social provider name**（github/google 等）；generic-oauth 的 provider 不在内置列表，要么自写按钮调 `authClient.signIn.oauth2`，要么 fork `<Auth />` 组件。
