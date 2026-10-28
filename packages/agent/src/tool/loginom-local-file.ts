import { Cause, Effect } from "effect"
import { basename, dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { FSUtil } from "@loginom-ai-agent/core/fs-util"
import { PermissionV1 } from "@loginom-ai-agent/core/v1/permission"
import { Agent } from "@/agent/agent"
import { InstanceState } from "@/effect/instance-state"
import { Permission } from "@/permission"
import { containsPath } from "@/project/instance-context"
import { Session } from "@/session/session"
import { TaskScope } from "@/session/task-scope"
import { Tool } from "./tool"
import { assertExternalDirectoryEffect } from "./external-directory"
import { fileSnapshot } from "@/util/file-snapshot"
import { fileError, hostErrorText } from "@loginom-ai-agent/loginom-host/errors"
import { Global } from "@loginom-ai-agent/core/global"
import {
  inspectReferenceFile,
  stageReferenceFile,
  type FileReference,
  type ReferenceSlot,
} from "@loginom-ai-agent/loginom-host/file-reference"
import { exactFileDigest } from "./loginom-file-profile-core"

const attachmentHint = ". Для CLI передайте файл через --file; в Desktop/TUI приложите файл к сообщению."

// Large files cross private IPC only as immutable Host-reserved references.
export const admitLoginomFileReference = Effect.fn("Loginom.admitFileReference")(function* (
  path: string,
  ctx: Tool.Context,
  host: {
    reserveReference(userMessage: string, name: string): Promise<ReferenceSlot>
    admitReference(reference: FileReference): Promise<unknown>
    discardReference(grant: string): Promise<unknown>
  },
  userMessage: string,
  authorized?: { sourcePath: string; canonicalPath: string },
) {
  const source = authorized ?? (yield* authorizeLoginomFile(path, ctx))
  return yield* Effect.tryPromise({
    try: async (signal) => {
      const abort = AbortSignal.any([ctx.abort, signal])
      const identity = await inspectReferenceFile(source.sourcePath)
      if (identity.canonical_path !== source.canonicalPath) throw Error("LOGINOM_FILE_CHANGED")
      const sha256 = await exactFileDigest(identity, join(Global.Path.data, "file-profiles", ctx.sessionID))
      if (abort.aborted) throw Error("LOGINOM_UPLOAD_CANCELLED")
      const slot = await host.reserveReference(userMessage, basename(source.canonicalPath))
      const reference = await stageReferenceFile(source.sourcePath, identity, slot, { sha256, signal: abort }).catch(
        async (error) => {
          // No upload was dispatched. Keep the original typed file/cancel cause;
          // Host shutdown retains responsibility for an unremoved reservation.
          await host.discardReference(slot.grant).catch(() => undefined)
          throw error
        },
      )
      if (abort.aborted) {
        await host.discardReference(slot.grant)
        throw Error("LOGINOM_UPLOAD_CANCELLED")
      }
      // Once commit starts its reply may be lost. Retain the snapshot for an
      // exact retry or confirmed Host shutdown rather than deleting it here.
      const artifact = await host.admitReference(reference)
      return { sourcePath: source.sourcePath, artifact }
    },
    catch: (error) => Error(hostErrorText(fileError(error)) + " Путь: " + source.sourcePath),
  })
})

type ReferenceHost = Parameters<typeof admitLoginomFileReference>[2]
const admittedReferences = new WeakMap<ReferenceHost, Map<string, { sourcePath: string; artifact: unknown }>>()

export const admitLoginomLocalFile = Effect.fn("Loginom.admitLocalFile")(function* (
  path: string,
  ctx: Tool.Context,
  host: ReferenceHost & { admit(userMessage: string, files: { name: string; data: string }[]): Promise<unknown> },
  userMessage: string,
) {
  const source = yield* authorizeLoginomFile(path, ctx)
  if (source.canonicalPath.toLowerCase().endsWith(".lgp"))
    return yield* Effect.die(
      Error("Use loginom_dock_prepare with local_package_path for a local .lgp: " + source.sourcePath),
    )
  const identity = yield* Effect.tryPromise({
    try: () => inspectReferenceFile(source.canonicalPath),
    catch: (error) => Error(hostErrorText(fileError(error)) + " Путь: " + source.sourcePath),
  })
  if (identity.size > 16 * 1024 * 1024) {
    const key = JSON.stringify([ctx.sessionID, userMessage, identity])
    const cache = admittedReferences.get(host) ?? new Map()
    admittedReferences.set(host, cache)
    const previous = cache.get(key)
    if (previous) return previous
    const result = yield* admitLoginomFileReference(path, ctx, host, userMessage, source)
    cache.set(key, result)
    return result
  }
  const bytes = yield* Effect.tryPromise({
    try: () => fileSnapshot(source.canonicalPath, 16 * 1024 * 1024),
    catch: (error) => Error(hostErrorText(error) + " Путь: " + source.sourcePath),
  })
  const artifacts = yield* Effect.tryPromise({
    try: () =>
      host.admit(JSON.stringify(["local-file", ctx.messageID, ctx.callID]), [
        { name: basename(source.canonicalPath), data: bytes.toString("base64") },
      ]),
    catch: (error) => Error(hostErrorText(error)),
  })
  if (!Array.isArray(artifacts) || artifacts.length !== 1)
    return yield* Effect.die(Error("LOGINOM_INPUT_INVALID: " + source.sourcePath))
  return { sourcePath: source.sourcePath, artifact: artifacts[0] as unknown }
})

export const snapshotLoginomFile = Effect.fn("Loginom.snapshotLocalFile")(function* (path: string, ctx: Tool.Context) {
  const source = yield* authorizeLoginomFile(path, ctx)
  const bytes = yield* Effect.tryPromise({
    try: () => fileSnapshot(source.canonicalPath, 16 * 1024 * 1024),
    catch: (error) => Error(hostErrorText(error) + " Путь: " + source.sourcePath),
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
  const canonicalPath = yield* fs
    .realPath(sourcePath)
    .pipe(Effect.mapError((error) => Error(hostErrorText(fileError(error)) + " Путь: " + sourcePath)))
  yield* checkDeny(canonicalPath)
  if (
    (yield* fs
      .stat(canonicalPath)
      .pipe(Effect.mapError((error) => Error(hostErrorText(fileError(error)) + " Путь: " + sourcePath)))).type !==
    "File"
  )
    return yield* Effect.die(Error(hostErrorText("LOGINOM_FILE_NOT_REGULAR") + " Путь: " + sourcePath))
  yield* fs
    .access(canonicalPath, { readable: true })
    .pipe(Effect.mapError((error) => Error(hostErrorText(fileError(error)) + " Путь: " + sourcePath)))
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
    return hostErrorText("LOGINOM_FILE_ACCESS_DENIED") + " " + super.message + " Путь: " + this.path
  }
}

class LocalFileRejected extends PermissionV1.RejectedError {
  constructor(readonly path: string) {
    super()
  }
  override get message() {
    return hostErrorText("LOGINOM_FILE_ACCESS_DENIED") + " " + super.message + " Путь: " + this.path + attachmentHint
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
    return hostErrorText("LOGINOM_FILE_ACCESS_DENIED") + " " + super.message + " Путь: " + this.path + attachmentHint
  }
}
