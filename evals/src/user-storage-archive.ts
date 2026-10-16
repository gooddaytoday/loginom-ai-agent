import path from "node:path"
import { constants } from "node:fs"
import { lstat, mkdtemp, open, realpath } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { inspectUserStorage } from "./parallel-pair"
import { readUserOwnership, readUserPreparation } from "./user-environment"
import type { acquireEnvironmentLeases, SlotFile, SlotLease } from "./slots"

/** Copies all owned server material; a committed snapshot grants no deletion. */
export async function archiveUserStorage(file: SlotFile, server: Awaited<ReturnType<typeof acquireEnvironmentLeases>>["server"], lease: SlotLease, id: string) {
  await server.assertHeld()
  await lease.assertHeld()
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id) ||
    server.reservation.key !== `server:${lease.identity.containerId}` || hash(server.reservation.identity) !== hash(lease.identity))
    throw new EvalFailure("USER_STORAGE_ARCHIVE_SCOPE", 2)
  await privateDirectory(file.controller.stateDir)
  await privateDirectory(lease.slot.historyDir)
  const journal = path.join(file.controller.stateDir, `user-storage-archive-${id}.json`)
  const existing = await lstat(journal).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (existing) throw new EvalFailure("USER_STORAGE_ARCHIVE_EXISTS", 2)
  const prepared = await readUserPreparation(file, lease, path.join(file.controller.stateDir, `prepare-${lease.slot.id}.secret.json`))
  const owned = await readUserOwnership(file, lease, prepared.secretFile)
  const publication = path.join(file.controller.stateDir, `storage-${lease.slot.id}.json`)
  const published = await readLeaseReceipt(publication) as Record<string, unknown>
  const expected = { version: 2, kind: "owned-user-storage", state: "published", slotId: lease.slot.id, username: lease.slot.username,
    identity: lease.identity, preparationNonce: prepared.nonce, userKey: owned.userKey, ownerSource: owned.source.sha256,
    root: `${file.server.storageRoot}/${lease.slot.username}` }
  if (!published || typeof published !== "object" || Array.isArray(published) ||
    Object.entries(expected).some(([key, value]) => hash(published[key]) !== hash(value))) throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
  const startedAt = new Date().toISOString()
  const before = await snapshotRoot(file, lease, prepared.nonce)
  if (["device", "inode", "uid", "gid"].some(key => published[key] !== before.observed[key as keyof typeof before.observed]))
    throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
  const bytes = await copyRoot(lease.identity.containerId, before.observed.root)
  const files = await filesInArchive(bytes, before.observed)
  if (hash(await filesInArchive(await copyRoot(lease.identity.containerId, before.observed.root), before.observed)) !== hash(files) ||
    hash(await snapshotRoot(file, lease, prepared.nonce)) !== hash(before)) throw new EvalFailure("USER_STORAGE_ARCHIVE_CHANGED", 2)
  await server.assertHeld()
  await lease.assertHeld()
  if (hash(await readLeaseReceipt(publication)) !== hash(published)) throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
  const directory = await mkdtemp(path.join(lease.slot.historyDir, "user-storage-"))
  const binding = await privateDirectory(directory)
  const payload = { path: path.join(directory, "payload.tar"), bytes: bytes.byteLength, sha256: hashBytes(bytes) }
  const entries = before.observed.entries.map(entry => ({ ...entry, ...before.details.find(detail => detail.name === entry.name)!,
    ...(entry.type === "f" ? { sha256: files.find(item => item.name === entry.name)!.sha256 } : {}) }))
  const base = { version: 1, kind: "user-storage-archive", context: { identity: lease.identity, slotId: lease.slot.id, leaseToken: lease.token,
    serverToken: server.reservation.token, serverRevision: server.reservation.revision, id, preparationNonce: prepared.nonce,
    publication: { path: publication, sha256: hash(published) } }, root: before.observed, rootDetails: before.details.find(detail => detail.name === "")!,
    entries, directory: binding, payload, startedAt, storageDeletionAllowed: false as const, nextAdmissionAllowed: false as const }
  await writeLeaseReceipt(journal, { ...base, status: "copying" })
  const target = await open(payload.path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try { await target.writeFile(bytes); await target.sync() }
  finally { await target.close() }
  for (const folder of [directory, lease.slot.historyDir]) {
    const handle = await open(folder, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    try { await handle.sync() } finally { await handle.close() }
  }
  if (hashBytes(await Bun.file(payload.path).bytes()) !== payload.sha256) throw new EvalFailure("USER_STORAGE_ARCHIVE_UNCONFIRMED", 2)
  await server.assertHeld()
  await lease.assertHeld()
  const receipt = { ...base, status: "committed" as const, committedAt: new Date().toISOString() }
  await writeLeaseReceipt(journal, receipt)
  return { ...receipt, source: { path: journal, sha256: hash(receipt) } }
}

async function snapshotRoot(file: SlotFile, lease: SlotLease, nonce: string) {
  const observed = await inspectUserStorage(file, lease.identity, lease.slot, nonce)
  observed.entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  const child = Bun.spawn(["docker", "--host", "unix:///var/run/docker.sock", "exec", lease.identity.containerId,
    "env", "-i", "PATH=/usr/bin:/bin", "LC_ALL=C", "find", "-P", observed.root, "-printf", "%P\\0%m\\0%l\\0%T@\\0%C@\\0"],
    { stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 20_000 })
  const [code, output] = await Promise.all([child.exited, new Response(child.stdout).bytes(), new Response(child.stderr).text()])
  if (code !== 0) throw new EvalFailure("USER_STORAGE_ARCHIVE_UNCONFIRMED", 2)
  const fields = new TextDecoder("utf-8", { fatal: true }).decode(output).split("\0")
  if (fields.pop() !== "" || fields.length % 5) throw new EvalFailure("USER_STORAGE_ARCHIVE_UNCONFIRMED", 2)
  const details = Array.from({ length: fields.length / 5 }, (_, index) => {
    const row = fields.slice(index * 5, index * 5 + 5)
    if (!/^[0-7]{1,4}$/.test(row[1]!) || row[0] !== "" && !observed.entries.some(entry => entry.name === row[0]))
      throw new EvalFailure("USER_STORAGE_ARCHIVE_CHANGED", 2)
    return { name: row[0]!, mode: Number.parseInt(row[1]!, 8), target: row[2]!, modifiedAt: row[3]!, changedAt: row[4]! }
  }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  if (details.length !== observed.entries.length + 1 || new Set(details.map(entry => entry.name)).size !== details.length || details[0]?.name !== "")
    throw new EvalFailure("USER_STORAGE_ARCHIVE_CHANGED", 2)
  return { observed, details }
}

async function copyRoot(container: string, root: string) {
  // No trailing /. or -L: preserve the source root and symlink objects.
  const child = Bun.spawn(["docker", "--host", "unix:///var/run/docker.sock", "cp", `${container}:${root}`, "-"],
    { stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 30_000 })
  const [code, bytes] = await Promise.all([child.exited, new Response(child.stdout).bytes(), new Response(child.stderr).text()])
  if (code !== 0) throw new EvalFailure("USER_STORAGE_ARCHIVE_COPY", 2)
  return bytes
}

async function filesInArchive(bytes: Uint8Array, observed: Awaited<ReturnType<typeof inspectUserStorage>>) {
  // Bun 1.3.14 truncates Docker PAX archives at Unicode paths. GNU tar reads
  // regular payloads through stdin only; directories and links are never extracted.
  const child = Bun.spawn(["tar", "--extract", "--file=-", "--to-command=" +
    'digest=$(sha256sum) || exit; printf \'%s\\0%s\\0%s\\0\' "$TAR_FILENAME" "$TAR_SIZE" "${digest%% *}"'],
    { env: { PATH: "/usr/bin:/bin", LC_ALL: "C" }, stdin: bytes, stdout: "pipe", stderr: "pipe", timeout: 30_000 })
  const [code, output] = await Promise.all([child.exited, new Response(child.stdout).bytes(), new Response(child.stderr).text()])
  if (code !== 0) throw new EvalFailure("USER_STORAGE_ARCHIVE_COPY", 2)
  const fields = new TextDecoder("utf-8", { fatal: true }).decode(output).split("\0")
  const expected = observed.entries.filter(entry => entry.type === "f")
  if (fields.pop() !== "" || fields.length !== expected.length * 3) throw new EvalFailure("USER_STORAGE_ARCHIVE_CHANGED", 2)
  const files = Array.from({ length: fields.length / 3 }, (_, index) => ({ name: fields[index * 3]!, bytes: fields[index * 3 + 1]!, sha256: fields[index * 3 + 2]! }))
  return expected.map(entry => {
    const matches = files.filter(file => file.name === `${observed.username}/${entry.name}`)
    if (matches.length !== 1 || matches[0]!.bytes !== String(entry.bytes) || !/^[a-f0-9]{64}$/.test(matches[0]!.sha256))
      throw new EvalFailure("USER_STORAGE_ARCHIVE_CHANGED", 2)
    return { name: entry.name, bytes: entry.bytes, sha256: matches[0]!.sha256 }
  })
}

async function privateDirectory(directory: string) {
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700 || await realpath(directory) !== directory)
    throw new EvalFailure("USER_STORAGE_ARCHIVE_PRIVATE", 2)
  return { path: directory, device: String(info.dev), inode: String(info.ino) }
}

function hash(value: unknown) {
  return hashBytes(JSON.stringify(value))
}

function hashBytes(value: string | Uint8Array) {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}
