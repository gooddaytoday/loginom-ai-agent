import path from "node:path"
import { lstat, realpath } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { readLeaseReceipt, writeLeaseReceipt, type acquireResourceLease } from "./lease"
import { readServerIdentity } from "./parallel-pair"
import type { SlotFile, SlotLease } from "./slots"

/** Publishes a same-epoch kernel snapshot under the current server/slot fences. */
export async function captureServerFiles(file: SlotFile, server: Awaited<ReturnType<typeof acquireResourceLease>>, lease: SlotLease) {
  const context = await requireFence(file, server, lease)
  const snapshot = await serverFileObservation(lease.identity.containerId)
  if (!snapshot.complete) throw new EvalFailure("SERVER_FILE_SCAN_UNCONFIRMED", 2)
  if (hash(await requireFence(file, server, lease)) !== hash(context)) throw new EvalFailure("SERVER_FILE_SOURCE_UNCONFIRMED", 2)
  const receipt = { version: 1, kind: "server-file-observation", context, frame: snapshot.frame }
  const target = path.join(file.controller.stateDir, `server-files-${crypto.randomUUID()}.json`)
  await writeLeaseReceipt(target, receipt)
  return readServerFiles(file, server, lease, { path: target, sha256: hash(receipt) })
}

/** Replays raw data; a complete snapshot alone grants no cleanup or admission. */
export async function readServerFiles(file: SlotFile, server: Awaited<ReturnType<typeof acquireResourceLease>>, lease: SlotLease, source: { path: string; sha256: string }) {
  const context = await requireFence(file, server, lease)
  if (path.dirname(source.path) !== file.controller.stateDir || path.resolve(source.path) !== source.path ||
    !/^server-files-[a-f0-9-]{36}\.json$/.test(path.basename(source.path)) || !/^[a-f0-9]{64}$/.test(source.sha256))
    throw new EvalFailure("SERVER_FILE_SOURCE_UNCONFIRMED", 2)
  const receipt = record(await readLeaseReceipt(source.path))
  if (Object.keys(receipt).length !== 4 || receipt.version !== 1 || receipt.kind !== "server-file-observation" ||
    hash(receipt) !== source.sha256 || hash(receipt.context) !== hash(context)) throw new EvalFailure("SERVER_FILE_SOURCE_UNCONFIRMED", 2)
  const frame = record(receipt.frame)
  if (Object.keys(frame).length !== 4 || frame.containerId !== lease.identity.containerId || typeof frame.output !== "string" ||
    typeof frame.startedAt !== "string" || typeof frame.finishedAt !== "string" || !Number.isFinite(Date.parse(frame.startedAt)) ||
    !Number.isFinite(Date.parse(frame.finishedAt)) || Date.parse(frame.startedAt) > Date.parse(frame.finishedAt))
    throw new EvalFailure("SERVER_FILE_SOURCE_UNCONFIRMED", 2)
  const snapshot = parseSnapshot(frame.containerId, frame.startedAt, frame.finishedAt, frame.output)
  if (!snapshot.complete || hash(await requireFence(file, server, lease)) !== hash(context) || hash(await readLeaseReceipt(source.path)) !== source.sha256)
    throw new EvalFailure("SERVER_FILE_SOURCE_UNCONFIRMED", 2)
  return { identity: lease.identity, slotId: lease.slot.id, leaseToken: lease.token, snapshot, source, storageDeletionAllowed: false as const, nextAdmissionAllowed: false as const }
}

/** Read-only collector; research controls also use this without cleanup authority. */
export async function serverFileObservation(containerId: string) {
  if (!/^[a-f0-9]{64}$/.test(containerId)) throw new EvalFailure("SERVER_FILE_CONTAINER_ID", 2)
  const startedAt = new Date().toISOString()
  const child = Bun.spawn(["docker", "--host", "unix:///var/run/docker.sock", "exec", "-i", containerId,
    "env", "-i", "PATH=/usr/bin:/bin", "LC_ALL=C", "sh", "-s"], { stdin: "pipe", stdout: "pipe", stderr: "pipe", timeout: 5000 })
  child.stdin.write(await Bun.file(path.resolve(import.meta.dir, "../fixtures/server-files.sh")).text())
  child.stdin.end()
  const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  if (code !== 0) throw new EvalFailure("SERVER_FILE_SCAN_UNCONFIRMED", 2)
  return parseSnapshot(containerId, startedAt, new Date().toISOString(), output)
}

function parseSnapshot(containerId: string, startedAt: string, finishedAt: string, output: string) {
  const fields = output.split("\0")
  if (fields.pop() !== "" || fields.length % 6 !== 0) throw new EvalFailure("SERVER_FILE_SCAN_FRAME", 2)
  const rows = Array.from({ length: fields.length / 6 }, (_, index) => fields.slice(index * 6, index * 6 + 6))
  if (rows.some(row => !["B", "P", "F", "E"].includes(row[0]!))) throw new EvalFailure("SERVER_FILE_SCAN_FRAME", 2)
  const before = rows.find(row => row[0] === "B" && row[1] === "before")
  const after = rows.find(row => row[0] === "B" && row[1] === "after")
  if (!before || !after) throw new EvalFailure("SERVER_FILE_SCAN_BOUNDARY", 2)
  if (rows[0] !== before || rows.at(-1) !== after || rows.filter(row => row[0] === "B").length !== 2)
    throw new EvalFailure("SERVER_FILE_SCAN_FRAME", 2)
  const processes = rows.filter(row => row[0] === "P").map(row => ({ pid: Number(row[1]), stat: row[2]!, maps: row[3]!,
    finalStat: rows.find(end => end[0] === "E" && end[1] === row[1])?.[2] }))
  const files = rows.filter(row => row[0] === "F").map(row => ({ pid: Number(row[1]), fd: Number(row[2]),
    target: row[3]!, identity: row[4]!, info: row[5]! }))
  const pidsBefore = before[2]!.trim().split(/\s+/), pidsAfter = after[2]!.trim().split(/\s+/)
  return { frame: { containerId, startedAt, finishedAt, output }, containerId, startedAt, finishedAt, pidsBefore, pidsAfter, processes, files,
    daemonStarttime: birth(before[3]!), daemonBefore: before[3]!, daemonAfter: after[3]!, locksBefore: before[4]!, locksAfter: after[4]!,
    complete: JSON.stringify(pidsBefore) === JSON.stringify(pidsAfter) && processes.length === pidsBefore.length &&
      processes.every(process => pidsBefore.includes(String(process.pid)) && birth(process.stat) && birth(process.stat) === birth(process.finalStat ?? "")) &&
      birth(before[3]!) === birth(after[3]!) }
}

function birth(stat: string) {
  return stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/)[19]
}

async function requireFence(file: SlotFile, server: Awaited<ReturnType<typeof acquireResourceLease>>, lease: SlotLease) {
  await server.assertHeld()
  await lease.assertHeld()
  const root = await lstat(file.controller.stateDir)
  if (!root.isDirectory() || root.uid !== process.getuid?.() || (root.mode & 0o777) !== 0o700 ||
    await realpath(file.controller.stateDir) !== file.controller.stateDir || path.dirname(lease.receipt) !== file.controller.stateDir ||
    !file.slots.some(slot => JSON.stringify(slot) === JSON.stringify(lease.slot)) ||
    server.reservation.key !== `server:${lease.identity.containerId}` || hash(server.reservation.identity) !== hash(lease.identity))
    throw new EvalFailure("SERVER_FILE_FENCE_UNCONFIRMED", 2)
  if (hash(await readServerIdentity(file)) !== hash(lease.identity)) throw new EvalFailure("SERVER_EPOCH_CHANGED", 2)
  return { identity: lease.identity, slotId: lease.slot.id, leaseToken: lease.token, server: { token: server.reservation.token,
    revision: server.reservation.revision, commandId: server.reservation.commandId, journal: server.reservation.journal },
    scriptSha256: new Bun.CryptoHasher("sha256").update(await Bun.file(path.resolve(import.meta.dir, "../fixtures/server-files.sh")).bytes()).digest("hex") }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EvalFailure("SERVER_FILE_SOURCE_UNCONFIRMED", 2)
  return value as Record<string, unknown>
}

function hash(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}
