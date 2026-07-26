# Research: OpenTelemetry Node SDK bootstrap (sdk-node 0.221.0 + auto-instrumentations-node 0.78.0)

- **Query**: Minimal NodeSDK init (resource, traces + metrics, auto-instrumentations, OTLP env conventions, sampling); behaviour with no exporter endpoint; correct shutdown; ESM load-order and loader-hook requirements for a `node --import instrument.server.mjs` preload; version compatibility
- **Scope**: external (library), verified against installed source
- **Date**: 2026-07-26
- **Versions verified**: `@opentelemetry/sdk-node@0.221.0`, `@opentelemetry/auto-instrumentations-node@0.78.0`, `@opentelemetry/api@1.9.1`, `@opentelemetry/instrumentation@0.221.0` + `0.220.0` + `0.214.0` (three copies in the store), `import-in-the-middle@3.0.1`, `require-in-the-middle@8.0.1`. Node in this environment: **v24.12.0**.
- **Sources**: `node_modules/@opentelemetry/sdk-node/build/src/{sdk.js,types.d.ts,utils.js,create-from-env.js,start.d.ts}`, `node_modules/@opentelemetry/auto-instrumentations-node/build/src/{utils.js,register.js}`, `@opentelemetry/instrumentation/README.md` + `hook.mjs`.

## Findings

### Version compatibility: aligned, with one duplicate-install wrinkle

`auto-instrumentations-node@0.78.0` declares:

- `dependencies`: `@opentelemetry/sdk-node: ^0.220.0`, `@opentelemetry/instrumentation: ^0.220.0`, `@opentelemetry/resources: ^2.0.0`
- `peerDependencies`: `@opentelemetry/api: ^1.4.1`, `@opentelemetry/core: ^2.0.0`

`0.221.0` satisfies `^0.220.0`, so **the pairing is correct**. But note that `sdk-node` is a *dependency* of auto-instrumentations, not a peer, and pnpm resolved a second copy:

```
node_modules/.pnpm/@opentelemetry+sdk-node@0.220.0   <- what auto-instrumentations-node/register uses
node_modules/.pnpm/@opentelemetry+sdk-node@0.221.0   <- the app's top-level dependency
```

Verified: `node_modules/.pnpm/@opentelemetry+auto-instrumentations-node@0.78.0_*/node_modules/@opentelemetry/sdk-node -> @opentelemetry+sdk-node@0.220.0`.

This only matters if you use the turnkey `@opentelemetry/auto-instrumentations-node/register` entry, which constructs its own `NodeSDK` from that nested 0.220.0. Importing `getNodeAutoInstrumentations` from the package index and constructing `NodeSDK` yourself from the top-level `@opentelemetry/sdk-node` uses 0.221.0 throughout. Both copies share the same `@opentelemetry/api@1.9.1` global, so there is no split-brain on the API side either way.

`sdk-node` `engines`: `^18.19.0 || >=20.6.0`. ✅

### `NodeSDK` surface (0.221.0)

```ts
export declare class NodeSDK {
  constructor(configuration?: Partial<NodeSDKConfiguration>);
  start(): void;                  // synchronous, returns void
  shutdown(): Promise<void>;
}
export { startNodeSDK } from './start';   // @experimental, returns { shutdown }
```

`NodeSDKConfiguration` (`build/src/types.d.ts`), complete:

```ts
interface NodeSDKConfiguration {
  autoDetectResources: boolean;
  contextManager: ContextManager;
  textMapPropagator: TextMapPropagator | null;
  logRecordProcessor: LogRecordProcessor;      // @deprecated -> logRecordProcessors
  logRecordProcessors?: LogRecordProcessor[];
  metricReader: IMetricReader;                 // @deprecated -> metricReaders
  metricReaders?: IMetricReader[];
  views: ViewOptions[];
  instrumentations: (Instrumentation | Instrumentation[])[];
  resource: Resource;
  resourceDetectors: Array<ResourceDetector>;
  sampler: Sampler;
  serviceName?: string;
  spanProcessor?: SpanProcessor;               // @deprecated -> spanProcessors
  spanProcessors?: SpanProcessor[];
  traceExporter: SpanExporter;
  spanLimits: SpanLimits;
  idGenerator: IdGenerator;
}
```

The three deprecated singular forms each emit a `diag.warn` at construction. The `resource` field's own doc comment prescribes the merge idiom:

```ts
resource: defaultResource().merge(resourceFromAttributes({ foo: 'bar' }))
```

`serviceName` is a shortcut: `start()` merges `{ [ATTR_SERVICE_NAME]: serviceName }` into the resource for you (`sdk.js:174-180`), so you don't need both.

### Minimal init

```js
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'

const sdk = new NodeSDK({
  resource: defaultResource().merge(resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.APP_NAME ?? 'tan-servora',
    [ATTR_SERVICE_VERSION]: process.env.APP_VERSION,
    'deployment.environment.name': process.env.APP_ENV,
  })),
  instrumentations: [getNodeAutoInstrumentations()],
})

sdk.start()
```

Everything else — exporters, endpoint, protocol, sampler, batch tuning — comes from `OTEL_*` env vars. Providing no options at all is explicitly supported and documented in the class JSDoc: `new NodeSDK()` uses env config entirely.

### `getNodeAutoInstrumentations(inputConfigs?)`

```ts
function getNodeAutoInstrumentations(inputConfigs?: InstrumentationConfigMap): Instrumentation[];
function getResourceDetectorsFromEnv(): Array<ResourceDetector>;   // exported as `getResourceDetectors`
```

Per-instrumentation config is keyed by full package name; unknown keys produce a `diag.error("Provided instrumentation name ... not found")` rather than a throw:

```js
getNodeAutoInstrumentations({
  '@opentelemetry/instrumentation-fs': { enabled: false },
  '@opentelemetry/instrumentation-pino': { enabled: false },   // repo already does trace ctx via pino mixin
})
```

Enable/disable resolution order (`utils.js:113-139`): programmatic `enabled: false` → `OTEL_NODE_DISABLED_INSTRUMENTATIONS` → `OTEL_NODE_ENABLED_INSTRUMENTATIONS` allowlist → default exclusions. Env var values are bare suffixes, joined onto `@opentelemetry/instrumentation-` (e.g. `OTEL_NODE_ENABLED_INSTRUMENTATIONS=http,pg,undici`).

**Excluded by default** (`utils.js:109-112`): `@opentelemetry/instrumentation-fs` and `@opentelemetry/instrumentation-host-metrics`. Everything else in the map is on — that is ~45 instrumentations including `pg`, `http`, `undici`, `pino`, `express`, `graphql`, `redis`, `mongodb`, `aws-*`. Each is `new`'d eagerly inside a try/catch (failures become `diag.error`).

Relevant to this repo: `instrumentation-pg` will trace the shared `pg.Pool` from `src/db.ts`, and `instrumentation-pino` would inject trace context into log records — which duplicates what `src/lib/observability/logger.ts:31-42` already does with its own `mixin()` reading `trace.getActiveSpan()`.

### Behaviour with no exporter endpoint configured — this is the noisy-local case

**Traces.** With no `traceExporter`/`spanProcessors` in config, `start()` calls `getSpanProcessorsFromEnv()` (`utils.js:118-161`):

```js
let traceExportersList = getStringListFromEnv('OTEL_TRACES_EXPORTER') ...
if (traceExportersList[0] === 'none') {
  diag.warn('OTEL_TRACES_EXPORTER contains "none". SDK will not be initialized.')
  return []
}
if (traceExportersList.length === 0) {
  diag.debug('OTEL_TRACES_EXPORTER is empty. Using default otlp exporter.')
  traceExportersList = ['otlp']
}
```

**Metrics.** The constructor calls `getMetricReadersFromEnv()` (`sdk.js:27-55`) with the same default:

```js
if (enabledExporters.length === 0) {
  diag.debug('OTEL_METRICS_EXPORTER is empty. Using default otlp exporter.')
  enabledExporters.push('otlp')
}
if (enabledExporters.includes('none')) { ...; return [] }
```

Protocol resolution (`utils.js:98-102`):

```js
getStringFromEnv('OTEL_EXPORTER_OTLP_TRACES_PROTOCOL')
  ?? getStringFromEnv('OTEL_EXPORTER_OTLP_PROTOCOL')
  ?? 'http/protobuf'
```

and `http/protobuf`'s default URL is `http://localhost:4318/v1/traces` (`@opentelemetry/otlp-exporter-base/build/src/configuration/otlp-http-configuration.js:60`).

> **Net effect: a bare `new NodeSDK({...}).start()` with no `OTEL_*` env set will export both traces and metrics to `http://localhost:4318`, and on a dev machine with no collector you get repeated connection-refused export failures.** There is no "detect that no endpoint is configured and stay quiet" logic — `OTEL_EXPORTER_OTLP_ENDPOINT` being unset means *default localhost*, not *disabled*.

Three ways to turn it off cleanly, in order of bluntness:

| Method | Effect |
|---|---|
| `OTEL_SDK_DISABLED=true` | Constructor sets `_disabled` (`sdk.js:91-93`); `start()` returns immediately (`sdk.js:157-159`). No instrumentation registered, no providers, no context manager. Total no-op. |
| `OTEL_TRACES_EXPORTER=none` + `OTEL_METRICS_EXPORTER=none` | Providers are simply never constructed (see next section). Instrumentations still register and the context manager is still installed. |
| `OTEL_TRACES_EXPORTER=console` | Spans to stdout via `SimpleSpanProcessor` + `ConsoleSpanExporter` — useful for local verification, very verbose. |

`OTEL_SDK_DISABLED` is read via `getBooleanFromEnv`. Guarding the whole bootstrap behind your own env check (mirroring how `instrument.server.mjs` currently gates Sentry on `VITE_SENTRY_DSN`) achieves the same and avoids constructing the SDK at all.

### Providers are only registered when there is something to export

Two conditional registrations in `start()`:

```js
// sdk.js:182-190 — metrics
if (this._meterProviderConfig?.readers && this._meterProviderConfig.readers.length > 0) {
  ... metrics.setGlobalMeterProvider(meterProvider)
}
// sdk.js:216-231 — traces
if (spanProcessors.length > 0) {
  ... trace.setGlobalTracerProvider(this._tracerProvider)
}
```

So with `OTEL_TRACES_EXPORTER=none`, no global tracer provider is set, `trace.getActiveSpan()` returns `undefined`, and the pino `mixin()` at `src/lib/observability/logger.ts:32-41` degrades to `return {}` without error. That path is already safe.

Separately, **SDK self-observability metrics are opt-in**: `OTEL_NODE_EXPERIMENTAL_SDK_METRICS` (`sdk.js:180-181`, "While SDK metrics are unstable, we require an opt-in"). When unset, the meter provider is not wired into span processors or the tracer provider.

### Sampling via `OTEL_TRACES_SAMPLER`

`createSamplerFromEnv()` (`create-from-env.js`). **If the var is unset it returns `undefined`** and the `TracerProvider`'s own default applies — it is not forced to always-on by this code path.

| `OTEL_TRACES_SAMPLER` | Sampler |
|---|---|
| `always_on` | `AlwaysOnSampler` |
| `always_off` | `AlwaysOffSampler` |
| `parentbased_always_on` | `ParentBasedSampler({ root: AlwaysOnSampler })` |
| `parentbased_always_off` | `ParentBasedSampler({ root: AlwaysOffSampler })` |
| `traceidratio` | `TraceIdRatioBasedSampler(ratio)` |
| `parentbased_traceidratio` | `ParentBasedSampler({ root: TraceIdRatioBasedSampler(ratio) })` |
| anything else | `diag.error('unknown OTEL_TRACES_SAMPLER value "..."')`, returns `undefined` |

Ratio comes from `OTEL_TRACES_SAMPLER_ARG`, `DEFAULT_RATIO = 1`. Blank or out-of-`[0,1]` values log a `diag.error` and fall back to `1` — i.e. **a typo'd sampler arg silently becomes 100% sampling**, not 0%.

Batch span processor tuning (`createBatchSpanProcessorFromEnv`): `OTEL_BSP_MAX_QUEUE_SIZE`, `OTEL_BSP_SCHEDULE_DELAY`, `OTEL_BSP_EXPORT_TIMEOUT`, `OTEL_BSP_MAX_EXPORT_BATCH_SIZE`. A `ConsoleSpanExporter` is wrapped in `SimpleSpanProcessor` instead (no batching).

Diagnostics: `OTEL_LOG_LEVEL` (read in the `NodeSDK` constructor, `sdk.js:96-101`) installs a `DiagConsoleLogger` at that level. Without it, all the `diag.warn`/`diag.debug` messages quoted above are invisible — set `OTEL_LOG_LEVEL=debug` when diagnosing "why am I getting no spans".

Resource detectors: default `[envDetector, processDetector, hostDetector]` (`sdk.js:114-116`); override with `resourceDetectors` or `OTEL_NODE_RESOURCE_DETECTORS` (comma list, `'all'` / `'none'` supported by the auto-instrumentations helper).

### Shutdown

```js
shutdown() {
  const promises = []
  if (this._tracerProvider) promises.push(this._tracerProvider.shutdown())
  if (this._loggerProvider) promises.push(this._loggerProvider.shutdown())
  if (this._meterProvider)  promises.push(this._meterProvider.shutdown())
  return Promise.all(promises).then(() => {})
}
```

Each provider's `shutdown()` force-flushes its processors/readers before closing, so awaiting `sdk.shutdown()` is the flush. It is **async**, which means it cannot run inside an `exit` handler — it needs a live event loop, so it belongs in the SIGTERM path before `process.exit()`.

Note the ordering tension with [[pino-graceful-shutdown-and-pino-roll]]: OTel shutdown is async and must be awaited, pino's `flushSync` is synchronous and must be last. Sequence: drain server → `await sdk.shutdown()` → `flushLogsSync()` → `process.exit()`.

The turnkey `@opentelemetry/auto-instrumentations-node/register` module (`register.js`) shows the reference wiring, and is worth reading as the canonical shape:

```js
const sdk = new opentelemetry.NodeSDK({
  instrumentations: getNodeAutoInstrumentations(),
  resourceDetectors: getResourceDetectorsFromEnv(),
})
try {
  sdk.start()
  diag.info('OpenTelemetry automatic instrumentation started successfully')
} catch (error) {
  diag.error('Error initializing OpenTelemetry SDK. Your application is not instrumented and will not produce telemetry', error)
}
async function shutdown () {
  try { await sdk.shutdown(); diag.debug('OpenTelemetry SDK terminated') }
  catch (error) { diag.error('Error terminating OpenTelemetry SDK', error) }
}
process.on('SIGTERM', shutdown)
process.once('beforeExit', shutdown)
```

Two things to copy deliberately or not: it registers **`SIGTERM` only, not `SIGINT`**, and it uses `process.on` (not `once`) for SIGTERM while using `once` for `beforeExit`. It also does not call `process.exit()`, relying on the signal's default disposition being replaced — meaning with this handler alone, SIGTERM no longer terminates the process.

### ESM caveats — the important part for `node --import instrument.server.mjs`

**Loading order requirement.** From `@opentelemetry/instrumentation/README.md` § Limitations:

> - Instrumentations are registered **before** the module to instrument is `require`ed (CJS only)
> - modules are not included in a bundle. Tools like `esbuild`, `webpack`, ... usually have some mechanism to exclude specific modules from bundling

**The ESM loader hook is required and is still marked experimental.** README § "Instrumentation for ECMAScript Modules (ESM) in Node.js (experimental)":

> If your application is written in JavaScript as ESM, or it must compile to ESM from TypeScript, then a loader hook is required to properly patch instrumentation. The custom hook for ESM instrumentation is `--experimental-loader=@opentelemetry/instrumentation/hook.mjs`.

Monkey-patching `require` (via `require-in-the-middle`) covers CJS dependencies; ESM imports are immutable bindings and can only be intercepted at resolve/load time, which is what `import-in-the-middle` does.

`@opentelemetry/instrumentation/hook.mjs` is a four-line re-export:

```js
import { load, resolve, initialize } from 'import-in-the-middle/hook.mjs';
export { load, resolve, initialize };
```

Because it exports **`initialize`**, it is compatible with `module.register()` — the modern replacement for `--experimental-loader`, which is deprecated on Node 20.6+ (this environment is Node v24.12.0). So on this Node version, prefer:

```js
// instrument.server.mjs
import { register } from 'node:module'
register('@opentelemetry/instrumentation/hook.mjs', import.meta.url)
// ... then construct and start the NodeSDK
```

rather than adding `--experimental-loader` to `NODE_OPTIONS`. `@opentelemetry/instrumentation` has no `exports` map, so the `/hook.mjs` subpath resolves as a plain file and this specifier is valid.

**The subtlety specific to a `--import` preload file**: within `instrument.server.mjs`, its own static `import` statements are hoisted and fully evaluated *before* any top-level statement in its body runs. So anything `instrument.server.mjs` itself imports — `@opentelemetry/sdk-node`, `@sentry/tanstackstart-react`, and their transitive deps — is loaded **before** `register()` executes and will therefore not be instrumented. The application entry is a separate module graph loaded after the `--import` module finishes, so app code and its dependencies *are* covered. To narrow the uninstrumented window, the `register()` call has to live in its own tiny module imported first, or use dynamic `import()` for the SDK after registering:

```js
// instrument.server.mjs
import { register } from 'node:module'
register('@opentelemetry/instrumentation/hook.mjs', import.meta.url)
const { NodeSDK } = await import('@opentelemetry/sdk-node')   // dynamic: after the hook is live
```

The repo's existing `package.json` scripts already use this preload shape — `dev` sets `NODE_OPTIONS='--import ./instrument.server.mjs'` and `start` runs `node --import ./dist/server/instrument.server.mjs dist/server/server.js` — so the entry point exists; it currently only initializes Sentry.

**Bundling caveat, which is the sharpest one for this project.** `pnpm build` runs `vite build`, which bundles the server output. Per the Limitations quote above, instrumentation patches a module at `require`/`import` time by package name — a dependency that Vite has inlined into the server bundle is no longer resolved through the loader and **will not be instrumented**. `pg`, `undici`, and `nodemailer` would each need to stay external (Vite's `ssr.external` / `build.rollupOptions.external`) for `instrumentation-pg` / `instrumentation-undici` to attach. The current `vite.config.ts` sets no `ssr.external` / `noExternal` configuration at all, so whatever TanStack Start's `tanstackStart()` plugin defaults to governs this. **Not verified in this pass** — worth an empirical check (build, then grep the server bundle for inlined `pg` internals) before assuming auto-instrumentation works in production.

Dev mode has the same question in a different shape: Vite's SSR module runner transforms and executes app modules through its own pipeline rather than Node's ESM loader, so the `import-in-the-middle` hook may not see them. Node-native dependencies loaded via `createRequire` or externalized deps should still be patchable.

## Caveats / Not Found

- **Vite/TanStack Start interaction with the ESM loader hook is unverified.** Whether `import-in-the-middle` actually intercepts modules that Vite's SSR runner loads (dev) or that Vite has bundled (prod) was not tested. This is the single highest-risk unknown for making auto-instrumentation work here, and it is empirically checkable rather than documentable.
- `startNodeSDK(sdkOptions?)` is exported from `sdk-node` 0.221.0 and marked `@experimental` in its JSDoc. It takes only `{ instrumentations?, resourceDetectors?, textMapPropagator? }` and returns `{ shutdown: () => Promise<void> }`, deriving everything else from `@opentelemetry/configuration`. Not investigated further; `NodeSDK` remains the documented path.
- `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_EXPORTER_OTLP_TIMEOUT`, and per-signal endpoint overrides (`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`) are handled inside `@opentelemetry/otlp-exporter-base` rather than `sdk-node`; their precedence rules were not read in this pass. The spec defaults apply.
- Whether Sentry's `@sentry/tanstackstart-react` (already in `instrument.server.mjs`) installs its own OTel SDK / conflicts with a second `NodeSDK` was **not investigated**. Sentry's Node SDK is built on OpenTelemetry and typically registers its own tracer provider; running both without coordination is a known source of duplicate or dropped spans. This needs checking before wiring a second SDK into the same preload file.
- Related: [[pino-graceful-shutdown-and-pino-roll]] (shared SIGTERM sequencing), [[orpc-experimental-pino-logging-plugin]] (the `rpc.id` correlation field, and oRPC's own `@orpc/otel` package which is not currently a dependency).
