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
          if (params.operation !== "extract") return yield* Effect.die(Error("PACKAGE_DOCS_TOOL_UNSUPPORTED"))
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
          yield* ctx.ask({
            permission: "edit",
            patterns: [relative(instance.worktree, join(work, "structure.json"))],
            always: [relative(instance.worktree, work) + "/*"],
            metadata: { filepath: join(work, "structure.json") },
          })
          const resources = flags.loginomResources
          if (!resources) return yield* Effect.die(Error("PACKAGE_DOCS_RESOURCES_MISSING: переустановите приложение."))
          const root = yield* fs.realPath(resources)
          yield* Effect.tryPromise(() => verifyBundledSkills(root)).pipe(
            Effect.catch(() =>
              Effect.die(
                Error("PACKAGE_DOCS_RESOURCES_INVALID: встроенный skill повреждён; переустановите приложение."),
              ),
            ),
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
          const result = yield* appProcess.run(
            ChildProcess.make(
              node,
              [
                join(root, "skills/package-docs/scripts/package-docs.mjs"),
                params.operation,
                "--lgp",
                lgp,
                "--directory",
                directory,
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
          return {
            title: "Документация: " + params.operation,
            output: result.stdout.toString("utf8").trim(),
            metadata: { truncated: false },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
