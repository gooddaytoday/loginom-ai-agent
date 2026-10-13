import path from "node:path"
import { constants } from "node:fs"
import { lstat, mkdir, open, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { EvalFailure } from "./fail"
import type { ProcessCleanup } from "./process-supervisor"
import { groupProcesses } from "./process-group"
import { assertProfileClean } from "./profile"

export const globalLockRoot = "/var/lib/loginom-evals/locks"

export type Reservation = {
  version: 2
  key: string
  revision: number
  token: string
  state: "retained" | "released" | "recovery-only"
  commandId: string
  journal: string
  owner: { bootId: string; pid: number; starttime: string; uid: number }
  releaseEvidence?: { path: string; sha256: string }
  lineage: { token: string; revision: number; journal: string }[]
}

type ResourceRequest = { key: string; lockRoot: string; journal: string; commandId: string }

export function acquireResourceLease(input: ResourceRequest) {
  return acquireResource(input)
}

export function recoverResourceLease(input: ResourceRequest, expected: { token: string; revision: number; incidentToken?: string }) {
  return acquireResource(input, expected)
}

async function acquireResource(input: ResourceRequest, expected?: { token: string; revision: number; incidentToken?: string }) {
  const root = await lstat(input.lockRoot).catch(() => { throw new EvalFailure("LEASE_LOCK_ROOT", 2) })
  if (!root.isDirectory() || root.isSymbolicLink() || root.uid !== process.getuid?.() || (root.mode & 0o777) !== 0o700 ||
    !path.isAbsolute(input.lockRoot) || await realpath(input.lockRoot) !== input.lockRoot) throw new EvalFailure("LEASE_LOCK_ROOT", 2)
  await readPrivateJson(input.journal).catch(() => { throw new EvalFailure("LEASE_JOURNAL", 2) })
  const key = new Bun.CryptoHasher("sha256").update(input.key).digest("hex")
  const guardFile = path.join(input.lockRoot, `${key}.guard`)
  const { dlopen } = await import("bun:ffi")
  const library = dlopen("libc.so.6", { flock: { args: ["i32", "i32"], returns: "i32" } })
  const handle = await open(guardFile, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600).catch(() => {
    library.close()
    throw new EvalFailure("LEASE_GUARD_CHANGED", 2)
  })
  const guard = await handle.stat()
  const checkGuard = async () => {
    const current = await lstat(guardFile).catch(() => { throw new EvalFailure("LEASE_GUARD_CHANGED", 2) })
    if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1 || current.uid !== process.getuid?.() ||
      (current.mode & 0o777) !== 0o600 || current.dev !== guard.dev || current.ino !== guard.ino)
      throw new EvalFailure("LEASE_GUARD_CHANGED", 2)
  }
  if (library.symbols.flock(handle.fd, 2 | 4) !== 0) {
    await handle.close()
    library.close()
    throw new EvalFailure("BUSY", 2)
  }
  let closed = false
  const close = async () => {
    if (closed) return
    closed = true
    try { await handle.close() } finally { library.close() }
  }
  try {
    const receipt = path.join(input.lockRoot, `${key}.reservation.json`)
    const previous = await readReservation(receipt, input.key)
    if (expected && (!previous || previous.state === "released" || previous.token !== expected.token || previous.revision !== expected.revision))
      throw new EvalFailure("LEASE_CAS_STALE", 2)
    if (!expected && previous && previous.state !== "released") throw new EvalFailure("RECOVERY_REQUIRED", 2)
    if (expected && previous) {
      if (![previous.token, ...previous.lineage.map(item => item.token)].includes(expected.incidentToken ?? expected.token))
        throw new EvalFailure("LEASE_LINEAGE_INVALID", 2)
      await Promise.all(previous.lineage.map(item => readPrivateJson(item.journal))).catch(() => { throw new EvalFailure("LEASE_JOURNAL", 2) })
      await readPrivateJson(previous.journal).catch(() => { throw new EvalFailure("LEASE_JOURNAL", 2) })
      const bootId = (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim()
      if (previous.owner.uid !== process.getuid?.()) throw new EvalFailure("LEASE_OWNER_UNVERIFIED", 2)
      const owner = previous.owner.bootId === bootId ? await readFile(`/proc/${previous.owner.pid}/stat`, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined
        throw new EvalFailure("LEASE_OWNER_UNVERIFIED", 2)
      }) : undefined
      if (owner && owner.slice(owner.lastIndexOf(")") + 2).split(" ")[19] === previous.owner.starttime) throw new EvalFailure("BUSY", 2)
    }
    const raw = await readFile(`/proc/${process.pid}/stat`, "utf8")
    const reservation: Reservation = {
      version: 2, key: input.key, revision: previous ? previous.revision + 1 : 1, token: crypto.randomUUID(), state: expected ? "recovery-only" : "retained",
      commandId: input.commandId, journal: input.journal,
      lineage: expected && previous ? [...previous.lineage, { token: previous.token, revision: previous.revision, journal: previous.journal }] : [],
      owner: { bootId: (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim(), pid: process.pid,
        starttime: raw.slice(raw.lastIndexOf(")") + 2).split(" ")[19]!, uid: process.getuid!() },
    }
    await checkGuard()
    await writeReservation(receipt, reservation)
    return { reservation, receipt, guardFile, close, async release(proof: string) {
      await checkGuard()
      const evidence = await readPrivateJson(proof).catch(() => { throw new EvalFailure("LEASE_RELEASE_UNCONFIRMED", 2) })
      const current = await readReservation(receipt, input.key)
      if (closed || !jsonObject(evidence) || evidence.version !== 2 || evidence.status !== "confirmed" || evidence.key !== reservation.key ||
        evidence.token !== reservation.token || evidence.revision !== reservation.revision || current?.token !== reservation.token || current?.revision !== reservation.revision)
        throw new EvalFailure("LEASE_RELEASE_UNCONFIRMED", 2)
      await writeReservation(receipt, { ...reservation, state: "released", releaseEvidence: { path: proof, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(evidence)).digest("hex") } })
      await close()
    } }
  } catch (error) { await close(); throw error }
}

async function writeReservation(file: string, value: Reservation) {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync() }
  finally { await handle.close() }
  await rename(temporary, file)
  const directory = await open(path.dirname(file), constants.O_RDONLY | constants.O_DIRECTORY)
  try { await directory.sync() } finally { await directory.close() }
}

async function readPrivateJson(file: string): Promise<unknown> {
  if (!path.isAbsolute(file) || await realpath(path.dirname(file)) !== path.dirname(file)) throw new EvalFailure("LEASE_FILE_PRIVATE", 2)
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600)
      throw new EvalFailure("LEASE_FILE_PRIVATE", 2)
    return JSON.parse(await handle.readFile("utf8"))
  } finally { await handle.close() }
}

async function readReservation(file: string, key: string): Promise<Reservation | undefined> {
  const value = await readPrivateJson(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw new EvalFailure("LEASE_RESERVATION_INVALID", 2)
  })
  if (value === undefined) return undefined
  if (!jsonObject(value) || value.version !== 2 || value.key !== key || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 ||
    typeof value.token !== "string" || !value.token || !["retained", "released", "recovery-only"].includes(String(value.state)) ||
    typeof value.commandId !== "string" || !value.commandId || typeof value.journal !== "string" || !path.isAbsolute(value.journal) ||
    !jsonObject(value.owner) || typeof value.owner.bootId !== "string" || !value.owner.bootId || !Number.isSafeInteger(value.owner.pid) || Number(value.owner.pid) < 1 ||
    typeof value.owner.starttime !== "string" || !/^\d+$/.test(value.owner.starttime) || !Number.isSafeInteger(value.owner.uid) ||
    !Array.isArray(value.lineage) || value.lineage.some(item => !jsonObject(item) || typeof item.token !== "string" || !item.token ||
      !Number.isSafeInteger(item.revision) || Number(item.revision) < 1 || typeof item.journal !== "string" || !path.isAbsolute(item.journal)) ||
    (value.state === "released" && (!jsonObject(value.releaseEvidence) || typeof value.releaseEvidence.path !== "string" ||
      !path.isAbsolute(value.releaseEvidence.path) || typeof value.releaseEvidence.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.releaseEvidence.sha256))))
    throw new EvalFailure("LEASE_RESERVATION_INVALID", 2)
  const lineage = value.lineage as Reservation["lineage"]
  if (new Set([value.token, ...lineage.map(item => item.token)]).size !== lineage.length + 1 ||
    lineage.some((item, index) => item.revision !== Number(value.revision) - lineage.length + index))
    throw new EvalFailure("LEASE_LINEAGE_INVALID", 2)
  return value as Reservation
}

function jsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Sibling of the product profile: resetProfile cannot remove the harness lock.
 * A stale lock requires inspection; PID alone never authorizes lock stealing.
 */
export async function acquireHarnessLease(profile: string, receipt?: string) {
  await mkdir(path.resolve(profile), { recursive: true, mode: 0o700 })
  const profileDir = await realpath(profile)
  const directory = `${profileDir}.harness-lease`
  await mkdir(directory, { mode: 0o700 }).catch(() => {
    throw new EvalFailure(`Exclusive harness lease unavailable: ${directory}`, 2)
  })
  const info = await lstat(directory)
  const raw = await readFile(`/proc/${process.pid}/stat`, "utf8")
  const owner = JSON.stringify({ nonce: crypto.randomUUID(), pid: process.pid, uid: process.getuid?.(),
    starttime: raw.slice(raw.lastIndexOf(")") + 2).split(" ")[19] })
  await writeFile(path.join(directory, "owner.json"), owner, { flag: "wx", mode: 0o600 })
  if (receipt) {
    if (!path.isAbsolute(receipt) || receipt.startsWith(profileDir + path.sep) || await realpath(path.dirname(receipt)) !== path.dirname(receipt))
      throw new EvalFailure("Harness lease admission path refused", 2)
    await writeFile(receipt, JSON.stringify({ version: 1, profileDir, directory, device: info.dev, inode: info.ino, owner, acquiredAt: new Date().toISOString() }),
      { flag: "wx", mode: 0o600 })
  }
  return {
    directory,
    profileDir,
    async release() {
      const current = await lstat(directory)
      if (current.dev !== info.dev || current.ino !== info.ino || current.isSymbolicLink() ||
        await readFile(path.join(directory, "owner.json"), "utf8") !== owner)
        throw new EvalFailure("Harness lease identity changed", 1)
      await rm(directory, { recursive: true })
    },
  }
}

/** Call only after stand verification. A dead PID alone supplies no cleanup or ownership evidence. */
export async function retireRecordedHarnessLease(profile: string, receipt: string, cleanup: ProcessCleanup) {
  const admitted = await lstat(receipt)
  if (!admitted.isFile() || admitted.isSymbolicLink() || admitted.uid !== process.getuid?.() || admitted.mode & 0o077)
    throw new EvalFailure("Harness lease admission identity changed", 2)
  const saved = await Bun.file(receipt).json() as { version: number; profileDir: string; directory: string; device: number; inode: number; owner: string; acquiredAt: string }
  if (cleanup?.status !== "confirmed" || cleanup.error || cleanup.capture_complete !== true || cleanup.observation_mode === "unit_after_exit" ||
    cleanup.unknownProcesses?.length || !cleanup.verification || cleanup.verification.length < 2 ||
    cleanup.verification.some(pass => pass.owned_remaining !== 0 || Date.parse(pass.observed_at) < Date.parse(saved.acquiredAt)))
    throw new EvalFailure("Harness cleanup unconfirmed", 2)
  if ((await Promise.all([...new Set(cleanup.processes.map(item => item.group))].map(group => groupProcesses(group)))).some(group => group.length))
    throw new EvalFailure("Harness cleanup processes busy", 2)
  if (saved.version !== 1 || saved.profileDir !== await realpath(profile) || saved.directory !== `${saved.profileDir}.harness-lease`)
    throw new EvalFailure("Harness lease admission identity changed", 2)
  const info = await lstat(saved.directory)
  const ownerInfo = await lstat(path.join(saved.directory, "owner.json"))
  if (info.dev !== saved.device || info.ino !== saved.inode || info.isSymbolicLink() || !info.isDirectory() || info.uid !== process.getuid?.() || info.mode & 0o077 ||
    !ownerInfo.isFile() || ownerInfo.isSymbolicLink() || ownerInfo.uid !== info.uid || ownerInfo.mode & 0o077 ||
    await readFile(path.join(saved.directory, "owner.json"), "utf8") !== saved.owner) throw new EvalFailure("Harness lease identity changed", 2)
  const owner = JSON.parse(saved.owner) as { pid: number; starttime: string; uid: number }
  const stat = await readFile(`/proc/${owner.pid}/stat`, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (stat && stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19] === owner.starttime)
    throw new EvalFailure("Harness lease owner still present", 2)
  await assertProfileClean(saved.profileDir)
  await writeFile(`${receipt}.retired`, JSON.stringify({ status: "RETIRED", receiptSha256: new Bun.CryptoHasher("sha256").update(await Bun.file(receipt).bytes()).digest("hex"),
    at: new Date().toISOString() }), { flag: "wx", mode: 0o600 })
  if ((await lstat(saved.directory)).ino !== info.ino || await readFile(path.join(saved.directory, "owner.json"), "utf8") !== saved.owner)
    throw new EvalFailure("Harness lease identity changed", 2)
  await rm(saved.directory, { recursive: true })
}
