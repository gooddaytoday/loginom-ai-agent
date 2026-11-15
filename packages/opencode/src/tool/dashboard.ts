import { mkdtemp, realpath, rm } from "node:fs/promises"
import { join } from "node:path"
import { preparePublish, finishPublish, outputText } from "@loginom-ai-agent/dashboard/agent/publish"
import { LoginomHost } from "@loginom-ai-agent/loginom-host/adapter"
import { hostErrorText } from "@loginom-ai-agent/loginom-host/errors"
import { PublicationSource } from "@loginom-ai-agent/dashboard/contract/publication"
import { Effect, Schema } from "effect"
import { dashboardResources } from "@loginom-ai-agent/dashboard/agent/resources"
import { draftDashboard } from "@loginom-ai-agent/dashboard/agent/draft"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Session } from "@/session/session"
import { Tool } from "./tool"

const Parameters = Schema.Struct({})

export const DashboardDraftTool = Tool.define(
  "dashboard_draft",
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const flags = yield* RuntimeFlags.Service
    return {
      description:
        "Build the dashboard draft from src/ of this dashboard folder, serve it on localhost and check the page. Returns the link for the user and the check results. Takes no arguments.",
      parameters: Parameters,
      execute: (_params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const session = yield* sessions.getForExecution(ctx.sessionID)
          const resources = dashboardResources(flags.loginomResources)
          const output = yield* Effect.promise(() => draftDashboard({ work: session.directory, resources, signal: ctx.abort }))
          return { title: "Черновик dashboard", output: outputText(Buffer.from(output)), metadata: { truncated: false } }
        }).pipe(Effect.orDie),
    }
  }),
)

export const DashboardPublishTool = Tool.define(
  "dashboard_publish",
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const flags = yield* RuntimeFlags.Service
    return {
      description: "Build this dashboard and send the approved sources to Loginom for publication. Request only when the user explicitly asks to publish. Takes no arguments.",
      parameters: Parameters,
      execute: (_params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const session = yield* sessions.getForExecution(ctx.sessionID)
          const resources = dashboardResources(flags.loginomResources)
          const work = yield* Effect.promise(() => realpath(session.directory))
          const result = yield* Effect.acquireUseRelease(
            Effect.promise(() => mkdtemp(join(work, "../control/.publish-"))),
            operation => Effect.gen(function* () {
              const prepared = yield* Effect.uninterruptible(Effect.promise(() =>
                preparePublish({ work, operation, resources, signal: ctx.abort }),
              ))
              if (!prepared.ok) return { status: "failed", text: prepared.text }
              const latest = yield* Effect.uninterruptible(Effect.tryPromise({ try: () => dashboardOperation(ctx, async host =>
                Schema.decodeUnknownSync(Schema.NullOr(PublicationSource), { onExcessProperty: "error" })(
                  await host.dashboardRead({ origin: prepared.control.origin, binding: prepared.control.binding }, ctx.abort),
                ),
              ), catch: error => error }).pipe(Effect.catch(error => Effect.die(Error(hostErrorText(error))))))
              const expected = latest?.version ?? null
              const cancelled = Effect.callback<never>(resume => {
                const abort = () => resume(Effect.interrupt)
                if (ctx.abort.aborted) return abort()
                ctx.abort.addEventListener("abort", abort, { once: true })
                return Effect.sync(() => ctx.abort.removeEventListener("abort", abort))
              })
              yield* Effect.raceFirst(ctx.ask({
                permission: "dashboard_publish",
                patterns: [prepared.control.nodeName, prepared.control.binding.packagePath],
                always: [], metadata: {
                  sourceHash: prepared.publication.sourceHash,
                  ...(expected && (prepared.control.base?.name !== expected.name || prepared.control.base.sourceHash !== expected.sourceHash)
                    ? { dashboardConflict: { base: prepared.control.base ?? null, latest: expected } } : {}),
                },
              }), cancelled)
              ctx.abort.throwIfAborted()
              return yield* Effect.uninterruptible(Effect.tryPromise({ try: () => finishPublish({
                work, ...prepared, expected, signal: ctx.abort,
                publish: (request, signal) => dashboardOperation(ctx, host => host.dashboardPublish(request, signal)),
              }), catch: error => error }).pipe(Effect.catch(error => Effect.succeed({ status: "failed", text: hostErrorText(error) }))))
            }),
            operation => Effect.tryPromise(() => rm(operation, { recursive: true, force: true })).pipe(Effect.ignore),
          )
          const output = outputText(Buffer.from(result.status + ": " + result.text))
          return { title: "Публикация dashboard", output, metadata: { truncated: false } }
        }).pipe(Effect.orDie),
    }
  }),
)

async function dashboardOperation<T>(ctx: Tool.Context, operation: (host: NonNullable<Awaited<ReturnType<typeof LoginomHost.acquire>>>) => Promise<T>) {
  ctx.abort.throwIfAborted()
  const host = await LoginomHost.acquire(ctx.sessionID)
  if (!host) throw Error("LOGINOM_HOST_NOT_READY")
  try {
    await host.scope("bind", { taskMessageID: ctx.messageID, profile: "loginom-dashboard" }, ctx.abort)
    return await operation(host)
  } finally {
    await host.release()
  }
}
