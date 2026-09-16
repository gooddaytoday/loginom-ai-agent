import { Schema } from "effect"
import { createHash } from "node:crypto"
import { readFile, realpath, stat } from "node:fs/promises"
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
    platform: Schema.Literal("linux"),
    arch: Schema.Literal("x64"),
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
    status: Schema.Literal("unsigned"),
    identity: Schema.Null,
    notarized: Schema.Literal(false),
  }),
  installation: Schema.Struct({ scope: Schema.Literal("machine"), uninstallPolicy: text, preservesUserData: flag }),
  validation: Schema.Struct({
    commands: Schema.Array(Schema.Struct({ cwd: text, argv: Schema.Array(text) })),
    reportFiles: Schema.Array(text),
  }),
  provenance: Schema.Struct({ licensesSha256: text, migrationManifestSha256: text }),
  artifacts: Schema.Array(
    Schema.Struct({
      file: text,
      kind: Schema.Literals(["deb", "appimage", "source", "updater-metadata"]),
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
    (manifest.source.dirty && !manifest.source.patchSha256)
  )
    throw Error("RELEASE_MANIFEST_INVALID")
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
export async function verifyResourceTree(root: string, expected: string) {
  const directory = await realpath(root)
  const bytes = await readFile(join(directory, "resource-manifest.json"))
  if (hash(bytes) !== expected) throw Error("RELEASE_RESOURCES_MANIFEST_MISMATCH")
  const manifest = JSON.parse(bytes.toString())
  if (
    manifest.protocol !== 1 ||
    manifest.target !== "linux-x64" ||
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
    if (local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local) || !(await stat(path)).isFile())
      throw Error("RELEASE_RESOURCE_ESCAPE")
    if ((await fileHash(path)) !== item.sha256) throw Error("RELEASE_RESOURCE_HASH_MISMATCH")
  }
  for (const entry of [manifest.node, manifest.browser]) {
    if (!seen.has(entry)) throw Error("RELEASE_EXECUTABLE_MISSING")
    const bytes = await readFile(join(directory, entry))
    if (
      bytes.subarray(0, 4).toString() !== "\x7fELF" ||
      bytes[4] !== 2 ||
      bytes.readUInt16LE(18) !== 62 ||
      !((await stat(join(directory, entry))).mode & 0o111)
    )
      throw Error("RELEASE_EXECUTABLE_INVALID")
  }
  return { files: seen.size, node: manifest.node, browser: manifest.browser }
}
