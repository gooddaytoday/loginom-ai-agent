import { Cause, Effect, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { createHash } from "node:crypto"
import { isAbsolute, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { AppProcess } from "@loginom-ai-agent/core/process"
import { FSUtil } from "@loginom-ai-agent/core/fs-util"
import { PermissionV1 } from "@loginom-ai-agent/core/v1/permission"
import { verifyBundledSkills } from "@loginom-ai-agent/loginom-host/bundled-skills"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { InstanceState } from "@/effect/instance-state"
import { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Session } from "@/session/session"
import { TaskScope } from "@/session/task-scope"
import { Tool } from "./tool"
import { assertExternalDirectoryEffect } from "./external-directory"

export const Parameters = Schema.Union([
  Schema.Struct({ operation: Schema.Literal("validate"), spec: Schema.String }),
  Schema.Struct({
    operation: Schema.Literal("generate"),
    spec: Schema.optional(Schema.String),
    preset: Schema.optional(Schema.Literal("retail")),
    params: Schema.optional(Schema.String),
    name: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    operation: Schema.Literal("inspect"),
    lgp: Schema.String,
    name: Schema.optional(Schema.String),
  }),
])

export const SyntheticDataTool = Tool.define(
  "synthetic_data_run",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const sessions = yield* Session.Service
    const appProcess = yield* AppProcess.Service
    const flags = yield* RuntimeFlags.Service
    const agents = yield* Agent.Service

    return {
      description:
        "Validate, generate or inspect a deterministic synthetic dataset in the session directory. Generated files are not Loginom inputs until the user attaches them.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (ctx.abort.aborted) return yield* Effect.die(AppProcess.abortError(ctx.abort))
          if (params.operation === "generate" && !!params.spec === !!params.preset)
            return yield* Effect.die(Error("SYNTHETIC_DATA_ARGUMENTS_INVALID"))
          if (params.operation === "generate" && params.params && params.params.length > 8000)
            return yield* Effect.die(Error("SYNTHETIC_DATA_ARGUMENTS_INVALID"))
          const instance = yield* InstanceState.context
          const session = yield* sessions.get(ctx.sessionID)
          const directory = yield* fs.realPath(session.directory)
          const rules = Permission.merge((yield* agents.get(ctx.agent)).permission, session.permission ?? [])
          const source = params.operation === "inspect" ? params.lgp : params.spec
          const resolved = source ? yield* admitSource(fs, sessions, ctx, session, rules, directory, source, params.operation === "inspect") : undefined
          const requestedName = params.operation === "validate" ? undefined : params.name
          const named = requestedName ?? (params.operation === "generate" && resolved ? yield* specName(fs, resolved) : undefined)
          const folder = folderName(named ?? (params.operation === "inspect" ? "inspect" : "retail"))
          if (!folder) return yield* Effect.die(Error("SYNTHETIC_DATA_ARGUMENTS_INVALID"))
          const output = params.operation === "validate" ? undefined : join(directory, "synthetic-data", folder)
          if (output) {
            const inside = relative(directory, output)
            if (inside.startsWith("..") || isAbsolute(inside)) return yield* Effect.die(Error("SYNTHETIC_DATA_OUTPUT_ESCAPE"))
            if (yield* fs.stat(output).pipe(Effect.as(true), Effect.catch(() => Effect.succeed(false))))
              return yield* Effect.die(Error("SYNTHETIC_DATA_OUTPUT_COLLISION"))
            yield* ctx.ask({
              permission: "edit",
              patterns: [relative(instance.worktree, output) + "/*"],
              always: [relative(instance.worktree, output) + "/*"],
              metadata: { filepath: output },
            })
          }
          const executor = yield* requireExecutor(fs, flags.loginomResources)
          const result = yield* appProcess.run(
            ChildProcess.make(
              executor.node,
              [
                executor.script,
                params.operation,
                "--directory",
                directory,
                ...(resolved && params.operation !== "inspect" ? ["--spec", resolved] : []),
                ...(params.operation === "inspect" && resolved ? ["--lgp", resolved] : []),
                ...(params.operation === "generate" && params.preset ? ["--preset", params.preset] : []),
                ...(params.operation === "generate" && params.params ? ["--params", params.params] : []),
                ...(output ? ["--name", folder] : []),
              ],
              { cwd: directory, env: { LANG: "C.UTF-8" }, extendEnv: false },
            ),
            { signal: ctx.abort, timeout: "60 seconds", maxOutputBytes: 64 * 1024, maxErrorBytes: 8 * 1024 },
          )
          if (result.exitCode !== 0 || result.stdoutTruncated || result.stderrTruncated)
            return yield* Effect.die(Error(knownError(result.stderr.toString("utf8"))))
          const response = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(result.stdout.toString("utf8")).pipe(
            Effect.catch(() => Effect.die(Error("SYNTHETIC_DATA_OUTPUT_INVALID"))),
          )
          if (!response || typeof response !== "object" || Array.isArray(response) || !("ok" in response))
            return yield* Effect.die(Error("SYNTHETIC_DATA_OUTPUT_INVALID"))
          if (response.ok === true && output) yield* expectInside(fs, output, outputPaths(response))
          return { title: "Синтетические данные: " + params.operation, output: JSON.stringify(response), metadata: { truncated: false } }
        }).pipe(Effect.orDie),
    }
  }),
)

const admitSource = Effect.fn("SyntheticData.admitSource")(function* (
  fs: FSUtil.Interface,
  sessions: Session.Interface,
  ctx: Tool.Context,
  session: { id: string; revert?: Parameters<typeof TaskScope.visible>[0]["revert"] },
  rules: PermissionV1.Ruleset,
  directory: string,
  source: string,
  packageFile: boolean,
) {
  const instance = yield* InstanceState.context
  const requested = isAbsolute(source) ? source : join(directory, source)
  const path = yield* fs.realPath(requested)
  const inside = relative(directory, path)
  if (packageFile) {
    const history = yield* sessions.messages({ sessionID: ctx.sessionID })
    const attachments = TaskScope.visible({ sessionID: ctx.sessionID, messages: history, revert: session.revert })
      .filter((message) => message.info.role === "user" && !TaskScope.replayOf(message))
      .flatMap((message) => message.parts.filter((part) => part.type === "file"))
    const attached = yield* Effect.forEach(attachments, (part) =>
      Effect.gen(function* () {
        const url = URL.parse(part.url)
        if (!url || url.protocol !== "file:" || url.search || url.hash) return false
        return (yield* fs.realPath(fileURLToPath(url)).pipe(Effect.orElseSucceed(() => undefined))) === path
      }),
    )
    if (!attached.some(Boolean))
      yield* assertExternalDirectoryEffect(ctx, path).pipe(Effect.catchCause((cause) => rejectRead(cause)))
  }
  if (inside.startsWith("..") || isAbsolute(inside))
    yield* assertExternalDirectoryEffect(ctx, path).pipe(Effect.catchCause((cause) => rejectRead(cause)))
  const decision = Permission.evaluate("read", relative(instance.worktree, path), rules).action
  if (decision === "deny") return yield* Effect.die(new PermissionV1.RejectedError())
  if (decision === "ask")
    yield* ctx.ask({
      permission: "read",
      patterns: [relative(instance.worktree, path)],
      always: ["*"],
      metadata: { filepath: path },
    }).pipe(Effect.catchCause((cause) => rejectRead(cause)))
  return path
})

function rejectRead(cause: Cause.Cause<unknown>) {
  if (Cause.squash(cause) instanceof PermissionV1.RejectedError) return Effect.die(new PermissionV1.RejectedError())
  return Effect.failCause(cause)
}

const specName = Effect.fn("SyntheticData.specName")(function* (fs: FSUtil.Interface, path: string) {
  const value: unknown = yield* fs.readJson(path).pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (!value || typeof value !== "object" || Array.isArray(value) || !("name" in value) || typeof value.name !== "string") return
  return value.name
})

function outputPaths(response: object) {
  const record = response as Record<string, unknown>
  return ["manifest", "draft", "imports"].flatMap((key) => typeof record[key] === "string" ? [record[key]] : [])
    .concat(Array.isArray(record.files) ? record.files.filter((item): item is string => typeof item === "string") : [])
}

const expectInside = Effect.fn("SyntheticData.expectInside")(function* (fs: FSUtil.Interface, output: string, paths: string[]) {
  if (!paths.length || paths.some((path) => {
    const inside = relative(output, path)
    return inside.startsWith("..") || isAbsolute(inside)
  })) return yield* Effect.die(Error("SYNTHETIC_DATA_OUTPUT_INVALID"))
  yield* Effect.forEach(paths, (path) =>
    Effect.gen(function* () {
      if ((yield* fs.stat(path)).type !== "File" || (yield* fs.realPath(path)) !== path)
        return yield* Effect.die(Error("SYNTHETIC_DATA_OUTPUT_INVALID"))
    }),
  ).pipe(Effect.catch(() => Effect.die(Error("SYNTHETIC_DATA_OUTPUT_INVALID"))))
})

function folderName(value: string) {
  const cleaned = value.trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 64)
  if (!/^[\p{L}\p{N}_-]{1,64}$/u.test(cleaned)) return
  return cleaned
}

function knownError(stderr: string) {
  const code = stderr.trim()
  return /^SYNTHETIC_DATA_[A-Z_]+\s*$/.test(code) ? code.trim() : "SYNTHETIC_DATA_FAILED"
}

const requireExecutor = Effect.fn("SyntheticData.requireExecutor")(function* (fs: FSUtil.Interface, resources?: string) {
  if (!resources) return yield* Effect.die(Error("SYNTHETIC_DATA_RESOURCES_MISSING"))
  const root = yield* fs.realPath(resources)
  const skills = yield* Effect.tryPromise(() => verifyBundledSkills(root)).pipe(
    Effect.catch(() => Effect.die(Error("SYNTHETIC_DATA_RESOURCES_INVALID"))),
  )
  if (!skills.some((skill) => skill.name === "synthetic-data" && skill.files.some((file) => file.path === "skills/synthetic-data/scripts/synthetic-data.mjs")))
    return yield* Effect.die(Error("SYNTHETIC_DATA_RESOURCES_INVALID"))
  const manifest = yield* Schema.decodeUnknownEffect(Schema.Struct({
    protocol: Schema.Literal(1),
    node: Schema.Union([Schema.Literal("bin/node"), Schema.Literal("bin/node.exe")]),
    files: Schema.Array(Schema.Struct({ path: Schema.String, sha256: Schema.String })),
  }))(yield* fs.readJson(join(root, "resource-manifest.json")))
  const node = yield* fs.realPath(join(root, manifest.node))
  const inside = relative(root, node)
  const entry = manifest.files.find((file) => file.path === manifest.node)
  if (!entry || isAbsolute(inside) || inside === ".." || inside.startsWith(".." + sep) || createHash("sha256").update(yield* fs.readFile(node)).digest("hex") !== entry.sha256)
    return yield* Effect.die(Error("SYNTHETIC_DATA_RESOURCES_INVALID"))
  return { node, script: join(root, "skills/synthetic-data/scripts/synthetic-data.mjs") }
})
