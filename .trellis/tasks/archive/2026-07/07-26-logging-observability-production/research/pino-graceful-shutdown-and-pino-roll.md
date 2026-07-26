# Research: pino v10 graceful shutdown + pino-roll v4 fail-fast

- **Query**: Correct flush/close of pino destinations on SIGTERM/SIGINT in ESM; sync vs async sonic-boom flush semantics; how multistream complicates flush; pino-roll v4 init errors and how to make failure propagate; considerations when transports are built in-process rather than in worker threads
- **Scope**: external (library), verified against installed source
- **Date**: 2026-07-26
- **Versions verified**: `pino@10.3.1`, `pino-roll@4.0.0`, `sonic-boom@4.2.1` (nested under pino-roll; pino declares `sonic-boom: ^4.0.1` so the same major is shared)
- **Sources**: `node_modules/pino/{pino.js,lib/proto.js,lib/tools.js,lib/multistream.js,docs/*.md}`, `node_modules/pino-roll/{pino-roll.js,lib/utils.js}`, `node_modules/.pnpm/sonic-boom@4.2.1/.../index.js`. pino ships its **full docs directory** inside the npm package (`node_modules/pino/docs/api.md`, 51 KB) — that is the authoritative reference and it is already on disk.

## Findings

### Headline: `pino.final()` no longer exists in pino v10

Most shutdown advice on the web says "wrap your handler in `pino.final()`". That API is **gone in 10.3.1**:

- not in `pino.js` exports (`pino.js:212-234` exports only `destination`, `transport`, `multistream`, `levels`, `stdSerializers`, `stdTimeFunctions`, `symbols`, `version`, `default`, `pino`)
- `grep -n "final\b" pino.d.ts` → no matches
- no references in `docs/*.md`

Any shutdown code written against `pino.final` will fail at runtime with "pino.final is not a function". The replacement is explicit `flush`/`flushSync` on the destination, described below.

### `logger.flush([cb])` — what it actually does

`lib/proto.js`:

```js
function flush (cb) {
  if (cb != null && typeof cb !== 'function') {
    throw Error('callback must be a function')
  }
  const stream = this[streamSym]
  if (typeof stream.flush === 'function') {
    stream.flush(cb || noop)
  } else if (cb) cb()
}
```

It is a thin delegation. Per `docs/api.md:1029-1046` it is "asynchronous, best used as fire and forget"; pass a callback if you need to wait.

### The multistream trap

**`pino.multistream()` does not implement `flush`.** Its returned object (`lib/multistream.js:20-32`) is:

```js
{ write, add, remove, emit, flushSync, end, minLevel, lastId, streams, clone, [metadata], streamLevels }
```

`flushSync` and `end` — but no `flush`. Combined with the `proto.js` code above, this means:

> On a multistream logger, `logger.flush(cb)` falls into the `else if (cb) cb()` branch: **it flushes nothing and fires your callback immediately.** A shutdown routine that awaits `logger.flush` and then calls `process.exit(0)` will silently truncate buffered logs.

This applies directly to `src/lib/observability/logger.ts:90-93`, which builds a `pino.multistream([...])` in production whenever `LOG_FILE` is set.

What multistream *does* implement:

```js
function flushSync () {                       // lib/multistream.js:92-98
  for (const { stream } of this.streams) {
    if (typeof stream.flushSync === 'function') stream.flushSync()
  }
}
function end () {                             // lib/multistream.js:154-161
  for (const { stream } of this.streams) {
    if (typeof stream.flushSync === 'function') stream.flushSync()
    stream.end()
  }
}
```

So the working shutdown call on a multistream logger is `logger[pino.symbols.streamSym].flushSync()` — or, more simply, keep a module-level reference to the stream you built and call `.flushSync()` / `.end()` on it directly. `end()` is the fuller option: it flushes synchronously *and* closes each underlying fd.

### sonic-boom flush semantics (what `pino.destination` is)

`pino.destination()` returns a `SonicBoom`. API (`sonic-boom/types/index.d.ts`):

| Method | Semantics |
|---|---|
| `write(string)` | returns `false` to signal backpressure |
| `flush(cb?)` | writes the current buffer **if a write is not already in progress**; no-op when `minLength` is 0 or already writing. Asynchronous. |
| `flushSync()` | flushes buffered data synchronously. Documented as "a costly operation" — but it is the only thing that survives a `process.exit()`. |
| `end()` | closes the stream, data flushed **asynchronously** |
| `destroy()` | closes immediately, **data is not flushed** |
| `reopen(file?)` | reopen in place, for external log rotation (SIGHUP/SIGUSR2 pattern, `docs/help.md:51`) |

Events: `close`, `drain`, `drop`, `error`, `finish`, `ready`, `write`.

`sync: true` writes each line with a blocking syscall; `sync: false` (the default) buffers and writes via async `fs.write`, so in-flight and buffered data are both at risk at exit (`docs/asynchronous.md`).

Note the asymmetry in `pino.js:214-221`: the scalar form `pino.destination(1)` forces `minLength: 0` (effectively unbuffered), while the object form `pino.destination({ dest, minLength })` honours your buffer size. Both are still `sync: false` unless you say otherwise.

### pino already auto-flushes `pino.destination()` streams at exit

`buildSafeSonicBoom` (`lib/tools.js`):

```js
function buildSafeSonicBoom (opts) {
  const stream = new SonicBoom(opts)
  stream.on('error', filterBrokenPipe)
  // If we are sync: false, we must flush on exit
  if (!opts.sync && isMainThread) {
    onExit.register(stream, autoEnd)
    stream.on('close', function () { onExit.unregister(stream) })
  }
  return stream
}
```

and:

```js
function autoEnd (stream, eventName) {
  if (stream.destroyed) return
  if (eventName === 'beforeExit') {
    stream.flush()                                  // event loop still turning
    stream.on('drain', function () { stream.end() })
  } else {
    stream.flushSync()                              // no event loop; must be sync
  }
}
```

Two consequences that matter for this task:

1. Streams created through `pino.destination(...)` get `beforeExit`/`exit` flushing **for free** via `on-exit-leak-free`, and get an `error` listener that swallows `EPIPE` (neutering `write`/`end`/`flushSync`/`destroy` to no-ops) and re-emits everything else.
2. **`pino-roll` streams get neither.** pino-roll constructs `new SonicBoom({ ...opts, dest: fileName })` directly (`pino-roll.js:102`) — no `onExit.register`, no `error` listener. A rotating file stream will not be flushed by pino's exit hooks, and an fd error on it has no handler.

`process.exit()` stops the event loop, so anything relying on `beforeExit` or an async `flush` callback is lost. The only shutdown sequence that is safe against an immediate exit is: **`flushSync()` on every destination, then exit.** `logger.fatal()` is documented (`docs/api.md:883-888`) to sync-flush the destination on every call, which is why the docs warn against using it for anything other than final messages.

### Signal handling shape (ESM, in-process streams)

Nothing pino-specific is required for ESM; the constraint is only "do the sync flush before the process dies". A shape that satisfies everything above:

```js
// keep the stream you built, not just the logger
export const logStream = await buildStream()
export const logger = pino(pinoOptions, logStream)

function flushLogsSync () {
  // multistream: flushSync + end each child; SonicBoom: flushSync itself
  if (typeof logStream.end === 'function') logStream.end()
  else if (typeof logStream.flushSync === 'function') logStream.flushSync()
}

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.once(sig, () => {
    // ... drain HTTP server / close pg pool first ...
    flushLogsSync()
    process.exit(sig === 'SIGINT' ? 130 : 143)
  })
}
process.on('uncaughtException', (err) => { logger.fatal(err); flushLogsSync(); process.exit(1) })
```

`logger.fatal(err)` already sync-flushes, so the explicit call after it is belt-and-braces for the multistream case.

### pino-roll v4 — initialization, and where errors go

`module.exports` is an **`async function`** (`pino-roll.js:76`), so `await pinoRoll({...})` is required and every synchronous `throw` inside it surfaces as a **promise rejection**.

Validation runs first (`pino-roll.js:86-89`), throwing plain `Error`s with these messages (`lib/utils.js`):

| Trigger | Message |
|---|---|
| `limit` not an object | `limit must be an object` |
| `limit.count` ≤ 0 or not a number | `limit.count must be a number greater than 0` |
| `limit.removeOtherLogFiles` not boolean | `limit.removeOtherLogFiles must be boolean` |
| bad `dateFormat` characters | `` `${formatStr} contains invalid characters` `` |
| unparseable `dateFormat` | `` `${formatStr} must be a valid date format` `` |
| missing `file` | `No file name provided` |
| bad path characters | `` `File name contains invalid characters: ${filepath}` `` |
| bad `size` (not k/m/g) | `` `${size} is not a valid size in KB, MB or GB` `` |
| bad `frequency` | `` `${frequency} is neither a supported frequency or a number of milliseconds` `` |

These **do** fail fast through `await`. Filesystem errors do not, and that is the important asymmetry:

```js
// pino-roll.js:96-102 — async fs work, then the stream is constructed and returned
let number = await detectLastNumber(file, frequencySpec?.start, extension)
let currentSize = await getFileSize(fileName)
const destination = new SonicBoom({ ...opts, dest: fileName })
...
return destination
```

`sonic-boom`'s `openFile` branches on `sync`:

```js
if (sonic.sync) {
  try {
    if (sonic.mkdir) fs.mkdirSync(path.dirname(file), { recursive: true })
    const fd = fs.openSync(file, flags, mode)
    fileOpened(null, fd)
  } catch (err) {
    fileOpened(err)
    throw err                      // <-- synchronous throw out of the constructor
  }
} else if (sonic.mkdir) {
  fs.mkdir(path.dirname(file), { recursive: true }, (err) => {
    if (err) return fileOpened(err)   // fileOpened -> sonic.emit('error', err)
    fs.open(file, flags, mode, fileOpened)
  })
} else {
  fs.open(file, flags, mode, fileOpened)
}
```

So, for an unwritable directory (`EACCES`), a bad path (`ENOENT` without `mkdir`), or `EMFILE`:

- **`sync: true`** → `new SonicBoom(...)` throws synchronously inside the async function → `await pinoRoll(...)` **rejects**. A `try/catch` around the `await` catches it. This is the fail-fast path.
- **`sync: false`** (the default, and what `src/lib/observability/logger.ts:87` currently sets) → `pinoRoll()` **resolves successfully** with a stream whose fd was never opened. The error arrives later as `stream.emit('error', err)`. Because pino-roll attaches no `error` listener and pino only attaches one to streams it built via `pino.destination`, this is an **`EventEmitter` `'error'` with no listener → uncaught exception → process crash**, thrown from an fs callback at an unpredictable point after startup, with a stack that points into sonic-boom rather than your config.

Two ways to get deterministic fail-fast with `sync: false` retained for throughput:

```js
// (a) probe writability yourself before constructing the stream
await fs.promises.mkdir(path.dirname(logConfig.file), { recursive: true })
await fs.promises.access(path.dirname(logConfig.file), fs.constants.W_OK)

// (b) or race the stream's ready/error events, which sonic-boom emits either way
const fileStream = await pinoRoll({ ...opts, sync: false })
await new Promise((resolve, reject) => {
  fileStream.once('ready', resolve)
  fileStream.once('error', reject)   // also installs the listener that prevents the uncaught throw
})
```

Attaching a long-lived `fileStream.on('error', handler)` is worth doing regardless — it converts later runtime fd errors (disk full, fd revoked during rotation) from process-killing uncaught exceptions into something handleable. pino-roll also emits `'error'` from its rotation path on flush/reopen/cleanup failure (`pino-roll.js:141`, `:163`, `:172`, `:189`).

Also note: the `try { ... } catch { return pino.destination(1) }` wrapper currently at `src/lib/observability/logger.ts:75-96` catches exactly the validation errors above — i.e. it silently downgrades a genuine misconfiguration (bad `LOG_MAX_SIZE`, bad `limit.count`) to stdout-only logging, while *not* catching the fs errors, which escape as described.

### pino-roll v4 options accepted

Destructured explicitly (`pino-roll.js:76-85`): `file`, `size`, `frequency`, `extension`, `limit`, `symlink`, `dateFormat`. **Everything else is spread straight into `SonicBoom`** — that is how `mkdir`, `sync`, `minLength`, `append`, `mode`, `fsync`, `periodicFlush` reach the stream. The type is declared as `Options & import('sonic-boom').SonicBoomOpts`.

- `size`: `'k' | 'm' | 'g'` suffix; a bare number means MB.
- `frequency`: `'daily' | 'hourly'` or a number of milliseconds. A numeric value **always creates a new file on startup**.
- `limit.count`: number of retained files **in addition to the file currently in use**.
- `limit.removeOtherLogFiles`: also delete pre-existing files matching the pattern.
- Filename convention: `filename.date.count.extension` (e.g. `app.2025-08-19.1.log`).
- `symlink: true` maintains a `current.log` symlink to the active file; the symlink is rewritten synchronously on every roll (`createSymlinkSync`).
- Rotation timers are `.unref()`'d (`pino-roll.js:197`) so they do not hold the process open.
- **No gzip.** Despite the comment at `src/lib/observability/logger.ts:74` ("+ gzip"), pino-roll v4 has no compression option — `grep` for gzip/compress in the package returns nothing. Compression needs an external tool (logrotate) or a post-rotation hook on the `cleanup-complete` event.

### In-process streams vs worker-thread transports

The repo deliberately avoids `pino.transport()` (worker threads) because Vite SSR can't reliably spawn the worker — see the comment at `src/lib/observability/logger.ts:45-47`. The tradeoffs that follow:

- **You lose pino's transport exit handling.** `docs/api.md:1295-1301`: `transport()` registers `beforeExit` and `exit` listeners itself to flush the worker, and auto-terminates via `FinalizationRegistry`. In-process streams get none of that except the `pino.destination`-only `autoEnd` hook described above — hence the need for explicit `flushSync`.
- **Serialization and file I/O run on the main thread**, competing with request handling. `sync: false` + a non-zero `minLength` is what keeps that cheap.
- `pino-pretty` loaded via `createRequire` with `sync: true` (as at `src/lib/observability/logger.ts:57-63`) is blocking per line — fine for dev, and it sidesteps flush concerns entirely since nothing is buffered.
- The docs' own recommendation for plain stdout (`docs/help.md:330-340`) is the zero-config default: `pino()`. Container platforms that collect stdout make the whole rotating-file path optional — pino's log-rotation guidance (`docs/help.md:20-49`) is to use external `logrotate` with `copytruncate`, or the `reopen()`-on-SIGHUP pattern (`docs/help.md:51`), rather than in-process rotation.

## Caveats / Not Found

- **`pino.final` is removed** — verified absent from exports, types, and docs in 10.3.1. I did not find a migration note inside the package (no CHANGELOG is shipped); the pino GitHub releases would confirm which major dropped it.
- `docs/api.md` does not document a `flush` method on `MultiStreamRes`; the absence was confirmed by reading `lib/multistream.js` directly rather than from a doc statement.
- `on-exit-leak-free`'s exact event registration was not read (the nested package path did not resolve in the pnpm store during this pass). The `autoEnd(stream, eventName)` signature and its `'beforeExit'` branch make clear it is called for both `beforeExit` and `exit`, which is sufficient for the conclusions above.
- Whether `stream.flushSync()` on a **stdout fd** (`pino.destination(1)`) can throw `EAGAIN` on a non-blocking pipe was not investigated; sonic-boom has `retryEAGAIN` handling for this, default behaviour unverified.
- Related: [[orpc-experimental-pino-logging-plugin]] (consumer of this logger), [[otel-node-sdk-bootstrap]] (shares the SIGTERM handler).
