import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { lstat, readFile, readdir, readlink, realpath, stat, writeFile } from "node:fs/promises"
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
  if (
    new Set(files.map((item) => item.path)).size !== files.length ||
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
  return info
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
