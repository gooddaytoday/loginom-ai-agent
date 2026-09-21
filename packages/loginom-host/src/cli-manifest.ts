import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { lstat, open, readFile, readdir, readlink, realpath, stat, writeFile } from "node:fs/promises"
import { isAbsolute, join, relative, sep } from "node:path"
import { Option, Schema } from "effect"

const file = Schema.Struct({
  path: Schema.String,
  sha256: Schema.String,
  mode: Schema.Number,
  link: Schema.optional(Schema.String),
})
const metadata = Schema.Struct({
  version: Schema.String,
  channel: Schema.String,
  platform: Schema.String,
  arch: Schema.String,
  sourceCommit: Schema.String,
  sourceTreeSha256: Schema.String,
  sourceDirty: Schema.Boolean,
  dependencies: Schema.Record(Schema.String, Schema.String),
})
const manifest = Schema.Struct({
  format: Schema.Literal("loginom-cli-artifact-v1"),
  metadata,
  files: Schema.Array(file),
})
const filename = "cli-manifest.json"

// Shared by build/installer verification and the installed runtime resolver.
export async function writeCliManifest(root: string, info: typeof metadata.Type) {
  const files = await inventory(root)
  const value = { format: "loginom-cli-artifact-v1", metadata: info, files }
  await writeFile(join(root, filename), JSON.stringify(value, null, 2) + "\n")
  return value
}

export async function verifyCliManifest(root: string, expected: { platform: string; arch: string; version?: string }) {
  const decoded = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(await readFile(join(root, filename), "utf8"))
  if (Option.isNone(decoded)) throw new Error("LOGINOM_MANIFEST_INVALID")
  const value = Schema.decodeUnknownOption(manifest, { onExcessProperty: "error" })(decoded.value)
  if (Option.isNone(value)) throw new Error("LOGINOM_MANIFEST_INVALID")
  const info = value.value.metadata
  if (
    info.platform !== expected.platform ||
    info.arch !== expected.arch ||
    (expected.version && info.version !== expected.version)
  )
    throw new Error("LOGINOM_MANIFEST_TARGET_MISMATCH")
  if (!/^[a-f0-9]{40}$/.test(info.sourceCommit) || !/^[a-f0-9]{64}$/.test(info.sourceTreeSha256))
    throw new Error("LOGINOM_MANIFEST_INVALID")
  const files = value.value.files
  const paths = files.map((item) => (info.platform === "win32" ? item.path.toLowerCase() : item.path))
  if (
    new Set(paths).size !== files.length ||
    files.some((item) => !safePath(item.path) || !/^[a-f0-9]{64}$/.test(item.sha256))
  )
    throw new Error("LOGINOM_MANIFEST_INVALID")
  const actual = await inventory(root)
  if (actual.length !== files.length) throw new Error("LOGINOM_MANIFEST_PAYLOAD_MISMATCH")
  const entries = new Map(files.map((item) => [item.path, item]))
  if (
    actual.some((item) => {
      const expected = entries.get(item.path)
      return !expected || item.sha256 !== expected.sha256 || item.mode !== expected.mode || item.link !== expected.link
    })
  )
    throw new Error("LOGINOM_MANIFEST_PAYLOAD_MISMATCH")
  const binary = info.platform === "win32" ? "bin/loginom-ai-agent-cli.exe" : "bin/loginom-ai-agent-cli"
  for (const required of [
    binary,
    ...(info.platform === "darwin" ? ["resources/loginom/bin/loginom-keychain"] : []),
    "resources/loginom/host/node-host.mjs",
    "resources/loginom/resource-manifest.json",
    `resources/loginom/bin/${info.platform === "win32" ? "node.exe" : "node"}`,
  ]) {
    if (!entries.has(required)) throw new Error("LOGINOM_MANIFEST_INCOMPLETE")
  }
  if (info.platform === "win32" && info.arch === "x64") await verifyWindowsPayload(root, entries)
  return info
}

async function verifyWindowsPayload(root: string, entries: Map<string, typeof file.Type>) {
  const decoded = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(
    await readFile(join(root, "resources/loginom/resource-manifest.json"), "utf8"),
  )
  if (Option.isNone(decoded) || !decoded.value || typeof decoded.value !== "object")
    throw new Error("LOGINOM_MANIFEST_RESOURCE_INVALID")
  const resource = decoded.value as Record<string, unknown>
  if (
    resource.target !== "win32-x64" ||
    resource.node !== "bin/node.exe" ||
    typeof resource.browser !== "string" ||
    !safePath(resource.browser) ||
    !resource.browser.toLowerCase().endsWith(".exe") ||
    !Array.isArray(resource.files)
  )
    throw new Error("LOGINOM_MANIFEST_RESOURCE_INVALID")
  const resources = new Set<string>()
  for (const item of resource.files) {
    if (!item || typeof item !== "object") throw new Error("LOGINOM_MANIFEST_RESOURCE_INVALID")
    const entry = item as Record<string, unknown>
    if (
      typeof entry.path !== "string" ||
      !safePath(entry.path) ||
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      resources.has(entry.path.toLowerCase()) ||
      (entry.link !== undefined && typeof entry.link !== "string")
    )
      throw new Error("LOGINOM_MANIFEST_RESOURCE_INVALID")
    resources.add(entry.path.toLowerCase())
    const outer = entries.get(`resources/loginom/${entry.path}`)
    if (!outer || outer.sha256 !== entry.sha256 || outer.link !== entry.link)
      throw new Error("LOGINOM_MANIFEST_RESOURCE_MISMATCH")
  }
  if (!resources.has(resource.node.toLowerCase()) || !resources.has(resource.browser.toLowerCase()))
    throw new Error("LOGINOM_MANIFEST_RESOURCE_INVALID")
  const node = entries.get(`resources/loginom/${resource.node}`)
  const browser = entries.get(`resources/loginom/${resource.browser}`)
  if (resource.nodeSha256 !== node?.sha256 || resource.browserSha256 !== browser?.sha256)
    throw new Error("LOGINOM_MANIFEST_RESOURCE_MISMATCH")
  await Promise.all(
    ["bin/loginom-ai-agent-cli.exe", `resources/loginom/${resource.node}`, `resources/loginom/${resource.browser}`].map(
      (path) => requirePeAmd64(join(root, path)),
    ),
  )
}

async function requirePeAmd64(path: string) {
  const handle = await open(path, "r")
  try {
    const dos = Buffer.alloc(64)
    if ((await handle.read(dos, 0, dos.length, 0)).bytesRead !== dos.length || dos.readUInt16LE(0) !== 0x5a4d)
      throw new Error("LOGINOM_MANIFEST_EXECUTABLE_INVALID")
    const offset = dos.readUInt32LE(0x3c)
    if (offset < 64 || offset > 16 * 1024 * 1024) throw new Error("LOGINOM_MANIFEST_EXECUTABLE_INVALID")
    const header = Buffer.alloc(26)
    if (
      (await handle.read(header, 0, header.length, offset)).bytesRead !== header.length ||
      header.readUInt32LE(0) !== 0x00004550 ||
      header.readUInt16LE(4) !== 0x8664 ||
      header.readUInt16LE(20) < 2 ||
      (header.readUInt16LE(22) & 0x0002) === 0 ||
      header.readUInt16LE(24) !== 0x020b
    )
      throw new Error("LOGINOM_MANIFEST_EXECUTABLE_INVALID")
  } finally {
    await handle.close()
  }
}

function safePath(path: string) {
  return (
    !!path &&
    !isAbsolute(path) &&
    !path.includes("\\") &&
    !path.split("/").some((part) => !part || part === "." || part === "..") &&
    path !== filename
  )
}

async function inventory(root: string) {
  if (!isAbsolute(root)) throw new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  const canonical = await realpath(root)
  const files: Array<typeof file.Type> = []
  async function visit(directory: string) {
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name)
      const key = relative(root, path).split(sep).join("/")
      if (key === filename) continue
      if (!safePath(key)) throw new Error("LOGINOM_MANIFEST_INVALID")
      const info = await lstat(path)
      if (info.isDirectory()) {
        await visit(path)
        continue
      }
      if (!info.isFile() && !info.isSymbolicLink()) throw new Error("LOGINOM_MANIFEST_FILE_INVALID")
      const target = relative(canonical, await realpath(path))
      if (!target || target === ".." || target.startsWith(".." + sep) || isAbsolute(target))
        throw new Error("LOGINOM_MANIFEST_PATH_ESCAPE")
      const link = info.isSymbolicLink() ? await readlink(path) : undefined
      const hash = createHash("sha256")
      // macOS app frameworks contain directory symlinks. Record the link text;
      // target files are inventoried through their real directory, never twice.
      if (link !== undefined && (await stat(path)).isDirectory()) hash.update(link)
      else for await (const chunk of createReadStream(path)) hash.update(chunk)
      files.push({
        path: key,
        sha256: hash.digest("hex"),
        mode: info.mode & 0o7777,
        ...(link !== undefined ? { link } : {}),
      })
    }
  }
  await visit(root)
  return files
}
