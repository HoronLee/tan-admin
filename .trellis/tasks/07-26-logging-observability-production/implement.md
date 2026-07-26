# Implement — Logging & observability production hardening

> 依 [design.md](./design.md) 四阶段执行。每阶段末跑验证命令，绿了再进下一阶段；阶段即回滚点。
> 决策门（D1/D2/D3）遇到时先实证再定向，结论写回本文件对应条目。

## Phase A — logger 核心硬化

- [x] A-1 `src/lib/env.ts`：新增 `LOG_OUTPUT: z.enum(["stdout","file","both"]).optional()`；`OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional()`（含 runtimeEnv 映射两处）。
- [x] A-2 `src/lib/config.server.ts`：`logConfig` 加 `output` 解析（显式 > 默认 stdout）；`output` 含 file 且无 `LOG_FILE` → throw 带修复提示；`LOG_FILE` 有值但 output=stdout → 记 boot 提示（不抛）。判定逻辑提成可单测纯函数（如 `resolveLogOutput(envSlice)`）。
- [x] A-3 `src/lib/observability/logger.ts`：
  - buildStream 按 output 四分支重写（design A2）；
  - 删除 prod 路径整段 try/catch 静默降级；pino-roll `await` + `once('ready')/once('error')` race + 常驻 `on('error')` → stderr；
  - 模块级导出 `logStream`；
  - 修正 "+ gzip" 注释。
- [x] A-4 新增 `src/lib/observability/shutdown.ts`：`flushLogsSync()`（multistream `.end()` / SonicBoom `.flushSync()+.end()`，type guard 兜底）+ `registerShutdownHooks()`（幂等；SIGTERM/SIGINT → otel shutdown(2s 超时) → Sentry.flush(2000) → flushLogsSync → exit 143/130）。
- [x] A-5 `src/server.ts`：模块加载时 `registerShutdownHooks()`。
- [x] A-6 新增 `src/lib/observability/database-fail-fast.ts`：复用 DB unavailable 判定与 process-wide 单次退出 promise；fatal（含可用 requestId）→ Sentry capture → OTel/Sentry/Pino drain → exit(1)。`src/middleware/error.ts` 复用同一 scheduler。
- [x] A-7 `src/lib/db.ts` 显式捕获缺失 `DATABASE_URL` / `$connect()` 失败并 await 同一 fatal helper；修复 Nitro lazy SSR chunk 将 top-level rejection 吞成 HTTP 500、进程继续存活的问题。`src/server/seed.ts` 的强制退出前调用 `flushLogsSync()`。
- [x] A-8 单测：`resolveLogOutput` 校验矩阵；DB unavailable 递归判定、退出去重与 drain-before-exit 行为；server-fn error requestId 关联。

**验证 A**：
```bash
pnpm check && pnpm test
# 手工：
APP_ENV=prod LOG_OUTPUT=file LOG_FILE=/root/deny/app.log pnpm start   # 期望 boot 抛错（A5 场景）
APP_ENV=prod pnpm start                                               # stdout JSON，不建目录（A6）
# dev 起服 → Ctrl-C：日志完整无截断（A7 粗验）
```

A8 最终证据：坏 `DATABASE_URL` 下请求触发 lazy DB bootstrap 后客户端 socket 关闭，进程 `exit(1)`；pino-roll 文件在退出前完整落盘 `fatal/module=database/phase=bootstrap`。首次复验发现 `resolveRequestId()` 的动态 import 与待完成的 SSR chunk 循环等待，改为静态 `getRequestHeaders` 后闭环。bootstrap 发生在 TanStack request ALS 建立前，故该 fatal 的 requestId 为 `null`；运行期 server-fn DB 错误由 middleware 显式传入 requestId，测试已覆盖关联。

## Phase B — 访问日志

- [x] B-1 `src/server.ts`：requestId 注入（入站 `x-request-id` ?? `crypto.randomUUID()`；优先直接写入原 request headers，immutable / Vite 跨 realm request 时以 `url` / `method` / `headers` / `body` / `signal` 显式重建，绝不将原 `Request` 作为 `RequestInfo`）+ 响应回显同名 header。
  - 单测覆盖缺失 ID、入站 ID 与 immutable-header POST request 重建；Phase B focused suite 已通过。
- [x] B-2 新增 `src/orpc/access-log.ts`：访问 interceptor（计时、status→level：<400 info / 4xx warn / 5xx error、`slowThresholdMs` 升 warn+`slow:true`、异常记分级访问行后 rethrow、logger 取 `getLogger(context) ?? createModuleLogger("orpc")`）。
- [x] B-3 `src/routes/api.rpc.$.ts` + `api.$.ts`：采用 W2，**不挂 `LoggingHandlerPlugin`**；两入口都以 `withRequestLogger({ headers: request.headers })` 绑定同一全局 requestId，`accessLogInterceptor` 置 `interceptors` 首位。
- [x] **D1 决策门（W2 已选并复验）**：`LoggingHandlerPlugin` 在 typed 4xx 重新抛出时会从 root / request interceptor 追加 error 行，违反 typed 4xx 的 warn 分级且与访问行重复。`src/orpc/access-log.chain.test.ts` 的 W1/W2 regression 已纳入 focused suite 并通过。
  - 结论：**W2** — 不使用 `LoggingHandlerPlugin`。通过 `CONTEXT_LOGGER_SYMBOL` 自播 request-scoped `orpc` child logger，`getLogger(context)` 仍可供 procedure / access interceptor 读取；W1 的额外 error 行由 decision-gate regression 固化。
- [x] B-4 `src/middleware/logging.ts`：`serverFnAccessMiddleware` 在外层为成功与失败各记一条访问行，只含 `requestId/method/path/status/durationMs/module/slow`；失败按 status 分级并原样 rethrow。内层 error middleware 独占 `err` 详情/Sentry，并带相同 requestId。
- [x] B-5 `src/start.ts`：`functionMiddleware: [serverFnAccessMiddleware, serverFnErrorMiddleware]`。
- [x] B-6 单测：oRPC level 映射、slow 升级、未匹配 404、typed 4xx rethrow / W1 决策门；server-fn 覆盖 success/slow/4xx/5xx、字段白名单、错误明细 requestId 关联。最终全量为 19 files / 90 tests passed。
- [x] B-7 手工字段面与脱敏：真实 dev smoke 的 OpenAPI `/api`、`/api/spec.json` 为 200 info，OpenAPI/RPC 404 为 warn，均回显入站 requestId；browser SSR server-fn info 含 requestId。访问行未含 headers/body/query；Pino 实值 authorization/cookie/password/token 均为 `[Redacted]`。

**验证 B**：
```bash
pnpm check && pnpm test
# 手工：浏览器走一轮登录+列表页 → 核对 A1/A2/A3 行（requestId 贯穿 rpc 与 server-fn；x-request-id 回显）
```

实证记录：D1 W1/W2 regression、Phase B focused suite 与最终全量回归均通过；真实 dev HTTP/browser smoke 覆盖上述 B-7 路径。最终生产浏览器登录进入站点管理页，并产生 `/api/rpc/navigation/get` POST 200 info 访问行。

## Phase C — OTel

- [x] C-1 新增 `otel.server.mjs`：仅 endpoint 非空且 `OTEL_SDK_DISABLED` 不为 true 时构建 NodeSDK；设置 service/version/env resource；启用 traces + metrics + auto instrumentation，关闭 OTel logs 与 instrumentation-pino；暴露幂等 `globalThis.__otelShutdown`。
- [x] C-2 `instrument.server.mjs` 保持薄且**不注册 ESM loader hook**：Nitro node-server 与 `@opentelemetry/instrumentation/hook.mjs` 不兼容；仅为 hook 直装的 `@opentelemetry/instrumentation` 已移除。SDK 仍在 app 入口前动态启动。
- [x] C-3 生产接线改用 Nitro 官方 `node-server`：`pnpm build` 产出 `.output/server/index.mjs`，`pnpm start` 以根目录 `instrument.server.mjs` 预载后启动该入口。
- [x] **D2 决策门（Sentry 冲突）**：Context7 与本地 Sentry 10.56.0 源码确认自管 provider 可用 `skipOpenTelemetrySetup`，但需手动安装 Sentry sampler/span processor/propagator/context manager，且会改变当前 Sentry tracing 与标准 `OTEL_*` sampler 契约。本期采用保守互斥：双配置时 Sentry 优先，独立 NodeSDK 不启动，并输出一次 bootstrap warning。实测 `otelEnabled=false`。
- [x] **D3 决策门（Nitro production artifact + ESM hook）**：有 `register("@opentelemetry/instrumentation/hook.mjs")` 时生产 `/api/spec` 稳定 500（`echoRequestId(undefined)`）；逐一禁用 undici/http/全部 auto instrumentation 仍失败。保留完整 NodeSDK + 全 auto、仅移除 register 后 `/api/spec` 200，访问行带匹配 `traceId/spanId`，collector 实收 `/v1/traces` 2183 bytes。因此 Nitro 下禁止 ESM hook，依赖 Node core HTTP instrumentation；`pg` / `nodemailer` library-level 覆盖仍不能从 `.output/server/_libs` 布局推断。build 明示当前 `darwin-arm64` 目标，部署需在/为目标平台重建。
- [x] C-4 本地 probe 实收 traces（1286 bytes）+ metrics（6452 bytes）；Nitro 生产 HTTP probe 实收 `/v1/traces` 2183 bytes，Pino `traceId/spanId` 与 active span 一致。无 endpoint probe `enabled=false` 且零 exporter 重试噪音。

**验证 C**：
```bash
pnpm check && pnpm test
pnpm dev                                    # 无 OTEL_* → 无重试噪音
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 pnpm dev   # mixin 出 traceId
pnpm build && pnpm start                    # A11 prod 同验
```

## Phase D — 收尾

- [x] D-1 `pnpm-workspace.yaml`：`protobufjs: true`；`pnpm install` 已通过。
- [x] D-2 `.env.example`：Logging + OpenTelemetry 两节，含 dev / 容器 / 物理机推荐与 Sentry 互斥说明。
- [x] D-3 `TODO.md`：移除「日志与可观测性」节。
- [x] D-4 spec `logging-guidelines.md` / `error-handling.md` 更新：LOG_OUTPUT、访问行、关闭流程、pino-roll 无 gzip、OTel 启用门与 D1-D3/Nitro 结论。
- [x] D-5 全量回归完成：`pnpm check` 209 files；`pnpm test` 19 files / 90 tests；`pnpm build` 产出 Nitro node-server；`pnpm start` 真实监听并完成生产浏览器、HTTP、OTel、SIGTERM 与坏 DB smoke。
  - A1/A2：生产浏览器登录后 `/api/rpc/navigation/get` POST 200 info；OpenAPI/RPC 404 warn；访问行均含 requestId/status/durationMs/method/path/module。
  - A3：server-fn 4xx/5xx、失败访问行 + error detail、同 requestId 与原样 rethrow 由行为测试覆盖。
  - A4：authorization/cookie/password/token 实值均输出 `[Redacted]`，访问字段面无 headers/body/query。
  - A5/A6：不可用文件路径 exit 1；stdout 模式临时目录零文件（孤立 LOG_FILE 仅警告）。
  - A7/A8：SIGTERM marker 完整落盘并 exit 143；坏 DB fatal 完整落盘后 exit 1。
  - A9/A10：Nitro 生产访问行含 traceId/spanId，collector 收 `/v1/traces` 2188 bytes；无 endpoint 无 exporter 重试。
  - A11/A12：生产 build/start + 浏览器 workspace 页面通过；Biome、Vitest、LSP diagnostics 全绿。

## 回滚点

| 点 | 操作 |
|---|---|
| Phase A 后 | 还原 logger.ts/config.server.ts/env.ts/shutdown.ts 即回原状 |
| Phase B 后 | 摘除 plugins/interceptors/middleware 接线即回原状（A 成果保留） |
| Phase C 后 | 删 otel.server.mjs、还原 instrument.server.mjs/build 脚本（A/B 保留） |

## 备注

- 决策门结论必须回填本文件再继续，避免口头决定丢失。
- 提交拆分建议：A / B / C / D 至少各一 commit（原子回滚）。
