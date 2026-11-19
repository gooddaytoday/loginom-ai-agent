import { realpath } from "node:fs/promises"
import { preparePublish, finishPublish, outputText } from "@loginom-ai-agent/dashboard/agent/publish"
import { LoginomHost } from "@loginom-ai-agent/loginom-host/adapter"
import { hostErrorText } from "@loginom-ai-agent/loginom-host/errors"
import { PublicationSource } from "@loginom-ai-agent/dashboard/contract/publication"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Effect, Schema } from "effect"
import { dashboardResources } from "@loginom-ai-agent/dashboard/agent/resources"
import { readDashboardBinding, removeDashboard, withDashboardStage } from "@loginom-ai-agent/dashboard/agent/folder"
import { draftDashboard, revokeDashboardDraft } from "@loginom-ai-agent/dashboard/agent/draft"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Session } from "@/session/session"
import { DashboardSession } from "@/product/dashboard-session"
import { Tool } from "./tool"

const Parameters = Schema.Struct({})
const deleteTitle = "Удаление dashboard"

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
          const output = yield* Effect.promise(() => draftDashboard({
            work: session.directory, resources, signal: ctx.abort,
            expectedDraftId: ctx.dashboardWork && (ctx.dashboardWork.draftId ?? null),
          }))
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
          const prepared = yield* Effect.uninterruptible(Effect.promise(() => withDashboardStage(work, operation =>
            preparePublish({ work, operation, resources, signal: ctx.abort }),
          )))
          if (!prepared.ok) return publishResult("failed", prepared.text)
          if (ctx.dashboardWork && prepared.control.draftId !== ctx.dashboardWork.draftId)
            return yield* Effect.die(Error("LOGINOM_SCOPE_DENIED"))
          const latest = yield* Effect.uninterruptible(Effect.tryPromise({ try: () => dashboardOperation(ctx, async host =>
            Schema.decodeUnknownSync(Schema.NullOr(PublicationSource), { onExcessProperty: "error" })(
              await host.dashboardRead({ origin: prepared.control.origin, binding: prepared.control.binding }, ctx.abort),
            ),
          ), catch: error => error }).pipe(Effect.catch(error => Effect.die(Error(hostErrorText(error))))))
          const expected = latest?.version ?? null
          yield* Effect.raceFirst(ctx.ask({
            permission: "dashboard_publish",
            patterns: [prepared.control.nodeName, prepared.control.binding.packagePath],
            always: [], metadata: {
              sourceHash: prepared.publication.sourceHash,
              ...(expected && (prepared.control.base?.name !== expected.name || prepared.control.base.sourceHash !== expected.sourceHash)
                ? { dashboardConflict: { base: prepared.control.base ?? null, latest: expected } } : {}),
            },
          }), dashboardCancellation(ctx.abort))
          ctx.abort.throwIfAborted()
          yield* sessions.getForExecution(ctx.sessionID)
          const result = yield* Effect.uninterruptible(Effect.tryPromise({ try: () => finishPublish({
            work, publication: prepared.publication, control: prepared.control, expected, signal: ctx.abort,
            publish: (request, signal) => dashboardOperation(ctx, host => host.dashboardPublish(request, signal)),
          }), catch: error => error }).pipe(Effect.catch(error => Effect.succeed({ status: "failed", text: hostErrorText(error) }))))
          return publishResult(result.status, result.text)
        }).pipe(Effect.orDie),
    }
  }),
)

function publishResult(status: string, text: string) {
  const output = outputText(Buffer.from(status + ": " + text))
  return { title: "Публикация dashboard", output, metadata: { truncated: false } }
}

export const DashboardDeleteTool = Tool.define(
  "dashboard_delete",
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    return {
      description: "Delete this dashboard's published versions and local draft. Call only when the user explicitly asks to delete this dashboard. Takes no arguments.",
      parameters: Parameters,
      execute: (_params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const session = yield* sessions.getForExecution(ctx.sessionID)
          const root = DashboardSession.dashboardRoot()
          const control = yield* Effect.tryPromise(() => readDashboardBinding(session.directory, root)).pipe(
            Effect.catch(() => Effect.succeed(undefined)),
          )
          if (!control || (ctx.dashboardWork && control.draftId !== ctx.dashboardWork.draftId))
            return deleteOutput("Не удалось проверить привязку локального черновика. Удаление не началось.")
          const input = { origin: control.origin, binding: control.binding }
          const listed = yield* dashboardDeleteRequest(ctx, host => host.dashboardVersions(input, ctx.abort))
          if ("error" in listed) return deleteOutput(listed.error)

          return yield* Effect.uninterruptibleMask(restore => Effect.gen(function* () {
            let expected = listed.versions
            let confirmedRemoved = 0
            while (true) {
              yield* restore(Effect.raceFirst(ctx.ask({
                permission: "dashboard_delete",
                patterns: [control.nodeName, control.binding.packagePath],
                always: [],
                metadata: {
                  publicationCount: expected.length,
                  ...(confirmedRemoved > 0 ? { confirmedRemoved } : {}),
                },
              }), dashboardCancellation(ctx.abort))).pipe(
                Effect.catchDefect(error => Effect.die(
                  confirmedRemoved > 0 && error instanceof PermissionV1.RejectedError
                    ? new DashboardDeleteRejected(confirmedRemoved)
                    : error,
                )),
              )
              ctx.abort.throwIfAborted()
              const current = yield* sessions.getForExecution(ctx.sessionID).pipe(
                Effect.catch(() => Effect.succeed(undefined)),
                Effect.catchDefect(error => error instanceof Error && error.message === "LOGINOM_SCOPE_DENIED"
                  ? Effect.succeed(undefined)
                  : Effect.die(error)),
              )
              if (current?.directory !== session.directory) {
                const progress = confirmedRemoved ? ` Подтверждено удаление версий: ${confirmedRemoved}.` : ""
                return deleteOutput("Черновик удалён или пересоздан. Дальнейшее удаление остановлено." + progress)
              }
              const result = yield* dashboardDeleteRequest(ctx, host => host.dashboardDelete({
                ...input, generation: listed.generation, expected,
              }, ctx.abort))
              if ("error" in result) return deleteOutput(confirmedRemoved
                ? `${result.error} Подтверждено удаление версий: ${confirmedRemoved}. Локальный черновик сохранён.`
                : result.error)
              if (result.status === "changed") {
                confirmedRemoved += result.confirmedRemoved
                if (result.confirmedRemoved > 0)
                  yield* ctx.metadata({ title: deleteTitle, metadata: { confirmedRemoved } })
                expected = result.remaining
                continue
              }
              if (result.status === "failed") {
                const progress = `Подтверждено удаление версий: ${confirmedRemoved + result.confirmedRemoved}.`
                const remaining = result.remaining ? ` Текущий список содержит версий: ${result.remaining.length}.` : ""
                return deleteOutput(`${hostErrorText(result.reason)} ${progress}${remaining} Локальный черновик сохранён.`)
              }
              const cleaned = yield* Effect.try({
                try: () => {
                  ctx.abort.throwIfAborted()
                  removeDashboard(session.directory, root, control)
                },
                catch: () => undefined,
              }).pipe(Effect.as(true), Effect.catch(() => Effect.succeed(false)))
              if (!cleaned)
                return deleteOutput("На стенде подтверждено отсутствие опубликованных версий. Локальную папку черновика удалить не удалось.")
              yield* Effect.promise(() => revokeDashboardDraft(control.key))
              yield* sessions.retireDashboard(ctx.sessionID)
              return deleteOutput("Дашборд удалён. Опубликованных версий и локального черновика больше нет.", "deleted")
            }
          }))
        }).pipe(Effect.orDie),
    }
  }),
)

class DashboardDeleteRejected extends PermissionV1.RejectedError {
  constructor(readonly confirmedRemoved: number) {
    super()
  }

  override get message() {
    return `Дальнейшее удаление отменено. Подтверждено удаление версий: ${this.confirmedRemoved}. Локальный черновик сохранён.`
  }
}

function deleteOutput(output: string, status: "failed" | "deleted" = "failed") {
  return {
    title: deleteTitle,
    output,
    metadata: { truncated: false, ...(status === "deleted" ? { dashboardDeleted: true } : { isError: true }) },
  }
}

function dashboardDeleteRequest<T extends object>(
  ctx: Tool.Context,
  operation: (host: NonNullable<Awaited<ReturnType<typeof LoginomHost.acquire>>>) => Promise<T>,
) {
  return Effect.tryPromise({ try: () => dashboardOperation(ctx, operation), catch: error => error }).pipe(
    Effect.catch(error => Effect.succeed({ error: hostErrorText(error) })),
  )
}

function dashboardCancellation(signal: AbortSignal) {
  return Effect.callback<never>(resume => {
    const abort = () => resume(Effect.interrupt)
    if (signal.aborted) return abort()
    signal.addEventListener("abort", abort, { once: true })
    return Effect.sync(() => signal.removeEventListener("abort", abort))
  })
}

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
