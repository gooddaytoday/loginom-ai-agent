import { mkdtemp, realpath, rm } from "node:fs/promises"
import { join } from "node:path"
import { preparePublish, finishPublish, outputText } from "@loginom-ai-agent/dashboard/agent/publish"
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
          return { title: "Черновик dashboard", output, metadata: { truncated: false } }
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
      description: "Build this dashboard and publish the approved build to the local stand. Request only when the user explicitly asks to publish. Takes no arguments.",
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
              const cancelled = Effect.callback<never>(resume => {
                const abort = () => resume(Effect.interrupt)
                if (ctx.abort.aborted) return abort()
                ctx.abort.addEventListener("abort", abort, { once: true })
                return Effect.sync(() => ctx.abort.removeEventListener("abort", abort))
              })
              yield* Effect.raceFirst(ctx.ask({
                permission: "dashboard_publish",
                patterns: [prepared.control.nodeName, prepared.control.binding.packagePath],
                always: [], metadata: {},
              }), cancelled)
              ctx.abort.throwIfAborted()
              return yield* Effect.uninterruptible(Effect.promise(() => finishPublish({ work, ...prepared })))
            }),
            operation => Effect.tryPromise(() => rm(operation, { recursive: true, force: true })).pipe(Effect.ignore),
          )
          const output = outputText(Buffer.from(result.status + ": " + result.text))
          return { title: "Публикация dashboard", output, metadata: { truncated: false } }
        }).pipe(Effect.orDie),
    }
  }),
)
