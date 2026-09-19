import { $ } from "bun"
import { buildPhase } from "./build-phase"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { link, lstat, mkdir, mkdtemp, readFile, readlink, rename, rm } from "node:fs/promises"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { stageResources } from "./stage-resources"
import { buildNodeHost } from "./build-node-host"
import { buildCliInstaller } from "./build-cli-installer"
import { collectBuildNotices } from "./collect-build-notices"
import { writeCliManifest, verifyCliManifest } from "../src/cli-manifest"
import release from "../../product/loginom-release.json"
import bunNotice from "../licenses/bun/source.json"
import bunNativeNotices from "../licenses/bun/native/sources.json"
import webkitSource from "../licenses/bun/webkit-source.json"
import chromiumNotice from "../licenses/chromium/source.json"

const repo = resolve(import.meta.dir, "../../..")
const destination = process.argv[2]
if (!destination || !isAbsolute(destination)) throw new Error("Provide a new absolute artifact directory")
if (await Bun.file(join(destination, "cli-manifest.json")).exists()) throw new Error("Artifact already exists")
await lstat(destination).then(
  () => {
    throw new Error("Artifact directory already exists")
  },
  (error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error
  },
)
const node = process.env.LOGINOM_AI_AGENT_NODE_SOURCE
const browsers = process.env.LOGINOM_AI_AGENT_BROWSER_SOURCE
if (!node || !browsers) throw new Error("Pinned Node/browser inputs are required")
if (process.versions.bun !== bunNotice.version || Bun.revision !== bunNotice.commit)
  throw Error("LOGINOM_BUN_NOTICE_REVISION_MISMATCH")
if (
  (process.platform !== "linux" && process.platform !== "win32" && process.platform !== "darwin") ||
  (process.platform === "darwin" ? process.arch !== "arm64" : process.arch !== "x64")
)
  throw new Error("LOGINOM_NATIVE_RESOURCES_UNAVAILABLE")
const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT
if (process.platform === "win32" && (!systemRoot || !isAbsolute(systemRoot)))
  throw Error("LOGINOM_ARCHIVER_UNAVAILABLE")
const archiver = process.platform === "win32" ? join(systemRoot!, "System32/tar.exe") : "/usr/bin/tar"
const source = await snapshot()
const work = await mkdtemp(join(dirname(destination), ".cli-build-"))
try {
  await $`${process.execPath} script/build.ts --standalone --single --skip-install`
    .cwd(join(repo, "packages/agent"))
    .env({
      ...process.env,
      LOGINOM_AI_AGENT_CHANNEL: process.env.LOGINOM_AI_AGENT_CHANNEL ?? "dev",
      LOGINOM_AI_AGENT_BUILD_OUTPUT: join(work, "native"),
    })
  const artifact = join(
    work,
    `native/loginom-ai-agent-cli-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`,
  )
  const resources = join(artifact, "resources/loginom")
  if (process.platform === "darwin") {
    // Bun supplies its JSC runtime entitlements. Retain them while signing our
    // compiled executable, and never re-sign vendor Node or Chromium resources.
    await $`/usr/bin/codesign --force --sign - --timestamp=none --identifier com.loginom.aiagent.cli --preserve-metadata=entitlements ${join(artifact, "bin/loginom-ai-agent-cli")}`
    await $`/usr/bin/codesign --verify --strict ${join(artifact, "bin/loginom-ai-agent-cli")}`
  }
  await buildPhase("cli-resource-staging", () =>
    stageResources({
      destination: resources,
      node,
      browsers,
      target: { platform: process.platform, arch: process.arch },
      flavor: "cli",
    }),
  )
  await buildPhase("cli-node-host", () => buildNodeHost(join(resources, "host")))
  await buildPhase("cli-installer", () => buildCliInstaller(artifact, process.platform as "linux" | "darwin" | "win32"))
  await buildPhase("cli-notices", async () =>
    collectBuildNotices(join(artifact, "licenses/bundled-npm"), [
      { root: join(repo, "packages/agent"), metafile: await Bun.file(join(artifact, "build-inputs.json")).json() },
      {
        // Bun's host metafile paths are relative to this caller's working directory.
        root: process.cwd(),
        metafile: await Bun.file(join(resources, "host/build-inputs.json")).json(),
      },
    ]),
  )
  const bunLicense = await readFile(join(import.meta.dir, "../licenses/bun/LICENSE.md"))
  if (createHash("sha256").update(bunLicense).digest("hex") !== bunNotice.sha256)
    throw Error("LOGINOM_BUN_NOTICE_HASH_MISMATCH")
  await Bun.write(join(artifact, "licenses/bun/LICENSE.md"), bunLicense)
  await Bun.write(join(artifact, "licenses/bun/source.json"), JSON.stringify(bunNotice, null, 2) + "\n")
  for (const [component, notice] of Object.entries(bunNativeNotices.components)) {
    for (const file of notice.files) {
      const contents = await readFile(join(import.meta.dir, "../licenses/bun/native", file.file))
      if (createHash("sha256").update(contents).digest("hex") !== file.sha256)
        throw Error("LOGINOM_BUN_NATIVE_NOTICE_HASH_MISMATCH")
      await Bun.write(join(artifact, "licenses/bun/native", component, file.path), contents)
    }
  }
  await Bun.write(join(artifact, "licenses/bun/native/sources.json"), JSON.stringify(bunNativeNotices, null, 2) + "\n")
  if (webkitSource.bunCommit !== bunNotice.commit || webkitSource.commit !== bunNativeNotices.components.webkit.commit)
    throw Error("LOGINOM_WEBKIT_SOURCE_REVISION_MISMATCH")
  await Bun.write(join(artifact, "licenses/bun/webkit-source.json"), JSON.stringify(webkitSource, null, 2) + "\n")
  if (process.platform === "linux" && process.arch === "x64") {
    if (release.browserSha256 !== chromiumNotice.browserSha256 || release.chromiumRevision !== chromiumNotice.revision)
      throw Error("LOGINOM_CHROMIUM_NOTICE_REVISION_MISMATCH")
    const compressed = await readFile(join(import.meta.dir, "../licenses/chromium/linux-x64-1243.txt.gz"))
    if (createHash("sha256").update(compressed).digest("hex") !== chromiumNotice.gzipSha256)
      throw Error("LOGINOM_CHROMIUM_NOTICE_HASH_MISMATCH")
    const credits = Bun.gunzipSync(compressed)
    if (createHash("sha256").update(credits).digest("hex") !== chromiumNotice.sha256)
      throw Error("LOGINOM_CHROMIUM_NOTICE_HASH_MISMATCH")
    await Bun.write(join(artifact, "licenses/chromium/credits.txt"), credits)
    await Bun.write(join(artifact, "licenses/chromium/source.json"), JSON.stringify(chromiumNotice, null, 2) + "\n")
  }
  await Bun.write(
    join(artifact, "licenses/README.md"),
    "# Bundled dependency notices\n\n" +
      "bundled-npm/inventory.json records emitted npm packages and the copied package and nested license/notice texts. " +
      "Its missing list and exclusions are unresolved release audit items; this development inventory is incomplete. " +
      "bun/ contains the exact runtime revision's upstream notice and its remaining audit items. " +
      "The bun-js-sources, sqlite and bun-native-sources archives together preserve Bun's complete src tree with original notices; each inventory.json records its entry hashes. " +
      "WebKit source is supplied separately: bun/webkit-source.json identifies the required source companion archive and its SHA256. " +
      "On Linux, chromium/ contains credits exported from the pinned browser binary. " +
      "Runtime, Node, Dock and browser notices are described in resources/loginom/THIRD_PARTY_NOTICES.md.\n",
  )

  if (JSON.stringify(source) !== JSON.stringify(await buildPhase("cli-source-snapshot", snapshot)))
    throw new Error("LOGINOM_SOURCE_CHANGED_DURING_BUILD")
  const pkg = await Bun.file(join(artifact, "package.json")).json()
  await buildPhase("cli-manifest", () =>
    writeCliManifest(artifact, {
      version: pkg.version,
      channel: process.env.LOGINOM_AI_AGENT_CHANNEL ?? "dev",
      platform: process.platform,
      arch: process.arch,
      ...source,
      dependencies: {
        bun: process.versions.bun,
        node: release.nodeVersion,
        playwright: release.playwright,
        playwrightMcp: release.playwrightMcp,
        chromium: release.chromiumRevision,
      },
    }),
  )
  await buildPhase("cli-manifest-verify", () =>
    verifyCliManifest(artifact, { platform: process.platform, arch: process.arch, version: pkg.version }),
  )
  if (typeof pkg.version !== "string" || !/^[a-zA-Z0-9.+-]+$/.test(pkg.version))
    throw new Error("LOGINOM_ARCHIVE_VERSION_INVALID")
  const name = `loginom-ai-agent-cli-${pkg.version}-${process.platform}-${process.arch}.${process.platform === "win32" ? "zip" : "tar.gz"}`
  const archive = join(dirname(destination), name)
  const checksum = archive + ".sha256"
  const creation =
    process.platform === "linux"
      ? ["--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner", "-czf"]
      : process.platform === "win32"
        ? ["-a", "-cf"]
        : ["-czf"]
  await buildPhase("cli-archive", () => $`${archiver} ${creation} ${join(work, name)} -C ${artifact} .`)
  const sha256 = await buildPhase("cli-archive-sha256", async () => {
    const hash = createHash("sha256")
    for await (const chunk of createReadStream(join(work, name))) hash.update(chunk)
    return hash.digest("hex")
  })
  await Bun.write(join(work, name + ".sha256"), `${sha256}  ${name}\n`)
  const extracted = join(work, "archive-check")
  await mkdir(extracted)
  // The manifest includes modes; the build caller's private umask must not rewrite them.
  const extraction =
    process.platform === "linux" ? ["--same-permissions", "-xzf"] : process.platform === "win32" ? ["-xf"] : ["-xpf"]
  await buildPhase("cli-roundtrip-extract", async () => {
    if (process.platform === "win32") await $`${archiver} ${extraction} ${join(work, name)} -C ${extracted}`
    if (process.platform !== "win32")
      await $`/bin/sh -c ${'umask 077; exec "$@"'} -- ${archiver} ${extraction} ${join(work, name)} -C ${extracted}`
  })
  await buildPhase("cli-roundtrip-verify", () =>
    verifyCliManifest(extracted, { platform: process.platform, arch: process.arch, version: pkg.version }),
  )
  if (process.platform === "darwin") {
    await buildPhase(
      "cli-roundtrip-signature",
      () => $`/usr/bin/codesign --verify --strict ${join(extracted, "bin/loginom-ai-agent-cli")}`,
    )
    await buildPhase(
      "cli-roundtrip-keychain",
      () => $`/usr/bin/codesign --verify --strict ${join(extracted, "resources/loginom/bin/loginom-keychain")}`,
    )
  }
  // Exclusive hard links publish complete files without replacing an earlier candidate.
  const published: string[] = []
  try {
    await link(join(work, name), archive)
    published.push(archive)
    await link(join(work, name + ".sha256"), checksum)
    published.push(checksum)
    await rename(artifact, destination)
  } catch (error) {
    await Promise.all(published.map((path) => rm(path)))
    throw error
  }
  console.log(JSON.stringify({ artifact: destination, archive, checksum, sha256, version: pkg.version, ...source }))
} finally {
  await rm(work, { recursive: true, force: true })
}

async function snapshot() {
  const paths = [
    ...new Set(
      (await $`git ls-files --cached --others --exclude-standard -z`.cwd(repo).text()).split("\0").filter(Boolean),
    ),
  ].sort()
  const hash = createHash("sha256")
  for (const path of paths) {
    const stat = await lstat(join(repo, path)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    hash.update(path).update("\0")
    if (!stat) {
      hash.update("deleted\0")
      continue
    }
    hash.update(String(stat.mode)).update("\0")
    hash
      .update(stat.isSymbolicLink() ? await readlink(join(repo, path)) : await readFile(join(repo, path)))
      .update("\0")
  }
  return {
    sourceCommit: (await $`git rev-parse HEAD`.cwd(repo).text()).trim(),
    sourceTreeSha256: hash.digest("hex"),
    sourceDirty: !!(await $`git status --porcelain`.cwd(repo).text()).trim(),
  }
}
