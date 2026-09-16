import { createHash } from "node:crypto"
import { chmod, cp, mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { $ } from "bun"
import release from "../../product/loginom-release.json"

// Downloads belong to build provisioning. Runtime startup never invokes npm or a browser installer.
const source = resolve(import.meta.dir, "../../loginom-runtime")
const destination = resolve(import.meta.dir, "../resources/loginom")
const staging = destination + ".staging"
const node = process.env.LOGINOM_AI_AGENT_NODE_SOURCE
const browsers = process.env.LOGINOM_AI_AGENT_BROWSER_SOURCE
if (!node || !browsers || !isAbsolute(node) || !isAbsolute(browsers)) {
  throw new Error(
    "Set absolute LOGINOM_AI_AGENT_NODE_SOURCE and LOGINOM_AI_AGENT_BROWSER_SOURCE for the pinned build inputs",
  )
}
const version = (await $`${node} --version`.text()).trim()
if (version !== `v${release.nodeVersion}`) throw new Error("LOGINOM_NODE_VERSION_MISMATCH")
const platform = process.platform === "linux" ? "linux" : process.platform
if (platform !== "linux" || process.arch !== "x64")
  throw new Error("This bundler currently targets Linux x64; native ports follow their runbooks")
for (const [path, expected] of [
  [node, release.nodeSha256],
  [join(browsers, `chromium-${release.chromiumRevision}/chrome-linux64/chrome`), release.browserSha256],
  [join(source, "client/package-lock.json"), release.runtimeLockSha256],
  [resolve(source, "../product/models.json"), release.modelsSha256],
]) {
  if (
    createHash("sha256")
      .update(await readFile(path))
      .digest("hex") !== expected
  )
    throw new Error("LOGINOM_BUILD_INPUT_HASH_MISMATCH")
}
await rm(staging, { recursive: true, force: true })
await mkdir(join(staging, "bin"), { recursive: true })
await cp(node, join(staging, "bin/node"))
await cp(browsers, join(staging, "browsers"), {
  recursive: true,
  filter: (path) => !relative(browsers, path).split("/").includes(".links"),
})
await mkdir(join(staging, "runtime/client"), { recursive: true })
for (const path of ["src", "executor", "examples/memory-plugin-shared/lib", "client/lib"]) {
  await cp(join(source, path), join(staging, "runtime", path), { recursive: true })
}
for (const path of [
  "client/package.json",
  "client/package-lock.json",
  "client/.node-version",
  "LICENSE",
  "README_UPSTREAM.md",
]) {
  await cp(join(source, path), join(staging, "runtime", path))
}
const npm = resolve(dirname(node), "../lib/node_modules/npm/bin/npm-cli.js")
await $`${node} ${npm} ci --ignore-scripts --omit=dev --no-audit --fund=false --workspaces=false`
  .cwd(join(staging, "runtime/client"))
  .env({ ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1", PATH: `${dirname(node)}:${process.env.PATH ?? ""}` })
for (const [name, version] of [
  ["@playwright/mcp", release.playwrightMcp],
  ["playwright", release.playwright],
  ["playwright-core", release.playwright],
]) {
  const installed = await Bun.file(join(staging, "runtime/client/node_modules", name, "package.json")).json()
  if (installed.version !== version) throw new Error("LOGINOM_DEPENDENCY_VERSION_MISMATCH")
}
const catalog = await Bun.file(join(staging, "runtime/client/node_modules/playwright-core/browsers.json")).json()
if (
  !catalog.browsers.some(
    (entry: { name: string; revision: string }) =>
      entry.name === "chromium" && entry.revision === release.chromiumRevision,
  )
) {
  throw new Error("LOGINOM_BROWSER_REVISION_MISMATCH")
}
const browser = `browsers/chromium-${release.chromiumRevision}/chrome-linux64/chrome`
await stat(join(staging, browser))
// Chrome for Testing ships chrome_sandbox, while Chromium's fallback looks for chrome-sandbox.
// DEB installs these files as root; retain the standard setuid sandbox for kernels without user namespaces.
await cp(
  join(dirname(join(staging, browser)), "chrome_sandbox"),
  join(dirname(join(staging, browser)), "chrome-sandbox"),
)
await chmod(join(dirname(join(staging, browser)), "chrome-sandbox"), 0o4755)
await mkdir(join(staging, "licenses"))
await cp(resolve(source, "../../LICENSE"), join(staging, "licenses/OpenCode-MIT.txt"))
await cp(resolve(dirname(node), "../LICENSE"), join(staging, "licenses/Node.txt"))
await cp(join(source, "LICENSE"), join(staging, "licenses/Loginom-Dock-AGPL-3.0.txt"))
await Bun.write(
  join(staging, "THIRD_PARTY_NOTICES.md"),
  `# Third-party notices

Loginom AI Agent includes code derived from OpenCode (MIT) and Loginom Dock (AGPL-3.0).
The original copyright/license notices are preserved in licenses/.
Node.js license and bundled dependency notices are in licenses/Node.txt.
Playwright, MCP and their dependency license files are included alongside their package sources in runtime/client/node_modules/.
Electron and Chromium notices are included at the application root by electron-builder.
The active Dock JavaScript sources are included in runtime/.
`,
)
const files: Array<{ path: string; sha256: string }> = []
async function collect(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      await collect(path)
      continue
    }
    files.push({
      path: relative(staging, path),
      sha256: createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
    })
  }
}
await collect(staging)
await Bun.write(
  join(staging, "resource-manifest.json"),
  JSON.stringify({ ...release, node: "bin/node", browser, files }, null, 2) + "\n",
)
await rm(destination, { recursive: true, force: true })
await rename(staging, destination)
console.log(`Bundled Loginom Linux runtime: ${files.length} verified resource files`)
