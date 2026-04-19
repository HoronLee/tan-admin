# 统一错误处理体系

## Goal

为 tan-admin 建立一套端到端的错误处理契约：后端定义类型化错误 → oRPC 传输 → 前端类型化消费 → 日志/Sentry 上报 → 用户可见的 toast/错误页。与已完成的 pino 日志器配合，收尾"可观测性"地基。

## What I already know

### 当前状态
- oRPC 1.13 `OpenAPIHandler` 在 `src/routes/api.$.ts` 已接 `onError` 拦截器，**仅记录日志**，无类型化错误。
- MCP handler 在 `src/utils/mcp-handler.ts` try/catch 返回固定 JSON-RPC envelope（code `-32603`）。
- Server function 例子 `src/routes/demo/prisma.tsx` 用 try/catch + `log.error` 处理失败。
- Sentry 仅服务器侧 `instrument.server.mjs` 初始化，**前端未接**，代码里没有 `captureException` 调用。
- 前端无 toast / notification 组件（`src/components/ui/` 只有 button/input/label/select/slider/switch/textarea，没 sonner）。
- `src/orpc/router/todos.ts` 仍用 raw `os`，没有 `.errors({})` 基类。
- spec `.trellis/spec/backend/error-handling.md` 明确记录："No custom backend error class hierarchy exists yet"。

### 参考
- **servora-platform (Go/Kratos)**: service 层直接透传 `error`，依赖 Kratos 的 gRPC ↔ HTTP 错误码映射（`errors.Reason` proto enum → HTTP status）。**启示**：稳定的错误码枚举 + 框架自动映射到传输协议 = 类型安全 + 协议透明。
- **oRPC 2025 官方模式（context7 查得）**: 
  - `os.errors({ CODE: { status, message?, data?: zodSchema } })` 定义类型化错误
  - handler 内 `throw errors.CODE({ data })` 或 `throw new ORPCError('CODE', {...})`
  - 客户端 `isDefinedError(error)` 类型收窄
  - `clientInterceptors: [onError(...)]` 可把 `BAD_REQUEST + ValidationError` 转成自定义 `INPUT_VALIDATION_FAILED`（带 Zod `flattenError` 字段）
- **go-wind-admin 风格**: 业务错误按"领域 + 具体原因"分层编码（如 `UserNotFound` / `UserAlreadyExists`）。

### 技术栈约束
- oRPC 1.13、Zod 4.3、TanStack Start、Sentry 10 (`@sentry/tanstackstart-react`)。
- 现有基类 `createModuleLogger("module")` 已能记录 `{ err }` 结构化错误。

## Assumptions (temporary)

- MVP 不做 i18n 错误消息（paraglide 集成留作后续）。
- MVP 先覆盖 oRPC 路径；MCP / server function 按同一契约平行处理但以 oRPC 为主。
- 前端 toast 使用 shadcn/sonner（industry standard、与现有 Tailwind 4 + Radix 一致）。

## Research Notes

### 业界主流做法
- **tRPC**: `TRPCError({code, message, cause})` + formatted error via `initTRPC` + client `TRPCClientError` narrowing。
- **NestJS**: `HttpException` 层次 + Exception Filter。
- **Kratos (Go)**: proto `ErrorReason` enum + gRPC status code 自动映射。
- **oRPC (我们用的)**: 最现代——类型化 `.errors()` + ORPCError + `isDefinedError`，天然端到端类型安全。

### 可行方案

#### Approach A：oRPC-native 类型化（推荐）

**怎么做**
- `src/orpc/errors.ts`：导出 `base = os.errors({...})` 基础过程，定义 7 个标准错误码（UNAUTHORIZED/FORBIDDEN/NOT_FOUND/CONFLICT/INPUT_VALIDATION_FAILED/RATE_LIMITED/INTERNAL_ERROR），每个带 `status` + 可选 `data` schema。
- 所有 router 过程基于 `base` 派生；现有 `todos.ts` 改用 `base.input(...).handler(...)`。
- `src/routes/api.$.ts` + `api.rpc.$.ts`：加 `clientInterceptors: [onError(zodToValidationError)]`，把内部 Zod 抛出的 `BAD_REQUEST + ValidationError` 升级为类型化 `INPUT_VALIDATION_FAILED`。
- 未知 throw：日志 + `Sentry.captureException`；对外统一返回 `INTERNAL_ERROR`，不泄漏内部 stack。
- 前端 `src/lib/error-report.ts`：`reportError(error, { fallback })` 统一入口——`isDefinedError` 命中的按 code 映射 toast 文案；未知错误 → Sentry + 通用"出错了"toast。
- `sonner` 加入（`pnpm dlx shadcn@latest add sonner`）+ `<Toaster />` 挂 root。
- Root route `errorComponent` 做兜底渲染。
- 前端 Sentry 初始化（`src/lib/sentry.client.ts` + 路由注入）。

**Pros**
- 端到端类型安全（handler 抛什么、客户端就能 narrow 什么）。
- 贴合 oRPC 官方路径，升级/迁移成本最低。
- Zod 校验错误自动升级为结构化 field errors，直接喂 TanStack Form。

**Cons**
- 约束较强：所有新过程必须派生自 `base`（加 lint/check 保障）。
- 需要改现有 `todos.ts`（小工作量）。

#### Approach B：AppError + 边界转换

**怎么做**
- `src/lib/errors.ts` 定义 `AppError extends Error` 层次 + 每类子类。
- 边界（oRPC interceptor、server fn try/catch、MCP handler）把 `AppError` 转 `ORPCError` / JSON-RPC envelope。
- 领域代码抛 `AppError`，不直接依赖 oRPC。

**Pros**
- 领域层与传输协议解耦（将来加 GraphQL 等额外协议时省事）。
- 错误类可带领域方法（`.toPublic()` / `.toAudit()`）。

**Cons**
- 双层映射——每新增错误要在 AppError 和 errorMap 同步更新。
- 失去 oRPC `.errors()` 的客户端类型推导，需自己维护 code/data 契约。
- 对单一 oRPC 后端来说是过度设计。

#### Approach C：最小改动

**怎么做**
- 不做类型化错误；只加前端 toast + Sentry + 错误边界。
- 现有 `onError(logger)` 已覆盖后端侧。

**Pros**
- 一天内完工。

**Cons**
- 没有类型安全的错误消费路径，每个前端调用点要自己 `catch` 并决定文案，后续一定重构。

### 我们这边约束
- 单一 oRPC 后端（目前），Approach B 的协议解耦暂无收益。
- TanStack Form 天然吃扁平化 field errors → Approach A 的 `INPUT_VALIDATION_FAILED` 数据形状直接可用。
- 必须接住 Better Auth / Prisma 常见错误（P2002 unique constraint → CONFLICT，P2025 not found → NOT_FOUND）。

## Decision (ADR-lite)

**Context**：缺类型化错误契约 / 前端无 toast / Sentry 未在前端初始化 / Prisma 错误裸抛。

**Decision**：
- **路线 A**：oRPC-native 类型化错误（`os.errors({...})` + `isDefinedError` + Zod→字段级错误转换）
- **范围 (b)**：oRPC 错误契约 + Prisma 错误自动映射中间件 + 前端 sonner toast + 前端 Sentry 初始化 + Root errorComponent

**Consequences**：
- 所有 oRPC 过程必须派生自统一 `base`（用 lint / code review 保障）
- Prisma 错误会被中间件按 code 映射为类型化错误，业务代码不用手写 `if (err.code === 'P2002')`
- MCP / server function 此次**不动契约**，仅保持 envelope 向后兼容
- i18n 消息留作后续任务，当前使用英文默认消息

### Decision 2：扩展覆盖到 createServerFn 与进程级兜底

**Context**：本地 dev 触发 `prisma.todo.findMany()` 连接失败时发现：走 `createServerFn` 的路径**不经过** oRPC `serverInterceptors`，导致无结构化日志、无 Sentry 上报；原 PRD 只声明"以 oRPC 为主"忽略了这条路径。另外 Node 单线程事件循环默认不像 Go panic 那样带崩进程，但中间件/启动期未捕获的 throw 应该被记录并退出以触发容器重启。

**Decision**：采用双层兜底 ——
- L1：**TanStack Start 全局 `functionMiddleware`**（与 oRPC `serverInterceptors` 语义对称）覆盖所有 `createServerFn` 路径
- L2：**`process.on("uncaughtException"/"unhandledRejection")`** 在 `instrument.server.mjs` 注册，兜底 middleware 之外的漏网之鱼（bootstrap 期、非 server-fn 路径的异步 throw）

**Consequences**：
- scope 从"oRPC 契约"扩到"所有 server 端抛错路径"
- 不引入自造抽象（用框架原生钩子 `createStart` + `createMiddleware` + Node `process`）
- `instrument.server.mjs` 无法用 pino（TS 未 build），process-level handler 里用结构化 `console.error` JSON 输出（约定 `level: "fatal"`）

## Requirements

1. **oRPC 错误基类**（`src/orpc/errors.ts`）
   - 导出 `base` 过程，定义 7 个标准错误码：`UNAUTHORIZED` (401)、`FORBIDDEN` (403)、`NOT_FOUND` (404)、`CONFLICT` (409)、`INPUT_VALIDATION_FAILED` (422, data: `{formErrors, fieldErrors}`)、`RATE_LIMITED` (429, data: `{retryAfter}`)、`INTERNAL_ERROR` (500)

2. **Prisma 错误映射中间件**（`src/orpc/middleware/prisma-error.ts`）
   - P2002 (unique constraint) → `CONFLICT`
   - P2025 (record not found) → `NOT_FOUND`
   - 其他 Prisma known errors → `INTERNAL_ERROR`（日志保留原 code）
   - 挂到 `base.use(prismaErrorMw)` 或作为可选 use

3. **Router 升级**
   - `src/orpc/router/todos.ts` 改用新 `base`（验证旧过程迁移无障碍）

4. **边界拦截器升级**（`src/routes/api.$.ts` + `src/routes/api.rpc.$.ts`）
   - `clientInterceptors: [onError(zodToValidationError)]`：`BAD_REQUEST + ValidationError` → `INPUT_VALIDATION_FAILED` 带 `{formErrors, fieldErrors}`
   - 未类型化 throw → 日志 + `Sentry.captureException`，对外 `INTERNAL_ERROR`

5. **前端 Sentry 初始化**（`src/lib/sentry.client.ts` + root 注入）
   - `VITE_SENTRY_DSN` 存在才 init；否则一次性 warn。

6. **前端 toast（sonner）**
   - `pnpm dlx shadcn@latest add sonner`
   - `<Toaster />` 挂 `src/routes/__root.tsx`

7. **前端错误上报入口**（`src/lib/error-report.ts`）
   - `reportError(error, { fallback?, silent? })`：`isDefinedError` 命中按 code 渲染 toast；未知错误 → Sentry + 通用 toast
   - 所有前端 catch 必须走这里，禁止裸 `toast.error(err.message)`

8. **Root errorComponent**（`src/routes/__root.tsx`）
   - TanStack Router 根路由 `errorComponent` 渲染兜底错误页

9. **Spec 更新**（`.trellis/spec/backend/error-handling.md`）
   - 替换"No custom error class hierarchy exists yet"为新契约

10. **server function 全局错误中间件**（`src/start.ts` + `src/lib/server-fn-middleware.ts`）
    - 通过 TanStack Start 的 `createStart({ functionMiddleware })` 注册全局中间件，覆盖**所有** `createServerFn` 路径
    - middleware 内 try/catch `await next()`：`log.error({ err }, "server function error")` + `Sentry.captureException(err)` + 继续抛出（让客户端 route errorComponent 仍能响应）
    - 和 oRPC `serverInterceptors` 语义对称，形成两条后端抛错路径的对偶覆盖

11. **进程级兜底**（扩展 `instrument.server.mjs`）
    - 注册 `process.on("uncaughtException", ...)` 与 `process.on("unhandledRejection", ...)`
    - 失败时：结构化 fatal JSON 输出（mjs 早于 TS logger 加载，不走 pino）+ `Sentry.captureException` + `process.exit(1)`
    - 遵循 crash-only software 原则：进程级异常让 orchestrator（k8s/pm2/systemd）按 backoff 重启

## Acceptance Criteria

- [ ] `src/orpc/errors.ts` 导出 `base` 并定义 7 个错误码
- [ ] `src/orpc/middleware/prisma-error.ts` 将 P2002/P2025 映射到类型化错误，附带单测
- [ ] `todos.ts` 改用 `base`，`pnpm test` + `biome check` 全绿
- [ ] `clientInterceptors` 将 Zod 错误升级为 `INPUT_VALIDATION_FAILED`（`data.fieldErrors` 对应 Zod `flattenError` 形状）
- [ ] 未类型化错误经 Sentry.captureException 上报，对外响应 `INTERNAL_ERROR`（不泄漏 stack）
- [ ] 前端 `reportError(error)` 可由任意 catch 调用；命中类型化错误按 code 渲染 toast
- [ ] 前端未配置 `VITE_SENTRY_DSN` 时 Sentry 静默跳过，仅一次 warn
- [ ] Root `errorComponent` 可渲染兜底页（手动 throw 一次验证）
- [ ] spec `.trellis/spec/backend/error-handling.md` 更新到新契约

## Acceptance Criteria (evolving)

- [ ] 后端 oRPC 过程可抛类型化错误，客户端 `isDefinedError` 能精确 narrow
- [ ] Zod 校验失败在客户端得到 `INPUT_VALIDATION_FAILED` + 字段级 `{formErrors, fieldErrors}`
- [ ] 未类型化的 throw 统一日志 + Sentry 捕获，对外不泄漏内部
- [ ] 前端未捕获错误触发 toast 且 Sentry 可见
- [ ] React 路由级 `errorComponent` 渲染兜底页

## Definition of Done

- Biome check / tsc 无错
- `pnpm test` 绿（含新增的 handler/interceptor 单测）
- spec `.trellis/spec/backend/error-handling.md` 更新为新契约
- 示例调用链（`demo/prisma` 或新的演示页）可验证 5 条错误路径（401/403/404/409/422）

## Out of Scope (explicit)

- 错误消息国际化（i18n / paraglide）——另立任务
- 业务域特有错误码（用户/角色/权限领域）——等相应模块落地时再加
- 前端错误重试 / 指数退避策略
- 错误率限流 / 断路器
- MCP 协议错误契约的非边界改造（仅保持 envelope 契约不回归）

## Technical Notes

### 关键文件
- 新增：`src/orpc/errors.ts`（base + error codes）、`src/lib/error-report.ts`（前端上报入口）、`src/lib/sentry.client.ts`（前端 Sentry init）、`src/components/ui/sonner.tsx`（shadcn add）
- 修改：`src/routes/api.$.ts`、`src/routes/api.rpc.$.ts`（接 clientInterceptors）、`src/orpc/router/todos.ts`（改用 base）、`src/routes/__root.tsx`（Toaster + errorComponent + 前端 Sentry）、`src/utils/mcp-handler.ts`（保持契约，换 AppError-aware catch）

### 参考链接
- oRPC error handling: https://orpc.unnoq.com/docs/error-handling
- oRPC validation errors: https://orpc.unnoq.com/docs/advanced/validation-errors
- Sentry TanStack Start: https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/
- sonner (shadcn): https://ui.shadcn.com/docs/components/sonner
