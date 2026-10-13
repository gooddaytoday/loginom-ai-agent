import path from "node:path"
import { constants } from "node:fs"
import { lstat, mkdir, open, readdir, readlink, realpath, rename } from "node:fs/promises"
import { assertProfileClean, assertProfileSettled, profileHistory } from "./profile"
import { readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { EvalFailure } from "./fail"

type Snapshot = { kind: "file" | "directory" | "link"; device: string; inode: string; uid: number; mode: number; size: string; hash: string }
type Manifest = { version: 1; kind: "profile-archive"; profile: string; archive: string;
  bindings: { directory: string; device: string; inode: string }[]; roots: { name: string; snapshot: Snapshot }[]; status: "intent" | "committed"; at: string; committedAt?: string }

/** The caller holds the profile lease and supplies a private, empty archive target. */
export async function archiveProfileEvidence(profile: string, archive: string, journal: string) {
  const directories = [profile, archive, path.dirname(journal)]
  const bindings = await Promise.all(directories.map(async directory => {
    const info = await lstat(directory, { bigint: true })
    if (!path.isAbsolute(directory) || path.resolve(directory) !== directory || await realpath(directory) !== directory ||
      !info.isDirectory() || info.isSymbolicLink() || info.uid !== BigInt(process.getuid!()) || (info.mode & 0o777n) !== 0o700n)
      throw new EvalFailure("ARCHIVE_ROOT_PRIVATE", 2)
    return { directory, device: String(info.dev), inode: String(info.ino) }
  }))
  if (directories.some((directory, index) => directories.slice(index + 1).some(other =>
    directory === other || directory.startsWith(other + path.sep) || other.startsWith(directory + path.sep))))
    throw new EvalFailure("ARCHIVE_ROOT_OVERLAP", 2)
  await assertProfileSettled(profile)
  const saved = await readLeaseReceipt(journal).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw new EvalFailure("ARCHIVE_MANIFEST_INVALID", 2)
  })
  const manifest: Manifest = saved === undefined ? { version: 1, kind: "profile-archive", profile, archive, bindings,
    roots: await Promise.all((await profileHistory(profile)).sort().map(async file => ({ name: path.relative(profile, file), snapshot: await capture(file) }))),
    status: "intent", at: new Date().toISOString() } : requireManifest(saved, profile, archive, bindings)
  await validateTarget(archive, manifest.roots)
  if (saved === undefined) await writeLeaseReceipt(journal, manifest)
  const locations = await Promise.all(manifest.roots.map(async root => {
    const source = path.join(profile, root.name)
    const target = path.join(archive, root.name)
    const [original, moved] = await Promise.all([captureIfPresent(source), captureIfPresent(target)])
    if (Boolean(original) === Boolean(moved)) throw new EvalFailure("ARCHIVE_LOCATIONS_AMBIGUOUS", 2)
    if (JSON.stringify(original ?? moved) !== JSON.stringify(root.snapshot)) throw new EvalFailure("ARCHIVE_IDENTITY_CHANGED", 2)
    return { source, target, pending: Boolean(original), snapshot: root.snapshot }
  }))
  if ((await profileHistory(profile)).some(file => !manifest.roots.some(root => path.join(profile, root.name) === file)))
    throw new EvalFailure("ARCHIVE_PROFILE_CHANGED", 2)
  if (manifest.status === "committed") {
    if (locations.some(row => row.pending)) throw new EvalFailure("ARCHIVE_COMMIT_INVALID", 2)
    await assertProfileClean(profile)
    return { version: 1, status: "committed", archive, journal }
  }
  for (const row of locations) {
    if (row.pending) {
      await mkdir(path.dirname(row.target), { recursive: true, mode: 0o700 })
      await rename(row.source, row.target)
    }
    if (JSON.stringify(await capture(row.target)) !== JSON.stringify(row.snapshot)) throw new EvalFailure("ARCHIVE_IDENTITY_CHANGED", 2)
    await syncTree(row.target)
    await syncDirectory(path.dirname(row.source))
    await syncDirectory(path.dirname(row.target))
  }
  await assertProfileClean(profile)
  await validateTarget(archive, manifest.roots)
  await syncTree(archive)
  await syncDirectory(path.dirname(archive))
  await writeLeaseReceipt(journal, { ...manifest, status: "committed", committedAt: new Date().toISOString() })
  return { version: 1, status: "committed", archive, journal }
}

async function validateTarget(directory: string, roots: Manifest["roots"], relative = "") {
  await Promise.all((await readdir(directory)).map(async name => {
    const key = path.join(relative, name)
    if (roots.some(root => root.name === key)) return
    const file = path.join(directory, name)
    const info = await lstat(file)
    if (!roots.some(root => root.name.startsWith(key + path.sep)) || !info.isDirectory() || info.isSymbolicLink() ||
      info.uid !== process.getuid?.() || (info.mode & 0o077)) throw new EvalFailure("ARCHIVE_TARGET_CHANGED", 2)
    await validateTarget(file, roots, key)
  }))
}

async function captureIfPresent(file: string) {
  return capture(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
}

function requireManifest(value: unknown, profile: string, archive: string, bindings: Manifest["bindings"]): Manifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new EvalFailure("ARCHIVE_MANIFEST_INVALID", 2)
  const row = value as Partial<Manifest>
  if (row.version !== 1 || row.kind !== "profile-archive" || row.profile !== profile || row.archive !== archive ||
    JSON.stringify(row.bindings) !== JSON.stringify(bindings) || !["intent", "committed"].includes(String(row.status)) ||
    typeof row.at !== "string" || !Number.isFinite(Date.parse(row.at)) || !Array.isArray(row.roots) ||
    row.roots.some(root => !root || typeof root.name !== "string" || !root.name || root.name.includes("\0") || path.isAbsolute(root.name) ||
      path.normalize(root.name) !== root.name || root.name === ".." || root.name.startsWith("../") || typeof root.snapshot !== "object" || !root.snapshot) ||
    new Set(row.roots.map(root => root.name)).size !== row.roots.length || row.status === "committed" &&
    (typeof row.committedAt !== "string" || !Number.isFinite(Date.parse(row.committedAt)))) throw new EvalFailure("ARCHIVE_MANIFEST_INVALID", 2)
  return row as Manifest
}

async function capture(file: string): Promise<Snapshot> {
  const info = await lstat(file, { bigint: true })
  const kind = info.isSymbolicLink() ? "link" : info.isDirectory() ? "directory" : info.isFile() ? "file" : undefined
  if (!kind || info.uid !== BigInt(process.getuid!()) || kind === "file" && info.nlink !== 1n) throw new EvalFailure("ARCHIVE_TOPOLOGY", 2)
  const hash = new Bun.CryptoHasher("sha256")
  if (kind === "link") hash.update(await readlink(file))
  if (kind === "directory") hash.update(JSON.stringify(await Promise.all((await readdir(file)).sort().map(async name => ({ name, snapshot: await capture(path.join(file, name)) })))))
  if (kind === "file") for await (const bytes of Bun.file(file).stream()) hash.update(bytes)
  return { kind, device: String(info.dev), inode: String(info.ino), uid: Number(info.uid), mode: Number(info.mode & 0o7777n), size: String(info.size), hash: hash.digest("hex") }
}

async function syncTree(file: string) {
  const info = await lstat(file)
  if (info.isSymbolicLink()) return
  if (info.isDirectory()) await Promise.all((await readdir(file)).map(name => syncTree(path.join(file, name))))
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | (info.isDirectory() ? constants.O_DIRECTORY : 0))
  try { await handle.sync() } finally { await handle.close() }
}

async function syncDirectory(directory: string) {
  const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try { await handle.sync() } finally { await handle.close() }
}
