import { Schema } from "effect"
import { createHash } from "node:crypto"
import { lstat, readdir, readFile, readlink, realpath, stat } from "node:fs/promises"
import { isAbsolute, join, relative, sep } from "node:path"

const text = Schema.String
const nullable = Schema.Union([text, Schema.Null])
const flag = Schema.Boolean
export const Manifest = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  version: text,
  channel: Schema.Literals(["dev", "beta", "prod"]),
  builtAt: text,
  source: Schema.Struct({
    commit: text,
    dirty: flag,
    patchSha256: nullable,
    inputsManifestSha256: text,
    importSha256: text,
  }),
  target: Schema.Struct({
    platform: Schema.Literals(["linux", "win32", "darwin"]),
    arch: Schema.Literals(["x64", "arm64"]),
    minimumOS: text,
    backend: Schema.Literal("v1"),
  }),
  build: Schema.Struct({ os: text, arch: text, bun: text, lockSha256: text }),
  runtime: Schema.Struct({
    electron: text,
    electronNode: text,
    node: text,
    playwright: text,
    playwrightMcp: text,
    chromiumVersion: text,
    chromiumRevision: text,
    catalogSha256: text,
    resourcesSha256: text,
  }),
  product: Schema.Struct({ name: text, appId: text, executable: text, uriScheme: text }),
  paths: Schema.Struct({
    executor: text,
    node: text,
    chromium: text,
    config: text,
    data: text,
    cache: text,
    state: text,
    logs: text,
    profiles: text,
    secretStore: text,
  }),
  connection: Schema.Struct({
    schemaVersion: Schema.Literal(1),
    generationProtocol: Schema.Literal(1),
    knowledgeEndpoint: text,
  }),
  updater: Schema.Struct({ feed: nullable, channel: text, previousVersion: nullable }),
  signing: Schema.Struct({
    status: Schema.Literals(["unsigned", "ad-hoc"]),
    identity: nullable,
    notarized: Schema.Literal(false),
  }),
  installation: Schema.Struct({
    scope: Schema.Literals(["machine", "user"]),
    uninstallPolicy: text,
    preservesUserData: flag,
  }),
  validation: Schema.Struct({
    commands: Schema.Array(Schema.Struct({ cwd: text, argv: Schema.Array(text) })),
    reportFiles: Schema.Array(text),
  }),
  provenance: Schema.Struct({ licensesSha256: text, migrationManifestSha256: text }),
  artifacts: Schema.Array(
    Schema.Struct({
      file: text,
      kind: Schema.Literals(["deb", "appimage", "nsis", "dmg", "zip", "source", "updater-metadata"]),
      bytes: Schema.Number,
      sha256: text,
    }),
  ),
})

export const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex")
export const fileHash = async (path: string) => hash(await readFile(path))
export function relativePath(value: string) {
  if (
    !value ||
    isAbsolute(value) ||
    value.includes("\\") ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw Error("RELEASE_PATH_INVALID")
  return value
}
export function decodeManifest(value: unknown) {
  const manifest = Schema.decodeUnknownSync(Manifest, { onExcessProperty: "error" })(value)
  if (
    !/^[a-f0-9]{40}$/.test(manifest.source.commit) ||
    !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version) ||
    !manifest.artifacts.length ||
    (manifest.source.dirty && !manifest.source.patchSha256) ||
    (manifest.target.platform === "linux" && manifest.installation.scope !== "machine") ||
    (manifest.target.platform !== "linux" && manifest.installation.scope !== "user") ||
    manifest.artifacts.some((item) => {
      if (item.kind === "source" || item.kind === "updater-metadata") return false
      if (manifest.target.platform === "linux") return item.kind !== "deb" && item.kind !== "appimage"
      if (manifest.target.platform === "win32") return item.kind !== "nsis"
      return item.kind !== "dmg" && item.kind !== "zip"
    }) ||
    (manifest.target.platform === "win32" &&
      (!manifest.paths.node.endsWith(".exe") || !manifest.paths.chromium.endsWith(".exe")))
  )
    throw Error("RELEASE_MANIFEST_INVALID")
  if (manifest.target.platform === "darwin" ? manifest.target.arch !== "arm64" : manifest.target.arch !== "x64")
    throw Error("RELEASE_TARGET_INVALID")
  if (
    manifest.target.platform === "darwin" &&
    (manifest.signing.status !== "ad-hoc" || manifest.signing.identity !== "-" || manifest.target.minimumOS !== "14.0")
  )
    throw Error("RELEASE_MAC_POLICY_INVALID")
  const seen = new Set<string>()
  for (const item of manifest.artifacts) {
    relativePath(item.file)
    if (
      seen.has(item.file) ||
      !Number.isSafeInteger(item.bytes) ||
      item.bytes < 1 ||
      !/^[a-f0-9]{64}$/.test(item.sha256)
    )
      throw Error("RELEASE_ARTIFACT_INVALID")
    seen.add(item.file)
  }
  for (const key of ["executor", "node", "chromium"] as const) relativePath(manifest.paths[key])
  return manifest
}

// Static inspection: never import or execute code from the extracted artifact.
export async function verifyResourceTree(
  root: string,
  expected: string,
  expectedTarget?: "linux-x64" | "win32-x64" | "darwin-arm64",
) {
  const directory = await realpath(root)
  await verifyContainedLinks(directory)
  const bytes = await readFile(join(directory, "resource-manifest.json"))
  if (hash(bytes) !== expected) throw Error("RELEASE_RESOURCES_MANIFEST_MISMATCH")
  const manifest = JSON.parse(bytes.toString())
  if (
    manifest.protocol !== 1 ||
    !["linux-x64", "win32-x64", "darwin-arm64"].includes(manifest.target) ||
    (expectedTarget !== undefined && manifest.target !== expectedTarget) ||
    !Array.isArray(manifest.files) ||
    !manifest.files.length
  )
    throw Error("RELEASE_RESOURCES_INVALID")
  const seen = new Set<string>()
  for (const item of manifest.files) {
    relativePath(item.path)
    if (seen.has(item.path) || !/^[a-f0-9]{64}$/.test(item.sha256)) throw Error("RELEASE_RESOURCES_INVALID")
    seen.add(item.path)
    const path = await realpath(join(directory, item.path))
    const local = relative(directory, path)
    if (local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) throw Error("RELEASE_RESOURCE_ESCAPE")
    const metadata = await lstat(join(directory, item.path))
    if (metadata.isSymbolicLink() !== (typeof item.link === "string")) throw Error("RELEASE_RESOURCE_LINK_INVALID")
    if (metadata.isSymbolicLink() && (await readlink(join(directory, item.path))) !== item.link)
      throw Error("RELEASE_RESOURCE_LINK_INVALID")
    if (item.directory === true ? !(await stat(path)).isDirectory() : !(await stat(path)).isFile())
      throw Error("RELEASE_RESOURCE_TYPE_INVALID")
    if ((item.directory === true ? hash(item.link) : await fileHash(path)) !== item.sha256)
      throw Error("RELEASE_RESOURCE_HASH_MISMATCH")
  }
  for (const entry of [manifest.node, manifest.browser]) {
    if (!seen.has(entry)) throw Error("RELEASE_EXECUTABLE_MISSING")
    const bytes = await readFile(join(directory, entry))
    verifyExecutable(bytes, manifest.target)
    // NTFS does not expose the executable bits stored by Linux archives.
    if (manifest.target !== "win32-x64" && process.platform !== "win32") {
      if (!((await stat(join(directory, entry))).mode & 0o111)) throw Error("RELEASE_EXECUTABLE_INVALID")
    }
  }
  return { target: manifest.target, files: seen.size, node: manifest.node, browser: manifest.browser }
}

export function verifyExecutable(bytes: Buffer, target: "linux-x64" | "win32-x64" | "darwin-arm64") {
  if (target === "linux-x64") {
    if (
      bytes.length < 20 ||
      bytes.subarray(0, 4).toString() !== "\x7fELF" ||
      bytes[4] !== 2 ||
      bytes.readUInt16LE(18) !== 62
    )
      throw Error("RELEASE_EXECUTABLE_INVALID")
    return
  }

  if (target === "darwin-arm64") {
    if (bytes.length < 32 || bytes.readUInt32LE(0) !== 0xfeedfacf || bytes.readUInt32LE(4) !== 0x0100000c)
      throw Error("RELEASE_EXECUTABLE_INVALID")
    return
  }

  if (bytes.length < 64 || bytes.subarray(0, 2).toString() !== "MZ") throw Error("RELEASE_EXECUTABLE_INVALID")
  const offset = bytes.readUInt32LE(0x3c)
  if (
    offset > bytes.length - 6 ||
    bytes.subarray(offset, offset + 4).toString("binary") !== "PE\0\0" ||
    bytes.readUInt16LE(offset + 4) !== 0x8664
  )
    throw Error("RELEASE_EXECUTABLE_INVALID")
}

export async function verifyWindowsApplication(root: string, executable: string, expectedResources: string) {
  const directory = await realpath(root)
  verifyExecutable(await readFile(await containedFile(directory, `${executable}.exe`)), "win32-x64")
  await Promise.all(
    ["resources/app.asar", "resources/icons/icon.ico", "LICENSE.electron.txt", "LICENSES.chromium.html"].map((path) =>
      containedFile(directory, path),
    ),
  )
  return verifyResourceTree(join(directory, "resources/loginom"), expectedResources, "win32-x64")
}

async function containedFile(root: string, path: string) {
  const resolved = await realpath(join(root, path))
  const local = relative(root, resolved)
  if (local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local) || !(await stat(resolved)).isFile())
    throw Error("RELEASE_RESOURCE_ESCAPE")
  return resolved
}

// Resolve every link, including framework directory aliases, without following it during traversal.
export async function verifyContainedLinks(root: string) {
  const directory = await realpath(root)
  async function visit(parent: string): Promise<void> {
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      const file = join(parent, entry.name)
      if (entry.isSymbolicLink()) {
        const local = relative(directory, await realpath(file))
        if (isAbsolute(await readlink(file)) || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local))
          throw Error("RELEASE_RESOURCE_ESCAPE")
      }
      if (entry.isDirectory()) await visit(file)
    }
  }
  await visit(directory)
}
