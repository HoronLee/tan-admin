# Design — Logging & observability production hardening

> PRD: [prd.md](./prd.md)。研究依据：`research/` 三篇（全部对照已安装版本源码验证）。
> 分四阶段：A logger 核心硬化（R2/R3/R4）→ B 访问日志（R1/R6）→ C OTel（R5）→ D 收尾（R7/R8）。

## 研究结论摘要（决定设计的硬事实）

1. `pino.final()` 在 pino v10 **不存在**；multistream 上 `logger.flush(cb)` 是**静默 no-op**（`lib/proto.js` fall-through）。唯一可靠关闭手段：持有 stream 引用，multistream 调 `.end()`（内部对每个 child flushSync + end），SonicBoom 调 `.flushSync()`。
2. pino-roll v4 `sync: false`（现配置）下 fs 错误（EACCES/ENOENT）**不会 reject await**——stream 正常返回，错误稍后以无监听 `'error'` 事件炸进程。参数校验错误会 reject，但现有 `try/catch` 把它们静默降级 stdout。fail-fast 需 `once('ready')/once('error')` race + 常驻 error 监听。
3. pino-roll v4 **无 gzip**（`logger.ts:74` 注释有误）。
4. `pino.destination()` 流有 pino 自带 exit 自动 flush（`buildSafeSonicBoom`）；**pino-roll 流没有**——必须自己 flush。
5. `LoggingHandlerPlugin`（@orpc/experimental-pino 1.14.8）**不记 duration、不按 status 分级**（`res.status` 只是 info 行字段）；start/end 行由单一 `logRequestResponse` 开关控制；对 thrown error 无条件记 error 级；`generateId` 可读入站 header；`plugins` 数组两 handler 通用；`getLogger(context)` 取 request-scoped child。
6. 裸 `NodeSDK.start()` 无 env 时默认向 `http://localhost:4318` 导出 traces+metrics——本地无 collector 即连接拒绝重试噪音。endpoint 未设 ≠ 禁用。
7. Generic Node ESM auto-instrumentation can use a loader hook, but empirical Nitro node-server testing showed `register("@opentelemetry/instrumentation/hook.mjs")` makes `/api/spec` return 500 even with auto instrumentations disabled. This app must not register the hook; Node core HTTP instrumentation works without it.
8. Top-level `@opentelemetry/sdk-node` is 0.221.0 while auto-instrumentations may carry 0.220.0; use a self-built NodeSDK from the top-level package, not `/register`.
9. `instrument.server.mjs` is pure mjs and root-loaded by plain Node; it must not import TS / `#/` aliases. Nitro emits the app at `.output/server/index.mjs`; the preload remains outside that bundle.

## Phase A — logger 核心硬化（R2/R3/R4）

### A1. `LOG_OUTPUT` 契约

```
LOG_OUTPUT?: "stdout" | "file" | "both"   # env.ts Zod enum, optional
```

- 真相源优先级：显式 `LOG_OUTPUT` > 默认 `stdout`。容器识别不参与判定（只在 boot 诊断行里提示）。
- **兼容旧语义迁移**：现状"`LOG_FILE` 有值即写文件"废除。新规则：只有 `LOG_OUTPUT=file|both` 才碰文件系统。
- 校验联动（`config.server.ts` 解析层，boot 抛错）：
  - `LOG_OUTPUT=file|both` 且 `LOG_FILE` 缺失 → throw（带修复提示）。
  - `LOG_OUTPUT=stdout`（或缺省）时 `LOG_FILE` 被忽略，boot 诊断行提示"LOG_FILE set but LOG_OUTPUT=stdout, file output disabled"。
- dev（`APP_ENV=dev`）维持 pino-pretty 彩色单行 stdout，`LOG_OUTPUT` 不适用（文档写明）。

`logConfig` 新增 `output` 字段；`file`/`maxSize`/`maxFiles` 保留。

### A2. buildStream 重写（fail-fast）

```
dev            → pino-pretty（现状不动）
prod stdout    → pino.destination(1)（pino 自带 exit flush）
prod file      → 仅 pino-roll 流（不再强制混 stdout）
prod both      → multistream [stdout, pino-roll]
```

pino-roll 构建路径（删除现有整段 `try/catch` 静默降级）：

```ts
const fileStream = await pinoRoll({ ...opts, sync: false });   // 校验错误在此 reject → 自然抛出
await new Promise<void>((resolve, reject) => {                  // fs 错误 fail-fast
  fileStream.once("ready", () => resolve());
  fileStream.once("error", reject);
});
fileStream.on("error", (err) => {                               // 常驻：运行期 fd 错误不再炸进程
  process.stderr.write(`[pino-roll] file stream error: ${err?.message}\n`);
});
```

- 删除 `logger.ts:74` "+ gzip" 注释（pino-roll v4 无此能力）；轮转压缩交给外部 logrotate，文档记录。
- dev 的 pino-pretty `try/catch` 降级保留（dev 便利非生产正确性）。

### A3. 统一关闭流程

新增 `src/lib/observability/shutdown.ts`（app 模块图内，可 import logger）：

```ts
// logger.ts 改动：模块级导出 stream 引用
export const logStream: pino.DestinationStream = await buildStream();
export const logger = pino(pinoOptions, logStream);

// shutdown.ts
export function flushLogsSync(): void   // multistream → .end()；SonicBoom → .flushSync() + .end()
export function registerShutdownHooks(): void
```

`registerShutdownHooks()`（幂等，`src/server.ts` 模块加载时调一次）：

```
SIGTERM / SIGINT（process.once）:
  1. await globalThis.__otelShutdown?.()   // Phase C 注入；带 2s 超时护栏
  2. await Sentry.flush(2000) 若可用
  3. flushLogsSync()
  4. process.exit(SIGINT ? 130 : 143)
```

- 退出路径改造点：
  - `src/lib/observability/database-fail-fast.ts` 统一 DB unavailable 递归判定、fatal/Sentry 与 process-wide 单次 drain+exit promise；`src/middleware/error.ts` 复用 scheduler。
  - `src/lib/db.ts` 必须显式捕获缺失配置 / `$connect()` 失败并调用 fatal helper。Nitro 会懒加载 SSR chunk 并把普通 top-level rejection 转成 HTTP 500，不能依赖 Node 默认退出。
  - `src/server/seed.ts`：`process.exit()` 前加 `flushLogsSync()`。
- 不注册 `uncaughtException` 全局 handler（超出本任务范围，避免吞异常语义变化）；pino stdout 流已有 exit 自动 flush 兜底。

## Phase B — 访问日志（R1/R6）

### B1. requestId 贯穿

`src/server.ts` fetch 包装（所有请求最外层）：

```ts
const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
// clone request 注入 header → 下游三类入口统一从 headers 读
// response 回显 x-request-id header（客户端可关联）
```

- oRPC 两 route 的 `context: { headers: request.headers }` 现状即自动携带。
- server fn 侧 `getRequestHeaders()` 读同一 header。
- SSR in-process oRPC client（`server-client.ts`）走 `getRequestHeaders()`，同样拿到。

### B2. oRPC 侧：插件 + 自写访问 interceptor（主案 W1）

`LoggingHandlerPlugin` 共享单实例，挂两 handler `plugins`：

```ts
new LoggingHandlerPlugin({
  logger: createModuleLogger("orpc"),
  generateId: ({ request }) => request.headers["x-request-id"] ?? crypto.randomUUID(),
  logRequestResponse: false,   // start/end 行自己写（插件版无 duration、无分级）
})
```

插件职责收窄为：request-scoped child logger（绑 `rpc.id`/`rpc.method`/`req`）+ `getLogger(context)` 给 procedure 用。

**访问日志由自写 interceptor 承担**（新文件 `src/orpc/access-log.ts`，加入两 handler `interceptors` 数组首位）：

- 计时 `performance.now()` 包 `next()`；
- 成功：读 `result.response.status` → `<400` info / `4xx` warn / `5xx` error，一条 `"request completed"` 含 `durationMs`、`status`、method、URL path；
- `durationMs > logConfig.slowThresholdMs` → 升 warn 并附 `slow: true`（该配置字段首次真正投入使用）；
- 异常：记一条 error 级访问行后原样 rethrow（错误对象细节仍由现有 `serverInterceptors` 分级记录）；
- logger 取 `getLogger(context) ?? fallback module logger`。

**已知风险 + 决策门（实现期实证）**：插件对 thrown error 无条件记 error 级。现有 `serverInterceptors` 会 rethrow typed 4xx（warn 级已记），若实测插件叠加产生重复 error 行/等级违反 spec「Log level rule」→ 切**备案 W2**：弃用插件，在 route `handle()` 里自播 `context[CONTEXT_LOGGER_SYMBOL]`（`getLogger` 无插件也能读 symbol），requestId child 自建；TODO 条目 6 以"插件行为与 spec 分级规则冲突"为由 waive 并记录进 spec。验收不变（A1-A3 按行为验，不锁实现）。

### B3. server fn 侧

`src/middleware/logging.ts` 实现 `serverFnAccessMiddleware`：

- `createMiddleware({ type: "function" })`，计时包 `next()`；
- 成功与失败都记一条访问行，只含 `requestId/method/path/status/durationMs/module/slow`；`path` 使用稳定 `serverFnMeta.id`；
- `<400` info / `4xx` warn / `5xx` error，慢成功升 warn；失败原样 rethrow；
- `src/start.ts` 链：`functionMiddleware: [serverFnAccessMiddleware, serverFnErrorMiddleware]`。外层拥有访问行；内层拥有 `err` 详情/Sentry，并带相同 requestId。

### B4. 脱敏不回退

访问行只含：requestId、method、path/procedure、status、durationMs、module——无 headers/body/query string。现有 logger `redact` 契约不动。插件 hardcode 只采 content-type/length/disposition 三个良性 header（研究已证），无新增泄露面。

## Phase C — OTel Node SDK（R5）

### C1. 文件布局（修正 TODO 原案）

```
instrument.server.mjs        # 根目录 preload：Sentry → 动态 import OTel（不注册 ESM hook）
otel.server.mjs              # preload 的纯 ESM sibling
.output/server/index.mjs     # Nitro 官方 node-server 生产入口
```

- `package.json#start`：`node --import ./instrument.server.mjs .output/server/index.mjs`；preload 不依赖 Nitro bundle 内的 TS/`#/` alias。
- 理由：preload 在 plain Node 下运行，必须保留纯 ESM sibling；生产应用则使用可真实监听的 Nitro node-server 产物。

### C2. 初始化序（ESM 约束）

```js
// instrument.server.mjs：Nitro 兼容路径禁止 register ESM loader hook。
// Sentry init（现状）…
await import("./otel.server.mjs");
```

### C3. 启用门 + 配置

- **只在 `process.env.OTEL_EXPORTER_OTLP_ENDPOINT` 非空时构建/启动 NodeSDK**；未配置整体跳过（本地零噪音，R5"无 exporter 静默"）。`OTEL_SDK_DISABLED=true` 额外尊重（SDK 内建）。
- 自建 `NodeSDK`（顶层 0.221.0 import，不用 `/register` 入口——绕开嵌套 0.220.0 双份）：
  - resource：`serviceName` = `APP_NAME ?? "tan-servora"`，version/env attributes；
  - `instrumentations: getNodeAutoInstrumentations({ "@opentelemetry/instrumentation-pino": { enabled: false } })`——trace 注入已由 logger mixin 承担，防双写；`instrumentation-fs` 默认已排除；
  - exporter/协议/采样全走 `OTEL_*` 标准 env（不自造 env）；采样默认交 SDK（`OTEL_TRACES_SAMPLER` 可覆盖）。
- shutdown：`globalThis.__otelShutdown = () => sdk.shutdown()`（Phase A 关闭序消费；async flush 需活事件循环，故排在 `flushLogsSync()` 之前）。
- env.ts 声明 `OTEL_EXPORTER_OTLP_ENDPOINT?` 等为 optional string（文档化用途；preload 直读 `process.env`，不依赖 T3Env）。

### C4. 两个已识别风险（决策门）

1. **Sentry 冲突**：`@sentry/tanstackstart-react` Node 侧基于 OTel，可能注册自己的 tracer provider；同 preload 再起 NodeSDK 是已知 duplicate/dropped-span 源。实现期先查 Sentry v10 `skipOpenTelemetrySetup` + span processor 桥接文档（context7）：可行则两者共存；不可行则**互斥策略**——`VITE_SENTRY_DSN` 与 `OTEL_EXPORTER_OTLP_ENDPOINT` 同时配置时 boot 警告并按文档声明的优先序只启一个。验收 A9/A10 不受影响（单独 OTLP 场景）。
2. **Nitro bundle vs instrumentation（已实证）**：注册 ESM hook 时 `/api/spec` 500，禁用 undici/http/全部 auto instrumentation 仍失败；移除 hook、保留完整 NodeSDK + auto instrumentation 后 `/api/spec` 200，访问日志带 `traceId/spanId`，collector 收到 2183-byte trace。Nitro 将 `pg` / `nodemailer` 放入 `.output/server/_libs`，不能从布局推断 library-level 覆盖；生产需 collector-backed HTTP/DB smoke，build 当前目标为 `darwin-arm64`，部署需为目标平台重建。

## Phase D — 收尾（R7/R8）

- `.env.example` 新增「Logging」+「OpenTelemetry」两节：`APP_ENV`/`LOG_LEVEL`/`LOG_OUTPUT`/`LOG_FILE`/`LOG_MAX_SIZE`/`LOG_MAX_FILES`/`LOG_SLOW_THRESHOLD_MS`/`OTEL_EXPORTER_OTLP_ENDPOINT`/`OTEL_TRACES_SAMPLER` 注释含三形态推荐（容器=stdout / 物理机=both+文件 / dev=缺省）。
- `pnpm-workspace.yaml`：`protobufjs: set this to true or false` → `protobufjs: true`。
- `TODO.md`：清掉「日志与可观测性」节（完成后）。
- spec 更新 `logging-guidelines.md`：LOG_OUTPUT 契约、访问日志行 schema + 分级、关闭流程契约（multistream flush 陷阱）、无 gzip 事实、OTel 启用门与 correlation 生效条件。

## 测试策略

- 单测（Vitest）：
  - `resolveLogOutput`/logConfig 校验矩阵（file 模式缺 LOG_FILE 抛错等）——把判定逻辑提为纯函数；
  - 访问 interceptor level 映射（status→level、slow 升级、异常 rethrow）——mock next；
  - server fn access middleware 同理。
  - DB unavailable helper：嵌套 driver error 判定、process-wide 去重、fatal → drain → exit 顺序。
- 手工验收：PRD A1-A12 矩阵逐项（含 `kill -TERM`、坏目录 boot、OTLP collector 联通、`pnpm build && pnpm start`）。

## 变更文件清单（预估）

| 文件 | 动作 |
|---|---|
| `src/lib/env.ts` | + `LOG_OUTPUT`、`OTEL_*` 声明 |
| `src/lib/config.server.ts` | logConfig.output + 校验抛错 |
| `src/lib/observability/logger.ts` | buildStream 重写、导出 logStream、注释修正 |
| `src/lib/observability/shutdown.ts` | 新增 flushLogsSync + registerShutdownHooks |
| `src/lib/observability/database-fail-fast.ts` | 新增 DB fatal 分类、去重、drain+exit helper |
| `src/lib/db.ts` | missing URL / connect failure 显式 fatal exit（Nitro lazy import safe） |
| `src/server.ts` | requestId 注入/回显 + registerShutdownHooks() |
| `src/orpc/access-log.ts` | 新增访问 interceptor |
| `src/routes/api.rpc.$.ts` / `api.$.ts` | plugins + interceptors 接线 |
| `src/middleware/logging.ts` | serverFnAccessMiddleware 实现 |
| `src/middleware/error.ts` | 复用 DB fail-fast helper + error detail requestId |
| `src/start.ts` | functionMiddleware 链更新 |
| `src/server/seed.ts` | exit 前 flush |
| `instrument.server.mjs` | 动态初始化 Sentry / OTel；Nitro 下禁止 ESM hook |
| `otel.server.mjs` | 新增 OTel 初始化 |
| `package.json` / `vite.config.ts` | Nitro node-server build + 根目录 preload start |
| `pnpm-workspace.yaml` | protobufjs: true |
| `.env.example` | Logging/OTel 两节 |
| `TODO.md` / spec | 收尾更新 |

## 回滚

- Phase 独立可回滚：A 仅 logger/关闭/DB fatal 层；B 仅接线层（摘 plugins/interceptors/middleware 即回原状）；C 仅 preload + Nitro 生产入口（还原 instrument/start/build）；互不纠缠。
- `LOG_OUTPUT` 缺省=stdout 与现网容器行为一致；唯一行为变化是"`LOG_FILE` 单独存在不再触发文件输出"——.env.example 与 spec 显式记录该迁移。
