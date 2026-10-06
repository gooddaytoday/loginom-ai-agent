import { Effect, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { createHash } from "node:crypto"
import { basename, dirname, extname, isAbsolute, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { AppProcess } from "@loginom-ai-agent/core/process"
import { FSUtil } from "@loginom-ai-agent/core/fs-util"
import { verifyBundledSkills } from "@loginom-ai-agent/loginom-host/bundled-skills"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { InstanceState } from "@/effect/instance-state"
import { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Session } from "@/session/session"
import { Tool } from "./tool"
import { assertExternalDirectoryEffect } from "./external-directory"

export const Parameters = Schema.Union([
  Schema.Struct({ operation: Schema.Literal("extract"), lgp: Schema.String }),
  Schema.Struct({ operation: Schema.Literal("skeleton"), lgp: Schema.String }),
  Schema.Struct({
    operation: Schema.Literal("emit"),
    lgp: Schema.String,
    format: Schema.optional(Schema.Literals(["pdf", "docx", "md"])),
  }),
])

export const PackageDocsTool = Tool.define(
  "package_docs_run",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const sessions = yield* Session.Service
    const appProcess = yield* AppProcess.Service
    const flags = yield* RuntimeFlags.Service
    const agents = yield* Agent.Service

    return {
      description:
        "Extract a local Loginom package, create its documentation draft or publish the completed report in the session directory. No Loginom connection or browser is required.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const session = yield* sessions.get(ctx.sessionID)
          const directory = yield* fs.realPath(session.directory)
          const requested = isAbsolute(params.lgp) ? params.lgp : join(directory, params.lgp)
          const lgp = yield* fs.realPath(requested)
          if (extname(lgp).toLowerCase() !== ".lgp") return yield* Effect.die(Error("PACKAGE_DOCS_LGP_REQUIRED"))
          const history = yield* sessions.messages({ sessionID: ctx.sessionID })
          const attachments = history
            .filter((message) => message.info.role === "user")
            .flatMap((message) => message.parts.filter((part) => part.type === "file"))
          const attached = yield* Effect.forEach(attachments, (part) =>
            Effect.gen(function* () {
              const url = URL.parse(part.url)
              if (!url || url.protocol !== "file:" || url.search || url.hash) return false
              return (yield* fs.realPath(fileURLToPath(url)).pipe(Effect.orElseSucceed(() => undefined))) === lgp
            }),
          )
          const rules = Permission.merge((yield* agents.get(ctx.agent)).permission, session.permission ?? [])
          const readPatterns = [...new Set([requested, lgp].map((path) => relative(instance.worktree, path)))]
          if (
            !attached.some(Boolean) ||
            Permission.evaluate("external_directory", join(dirname(lgp), "*").replaceAll("\\", "/"), rules).action ===
              "deny"
          ) {
            yield* assertExternalDirectoryEffect(ctx, lgp)
          }
          if (
            !attached.some(Boolean) ||
            readPatterns.some((pattern) => Permission.evaluate("read", pattern, rules).action === "deny")
          ) {
            yield* ctx.ask({ permission: "read", patterns: readPatterns, always: ["*"], metadata: { filepath: lgp } })
          }
          const stem = basename(lgp, extname(lgp))
          const work = join(
            directory,
            ".work",
            "package-docs",
            stem + "-" + createHash("sha256").update(lgp).digest("hex").slice(0, 8),
          )
          const emission =
            params.operation === "emit"
              ? {
                  format: params.format ?? "pdf",
                  output: yield* availableReport(fs, directory, stem, params.format ?? "pdf"),
                }
              : undefined
          if (emission)
            yield* ctx.ask({
              permission: "read",
              patterns: [relative(instance.worktree, join(work, "report.md"))],
              always: ["*"],
              metadata: { filepath: join(work, "report.md") },
            })
          yield* ctx.ask({
            permission: "edit",
            patterns: [
              join(work, "structure.json"),
              ...(params.operation === "skeleton" ? [join(work, "report.md")] : []),
              ...(emission ? [emission.output] : []),
            ].map((path) => relative(instance.worktree, path)),
            always: [
              relative(instance.worktree, work) + "/*",
              ...(emission ? [relative(instance.worktree, emission.output)] : []),
            ],
            metadata: { filepath: emission?.output ?? join(work, "structure.json") },
          })
          const executor = yield* requireExecutor(fs, flags.loginomResources)
          const result = yield* appProcess.run(
            ChildProcess.make(
              executor.node,
              [
                executor.script,
                params.operation,
                "--lgp",
                lgp,
                "--directory",
                directory,
                ...(emission ? ["--format", emission.format, "--output", emission.output] : []),
              ],
              { cwd: directory, env: { LANG: "C.UTF-8" }, extendEnv: false },
            ),
            {
              signal: ctx.abort,
              timeout: "60 seconds",
              maxOutputBytes: 64 * 1024,
              maxErrorBytes: 8 * 1024,
            },
          )
          if (result.exitCode !== 0 || result.stdoutTruncated || result.stderrTruncated)
            return yield* Effect.die(
              Error(
                /^PACKAGE_DOCS_[A-Z_]+\s*$/.test(result.stderr.toString("utf8"))
                  ? result.stderr.toString("utf8").trim()
                  : "PACKAGE_DOCS_FAILED",
              ),
            )
          const response = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(
            result.stdout.toString("utf8"),
          ).pipe(Effect.catch(() => Effect.die(Error("PACKAGE_DOCS_OUTPUT_INVALID"))))
          const paths = yield* Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.String))(response).pipe(
            Effect.catch(() => Effect.die(Error("PACKAGE_DOCS_OUTPUT_INVALID"))),
          )
          const expected = {
            structure: join(work, "structure.json"),
            ...(params.operation !== "extract" ? { report: join(work, "report.md") } : {}),
            ...(emission ? { output: emission.output } : {}),
          }
          if (Object.entries(expected).some(([key, path]) => paths[key] !== path))
            return yield* Effect.die(Error("PACKAGE_DOCS_OUTPUT_INVALID"))
          yield* Effect.forEach(Object.values(expected), (path) =>
            Effect.gen(function* () {
              if ((yield* fs.stat(path)).type !== "File" || (yield* fs.realPath(path)) !== path)
                return yield* Effect.die(Error("PACKAGE_DOCS_OUTPUT_INVALID"))
            }),
          ).pipe(Effect.catch(() => Effect.die(Error("PACKAGE_DOCS_OUTPUT_INVALID"))))
          return {
            title: "Документация: " + params.operation,
            output: JSON.stringify(expected),
            metadata: { truncated: false },
          }
        }).pipe(Effect.orDie),
    }
  }),
)

const availableReport = Effect.fn("PackageDocs.availableReport")(function* (
  fs: FSUtil.Interface,
  directory: string,
  stem: string,
  format: string,
) {
  const names = new Set(yield* fs.readDirectory(directory))
  let index = 1
  while (names.has(stem + ".lgp_report" + (index > 1 ? "-" + index : "") + "." + format)) index++
  return join(directory, stem + ".lgp_report" + (index > 1 ? "-" + index : "") + "." + format)
})

const requireExecutor = Effect.fn("PackageDocs.requireExecutor")(function* (fs: FSUtil.Interface, resources?: string) {
  if (!resources) return yield* Effect.die(Error("PACKAGE_DOCS_RESOURCES_MISSING: переустановите приложение."))
  const root = yield* fs.realPath(resources)
  const skills = yield* Effect.tryPromise(() => verifyBundledSkills(root)).pipe(
    Effect.catch(() =>
      Effect.die(Error("PACKAGE_DOCS_RESOURCES_INVALID: встроенный skill повреждён; переустановите приложение.")),
    ),
  )
  if (
    !skills.some(
      (skill) =>
        skill.name === "package-docs" &&
        skill.files.some((file) => file.path === "skills/package-docs/scripts/package-docs.mjs"),
    )
  )
    return yield* Effect.die(
      Error("PACKAGE_DOCS_RESOURCES_INVALID: отсутствует встроенный генератор; переустановите приложение."),
    )
  const manifest = yield* Schema.decodeUnknownEffect(
    Schema.Struct({
      protocol: Schema.Literal(1),
      node: Schema.Literal("bin/node"),
      files: Schema.Array(Schema.Struct({ path: Schema.String, sha256: Schema.String })),
    }),
  )(yield* fs.readJson(join(root, "resource-manifest.json")))
  const node = yield* fs.realPath(join(root, "bin/node"))
  const inside = relative(root, node)
  const entry = manifest.files.find((file) => file.path === "bin/node")
  if (
    !entry ||
    isAbsolute(inside) ||
    inside === ".." ||
    inside.startsWith(".." + sep) ||
    createHash("sha256")
      .update(yield* fs.readFile(node))
      .digest("hex") !== entry.sha256
  )
    return yield* Effect.die(
      Error("PACKAGE_DOCS_RESOURCES_INVALID: встроенный Node повреждён; переустановите приложение."),
    )
  return { node, script: join(root, "skills/package-docs/scripts/package-docs.mjs") }
})
