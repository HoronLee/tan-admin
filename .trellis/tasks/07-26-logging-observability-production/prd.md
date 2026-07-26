# PRD — Logging & observability production hardening

## 背景

基础结构化日志（pino + 模块 child logger + redact + OTel trace mixin）已在早期任务落地（见 `.trellis/spec/backend/logging-guidelines.md`）。但生产可观测性存在七个已验证缺口（原 TODO.md「日志与可观测性」清单，2026-07-26 逐条核实属实）：

1. 无统一请求访问日志——`serverInterceptors` 只记 error，成功请求零记录；`src/middleware/logging.ts` 为空壳。
2. `pino-roll` 初始化失败被 `catch` 静默降级 stdout（`logger.ts:94-96`）——运维配了文件日志却拿不到，且无感知。
3. 无优雅关闭——无 SIGTERM/SIGINT handler；DB fail-fast 路径只 flush Sentry 就 `process.exit(1)`，pino 缓冲日志丢失。
4. 文件输出由 `LOG_FILE` 有无隐式决定，无显式 `LOG_OUTPUT` 策略开关。
5. OTel Node SDK 从未启动——logger mixin 调 `trace.getActiveSpan()` 永远拿不到 span，trace correlation 空转。
6. `@orpc/experimental-pino` 依赖已装（1.14.8）但代码零引用。
7. `.env.example` 无任何 `LOG_*` / OTel 示例条目。

依赖准备已在前次 session 完成（未提交）：`@opentelemetry/sdk-node`、`@opentelemetry/auto-instrumentations-node`、`@orpc/experimental-pino`、`@orpc/*` → 1.14.8。

## 需求

### R1 统一请求访问日志

- 覆盖三类入口：`RPCHandler`（`/api/rpc`）、`OpenAPIHandler`（`/api`）、TanStack Start server function。
- 每请求记录：`requestId`、method、路由或 procedure 路径、status、`durationMs`、`module`。
- 成功请求记一条结束事件（info）；4xx 记 `warn`；5xx 记 `error`。与现有 error 分级规则（logging-guidelines.md「Log level rule」）一致。
- 禁止记录完整 headers、cookie、请求体、token、密码——沿用现有 redact 契约。

### R2 文件日志失败 fail-fast

- 仅当显式配置文件输出时要求 `pino-roll` 初始化成功。
- `LOG_FILE` 缺失/目录无权限/轮转参数非法/stream 初始化失败 → bootstrap 阶段抛错，进程不得带病启动。
- stdout-only 模式完全不触碰文件系统，不因无日志目录失败。

### R3 Pino 优雅关闭

- stdout/file/multistream 统一 flush + close 流程。
- `SIGTERM`、`SIGINT`、DB-unavailable fail-fast 三条退出路径都先 flush 日志再结束进程。
- 消除直接 `process.exit()` 截断未写出日志的路径（`src/middleware/error.ts:85` 现状）。

### R4 显式日志输出策略

- 新增 `LOG_OUTPUT=stdout|file|both`，作为输出真相源；在 `src/lib/env.ts` 声明 + Zod 校验。
- 容器环境识别只影响默认值或诊断输出，不覆盖显式配置。
- 默认 stdout；物理机/私有化部署显式启用文件输出。
- 与 R2 联动：`LOG_OUTPUT` 含 file 时 pino-roll 失败必须抛错。

### R5 OTel Node SDK 启动

- 在 `instrument.server.mjs` 最早 bootstrap 阶段初始化。
- 初始化逻辑放 `src/lib/observability/otel.ts`（或按 ESM 预载约束等效位置，design 定），入口文件保持薄。
- 首期范围：traces + metrics + 自动 instrumentation；Pino 继续负责业务日志，复用现有 trace/span mixin。
- 明确 exporter 配置、采样率、shutdown flush、无 exporter 时本地静默行为（不产生噪音重试日志）。

### R6 oRPC 官方 Pino 适配器

- 用 `@orpc/experimental-pino` 的 `LoggingHandlerPlugin`，版本与 `@orpc/*` 稳定线一致（1.14.8）。
- 同时挂到 `RPCHandler` 与 `OpenAPIHandler` 的 `plugins`。
- 复用共享 pino logger + 请求上下文；不引入 `pino-http`。

### R7 示例配置与验证

- `.env.example` 补 `APP_ENV`、`LOG_LEVEL`、`LOG_OUTPUT`、`LOG_FILE`、`LOG_MAX_SIZE`、`LOG_MAX_FILES` 及 OTel 相关示例。
- 注释说明容器 / 物理机 / 开发三种部署形态推荐配置。
- 验证矩阵覆盖：stdout、文件轮转、脱敏、访问日志、OTel correlation、shutdown flush。

### R8（顺带）修复 pnpm-workspace.yaml placeholder

- `allowBuilds` 里 `protobufjs: set this to true or false` 是 pnpm 写入的字面 placeholder，改为 `protobufjs: true`（protobufjs 是 OTel 依赖链的 build script）。

## 约束

- 遵守 `.trellis/spec/backend/logging-guidelines.md` 全部现有契约（env 声明、redact、log level 分级、stream 先于 logger 初始化）。
- Vite SSR 限制不变：无 worker-thread transport，stream in-process 构建（`createRequire` 模式）。
- 环境变量必须进 `src/lib/env.ts` Zod schema；纯服务端变量不加 `VITE_` 前缀。
- 不破坏现有 `createModuleLogger` 调用方（约 12 处）。
- dev 体验不回退：`APP_ENV=dev` 仍是 pino-pretty 彩色单行。

## 验收标准

| # | 场景 | 期望 |
|---|---|---|
| A1 | 浏览器调 `/api/rpc` 成功请求 | 一条 info 访问日志含 requestId/procedure/status/durationMs |
| A2 | 调 `/api` OpenAPI 端点 404/422 | warn 级访问日志 |
| A3 | server fn 抛 5xx | error 级日志 + 访问日志，requestId 可关联 |
| A4 | 日志任意行 | 无 cookie/authorization/token/password 明文 |
| A5 | `LOG_OUTPUT=file` + 目录不可写 | boot 抛错退出，非静默降级 |
| A6 | `LOG_OUTPUT=stdout`（默认） | 不创建任何日志目录/文件 |
| A7 | `kill -TERM` 进程 | 缓冲日志完整落盘后退出 |
| A8 | DB 不可用触发 fail-fast | pino flush 完成后 exit(1) |
| A9 | 配置 OTLP endpoint 后请求 | 日志行带 traceId/spanId，且 trace 可在后端看到 |
| A10 | 无 OTLP endpoint 本地 dev | 无 exporter 重试噪音 |
| A11 | `pnpm build && pnpm start` | 生产模式上述行为一致 |
| A12 | `pnpm check` + `pnpm test` | 全绿 |

## 非目标

- 日志聚合后端（Loki/ELK）选型与部署。
- OTel logs signal（首期只做 traces/metrics + pino correlation）。
- Stripe/业务指标自定义 metrics。
- `pino-http` 或任何新日志框架。
