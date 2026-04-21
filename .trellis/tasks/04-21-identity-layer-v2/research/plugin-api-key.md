# Better Auth — apiKey 插件

## 来源
- https://better-auth.com/docs/plugins/api-key
- 抓取：2026-04-21
- ⚠️ **包名**：`@better-auth/api-key`（**独立包**，不在 `better-auth/plugins` 里）

## 核心概念

为应用提供"程序化访问"的 API Key：
- 用户级 / 组织级两种归属（per-config 决定）
- 内置 rate limiting（per-key time window + max requests）
- 内置 quota（remaining + refill 周期）
- 多 config（不同类型的 key 走不同策略，例如 "public" / "internal"）
- 可换为 session（用 API Key 调任何走 session 的端点）
- 自动清理过期 key（端点被调时触发，10s cooldown）
- secondary storage 支持（Redis 加速 lookup）

## 服务端配置（src/lib/auth.ts 视角）

```ts
import { betterAuth } from "better-auth"
import { apiKey } from "@better-auth/api-key"

export const auth = betterAuth({
  plugins: [
    apiKey({
      // 详细的 config / configs / permissions / 高级选项见 reference 页（本文未抓）
      // 基础用法：
    }),
  ],
})
```

`auth:migrate` 自动建 `apiKey` 表（schema 字段见 reference 页）。

## 客户端配置（src/lib/auth-client.ts 视角）

```ts
import { apiKeyClient } from "@better-auth/api-key/client"

export const authClient = createAuthClient({
  plugins: [apiKeyClient()],
})
```

## Schema 影响（zenstack/schema.zmodel 视角）

**新增 `apiKey` 表**（auth-cli 管理；zmodel 走 `@@ignore`）。字段大致包括：id / name / prefix / key (hashed) / userId / organizationId / configId / enabled / metadata / expiresAt / remaining / refillAmount / refillInterval / rateLimit* / permissions / createdAt / updatedAt（精确字段以 reference 页 + 实际 migration 输出为准）。

## 与本项目其它插件的协同

### 与 organization 协同（关键）
通过 config 的 `references` 字段决定 key 归属：
- `references: "user"`（默认）→ key 属于创建它的 user
- `references: "organization"` → key 属于 org，创建/列表必须传 `organizationId`

PRD 决策 D4 开了 teams——但 apiKey 只识别 organization 维度，**没有 team 级别的 key**。如要"团队私有 API Key"必须走 metadata 自管。

### 与 admin 协同
- admin role 的人想代用户管 API Key，没有内置 admin 端点；要走 server-only 的 `auth.api.createApiKey({ body: { userId } })` 直接绕过 session 校验。
- `delete` 端点的 client 路由会校验 user 身份；要硬删跳过校验得直接走 ZenStack/Kysely。

### 与 captcha 协同
captcha 默认不拦截 API Key 端点（`/api-key/*` 不在默认 endpoints）——合理，server-to-server 调用不应被 captcha 阻断。

## 关键 API 速查

| 用途 | client | server | endpoint |
|---|---|---|---|
| 创建 | `apiKey.create({ name?, expiresIn?, organizationId?, prefix?, metadata? })` | `auth.api.createApiKey({ body: { ..., userId, remaining, refillAmount, refillInterval, rateLimit*, permissions } })` | POST `/api-key/create` |
| 验证 | `apiKey.verify({ key, permissions? })` | `auth.api.verifyApiKey` | server-only |
| 取单个 | `apiKey.get({ query: { id } })` | `auth.api.getApiKey` | GET `/api-key/get` |
| 更新 | `apiKey.update({ keyId, name? })`（更多字段 server-only） | `auth.api.updateApiKey` | POST `/api-key/update` |
| 删除 | `apiKey.delete({ keyId })`（校验 owner = current user） | `auth.api.deleteApiKey` | POST `/api-key/delete` |
| 列表 | `apiKey.list({ query: { configId?, organizationId?, limit?, offset?, sortBy?, sortDirection? } })` | `auth.api.listApiKeys` | GET `/api-key/list` |
| 清过期 | `apiKey.deleteAllExpiredApiKeys()` | `auth.api.deleteAllExpiredApiKeys` | server-only |

`create` 返回的对象**只在那一次响应里包含原始 `key` 值**——之后只能查到 hash，不可还原。前端 UX 必须"立刻让用户复制保存"。

## 关键代码骨架

### server-only 创建（典型用法：admin 后台帮 user 生成）

```ts
const { key } = await auth.api.createApiKey({
  body: {
    userId: targetUserId,                 // server-only 才能传
    name: "production",
    expiresIn: 60 * 60 * 24 * 365,        // 1 年
    remaining: 10000,
    refillAmount: 10000,
    refillInterval: 1000 * 60 * 60 * 24,  // 每天补满
    rateLimitEnabled: true,
    rateLimitMax: 100,
    rateLimitTimeWindow: 1000 * 60,       // 60s
    permissions: { project: ["read"] },
    metadata: { issuedBy: "admin-ui", env: "prod" },
  },
})
// ⚠️ key 只在这里露脸，记得返给前端展示一次
```

### 验证（程序化客户端的 server handler）

```ts
const { valid, key, error } = await auth.api.verifyApiKey({
  body: {
    key: req.headers["x-api-key"],
    permissions: { project: ["read"] },   // 同时鉴权
  },
})
if (!valid) throw new HttpError(401, error?.code)
// key.userId / key.organizationId 可作为后续 oRPC 上下文
```

## 注意事项 / 坑

1. **独立包**：`pnpm add @better-auth/api-key`，不是 `better-auth/plugins/api-key`——很容易写错。
2. **key 只露一次**：UX 必须强提示。落地到 v1 ConfirmDialog 也不够，需要专门的"复制后才能关闭"组件。
3. `delete` 走 client 端点时**校验 owner = current user**，admin 想代删要么跳到 server-only API 传 userId/organizationId，要么直接 SQL。
4. `create` 时 `remaining` / `rateLimit*` / `refill*` / `permissions` 都是 **server-only**——客户端不能自己设额度，安全设计良好。
5. **没有 team 级 key**：teams 模式下要"团队私有 key"，得放 `metadata.teamId` 自管，verify 时手动比对。
6. 自动清理过期 key 是"惰性"的——需要有人调 endpoint 触发；高负载下 10s cooldown 不够，需要 cron 兜底。
7. secondary storage（Redis）支持但要在 better-auth 全局 `secondaryStorage` 上配，不是 plugin 内单独配。
8. 本任务 PRD 没列 apiKey 为 must-have——是否纳入要主人决策（影响 Acceptance Criteria 范围）。
