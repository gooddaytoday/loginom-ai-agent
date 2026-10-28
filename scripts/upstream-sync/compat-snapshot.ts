#!/usr/bin/env bun
/**
 * External-compatibility snapshot of a checkout (LAB-198 / S2).
 *
 * Captures everything outside code that must not change when internal names move:
 * product identity, resolved electron-builder configuration per platform and channel,
 * LOGINOM_AI_AGENT_* literals, OPENCODE_* reads, third-party-visible strings, the
 * @opencode-ai/plugin resolution, CI triggers, turbo task graph, workspace manifests
 * and content hashes of resource directories.
 *
 * Usage (from a checkout with `bun install` done):
 *   bun scripts/upstream-sync/compat-snapshot.ts --out snapshot.json
 * Compare two snapshots with compat-compare.ts. The file contains no secrets and no absolute paths.
 */
import { createRequire } from "node:module"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, realpathSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { parseArgs } from "node:util"

const { values: args } = parseArgs({ options: { out: { type: "string" }, repo: { type: "string" } }, strict: true })
const repo = resolve(args.repo ?? process.cwd())
if (!args.out) throw new Error("--out is required")

const sh = (cmd: string, argv: string[], cwd = repo, env: NodeJS.ProcessEnv = process.env) =>
  execFileSync(cmd, argv, { cwd, env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
const tracked = sh("git", ["ls-files", "-z"]).split("\0").filter(Boolean)

// The agent package directory is packages/agent in the fork before LAB-198 and packages/opencode after.
const agentDir = existsSync(join(repo, "packages/opencode/package.json")) ? "packages/opencode" : "packages/agent"
const SOURCE_DIRS = [
  `${agentDir}/src`,
  `${agentDir}/script`,
  "packages/core/src",
  "packages/desktop/src",
  "packages/desktop/scripts",
  "packages/loginom-host/src",
  "packages/loginom-host/script",
  "packages/loginom-runtime/src",
  "packages/product/src",
  "packages/app/src",
  "packages/cli/src",
  "packages/server/src",
  "packages/schema/src",
]
const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|json|jsonc|yml|yaml|ps1|sh|py)$/
const read = (path: string) => readFileSync(join(repo, path), "utf8")
const inSourceDirs = (path: string) => SOURCE_DIRS.some((dir) => path.startsWith(dir + "/"))
const sourceFiles = tracked.filter((path) => inSourceDirs(path) && TEXT_EXT.test(path))

// 1. Environment literals: the Appendix A command of the compatibility matrix, plus OPENCODE_* readers.
const envLiterals = new Set<string>()
const opencodeEnvFiles = new Set<string>()
for (const path of sourceFiles) {
  const text = read(path)
  for (const match of text.matchAll(/LOGINOM_AI_AGENT_[A-Z0-9_]+/g)) envLiterals.add(match[0])
  if (/\bOPENCODE_[A-Z_]+/.test(text)) opencodeEnvFiles.add(path)
}

// 2. Strings visible to third parties.
const externalNeedles = [/opencode\/1\.18\.31/, /opencodeCompatibilityVersion/, /\bOPENCODE_API_KEY\b/, /\bOPENCODE_GO_API_KEY\b/]
const externalLiterals: string[] = []
for (const path of tracked) {
  if (!TEXT_EXT.test(path) || path === "bun.lock" || path.startsWith("docs/") || path.startsWith("scripts/upstream-sync/")) continue
  const text = read(path)
  if (!externalNeedles.some((needle) => needle.test(text))) continue
  text.split("\n").forEach((line) => {
    if (externalNeedles.some((needle) => needle.test(line)) && line.length < 400) externalLiterals.push(line.trim())
  })
}

// 3. Workspace manifests.
const workspaces: Record<string, unknown> = {}
for (const path of tracked.filter((item) => item.endsWith("package.json") && !item.includes("node_modules"))) {
  let json: any
  try {
    json = JSON.parse(read(path))
  } catch {
    continue
  }
  workspaces[path.replace(/^packages\/agent\//, "packages/opencode/")] = {
    name: json.name,
    version: json.version,
    bin: json.bin,
    scripts: Object.keys(json.scripts ?? {}).sort(),
    workspaceDeps: Object.entries({ ...json.dependencies, ...json.devDependencies, ...json.peerDependencies })
      .filter(([, spec]) => String(spec).startsWith("workspace:"))
      .map(([name]) => name)
      .sort(),
    overrides: json.overrides,
  }
}

// 4. @opencode-ai/plugin: static mentions and runtime resolution (what a third-party plugin would load).
const pluginMentions = tracked
  .filter((path) => path.endsWith("package.json") && !path.includes("node_modules"))
  .filter((path) => read(path).includes("@opencode-ai/plugin"))
  .map((path) => path.replace(/^packages\/agent\//, "packages/opencode/"))
  .sort()
// Third-party plugins are dependencies of the agent package, so they are resolved from its manifest.
const rootRequire = createRequire(join(repo, agentDir, "package.json"))
const resolveFrom = (from: string, id: string) => {
  try {
    return relative(repo, realpathSync(createRequire(from).resolve(id))).replaceAll("\\", "/")
  } catch (error) {
    return `UNRESOLVED: ${(error as Error).message.split("\n")[0]}`
  }
}
const thirdParty = ["@gitlab/opencode-gitlab-auth", "opencode-gitlab-auth", "opencode-poe-auth"]
  .map((name) => {
    try {
      const dir = dirnameOf(rootRequire.resolve(`${name}/package.json`))
      return [name, resolveFrom(join(dir, "package.json"), "@opencode-ai/plugin/package.json")] as const
    } catch {
      return [name, "NOT_INSTALLED"] as const
    }
  })
  .sort()
function dirnameOf(path: string) {
  return path.slice(0, path.lastIndexOf("/"))
}
const pluginResolution = {
  fromRoot: resolveFrom(join(repo, "package.json"), "@opencode-ai/plugin/package.json"),
  thirdParty: Object.fromEntries(thirdParty),
}

// 5. CI triggers and job names.
const workflowFiles = tracked.filter((path) => /^\.github\/(workflows|actions)\/.*\.ya?ml$/.test(path))
const workflows: Record<string, unknown> = {}
for (const path of workflowFiles) {
  const doc: any = (Bun as any).YAML.parse(read(path))
  workflows[path] = {
    name: doc.name,
    on: doc.on ?? doc[true as any],
    defaultsRun: doc.defaults?.run,
    jobs: Object.fromEntries(
      Object.entries(doc.jobs ?? {}).map(([id, job]: [string, any]) => [
        id,
        {
          name: job.name,
          runsOn: job["runs-on"],
          if: job.if,
          matrix: job.strategy?.matrix,
          workingDirectories: [job.defaults?.run?.["working-directory"], ...(job.steps ?? []).map((step: any) => step["working-directory"])].filter(Boolean),
        },
      ]),
    ),
  }
}

// 6. Product identity and the resolved electron-builder configuration (evaluated, not parsed).
const productModule = await import(join(repo, "packages/product/src/index.ts"))
const product: Record<string, unknown> = { Product: productModule.Product }
for (const channel of ["prod", "beta", "dev"]) {
  product[channel] = { name: productModule.productName(channel), slug: productModule.productSlug(channel) }
}
const builderProbe = `
  const platform = process.argv[1]
  Object.defineProperty(process, "platform", { value: platform })
  const config = (await import(process.cwd() + "/electron-builder.config.ts")).default
  console.log(JSON.stringify(config, (_k, v) => (typeof v === "function" ? "[function]" : v)))
`
const electronBuilder: Record<string, unknown> = {}
for (const platform of ["linux", "darwin", "win32"]) {
  for (const channel of ["prod", "beta", "dev"]) {
    const out = sh(process.execPath, ["-e", builderProbe, platform], join(repo, "packages/desktop"), {
      ...process.env,
      LOGINOM_AI_AGENT_CHANNEL: channel,
      GITHUB_ACTIONS: "",
    })
    // Paths inside the checkout are recorded relative to it so that snapshots of different checkouts compare.
    electronBuilder[`${platform}/${channel}`] = JSON.parse(out.trim().split("\n").at(-1)!.replaceAll(repo, "<repo>"))
  }
}

// 7. Turbo task graph (what `turbo test` and `turbo typecheck` would run, with pass-through env).
const turbo: Record<string, unknown> = {}
for (const task of ["test", "typecheck", "build"]) {
  const out = sh(process.execPath, ["turbo", task, "--dry=json"])
  const json = JSON.parse(out.slice(out.indexOf("{")))
  turbo[task] = Object.fromEntries(
    json.tasks.map((item: any) => [
      item.taskId,
      {
        command: item.command,
        directory: item.directory,
        passThroughEnv: [...(item.resolvedTaskDefinition.passThroughEnv ?? [])].sort(),
        dependsOn: [...(item.resolvedTaskDefinition.dependsOn ?? [])].sort(),
      },
    ]),
  )
}

// 8. Content hashes of resource directories: renames must not change shipped resources.
const treeHash = (path: string) => {
  try {
    return sh("git", ["rev-parse", `HEAD:${path}`]).trim()
  } catch {
    return "MISSING"
  }
}
const resourcePaths = [
  "packages/product/skills",
  "packages/product/loginom-release.json",
  "packages/product/models.json",
  "packages/desktop/resources",
  "packages/loginom-runtime/client/lib",
  "packages/loginom-runtime/client/package.json",
  "packages/loginom-runtime/client/package-lock.json",
]
const resources = Object.fromEntries(resourcePaths.map((path) => [path, treeHash(path)]))

const snapshot = {
  head: sh("git", ["rev-parse", "HEAD"]).trim(),
  agentDir,
  product,
  electronBuilder,
  envLiterals: [...envLiterals].sort(),
  opencodeEnvFiles: [...opencodeEnvFiles].sort().map((path) => path.replace(/^packages\/agent\//, "packages/opencode/")),
  externalLiterals: externalLiterals.sort(),
  pluginMentions,
  pluginResolution,
  workspaces,
  workflows,
  turbo,
  resources,
}
await Bun.write(args.out, JSON.stringify(snapshot, null, 2) + "\n")
console.log(`snapshot: ${args.out} (${snapshot.envLiterals.length} LOGINOM_AI_AGENT_* names, ${workflowFiles.length} workflow files)`)
