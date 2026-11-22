// The package documentation tool `package_docs_run` (B2.5c), ported from 0.4 `packages/opencode/src/tool/package-docs.ts`:
// the name, description, input, the order of checks, the requested permissions, the executor and the result are 0.4's.
// OpenCode 2 gives the tool its call context and runs the tool hooks itself; the executor runs through the same
// `AppProcess` module as in 0.4, now in `@opencode/util`.
import { createHash } from "node:crypto"
import { readdir, readFile, realpath, stat } from "node:fs/promises"
import { basename, dirname, extname, isAbsolute, join, relative, sep } from "node:path"
import type { Info } from "@opencode/plugin/promise/tool"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { AppProcess } from "@opencode/util/process"
import { Effect, Option, Schema } from "effect"
import { ChildProcess } from "effect/process"
import type { localFiles } from "./local-file"

export const Parameters = Schema.Union([
  Schema.Struct({ operation: Schema.Literal("extract"), lgp: Schema.String }),
  Schema.Struct({ operation: Schema.Literal("skeleton"), lgp: Schema.String }),
  Schema.Struct({
    operation: Schema.Literal("emit"),
    lgp: Schema.String,
    // 0.4 had `Schema.optional`. OpenCode 2 offers such a key to the model as nullable, yet its input check refuses
    // `null`; `optionalKey`, as OpenCode's own tools use, shows the model 0.4's plain enum.
    format: Schema.optionalKey(Schema.Literals(["pdf", "docx", "md"])),
  }),
])

const processes = LayerNode.compile(AppProcess.node)

/**
 * `package_docs_run` over a plugin instance's local file admission. `directory` is the Location's directory (0.4: the
 * session's), `resources` the installation's resource root (0.4: `LOGINOM_AI_AGENT_RESOURCES`).
 */
export function packageDocs(
  files: Pick<Awaited<ReturnType<typeof localFiles>>, "ask" | "authorize">,
  location: string,
  resources: string | undefined,
): Info<typeof Parameters> {
  return {
    name: "package_docs_run",
    description:
      "Extract a local Loginom package, create its documentation draft or publish the completed report in the session directory. No Loginom connection or browser is required.",
    input: Parameters,
    options: { codemode: false },
    execute: async (params, call) => {
      if (call.signal.aborted) throw AppProcess.abortError(call.signal)
      const { canonicalPath: lgp } = await files.authorize(params.lgp, call)
      const directory = await realpath(location)
      if (extname(lgp).toLowerCase() !== ".lgp") throw Error("PACKAGE_DOCS_LGP_REQUIRED")
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
              output: await availableReport(directory, stem, params.format ?? "pdf"),
            }
          : undefined
      // Permission resources as OpenCode's own file tools name them inside the Location: relative to its directory
      // (0.4: relative to the worktree).
      const resource = (path: string) => relative(directory, path).replaceAll("\\", "/")
      if (emission)
        await files.ask(call, {
          action: "read",
          resources: [resource(join(work, "report.md"))],
          save: ["*"],
          metadata: { filepath: join(work, "report.md") },
        })
      await files.ask(call, {
        action: "edit",
        resources: [
          join(work, "structure.json"),
          ...(params.operation === "skeleton" ? [join(work, "report.md")] : []),
          ...(emission ? [emission.output] : []),
        ].map(resource),
        save: [resource(work) + "/*", ...(emission ? [resource(emission.output)] : [])],
        metadata: { filepath: emission?.output ?? join(work, "structure.json") },
      })
      const executor = await requireExecutor(resources)
      const result = await Effect.runPromise(
        AppProcess.Service.use((process) =>
          process.run(
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
              signal: call.signal,
              timeout: "60 seconds",
              maxOutputBytes: 64 * 1024,
              maxErrorBytes: 8 * 1024,
            },
          ),
        ).pipe(Effect.provide(processes)),
      )
      if (result.exitCode !== 0 || result.stdoutTruncated || result.stderrTruncated)
        throw Error(
          /^PACKAGE_DOCS_[A-Z_]+\s*$/.test(result.stderr.toString("utf8"))
            ? result.stderr.toString("utf8").trim()
            : "PACKAGE_DOCS_FAILED",
        )
      // 0.4 decoded JSON, then a record of strings; Effect 4.1 names the first step `fromJsonString`.
      const paths = Option.getOrUndefined(
        Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Record(Schema.String, Schema.String)))(
          result.stdout.toString("utf8"),
        ),
      )
      if (!paths) throw Error("PACKAGE_DOCS_OUTPUT_INVALID")
      const expected = {
        structure: join(work, "structure.json"),
        ...(params.operation !== "extract" ? { report: join(work, "report.md") } : {}),
        ...(emission ? { output: emission.output } : {}),
      }
      if (Object.entries(expected).some(([key, path]) => paths[key] !== path))
        throw Error("PACKAGE_DOCS_OUTPUT_INVALID")
      for (const path of Object.values(expected)) {
        const acknowledged = await stat(path)
          .then(async (info) => info.isFile() && (await realpath(path)) === path)
          .catch(() => false)
        if (!acknowledged) throw Error("PACKAGE_DOCS_OUTPUT_INVALID")
      }
      return {
        content: JSON.stringify({
          ...expected,
          ...(params.operation === "skeleton"
            ? {
                narrativeInstructions: await readFile(
                  join(dirname(executor.script), "../references/narrative-prompts.md"),
                  "utf8",
                ),
              }
            : {}),
        }),
        metadata: { truncated: false },
      }
    },
  }
}

async function availableReport(directory: string, stem: string, format: string) {
  const names = new Set(await readdir(directory))
  let index = 1
  while (names.has(stem + ".lgp_report" + (index > 1 ? "-" + index : "") + "." + format)) index++
  return join(directory, stem + ".lgp_report" + (index > 1 ? "-" + index : "") + "." + format)
}

async function requireExecutor(resources?: string) {
  if (!resources) throw Error("PACKAGE_DOCS_RESOURCES_MISSING: переустановите приложение.")
  const root = await realpath(resources)
  // The verifier needs the runtime client's npm dependencies, so only a call that reaches the executor loads it.
  const { verifyBundledSkills } = await import("@loginom-ai-agent/loginom-host/bundled-skills")
  const skills = await verifyBundledSkills(root).catch(() => {
    throw Error("PACKAGE_DOCS_RESOURCES_INVALID: встроенный skill повреждён; переустановите приложение.")
  })
  if (
    !skills.some(
      (skill) =>
        skill.name === "package-docs" &&
        skill.files.some((file) => file.path === "skills/package-docs/scripts/package-docs.mjs"),
    )
  )
    throw Error("PACKAGE_DOCS_RESOURCES_INVALID: отсутствует встроенный генератор; переустановите приложение.")
  const manifest = Schema.decodeUnknownSync(
    Schema.Struct({
      protocol: Schema.Literal(1),
      node: Schema.Literal("bin/node"),
      files: Schema.Array(Schema.Struct({ path: Schema.String, sha256: Schema.String })),
    }),
  )(JSON.parse(await readFile(join(root, "resource-manifest.json"), "utf8")))
  const node = await realpath(join(root, "bin/node"))
  const inside = relative(root, node)
  const entry = manifest.files.find((file) => file.path === "bin/node")
  if (
    !entry ||
    isAbsolute(inside) ||
    inside === ".." ||
    inside.startsWith(".." + sep) ||
    createHash("sha256")
      .update(await readFile(node))
      .digest("hex") !== entry.sha256
  )
    throw Error("PACKAGE_DOCS_RESOURCES_INVALID: встроенный Node повреждён; переустановите приложение.")
  return { node, script: join(root, "skills/package-docs/scripts/package-docs.mjs") }
}
