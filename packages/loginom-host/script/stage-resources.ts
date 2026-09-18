import { createHash } from "node:crypto"
import { chmod, cp, mkdir, readdir, readFile, readlink, realpath, rename, rm, stat } from "node:fs/promises"
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { $ } from "bun"
import { nativeResourceCandidates } from "./native-resource-candidates"
import { buildKeychain } from "./build-keychain"
import release from "../../product/loginom-release.json"

// Shared build-time staging; never imported by runtime entrypoints.
export async function stageResources(input: {
  destination: string
  node: string
  browsers: string
  target: { platform: string; arch: string }
  flavor: "desktop" | "cli"
}) {
  const target = `${input.target.platform}-${input.target.arch}`
  if (input.target.platform !== process.platform || input.target.arch !== process.arch)
    throw new Error("LOGINOM_NATIVE_RESOURCES_UNAVAILABLE")
  const pins =
    target === "linux-x64"
      ? {
          chromiumRevision: release.chromiumRevision,
          node: "bin/node",
          browser: `chromium-${release.chromiumRevision}/chrome-linux64/chrome`,
          nodeSha256: release.nodeSha256,
          browserSha256: release.browserSha256,
        }
      : target === "win32-x64"
        ? nativeResourceCandidates["win32-x64"]
        : target === "darwin-arm64"
          ? nativeResourceCandidates["darwin-arm64"]
          : undefined
  if (!pins) throw new Error("LOGINOM_NATIVE_RESOURCES_UNAVAILABLE")
  if (pins.chromiumRevision !== release.chromiumRevision) throw Error("LOGINOM_BROWSER_REVISION_MISMATCH")
  if (![input.destination, input.node, input.browsers].every(isAbsolute))
    throw new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  const source = resolve(import.meta.dir, "../../loginom-runtime")
  const destination = resolve(input.destination)
  const node = input.node
  const browsers = input.browsers
  const staging = destination + ".staging"
  for (const paths of [
    [destination, staging, source, node, browsers],
    await Promise.all([destination, staging, source, node, browsers].map(canonicalBuildPath)),
  ]) {
    if (
      paths
        .slice(0, 2)
        .some((output) =>
          paths
            .slice(2)
            .some((path) =>
              [relative(output, path), relative(path, output)].some(
                (inside) => !isAbsolute(inside) && inside !== ".." && !inside.startsWith(".." + sep),
              ),
            ),
        )
    )
      throw new Error("LOGINOM_BUILD_OUTPUT_OVERLAP")
  }
  const version = (await $`${node} --version`.text()).trim()
  if (version !== `v${release.nodeVersion}`) throw new Error("LOGINOM_NODE_VERSION_MISMATCH")
  for (const input of [
    { path: node, expected: pins.nodeSha256, text: false },
    { path: join(browsers, pins.browser), expected: pins.browserSha256, text: false },
    { path: join(source, "client/package-lock.json"), expected: release.runtimeLockSha256, text: true },
    { path: resolve(source, "../product/models.json"), expected: release.modelsSha256, text: true },
  ]) {
    const contents = await readFile(input.path)
    if (
      createHash("sha256")
        .update(input.text ? normalizeText(contents) : contents)
        .digest("hex") !== input.expected
    )
      throw new Error("LOGINOM_BUILD_INPUT_HASH_MISMATCH")
  }
  await rm(staging, { recursive: true, force: true })
  await mkdir(join(staging, "bin"), { recursive: true })
  await cp(node, join(staging, pins.node))
  await cp(browsers, join(staging, "browsers"), {
    recursive: true,
    verbatimSymlinks: true,
    filter: (path) => !relative(browsers, path).split(sep).includes(".links"),
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
  const npm = resolve(
    dirname(node),
    process.platform === "win32" ? "node_modules/npm/bin/npm-cli.js" : "../lib/node_modules/npm/bin/npm-cli.js",
  )
  await $`${node} ${npm} ci --ignore-scripts --omit=dev --no-audit --fund=false --workspaces=false`
    .cwd(join(staging, "runtime/client"))
    .env({
      ...process.env,
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
      PATH: `${dirname(node)}${delimiter}${process.env.PATH ?? ""}`,
    })
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
  const browser = `browsers/${pins.browser}`
  await stat(join(staging, browser))
  if (process.platform === "linux") {
    // Chrome for Testing ships chrome_sandbox, while Chromium's fallback looks for chrome-sandbox.
    // DEB installs these files as root; retain the standard setuid sandbox for kernels without user namespaces.
    await cp(
      join(dirname(join(staging, browser)), "chrome_sandbox"),
      join(dirname(join(staging, browser)), "chrome-sandbox"),
    )
    await chmod(join(dirname(join(staging, browser)), "chrome-sandbox"), 0o4755)
  }
  if (process.platform === "darwin" && input.flavor === "cli") await buildKeychain(join(staging, "bin"))
  await mkdir(join(staging, "licenses"))
  await cp(resolve(source, "../../LICENSE"), join(staging, "licenses/OpenCode-MIT.txt"))
  await cp(
    resolve(dirname(node), process.platform === "win32" ? "LICENSE" : "../LICENSE"),
    join(staging, "licenses/Node.txt"),
  )
  await cp(join(source, "LICENSE"), join(staging, "licenses/Loginom-Dock-AGPL-3.0.txt"))
  await Bun.write(
    join(staging, "THIRD_PARTY_NOTICES.md"),
    `# Third-party notices

  Loginom AI Agent includes code derived from OpenCode (MIT) and Loginom Dock (AGPL-3.0).
  The original copyright/license notices are preserved in licenses/.
  Node.js license and bundled dependency notices are in licenses/Node.txt.
  Playwright, MCP and their dependency license files are included alongside their package sources in runtime/client/node_modules/.
  ${input.flavor === "desktop" ? "Electron notices are included at the application root by electron-builder; the managed Chromium also exposes chrome://credits/." : "The bundled Chromium exposes its notices at chrome://credits/. Linux CLI archives also export them under licenses/chromium/ at the archive root. Browser-side license files remain under browsers/. Electron is not included."}
  The active Dock JavaScript sources are included in runtime/.
  `,
  )
  // Windows package isolation can expose a path through a virtualized alias.
  // Compare canonical paths on both sides so a legitimate staged file does
  // not look like an escape while real symlinks/junctions still fail closed.
  const canonicalStaging = await realpath(staging)
  const files: Array<{ path: string; sha256: string; link?: string; directory?: boolean }> = []
  async function collect(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        await collect(path)
        continue
      }
      const link = entry.isSymbolicLink() ? await readlink(path) : undefined
      const targetPath = relative(canonicalStaging, await realpath(path))
      if (targetPath === ".." || targetPath.startsWith(".." + sep) || isAbsolute(targetPath))
        throw Error("LOGINOM_BUILD_RESOURCE_ESCAPE")
      const directoryLink = link !== undefined && (await stat(path)).isDirectory()
      files.push({
        path: relative(staging, path).split(sep).join("/"),
        sha256: createHash("sha256")
          .update(directoryLink ? link! : await readFile(path))
          .digest("hex"),
        ...(link !== undefined ? { link } : {}),
        ...(directoryLink ? { directory: true } : {}),
      })
    }
  }
  await collect(staging)
  await Bun.write(
    join(staging, "resource-manifest.json"),
    JSON.stringify(
      {
        ...release,
        target,
        nodeSha256: pins.nodeSha256,
        browserSha256: pins.browserSha256,
        ...(target !== "linux-x64" ? { platformAcceptance: "pending" } : {}),
        node: pins.node,
        browser,
        files,
      },
      null,
      2,
    ) + "\n",
  )
  await rm(destination, { recursive: true, force: true })
  await rename(staging, destination)
  return { files: files.length, destination }
}

// Output directories may not exist yet. Resolve their existing ancestor so an
// alias in a parent cannot hide overlap with an input. No directories are created.
async function canonicalBuildPath(path: string): Promise<string> {
  return realpath(path).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT" || dirname(path) === path) throw error
    return join(await canonicalBuildPath(dirname(path)), basename(path))
  })
}

function normalizeText(contents: Buffer) {
  return Buffer.from(contents.toString("utf8").replaceAll("\r\n", "\n"))
}
