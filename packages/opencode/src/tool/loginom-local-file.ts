import { Cause, Effect } from "effect"
import { basename, dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Agent } from "@/agent/agent"
import { InstanceState } from "@/effect/instance-state"
import { Permission } from "@/permission"
import { containsPath } from "@/project/instance-context"
import { Session } from "@/session/session"
import { TaskScope } from "@/session/task-scope"
import { Tool } from "./tool"
import { assertExternalDirectoryEffect } from "./external-directory"
import { fileSnapshot } from "@/util/file-snapshot"

const attachmentHint = ". Для CLI передайте файл через --file; в Desktop/TUI приложите файл к сообщению."

export const snapshotLoginomFile = Effect.fn("Loginom.snapshotLocalFile")(function* (path: string, ctx: Tool.Context) {
  const source = yield* authorizeLoginomFile(path, ctx)
  const bytes = yield* Effect.tryPromise({
    try: () => fileSnapshot(source.canonicalPath, 16 * 1024 * 1024),
    catch: (error) => Error(`${error instanceof Error ? error.message : String(error)} Путь: ${source.sourcePath}`),
  })
  return {
    sourcePath: source.sourcePath,
    file: { name: basename(source.canonicalPath), data: bytes.toString("base64") },
  }
})

export const authorizeLoginomFile = Effect.fn("Loginom.authorizeLocalFile")(function* (
  path: string,
  ctx: Tool.Context,
) {
  ctx.abort.throwIfAborted()
  const fs = yield* FSUtil.Service
  const sessions = yield* Session.Service
  const agents = yield* Agent.Service
  const instance = yield* InstanceState.context
  const session = yield* sessions.get(ctx.sessionID)
  const sourcePath = resolve(session.directory, path)
  const rules = Permission.merge((yield* agents.get(ctx.agent)).permission, session.permission ?? [])
  const checkDeny = (target: string) =>
    Effect.gen(function* () {
      if (
        Permission.evaluate("read", relative(instance.worktree, target), rules).action !== "deny" &&
        (containsPath(target, instance) ||
          Permission.evaluate("external_directory", join(dirname(target), "*").replaceAll("\\", "/"), rules).action !==
            "deny")
      )
        return
      yield* ctx.metadata({ metadata: { permissionDenied: true } })
      return yield* Effect.die(new LocalFileDenied(sourcePath, rules))
    })
  yield* checkDeny(sourcePath)
  const canonicalPath = yield* fs.realPath(sourcePath)
  yield* checkDeny(canonicalPath)
  if ((yield* fs.stat(canonicalPath)).type !== "File")
    return yield* Effect.die(Error("Путь указывает на каталог или специальный файл: " + sourcePath))
  yield* fs.access(canonicalPath, { readable: true })
  const history = yield* sessions.messages({ sessionID: ctx.sessionID })
  const attachments = TaskScope.visible({ sessionID: ctx.sessionID, messages: history, revert: session.revert })
    .filter((message) => message.info.role === "user" && !TaskScope.replayOf(message))
    .flatMap((message) => message.parts.filter((part) => part.type === "file"))
  const attached = yield* Effect.forEach(attachments, (part) =>
    Effect.gen(function* () {
      const url = URL.parse(part.url)
      if (!url || url.protocol !== "file:" || url.search || url.hash) return false
      return (yield* fs.realPath(fileURLToPath(url)).pipe(Effect.orElseSucceed(() => undefined))) === canonicalPath
    }),
  )
  if (!attached.some(Boolean))
    yield* Effect.gen(function* () {
      yield* assertExternalDirectoryEffect(ctx, canonicalPath)
      yield* ctx.ask({
        permission: "read",
        patterns: [...new Set([sourcePath, canonicalPath].map((path) => relative(instance.worktree, path)))],
        always: ["*"],
        metadata: { filepath: canonicalPath },
      })
    }).pipe(Effect.catchCause((cause) => localFilePermissionFailure(sourcePath, cause, ctx)))
  return { sourcePath, canonicalPath }
})

export function localFilePermissionFailure(path: string, cause: Cause.Cause<unknown>, ctx: Tool.Context) {
  const error = Cause.squash(cause)
  if (error instanceof PermissionV1.RejectedError) return Effect.die(new LocalFileRejected(path))
  if (error instanceof PermissionV1.DeniedError) return Effect.die(new LocalFileDenied(path, error.ruleset))
  if (error instanceof PermissionV1.CorrectedError)
    return ctx
      .metadata({ metadata: { permissionDenied: true } })
      .pipe(Effect.andThen(Effect.die(new LocalFileCorrected(path, error.feedback))))
  return Effect.failCause(cause)
}

class LocalFileDenied extends PermissionV1.DeniedError {
  constructor(
    readonly path: string,
    ruleset: PermissionV1.Ruleset,
  ) {
    super({ ruleset })
  }
  override get message() {
    return super.message + " Путь: " + this.path
  }
}

class LocalFileRejected extends PermissionV1.RejectedError {
  constructor(readonly path: string) {
    super()
  }
  override get message() {
    return super.message + " Путь: " + this.path + attachmentHint
  }
}

class LocalFileCorrected extends PermissionV1.CorrectedError {
  constructor(
    readonly path: string,
    feedback: string,
  ) {
    super({ feedback })
  }
  override get message() {
    return super.message + " Путь: " + this.path + attachmentHint
  }
}
