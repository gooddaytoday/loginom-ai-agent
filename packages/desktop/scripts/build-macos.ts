import { $ } from "bun"
import { mkdir, readdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { fileHash } from "./release/manifest"
import { buildCommand } from "./build-command"
import { productName } from "@loginom-ai-agent/product"
import pins from "../../product/loginom-release.json"

// This is the common local/CI entry. Tool provisioning happens before this script.
const args = parseArgs({ options: { output: { type: "string" }, version: { type: "string" } } }).values
if (!args.output || !args.version || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(args.version))
  throw Error("Required: --output <new candidate directory> --version <semver>")
if (process.platform !== "darwin" || process.arch !== "arm64" || Bun.version !== "1.3.14")
  throw Error("Build requires macOS arm64 and Bun 1.3.14")
const root = resolve(import.meta.dir, "../../..")
const desktop = join(root, "packages/desktop")
const output = resolve(args.output)
const channel = process.env.LOGINOM_AI_AGENT_CHANNEL ?? "dev"
if (channel !== "dev" && channel !== "beta" && channel !== "prod") throw Error("Invalid channel")
if ((await $`git status --porcelain --untracked-files=all`.cwd(root).text()).trim())
  throw Error("Commit all build inputs before building a candidate")
if (!process.env.LOGINOM_AI_AGENT_NODE_SOURCE || !process.env.LOGINOM_AI_AGENT_BROWSER_SOURCE)
  throw Error("Pinned LOGINOM_AI_AGENT_NODE_SOURCE and LOGINOM_AI_AGENT_BROWSER_SOURCE are required")
const node = resolve(process.env.LOGINOM_AI_AGENT_NODE_SOURCE)
if ((await $`${node} --version`.text()).trim() !== `v${pins.nodeVersion}`) throw Error("Wrong Node version")
await mkdir(dirname(output), { recursive: true })
await mkdir(output) // Exclusive candidate directory: never replace an earlier build.
const commit = (await $`git rev-parse HEAD`.cwd(root).text()).trim()
const env = {
  ...process.env,
  LOGINOM_AI_AGENT_CHANNEL: channel,
  LOGINOM_AI_AGENT_VERSION: args.version,
  MODELS_DEV_API_JSON: join(root, "packages/product/models.json"),
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
  MACOSX_DEPLOYMENT_TARGET: "14.0",
  PATH: `${dirname(process.execPath)}:${dirname(node)}:${process.env.PATH ?? "/usr/bin:/bin"}`,
}
delete env.LOGINOM_AI_AGENT_RELEASE
await $`${process.execPath} run build`.cwd(desktop).env(env)
await $`${process.execPath} run package:mac --arm64 --publish never --config.directories.output=${output}`
  .cwd(desktop)
  .env(env)
await buildCommand({
  executable: process.execPath,
  args: ["script/build-cli.ts", join(output, "cli")],
  cwd: join(root, "packages/loginom-host"),
  env,
  timeout: 10 * 60_000,
})
await $`git archive --format=tar.gz --output=${join(output, `loginom-ai-agent-${args.version}-macos-source.tar.gz`)} ${commit}`.cwd(
  root,
)
await $`${process.execPath} scripts/release/write-manifest.ts --target darwin-arm64 --version ${args.version} --channel ${channel} --dist ${output} --resources ${join(desktop, "resources/loginom")} --output ${join(output, "release-manifest.json")}`
  .cwd(desktop)
  .env(env)
for (const name of (await readdir(output)).filter((name) => /\.(dmg|zip)$/.test(name))) {
  await $`${process.execPath} scripts/release/verify-artifact.ts --manifest ${join(output, "release-manifest.json")} --artifact ${join(output, name)} --report ${join(output, name.endsWith(".dmg") ? "static-dmg.json" : "static-zip.json")}`
    .cwd(desktop)
    .env(env)
}
await $`${process.execPath} scripts/macos-smoke.ts --desktop ${join(output, "mac-arm64", `${productName(channel)}.app`)} --cli ${join(output, "cli")} --report ${join(output, "offline-smoke.json")}`
  .cwd(desktop)
  .env(env)
if (
  (await $`git status --porcelain --untracked-files=all`.cwd(root).text()).trim() ||
  (await $`git rev-parse HEAD`.cwd(root).text()).trim() !== commit
)
  throw Error("Source changed during candidate build")
await Bun.write(
  join(output, "build-report.json"),
  JSON.stringify(
    {
      status: "PASS",
      commit,
      version: args.version,
      channel,
      platform: process.platform,
      arch: process.arch,
      os: (await $`sw_vers -productVersion`.text()).trim(),
      bun: Bun.version,
      node: pins.nodeVersion,
      nodeSha256: await fileHash(node),
      lockSha256: await fileHash(join(root, "bun.lock")),
      runtimeLockSha256: await fileHash(join(root, "packages/loginom-runtime/client/package-lock.json")),
      installedAcceptance: "NOT_RUN",
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
)
await Bun.write(
  join(output, "SHA256SUMS"),
  (
    await Promise.all(
      (await readdir(output))
        .sort()
        .filter((name) => /\.(dmg|zip|tar\.gz|json)$/.test(name))
        .map(async (name) => `${await fileHash(join(output, name))}  ${name}`),
    )
  ).join("\n") + "\n",
)
console.log(`Verified candidate: ${output}`)
