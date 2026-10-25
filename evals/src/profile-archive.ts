import path from "node:path"
import { constants } from "node:fs"
import { lstat, mkdir, open, readdir, readlink, realpath, rename } from "node:fs/promises"
import { assertProfileClean, profileHistory, waitProfileIdle } from "./profile"
import { writerIdentity, type ProcessCleanup, type UnitBinding, type UnitExitProof } from "./process-supervisor"
import { readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { EvalFailure } from "./fail"
import { loadResourceSlots, type ServerIdentity } from "./slots"

type Snapshot = { kind: "file" | "directory" | "link" | "socket"; device: string; inode: string; uid: number; mode: number; size: string; hash: string }
type Manifest = { version: 1; kind: "profile-archive"; profile: string; archive: string;
  bindings: { directory: string; device: string; inode: string }[]; roots: { name: string; snapshot: Snapshot }[]; status: "intent" | "committed"; at: string; committedAt?: string }

/** The caller holds the profile lease. Pending recovery is archived as evidence, not resolved. */
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
  if (await writerIdentity(profile) || !await waitProfileIdle(profile, 1_000)) throw new EvalFailure("ARCHIVE_PROFILE_BUSY", 2)
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

export async function confirmedProfileArchive(attemptDir: string, profileDir: string, historyDir = path.resolve(profileDir) + ".history") {
  const cleanup = await Bun.file(path.join(attemptDir, "cleanup.json")).json() as {
    result?: { status?: string }; stages?: { stage: string; status: string; path?: string }[];
    archive?: string | { status?: string; archive?: string; journal?: string }; profileDir?: string;
    processes?: Partial<ProcessCleanup>; serverSessions?: string; storageDeletionAllowed?: boolean; nextAdmissionAllowed?: boolean
  }
  if (cleanup.processes?.status === "failed") return confirmedRecoveredArchive(attemptDir, profileDir, historyDir, cleanup.processes)
  if (typeof cleanup.archive === "string") {
    if (cleanup.profileDir !== path.resolve(profileDir) || await realpath(profileDir) !== cleanup.profileDir ||
      !cleanup.archive.startsWith(path.resolve(historyDir) + path.sep) || await realpath(cleanup.archive) !== cleanup.archive ||
      cleanup.processes?.status !== "confirmed" || cleanup.processes.capture_complete !== true ||
      !Array.isArray(cleanup.processes.unknownProcesses) || cleanup.processes.unknownProcesses.length !== 0 ||
      cleanup.serverSessions !== "confirmed" || cleanup.storageDeletionAllowed !== true || cleanup.nextAdmissionAllowed !== true)
      throw Error("native evidence requires own confirmed history archive")
    return cleanup.archive
  }
  const archive = cleanup.stages?.find(stage => stage.stage === "profile_history" && stage.status === "confirmed")?.path
  if (cleanup.result?.status !== "confirmed" || !archive || !archive.startsWith(path.resolve(historyDir) + path.sep) || await realpath(archive) !== archive)
    throw Error("native evidence requires own confirmed history archive")
  if (cleanup.archive || path.resolve(historyDir) !== path.resolve(profileDir) + ".history") {
    if (cleanup.archive?.status !== "committed" || cleanup.archive.archive !== archive || !cleanup.archive.journal)
      throw Error("archive profile identity unconfirmed")
    const manifest = await readLeaseReceipt(cleanup.archive.journal)
    if (!manifest || typeof manifest !== "object" || !("kind" in manifest) || manifest.kind !== "profile-archive" ||
      !("status" in manifest) || manifest.status !== "committed" || !("profile" in manifest) || manifest.profile !== path.resolve(profileDir) ||
      !("archive" in manifest) || manifest.archive !== archive)
      throw Error("archive profile identity differs")
  }
  return archive
}

async function confirmedRecoveredArchive(attemptDir: string, profileDir: string, historyDir: string, original: Partial<ProcessCleanup>) {
  const refuse = () => { throw Error("native evidence requires own confirmed recovery archive") }
  const runDir = path.dirname(path.dirname(attemptDir))
  const config = await Bun.file(path.join(runDir, "config.json")).json() as { commandJournal: string; slotsFile: string }
  const file = await loadResourceSlots(config.slotsFile)
  const command = await readLeaseReceipt(config.commandJournal) as { version: number; kind: string; commandId: string; runDir: string;
    identity: ServerIdentity; unitBinding: UnitBinding; attempts: { taskId: string; attempt: number; slotId: string; purpose: string }[] }
  const result = await Bun.file(path.join(attemptDir, "result.json")).json() as { task_id: string; attempt: number; slot_id: string }
  const slot = file.slots.find(slot => slot.id === result.slot_id && slot.profileDir === profileDir && slot.historyDir === historyDir)
  if (!slot || await realpath(attemptDir) !== attemptDir || await realpath(profileDir) !== profileDir ||
    command.version !== 2 || command.kind !== "unactivated-preparation" || !command.commandId || command.runDir !== runDir ||
    path.dirname(config.commandJournal) !== file.controller.stateDir || !/^[a-f0-9]{64}$/.test(command.identity?.serverEpoch ?? "") ||
    path.join(runDir, result.task_id, String(result.attempt)) !== attemptDir ||
    command.attempts?.filter(row => row.taskId === result.task_id && row.attempt === result.attempt && row.slotId === slot.id && row.purpose === "measurement").length !== 1)
    return refuse()
  const sourceFile = path.join(attemptDir, "cleanup.json"), bytes = await Bun.file(sourceFile).arrayBuffer()
  const proof = await readLeaseReceipt(`${sourceFile}.unit-exit.json`) as UnitExitProof
  if (JSON.stringify(JSON.parse(Buffer.from(bytes).toString()).processes) !== JSON.stringify(original) ||
    original.status !== "failed" || original.observation_mode !== "continuous" || original.capture_complete !== true ||
    !Array.isArray(original.unknownProcesses) || original.unknownProcesses.length ||
    original.lifetime?.producer_pid !== command.unitBinding?.producer.pid || original.lifetime?.owner.kind !== "slot" || original.lifetime.owner.id !== slot.id ||
    proof.version !== 1 || proof.kind !== "systemd-unit-exit" || proof.source?.file !== sourceFile ||
    proof.source.sha256 !== new Bun.CryptoHasher("sha256").update(bytes).digest("hex") || proof.profile !== profileDir ||
    JSON.stringify(proof.binding) !== JSON.stringify(command.unitBinding) ||
    proof.registration?.bytes !== String(original.launcher?.pid) || proof.registration.uid !== command.unitBinding.producer.uid || (proof.registration.mode & 0o777) !== 0o600 ||
    proof.processes?.status !== "confirmed" || proof.processes.error !== null || proof.processes.writer !== null ||
    proof.processes.observation_mode !== "systemd_post_exit" || proof.processes.capture_complete !== true ||
    !Array.isArray(proof.processes.unknownProcesses) || proof.processes.unknownProcesses.length ||
    proof.processes.lifetime?.producer_pid !== original.lifetime?.producer_pid ||
    proof.processes.verification?.length !== 2 || proof.processes.verification.some(pass => pass.owned_remaining !== 0) ||
    proof.passes?.length !== 2 || proof.passes.some(pass => pass.owned_remaining !== 0 || pass.cgroup_remaining !== 0)) return refuse()
  const matches = []
  for (const name of (await readdir(file.controller.stateDir)).filter(name => name.startsWith(`slot-${slot.id}-`) && name.endsWith(".lease.json"))) {
    const receipt = path.join(file.controller.stateDir, name)
    const lease = await readLeaseReceipt(receipt) as { version: number; state: string; token: string; commandId: string; journal: string;
      slot: typeof slot; identity: ServerIdentity; cleanupReceipt: string; resources: { key: string; token: string; revision: number }[] }
    if (lease.commandId === command.commandId && lease.journal === config.commandJournal &&
      JSON.stringify(lease.slot) === JSON.stringify(slot) && JSON.stringify(lease.identity) === JSON.stringify(command.identity)) matches.push({ receipt, lease })
  }
  if (matches.length !== 1) return refuse()
  const { receipt, lease } = matches[0]!
  const resource = lease.resources?.[0], key = `profile:${profileDir}`
  if (lease.version !== 2 || lease.state !== "released" || !lease.token || lease.resources?.length !== 1 || resource?.key !== key ||
    !resource.token || !Number.isSafeInteger(resource.revision) || resource.revision < 1 ||
    lease.cleanupReceipt !== path.join(file.controller.stateDir, `startup-${lease.token}.json`)) return refuse()
  const release = await readLeaseReceipt(`${receipt}.${new Bun.CryptoHasher("sha256").update(key).digest("hex")}.released.json`) as {
    version: number; kind: string; status: string; key: string; token: string; revision: number; slotReceipt: string;
    cleanupReceipt: string; cleanupReceiptHash: string; serverEpoch: string }
  const cleanup = await readLeaseReceipt(lease.cleanupReceipt) as { version: number; status: string; slotId: string; leaseToken: string;
    serverEpoch: string; processes: string; serverSessions: string; archive: string; profileArchive: string; attemptDirs: string[];
    unused: boolean; storageDeletionAllowed: boolean; nextAdmissionAllowed: boolean }
  if (release.version !== 2 || release.kind !== "slot-resource-release" || release.status !== "confirmed" || release.key !== key ||
    release.token !== resource.token || release.revision !== resource.revision || release.slotReceipt !== receipt ||
    release.cleanupReceipt !== lease.cleanupReceipt || release.serverEpoch !== command.identity.serverEpoch ||
    release.cleanupReceiptHash !== new Bun.CryptoHasher("sha256").update(JSON.stringify(cleanup)).digest("hex") ||
    cleanup.version !== 2 || cleanup.status !== "confirmed" || cleanup.slotId !== slot.id || cleanup.leaseToken !== lease.token ||
    cleanup.serverEpoch !== command.identity.serverEpoch || cleanup.processes !== "confirmed" || cleanup.serverSessions !== "confirmed" ||
    cleanup.archive !== "committed" || cleanup.unused !== false || cleanup.storageDeletionAllowed !== true || cleanup.nextAdmissionAllowed !== true ||
    !Array.isArray(cleanup.attemptDirs) || !cleanup.attemptDirs.includes(attemptDir) || typeof cleanup.profileArchive !== "string" ||
    !cleanup.profileArchive.startsWith(path.resolve(historyDir) + path.sep) || await realpath(cleanup.profileArchive) !== cleanup.profileArchive) return refuse()
  // Historical native release remains valid after a later command replaces the current reservation.
  return cleanup.profileArchive
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
  const kind = info.isSymbolicLink() ? "link" : info.isDirectory() ? "directory" : info.isFile() ? "file" : info.isSocket() ? "socket" : undefined
  if (!kind || info.uid !== BigInt(process.getuid!()) || (kind === "file" || kind === "socket") && info.nlink !== 1n)
    throw Object.assign(new EvalFailure("ARCHIVE_TOPOLOGY", 2), { cause: { path: file, kind: kind ?? "other", type: Number(info.mode & 0o170000n),
      device: String(info.dev), inode: String(info.ino), uid: Number(info.uid), gid: Number(info.gid), mode: Number(info.mode), nlink: String(info.nlink) } })
  const hash = new Bun.CryptoHasher("sha256")
  if (kind === "link") hash.update(await readlink(file))
  if (kind === "directory") hash.update(JSON.stringify(await Promise.all((await readdir(file)).sort().map(async name => ({ name, snapshot: await capture(path.join(file, name)) })))))
  if (kind === "file") for await (const bytes of Bun.file(file).stream()) hash.update(bytes)
  return { kind, device: String(info.dev), inode: String(info.ino), uid: Number(info.uid), mode: Number(info.mode & 0o7777n), size: String(info.size), hash: hash.digest("hex") }
}

async function syncTree(file: string) {
  const info = await lstat(file)
  // Socket objects have no file payload to fsync; their name is persisted with the containing directory.
  if (info.isSymbolicLink() || info.isSocket()) return
  if (info.isDirectory()) await Promise.all((await readdir(file)).map(name => syncTree(path.join(file, name))))
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | (info.isDirectory() ? constants.O_DIRECTORY : 0))
  try { await handle.sync() } finally { await handle.close() }
}

async function syncDirectory(directory: string) {
  const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try { await handle.sync() } finally { await handle.close() }
}
