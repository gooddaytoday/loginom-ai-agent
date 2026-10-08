import path from "node:path"
import { lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { EvalFailure } from "./fail"
import type { ProcessCleanup } from "./process-supervisor"
import { groupProcesses } from "./process-group"
import { assertProfileClean } from "./profile"

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
