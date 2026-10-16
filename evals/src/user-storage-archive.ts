import path from "node:path"
import { constants } from "node:fs"
import { lstat, mkdtemp, open, realpath } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { inspectUserStorage } from "./parallel-pair"
import { readUserOwnership, readUserPreparation } from "./user-environment"
import type { acquireEnvironmentLeases, SlotFile, SlotLease } from "./slots"

type ServerLease = Awaited<ReturnType<typeof acquireEnvironmentLeases>>["server"]
type Snapshot = Awaited<ReturnType<typeof snapshotRoot>>
type Manifest = { version: 1; kind: "user-storage-archive"; context: Awaited<ReturnType<typeof archiveContext>>["binding"];
  root: Snapshot["observed"]; rootDetails: Snapshot["details"][number];
  entries: (Snapshot["observed"]["entries"][number] & Snapshot["details"][number] & { sha256?: string })[];
  directory: Awaited<ReturnType<typeof privateDirectory>>; payload: { path: string; bytes: number; sha256: string };
  startedAt: string; status: "copying" | "committed"; committedAt?: string; storageDeletionAllowed: false; nextAdmissionAllowed: false;
  partialCopies?: { expected: { path: string; bytes: number; sha256: string }; observed: { bytes: number; sha256: string } | null }[] }
type Archive = Manifest & { status: "committed"; committedAt: string; source: { path: string; sha256: string } }

/** Copies all owned server material; a committed snapshot grants no deletion. */
export async function archiveUserStorage(file: SlotFile, server: ServerLease, lease: SlotLease, id: string): Promise<Archive> {
  const context = await archiveContext(file, server, lease, id)
  const journal = path.join(file.controller.stateDir, `user-storage-archive-${id}.json`)
  const existing = await lstat(journal).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  const saved = existing ? (await loadStorageArchive(file, server, lease, { path: journal, sha256: hash(await readLeaseReceipt(journal)) })).receipt : undefined
  if (saved?.status === "committed") {
    const previous = await readUserStorageArchive(file, server, lease, { path: journal, sha256: hash(await readLeaseReceipt(journal)) })
    const expected = archivedSnapshot(previous)
    if (hash(await snapshotRoot(file, lease, context.prepared.nonce)) !== hash(expected) ||
      hash(await filesInArchive(await copyRoot(lease.identity.containerId, previous.root.root), previous.root)) !== hash(regularFiles(previous)) ||
      hash(await snapshotRoot(file, lease, context.prepared.nonce)) !== hash(expected)) throw new EvalFailure("USER_STORAGE_ARCHIVE_CHANGED", 2)
    return previous
  }
  const startedAt = saved?.startedAt ?? new Date().toISOString()
  const before = await snapshotRoot(file, lease, context.prepared.nonce)
  if (saved && hash(archivedSnapshot(saved)) !== hash(before)) throw new EvalFailure("USER_STORAGE_ARCHIVE_CHANGED", 2)
  if (["device", "inode", "uid", "gid"].some(key => context.published[key] !== before.observed[key as keyof typeof before.observed]))
    throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
  const bytes = await copyRoot(lease.identity.containerId, before.observed.root)
  const files = await filesInArchive(bytes, before.observed)
  if (saved && hash(files) !== hash(regularFiles(saved))) throw new EvalFailure("USER_STORAGE_ARCHIVE_CHANGED", 2)
  if (hash(await filesInArchive(await copyRoot(lease.identity.containerId, before.observed.root), before.observed)) !== hash(files) ||
    hash(await snapshotRoot(file, lease, context.prepared.nonce)) !== hash(before)) throw new EvalFailure("USER_STORAGE_ARCHIVE_CHANGED", 2)
  await server.assertHeld()
  await lease.assertHeld()
  if (hash(await readLeaseReceipt(context.publication)) !== hash(context.published)) throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
  const partialCopies = saved ? [...saved.partialCopies ?? [], { expected: saved.payload, observed: await payloadSnapshot(saved.payload.path) }] : undefined
  const directory = await mkdtemp(path.join(lease.slot.historyDir, "user-storage-"))
  const binding = await privateDirectory(directory)
  const payload = { path: path.join(directory, "payload.tar"), bytes: bytes.byteLength, sha256: hashBytes(bytes) }
  const entries = before.observed.entries.map(entry => ({ ...entry, ...before.details.find(detail => detail.name === entry.name)!,
    ...(entry.type === "f" ? { sha256: files.find(item => item.name === entry.name)!.sha256 } : {}) }))
  const base = { version: 1 as const, kind: "user-storage-archive" as const, context: context.binding, root: before.observed, rootDetails: before.details.find(detail => detail.name === "")!,
    entries, directory: binding, payload, startedAt, ...(partialCopies ? { partialCopies } : {}), storageDeletionAllowed: false as const, nextAdmissionAllowed: false as const }
  await writeLeaseReceipt(journal, { ...base, status: "copying" })
  const target = await open(payload.path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try { await target.writeFile(bytes); await target.sync() }
  finally { await target.close() }
  for (const folder of [directory, lease.slot.historyDir]) {
    const handle = await open(folder, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    try { await handle.sync() } finally { await handle.close() }
  }
  if (hashBytes(await Bun.file(payload.path).bytes()) !== payload.sha256) throw new EvalFailure("USER_STORAGE_ARCHIVE_UNCONFIRMED", 2)
  for (const partial of base.partialCopies ?? []) {
    if (JSON.stringify(await payloadSnapshot(partial.expected.path)) !== JSON.stringify(partial.observed))
      throw new EvalFailure("USER_STORAGE_ARCHIVE_UNCONFIRMED", 2)
  }
  await server.assertHeld()
  await lease.assertHeld()
  const receipt = { ...base, status: "committed" as const, committedAt: new Date().toISOString() }
  await writeLeaseReceipt(journal, receipt)
  return { ...receipt, source: { path: journal, sha256: hash(receipt) } }
}

/** Historical payload proof; current server files need not still exist. */
export async function readUserStorageArchive(file: SlotFile, server: ServerLease, lease: SlotLease, source: { path: string; sha256: string }): Promise<Archive> {
  const loaded = await loadStorageArchive(file, server, lease, source)
  const receipt = loaded.receipt
  if (receipt.status !== "committed" || !receipt.committedAt) throw new EvalFailure("USER_STORAGE_ARCHIVE_UNCONFIRMED", 2)
  const bytes = await readPayload(receipt.payload.path)
  if (!bytes || bytes.byteLength !== receipt.payload.bytes || hashBytes(bytes) !== receipt.payload.sha256 ||
    hash(await filesInArchive(bytes, receipt.root)) !== hash(regularFiles(receipt))) throw new EvalFailure("USER_STORAGE_ARCHIVE_UNCONFIRMED", 2)
  if (hash(await archiveContext(file, server, lease, receipt.context.id)) !== hash(loaded.context) || hash(await readLeaseReceipt(source.path)) !== source.sha256 ||
    hash(await privateDirectory(receipt.directory.path)) !== hash(receipt.directory)) throw new EvalFailure("USER_STORAGE_ARCHIVE_UNCONFIRMED", 2)
  return { ...receipt, status: "committed", committedAt: receipt.committedAt, source }
}

async function loadStorageArchive(file: SlotFile, server: ServerLease, lease: SlotLease, source: { path: string; sha256: string }) {
  const name = path.basename(source.path).match(/^user-storage-archive-([a-f0-9-]{36})\.json$/)
  if (!name || path.dirname(source.path) !== file.controller.stateDir || path.resolve(source.path) !== source.path || !/^[a-f0-9]{64}$/.test(source.sha256))
    throw new EvalFailure("USER_STORAGE_ARCHIVE_UNCONFIRMED", 2)
  const context = await archiveContext(file, server, lease, name[1]!)
  const value = await readLeaseReceipt(source.path)
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EvalFailure("USER_STORAGE_ARCHIVE_UNCONFIRMED", 2)
  const row = value as Partial<Manifest>
  if (hash(row) !== source.sha256 || row.version !== 1 || row.kind !== "user-storage-archive" || !["copying", "committed"].includes(String(row.status)) ||
    JSON.stringify(row.context) !== JSON.stringify(context.binding) || !row.root || row.root.root !== context.published.root ||
    ["device", "inode", "uid", "gid"].some(key => context.published[key] !== row.root![key as keyof typeof row.root]) ||
    !row.rootDetails || !Array.isArray(row.entries) || !row.directory || path.dirname(row.directory.path) !== lease.slot.historyDir ||
    !path.basename(row.directory.path).startsWith("user-storage-") || !row.payload || row.payload.path !== path.join(row.directory.path, "payload.tar") ||
    !/^[a-f0-9]{64}$/.test(row.payload.sha256) || !Number.isSafeInteger(row.payload.bytes) || row.payload.bytes < 0 ||
    row.storageDeletionAllowed !== false || row.nextAdmissionAllowed !== false ||
    !Number.isFinite(Date.parse(row.startedAt ?? "")) || row.status === "committed" && !Number.isFinite(Date.parse(row.committedAt ?? "")) || row.partialCopies !== undefined && !Array.isArray(row.partialCopies))
    throw new EvalFailure("USER_STORAGE_ARCHIVE_UNCONFIRMED", 2)
  if (hash(await privateDirectory(row.directory.path)) !== hash(row.directory)) throw new EvalFailure("USER_STORAGE_ARCHIVE_UNCONFIRMED", 2)
  const receipt = row as Manifest
  for (const partial of receipt.partialCopies ?? []) {
    if (path.basename(partial.expected.path) !== "payload.tar" || path.dirname(path.dirname(partial.expected.path)) !== lease.slot.historyDir ||
      !path.basename(path.dirname(partial.expected.path)).startsWith("user-storage-"))
      throw new EvalFailure("USER_STORAGE_ARCHIVE_UNCONFIRMED", 2)
    await privateDirectory(path.dirname(partial.expected.path))
    if (JSON.stringify(await payloadSnapshot(partial.expected.path)) !== JSON.stringify(partial.observed))
      throw new EvalFailure("USER_STORAGE_ARCHIVE_UNCONFIRMED", 2)
  }
  return { receipt, context }
}

async function readPayload(file: string) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (!handle) return null
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600)
      throw new EvalFailure("USER_STORAGE_ARCHIVE_UNCONFIRMED", 2)
    const bytes = await handle.readFile()
    // A recovered partial may have been interrupted before its first fsync.
    await handle.sync()
    return bytes
  } finally { await handle.close() }
}

async function payloadSnapshot(file: string) {
  const bytes = await readPayload(file)
  return bytes ? { bytes: bytes.byteLength, sha256: hashBytes(bytes) } : null
}

async function archiveContext(file: SlotFile, server: ServerLease, lease: SlotLease, id: string) {
  await server.assertHeld()
  await lease.assertHeld()
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id) ||
    server.reservation.key !== `server:${lease.identity.containerId}` || hash(server.reservation.identity) !== hash(lease.identity))
    throw new EvalFailure("USER_STORAGE_ARCHIVE_SCOPE", 2)
  await privateDirectory(file.controller.stateDir)
  await privateDirectory(lease.slot.historyDir)
  const prepared = await readUserPreparation(file, lease, path.join(file.controller.stateDir, `prepare-${lease.slot.id}.secret.json`))
  const owned = await readUserOwnership(file, lease, prepared.secretFile)
  const publication = path.join(file.controller.stateDir, `storage-${lease.slot.id}.json`)
  const published = await readLeaseReceipt(publication) as Record<string, unknown>
  const expected = { version: 2, kind: "owned-user-storage", state: "published", slotId: lease.slot.id, username: lease.slot.username,
    identity: lease.identity, preparationNonce: prepared.nonce, userKey: owned.userKey, ownerSource: owned.source.sha256,
    root: `${file.server.storageRoot}/${lease.slot.username}` }
  if (!published || typeof published !== "object" || Array.isArray(published) ||
    Object.entries(expected).some(([key, value]) => JSON.stringify(published[key]) !== JSON.stringify(value))) throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
  return { prepared, publication, published, binding: { identity: lease.identity, slotId: lease.slot.id, leaseToken: lease.token,
    serverToken: server.reservation.token, serverRevision: server.reservation.revision, id, preparationNonce: prepared.nonce,
    publication: { path: publication, sha256: hash(published) } } }
}

function regularFiles(receipt: Manifest) {
  return receipt.entries.filter(entry => entry.type === "f").map(entry => ({ name: entry.name, bytes: entry.bytes, sha256: entry.sha256 }))
}

function archivedSnapshot(receipt: Manifest) {
  return { observed: receipt.root, details: [receipt.rootDetails, ...receipt.entries.map(entry => ({ name: entry.name, mode: entry.mode,
    target: entry.target, modifiedAt: entry.modifiedAt, changedAt: entry.changedAt }))] }
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
