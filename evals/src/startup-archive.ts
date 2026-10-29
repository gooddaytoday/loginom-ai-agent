import { dlopen, ptr, read } from "bun:ffi"
import { getSystemErrorName } from "node:util"
import path from "node:path"
import { lstat, readFile, readdir, realpath, open, unlink, readlink } from "node:fs/promises"
import { readLeaseReceipt, type acquireResourceLease } from "./lease"
import { assertProfileClean } from "./profile"
import type { SlotLease } from "./slots"

type ServerLease = Awaited<ReturnType<typeof acquireResourceLease>>
const hash = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
export async function startupArchiveInventory(history: string, archive: string) {
  if (path.dirname(archive) !== history || !path.isAbsolute(history) || path.resolve(history) !== history) throw Error("STARTUP_ARCHIVE_UNCONFIRMED")
  for (const directory of [history, archive]) {
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.mode & 0o077 || await realpath(directory) !== directory)
      throw Error("STARTUP_ARCHIVE_UNCONFIRMED")
  }
  const inventory: { name: string; device: number; inode: number; bytes: number; sha256: string | null; kind?: "link" | "socket"; target?: string; mode?: number }[] = []
  async function walk(directory: string) {
    for (const name of (await readdir(directory)).sort()) {
      const file = path.join(directory, name), info = await lstat(file)
      if (info.uid !== process.getuid?.() || (!info.isDirectory() && !info.isSymbolicLink() && !info.isSocket() && !info.isFile()) ||
        (info.isFile() || info.isSocket()) && info.nlink !== 1)
        throw Error("STARTUP_ARCHIVE_UNCONFIRMED")
      inventory.push({ name: path.relative(archive, file), device: info.dev, inode: info.ino, bytes: info.size,
        sha256: info.isFile() ? hash(await readFile(file)) : null,
        ...(info.isSymbolicLink() ? { kind: "link" as const, target: await readlink(file), mode: info.mode } : {}),
        ...(info.isSocket() ? { kind: "socket" as const, mode: info.mode } : {}) })
      if (info.isDirectory()) await walk(file)
    }
  }
  await walk(archive)
  return inventory
}
export type StartupArchive = { file: string; sha256: string; archive: string; inventory: Awaited<ReturnType<typeof startupArchiveInventory>> }
const savedArchives = new WeakMap<StartupArchive, { bytes: string; proof: Buffer; composite: string; server: ServerLease; lease: SlotLease }>()

async function loadStartupArchive(file: string, server: ServerLease, lease: SlotLease) {
  await server.assertHeld(); await lease.assertHeld()
  const info = await lstat(file).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return; throw error })
  if (!info) return undefined
  const proof = await readLeaseReceipt(file) as Record<string, unknown>, bytes = await readFile(file)
  const composite = await readLeaseReceipt(lease.receipt) as Record<string, unknown>
  if (JSON.stringify(JSON.parse(bytes.toString())) !== JSON.stringify(proof) || proof.version !== 2 || proof.status !== "confirmed" ||
    proof.slotId !== lease.slot.id || proof.leaseToken !== lease.token || proof.serverEpoch !== lease.identity.serverEpoch ||
    proof.processes !== "confirmed" || proof.serverSessions !== "confirmed" || proof.archive !== "committed" ||
    proof.storageDeletionAllowed !== true || proof.nextAdmissionAllowed !== true || proof.unused !== false ||
    !Array.isArray(proof.attemptDirs) || proof.attemptDirs.length !== 0 || typeof proof.profileArchive !== "string" ||
    composite.token !== lease.token || composite.commandId !== server.reservation.commandId || composite.journal !== server.reservation.journal ||
    composite.state !== "retained" || JSON.stringify(composite.identity) !== JSON.stringify(lease.identity) ||
    JSON.stringify(composite.slot) !== JSON.stringify(lease.slot)) throw Error("STARTUP_ARCHIVE_UNCONFIRMED")
  await assertProfileClean(lease.slot.profileDir)
  const archive: StartupArchive = { file, sha256: hash(bytes), archive: proof.profileArchive,
    inventory: await startupArchiveInventory(lease.slot.historyDir, proof.profileArchive) }
  return { archive, proof, bytes, composite }
}

function anchorBinding(file: string, bytes: Buffer, composite: unknown, server: ServerLease, archive: StartupArchive, commandHash: string) {
  return { version: 1, kind: "startup-archive-anchor", source: { file, sha256: hash(bytes) },
    command: { file: server.reservation.journal, sha256: commandHash, commandId: server.reservation.commandId },
    compositeSha256: hash(Buffer.from(JSON.stringify(composite))), archive: archive.archive }
}

export async function readStartupArchive(file: string, server: ServerLease, lease: SlotLease) {
  const loaded = await loadStartupArchive(file, server, lease)
  if (!loaded) return undefined
  const { archive, proof, bytes, composite } = loaded
  let expected = proof.archiveInventory
  if (!Array.isArray(expected)) {
    const anchor = await readLeaseReceipt(`${file}.archive-anchor.json`).catch(() => { throw Error("STARTUP_ARCHIVE_ANCHOR_REQUIRED") }) as Record<string, unknown>
    const binding = anchorBinding(file, bytes, composite, server, archive, hash(await readFile(server.reservation.journal)))
    if (Object.entries(binding).some(([key, value]) => JSON.stringify(anchor[key]) !== JSON.stringify(value))) throw Error("STARTUP_ARCHIVE_ANCHOR_MISMATCH")
    expected = anchor.inventory
  }
  if (!Array.isArray(expected) || JSON.stringify(expected) !== JSON.stringify(archive.inventory)) throw Error("STARTUP_ARCHIVE_CHANGED")
  savedArchives.set(archive, { bytes: JSON.stringify(archive), proof: bytes, composite: JSON.stringify(composite), server, lease })
  return archive
}

/** Explicit legacy migration, under original leases, from independently retained pre-cleanup hashes. Never rewrites a proof or anchor. */
export async function sealLegacyStartupArchive(file: string, server: ServerLease, lease: SlotLease, evidenceFile: string, evidenceHash: string) {
  const loaded = await loadStartupArchive(file, server, lease)
  if (!loaded || Array.isArray(loaded.proof.archiveInventory)) throw Error("STARTUP_ARCHIVE_ANCHOR_INELIGIBLE")
  const evidence = await readLeaseReceipt(evidenceFile) as { history?: { slotId: string; profileDir: string; files: { file: string; sha256: string }[] }[] }
  const evidenceBytes = await readFile(evidenceFile)
  if (!/^[a-f0-9]{64}$/.test(evidenceHash) || hash(evidenceBytes) !== evidenceHash || JSON.stringify(JSON.parse(evidenceBytes.toString())) !== JSON.stringify(evidence) || !Array.isArray(evidence.history))
    throw Error("STARTUP_ARCHIVE_HISTORY_UNCONFIRMED")
  const matches = evidence.history.filter(row => row.slotId === lease.slot.id && row.profileDir === lease.slot.profileDir)
  if (matches.length !== 1 || !Array.isArray(matches[0]!.files)) throw Error("STARTUP_ARCHIVE_HISTORY_UNCONFIRMED")
  const expected = matches[0]!.files.map(row => {
    const name = path.relative(lease.slot.profileDir, row.file)
    if (!name || name.startsWith("..") || path.isAbsolute(name) || !/^[a-f0-9]{64}$/.test(row.sha256)) throw Error("STARTUP_ARCHIVE_HISTORY_UNCONFIRMED")
    return { name, sha256: row.sha256 }
  }).sort((a,b) => a.name.localeCompare(b.name))
  if (loaded.archive.inventory.some(row => row.kind)) throw Error("STARTUP_ARCHIVE_HISTORY_UNCONFIRMED")
  const actual = loaded.archive.inventory.filter(row => row.sha256 !== null).map(({name,sha256}) => ({name,sha256})).sort((a,b) => a.name.localeCompare(b.name))
  if (new Set(expected.map(row => row.name)).size !== expected.length || JSON.stringify(actual) !== JSON.stringify(expected)) throw Error("STARTUP_ARCHIVE_HISTORY_UNCONFIRMED")
  const command = await readFile(server.reservation.journal)
  const anchor = { ...anchorBinding(file, loaded.bytes, loaded.composite, server, loaded.archive, hash(command)),
    evidence: { file: evidenceFile, sha256: evidenceHash }, inventory: loaded.archive.inventory }
  await server.assertHeld(); await lease.assertHeld()
  if (!(await readFile(file)).equals(loaded.bytes) || !(await readFile(evidenceFile)).equals(evidenceBytes) ||
    !(await readFile(server.reservation.journal)).equals(command) || JSON.stringify(await readLeaseReceipt(lease.receipt)) !== JSON.stringify(loaded.composite) ||
    JSON.stringify(await startupArchiveInventory(lease.slot.historyDir, loaded.archive.archive)) !== JSON.stringify(loaded.archive.inventory)) throw Error("STARTUP_ARCHIVE_CHANGED")
  const target = `${file}.archive-anchor.json`, temporary = `${target}.tmp-${crypto.randomUUID()}`
  const handle = await open(temporary, "wx", 0o600)
  let published = false
  try {
    await handle.writeFile(JSON.stringify(anchor))
    await handle.sync()
    await handle.close()
    // RENAME_NOREPLACE publishes one link atomically; no overwrite or nlink=2 window.
    const libc = dlopen("libc.so.6", {
      renameat2: { args: ["i32", "ptr", "i32", "ptr", "u32"], returns: "i32" },
      __errno_location: { args: [], returns: "ptr" },
    })
    try {
      const sourcePath = Buffer.from(temporary + "\0"), targetPath = Buffer.from(target + "\0")
      if (libc.symbols.renameat2(-100, ptr(sourcePath), -100, ptr(targetPath), 1) !== 0) {
        const code = getSystemErrorName(-read.i32(libc.symbols.__errno_location()!))
        throw Object.assign(new Error(code), { code })
      }
      published = true
    } finally { libc.close() }
  } finally {
    await handle.close()
    if (!published) await unlink(temporary)
  }
  const directory = await open(path.dirname(target), "r")
  try { await directory.sync() } finally { await directory.close() }
  return await readStartupArchive(file, server, lease)
}

export async function validateStartupArchive(archive: StartupArchive, server: ServerLease, lease: SlotLease) {
  const saved = savedArchives.get(archive)
  if (!saved || saved.server !== server || saved.lease !== lease || saved.bytes !== JSON.stringify(archive)) throw Error("STARTUP_ARCHIVE_UNTRUSTED")
  await server.assertHeld(); await lease.assertHeld()
  if (!(await readFile(archive.file)).equals(saved.proof) || JSON.stringify(await readLeaseReceipt(lease.receipt)) !== saved.composite ||
    JSON.stringify(await startupArchiveInventory(lease.slot.historyDir, archive.archive)) !== JSON.stringify(archive.inventory))
    throw Error("STARTUP_ARCHIVE_CHANGED")
  await assertProfileClean(lease.slot.profileDir)
  const current = await readStartupArchive(archive.file, server, lease)
  if (!current || JSON.stringify(current) !== saved.bytes) throw Error("STARTUP_ARCHIVE_CHANGED")
}
