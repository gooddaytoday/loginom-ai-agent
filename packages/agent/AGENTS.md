# opencode database guide

## Standalone CLI implementation

- `src/standalone.ts` is the new early CLI entry; `src/cli/standalone.ts` selects and guards the profile before importing backend code. Do not route the standalone binary directly through the legacy eager `src/index.ts`.
- `LOGINOM_AI_AGENT_CLI_PROFILE` selects an absolute profile; only the bootstrap sets internal `LOGINOM_AI_AGENT_CLI_ROOT` for Global and worker inheritance. Clear inherited Desktop auth/config/DB overrides before backend imports. Keep project config discovery, but omit the implicit home `.loginom-ai-agent` global fallback.
- Hold `.writer` until backend and private host cleanup completes. Never steal a guard based on age/PID, and leave it after unconfirmed cleanup. `loginom recover` must not remove it.
- The current entry handles help/version and Loginom setup/check/status/cancel-pending/recover through the private Node host. `setup --stdin-json` preserves absent secrets and treats an explicit empty password separately. Interactive prompts send output to stderr and mask secrets; noninteractive setup requires stdin JSON, recovery requires `--acknowledge`. Never route prompt stdin into setup. TTY acceptance remains pending.
- `providers` (`auth`) and `models` use existing backend commands in the guarded CLI profile without starting a Loginom host. Live OAuth/TTY acceptance remains pending.
- Development runs require `LOGINOM_AI_AGENT_CLI_BUNDLE` with `bin/node` and built `host/node-host.mjs`; automatic installed bundle resolution remains pending. Default TUI dispatch and the private worker Loginom bridge are wired; PTY/TUI acceptance remains pending. `run` now performs Loginom preflight before the existing v1 RunCommand. Cleanup must abort the event subscription, dispose the loaded HttpApiApp web handler scope, dispose AppRuntime, disconnect the adapter and await Node host exit before releasing the guard. The standalone executable flushes stdout/stderr and explicitly exits only after that successful cleanup path; failed cleanup must retain the guard. Since 0.1.8, startup does not read system proxy settings; preserve explicit proxy environment as in OpenCode. Do not report installed CLI acceptance from source process tests.

- Build standalone native entry with `bun script/build.ts --standalone --single --skip-install` using the project-pinned Bun. Output is isolated in `dist-standalone`; this is not the complete Loginom resource archive. Model snapshot is embedded from Product pins.

## Database

- **Schema**: Drizzle schema lives in `packages/core/src/**/*.sql.ts`.
- **Migrations**: database migrations live in `packages/core` and are applied by core.

## Development server

- Running `bun dev` from `packages/agent` starts the live interactive TUI. Do not run it as a blocking foreground command when you need to inspect the result.
- Start it in `tmux` instead: `tmux new-session -d -s opencode-dev 'bun dev'`.
- Capture the current TUI output with: `tmux capture-pane -pt opencode-dev`.
- Stop the session explicitly when done: `tmux kill-session -t opencode-dev`.

# Module shape

Do not use `export namespace Foo { ... }` for module organization. It is not
standard ESM, it prevents tree-shaking, and it breaks Node's native TypeScript
runner. Use flat top-level exports combined with a self-reexport at the bottom
of the file:

```ts
// src/foo/foo.ts
export interface Interface { ... }
export class Service extends Context.Service<Service, Interface>()("@loginom-ai-agent/Foo") {}
export const layer = Layer.effect(Service, ...)
export const defaultLayer = layer.pipe(...)

export * as Foo from "./foo"
```

Consumers import the namespace projection:

```ts
import { Foo } from "@/foo/foo"

yield * Foo.Service
Foo.layer
Foo.defaultLayer
```

Namespace-private helpers stay as non-exported top-level declarations in the
same file — they remain inaccessible to consumers (they are not projected by
`export * as`) but are usable by the file's own code.

## When the file is an `index.ts`

If the module is `foo/index.ts` (single-namespace directory), use `"."` for
the self-reexport source rather than `"./index"`:

```ts
// src/foo/index.ts
export const thing = ...

export * as Foo from "."
```

## Multi-sibling directories

For directories with several independent modules (e.g. `src/session/`,
`src/config/`), keep each sibling as its own file with its own self-reexport,
and do not add a barrel `index.ts`. Consumers import the specific sibling:

```ts
import { SessionRetry } from "@/session/retry"
import { SessionStatus } from "@/session/status"
```

Barrels in multi-sibling directories force every import through the barrel to
evaluate every sibling, which defeats tree-shaking and slows module load.

# opencode Effect rules

Use these rules when writing or migrating Effect code.

See `specs/effect/migration.md` for the compact pattern reference and examples.

## Core

- Use `Effect.gen(function* () { ... })` for composition.
- Use `Effect.fn("Domain.method")` for named/traced effects and `Effect.fnUntraced` for internal helpers.
- `Effect.fn` / `Effect.fnUntraced` accept pipeable operators as extra arguments, so avoid unnecessary outer `.pipe()` wrappers.
- Use `Effect.callback` for callback-based APIs.
- Use `Effect.void` instead of `Effect.succeed(undefined)` or `Effect.succeed(void 0)`.
- Prefer `DateTime.nowAsDate` over `new Date(yield* Clock.currentTimeMillis)` when you need a `Date`.

## Module conventions

- In `src/config`, follow the existing self-export pattern at the top of the file (for example `export * as ConfigAgent from "./agent"`) when adding a new config module.

## Schemas and errors

- Use `Schema.Class` for multi-field data.
- Use branded schemas (`Schema.brand`) for single-value types.
- Use `Schema.TaggedErrorClass` for typed errors.
- Use `Schema.Defect` instead of `unknown` for defect-like causes.
- In `Effect.gen` / `Effect.fn`, prefer `yield* new MyError(...)` over `yield* Effect.fail(new MyError(...))` for direct early-failure branches.

## Runtime vs InstanceState

- Use `makeRuntime` (from `src/effect/run-service.ts`) for all services. It returns `{ runPromise, runFork, runCallback }` backed by a shared `memoMap` that deduplicates layers.
- Use `InstanceState` (from `src/effect/instance-state.ts`) for per-directory or per-project state that needs per-instance cleanup. It uses `ScopedCache` keyed by directory — each open project gets its own state, automatically cleaned up on disposal.
- If two open directories should not share one copy of the service, it needs `InstanceState`.
- Do the work directly in the `InstanceState.make` closure — `ScopedCache` handles run-once semantics. Don't add fibers, `ensure()` callbacks, or `started` flags on top.
- Use `Effect.addFinalizer` or `Effect.acquireRelease` inside the `InstanceState.make` closure for cleanup (subscriptions, process teardown, etc.).
- Use `Effect.forkScoped` inside the closure for background stream consumers — the fiber is interrupted when the instance is disposed.
- To make a service's `init()` non-blocking, fork `InstanceState.get(state)` at the `init()` call site (e.g. `Effect.forkIn(scope)`), not by forking work inside the `InstanceState.make` closure. Forking inside the closure leaves state incomplete for other methods that read it.
- `src/project/bootstrap.ts` already wraps every service `init()` in `Effect.forkDetach`, so `init()` is fire-and-forget in production. Keep `init()` methods synchronous internally; the caller controls concurrency.

## Effect v4 beta API

- `Effect.fork` and `Effect.forkDaemon` do not exist. Use `Effect.forkIn(scope)` to fork a fiber into a specific scope.

## Preferred Effect services

- In effectified services, prefer yielding existing Effect services over dropping down to ad hoc platform APIs.
- Prefer `FileSystem.FileSystem` instead of raw `fs/promises` for effectful file I/O.
- Prefer `ChildProcessSpawner.ChildProcessSpawner` with `ChildProcess.make(...)` instead of custom process wrappers.
- Prefer `HttpClient.HttpClient` instead of raw `fetch`.
- Prefer `Path.Path`, `Config`, `Clock`, and `DateTime` when those concerns are already inside Effect code.
- For background loops or scheduled tasks, use `Effect.repeat` or `Effect.schedule` with `Effect.forkScoped` in the layer definition.

## Effect.cached for deduplication

Use `Effect.cached` when multiple concurrent callers should share a single in-flight computation rather than storing `Fiber | undefined` or `Promise | undefined` manually. See `specs/effect/migration.md` for the full pattern.

## Callback boundaries

Use `EffectBridge` for native or external callbacks (`@parcel/watcher`, `node-pty`, native `fs.watch`, plugin callbacks, etc.) that need to re-enter Effect services with instance/workspace context.

Plain async code should pass explicit context or stay inside an Effect fiber; do not add ambient instance context shims.

## Loginom tools and ChatGPT compatibility

- `src/session/tools.ts` admits host-owned `loginom_` tools. Keep host credentials/context tokens out of model parameters and preserve original-user attachment admission; see [host contracts](../loginom-host/AGENTS.md).
- `src/provider/transform.ts` adapts provider-facing JSON Schema. OpenAI rejects structured array/object values inside enums: retain usable types/items and describe allowed structured values while leaving original Dock execution validation intact. Do not infer every nonnumeric const as string.
- Run `bun test test/provider/transform.test.ts` and `bun typecheck` here after schema changes. Real installed ChatGPT acceptance uses desktop `test/loginom/chatgpt-schema.mjs`, all actual Dock tools and an isolated profile; do not expose OAuth data.
- OAuth errors in `src/plugin/openai/codex.ts` expose only status and allowlisted error codes. Proxy behavior currently follows explicit environment as in OpenCode. Do not reintroduce automatic OS proxy import or model-only routing without implementing the separately documented design.
- See [schema acceptance report](../../docs/testing/loginom-ai-agent/reports/2026-09-17-schema/report.md) and [proxy acceptance](../../docs/testing/loginom-ai-agent/reports/2026-09-17-proxy/report.md).

- Preserve typed permission rejection as tool-state `metadata.permissionDenied` before provider serialization. Standalone noninteractive run must return 1 for this marker even without `permission.asked`; explicit auto-approval never overrides a policy deny.

- Loginom MCP `isError` must become a tool error, matching ordinary MCP catalog behavior. Preserve the bounded error text and generation/isError metadata; do not record it as a successful completed tool part.
- When backend truncation omits an oversized Loginom receipt, preserve its control summary (status, error, node, execution and next_step) and explicitly mark table data omitted. Keep the complete original in local tool-output storage; do not present a cropped exact table as complete or suggest repeating mutations merely to recover omitted text.

- Loginom acquire/catalog/attachment-admission failures must reach the model with the preparation stage and an allowlisted Host error code. Do not advertise availability after a failed preparation or claim that a chat attachment was admitted/uploaded. Retry preparation at the ordinary subsequent turn boundary; never synthesize attachment authorization or expose raw credential-bearing errors.

- Loginom preflight is mandatory for standalone run, while TUI without setup offers the shared interactive wizard and can continue an ordinary chat. Resume stdin after Clack/readline prompts before starting the TUI. Do not advertise Loginom tools without an active connection.

- Standalone run must evaluate terminal tool outcomes before idle success. Correlate Loginom repairs by tool + operation_id, otherwise by tool + exact canonical arguments. Unrelated success must not clear failures; invalid remains unresolved without an explicit repair relationship. Keep permission/session errors independent and legacy exit behavior unchanged.

- Standalone full-file user references are persisted as byte snapshots before Loginom admission; references with URL query/range or fragment remain references and do not authorize whole-file transfer. `util/file-snapshot.ts` supplies bounded regular-file reads for this path and `run --file`, rejects FIFO without waiting for a writer, and detects size/mtime changes during the read. Do not snapshot paths returned by model tools as original user attachments.

- For standalone run, bootstrap owns the SIGINT handler through profile release. The shared cancellation signal survives startup/import boundaries; stdin admission and provider dispatch check it before starting work. Command-specific interruption still aborts active sessions. Repeated signals must not force an exit during acknowledged host cleanup, and failed cleanup must still retain the guard.

- Standalone native builds can select exactly one `--target=linux-x64`, `--target=darwin-arm64` or `--target=win32-x64`; do not combine with --single/--baseline. Cross-compilation requires matching optional native build packages from the existing lockfile. A produced PE/Mach-O binary alone is not a complete Loginom resource distribution or native runtime acceptance.

- Windows profile admission calls `profile-windows.ts` before creating `.writer`: empty directories get a protected current-user ACL; existing descendants require current-user ownership/full access and reject other ACEs or reparse points. Existing profile permissions are never recursively repaired. Native PowerShell/NTFS acceptance remains pending; Linux tests prove only platform rejection and unchanged Linux admission.

- POSIX profile admission rejects a root or primary storage directory owned by another UID or accessible to group/others. Root is checked before guard creation; storage is checked before backend admission. Do not silently chmod an existing shared profile. This checks Unix mode bits, not extended ACLs or concurrent same-UID replacement.
