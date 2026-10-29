import type { Reservation } from "./lease"
import path from "node:path"
import { readFileSync, readlinkSync, statfsSync } from "node:fs"
import { readRootWitnessFile } from "./root-witness-file"
import { validateWitnessSource, type WitnessSource } from "./witness-source"

export const policyRoot = "/etc/loginom-evals/terminality"
export const witnessRoot = "/var/lib/loginom-evals/terminality"
export const digest = (bytes: Uint8Array | string) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
export type RootPolicy = {
  version: 1; commandId: string; source: string; qualification: string
  owner: { bootId: string; pid: number; starttime: string; uid: number }
  host: { pid: string; mnt: string; time: string; user: string; kernelNotes: string }
  controllerLock: WitnessSource; ownerFile: string; slotsFile: string; binary: string; cliSha256: string; stateDir: string
  batchUnit: string; campaignUnit: string; fixed: WitnessSource[]; server: WitnessSource
  slots: { id: string; profile: string; composite: WitnessSource; reservation: WitnessSource; registration: WitnessSource | null; receipts: WitnessSource[] }[]
  observer: { unit: string; binary: string; binarySha256: string; bundle: string; bundleSha256: string }
}
export type RootWitness = {
  version: 1; kind: "root-terminality"; policySha256: string; invocation: string
  observer: { pid: number; starttime: string }; counter: string; counterAfter: string; elapsedMs: number; groups: number
}
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const sha = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v)
const decimal = (v: unknown): v is string => typeof v === "string" && /^(0|[1-9][0-9]*)$/.test(v)
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0
const absolute = (v: unknown): v is string => typeof v === "string" && path.isAbsolute(v) && path.resolve(v) === v && !v.includes("\0")
const unit = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.@-]*\.service$/.test(v)
function keys(v: unknown, fields: string): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join(" ") === fields.split(" ").sort().join(" ")
}
function source(v: unknown): v is WitnessSource {
  return keys(v, "file uid device inode mode gid bytes mtimeNs ctimeNs sha256") && absolute(v.file) && integer(v.uid) && sha(v.sha256) &&
    [v.device, v.inode, v.mode, v.gid, v.bytes, v.mtimeNs, v.ctimeNs].every(decimal) && BigInt(String(v.bytes)) <= 65536n
}
export function parseRootPolicy(value: unknown): RootPolicy {
  const v = value
  if (!keys(v, "version commandId source qualification owner host controllerLock ownerFile slotsFile binary cliSha256 stateDir batchUnit campaignUnit fixed server slots observer") ||
    v.version !== 1 || !uuid(v.commandId) || typeof v.source !== "string" || !/^[a-f0-9]{40}$/.test(v.source) || !sha(v.qualification) ||
    !keys(v.owner, "bootId pid starttime uid") || !uuid(v.owner.bootId) || !integer(v.owner.pid) || !v.owner.pid || !integer(v.owner.uid) || !decimal(v.owner.starttime) ||
    !keys(v.host, "pid mnt time user kernelNotes") || !sha(v.host.kernelNotes) || !["pid", "mnt", "time", "user"].every(k =>
      typeof (v.host as Record<string, unknown>)[k] === "string" && new RegExp(`^${k}:\\[[0-9]+\\]$`).test(String((v.host as Record<string, unknown>)[k]))) ||
    !sha(v.cliSha256) || !source(v.controllerLock) || ![v.ownerFile, v.slotsFile, v.binary, v.stateDir].every(absolute) || !unit(v.batchUnit) || !unit(v.campaignUnit) ||
    !Array.isArray(v.fixed) || !v.fixed.length || !v.fixed.every(source) || !source(v.server) || !Array.isArray(v.slots) || !v.slots.length ||
    !v.slots.every(s => keys(s, "id profile composite reservation registration receipts") && typeof s.id === "string" && /^[a-zA-Z0-9_-]+$/.test(s.id) &&
      absolute(s.profile) && source(s.composite) && source(s.reservation) && (s.registration === null || source(s.registration)) &&
      Array.isArray(s.receipts) && s.receipts.every(source)) ||
    !keys(v.observer, "unit binary binarySha256 bundle bundleSha256") || !unit(v.observer.unit) || !absolute(v.observer.binary) ||
    !absolute(v.observer.bundle) || !sha(v.observer.binarySha256) || !sha(v.observer.bundleSha256)) throw Error("ROOT_POLICY_INVALID")
  const policy = v as RootPolicy
  if (new Set(policy.slots.map(s => s.id)).size !== policy.slots.length || new Set(policy.slots.map(s => s.profile)).size !== policy.slots.length ||
    !policy.fixed.some(s => s.file === policy.slotsFile) || policy.slots.some(s => s.registration && s.registration.file !== `${s.profile}.process-group`))
    throw Error("ROOT_POLICY_INVALID")
  return policy
}
export function parseRootWitness(v: unknown): RootWitness {
  if (!keys(v, "version kind policySha256 invocation observer counter counterAfter elapsedMs groups") || v.version !== 1 || v.kind !== "root-terminality" ||
    !sha(v.policySha256) || typeof v.invocation !== "string" || !/^[a-f0-9]{32}$/.test(v.invocation) ||
    !keys(v.observer, "pid starttime") || !integer(v.observer.pid) || !v.observer.pid || !decimal(v.observer.starttime) ||
    !decimal(v.counter) || v.counterAfter !== v.counter || BigInt(v.counter) >= 2n ** 63n || typeof v.elapsedMs !== "number" || !Number.isFinite(v.elapsedMs) ||
    v.elapsedMs < 0 || v.elapsedMs > 1000 || !integer(v.groups) || !v.groups) throw Error("ROOT_WITNESS_INVALID")
  return v as RootWitness
}
export function loadRootPolicy(commandId: string) {
  if (!uuid(commandId)) throw Error("ROOT_POLICY_INVALID")
  const bytes = readRootWitnessFile(path.join(policyRoot, `${commandId}.json`), 65536)
  const policy = parseRootPolicy(JSON.parse(bytes.toString()))
  if (policy.commandId !== commandId) throw Error("ROOT_POLICY_INVALID")
  return { policy, policySha256: digest(bytes) }
}
export function assertWitnessHost(policy: RootPolicy) {
  // A caller cannot substitute a root-owned filesystem in a new user namespace.
  // Actual procfs + initial uid map are prerequisites before trusting host anchors.
  if (statfsSync("/proc").type !== 0x9fa0 || readFileSync("/proc/self/uid_map", "utf8").trim().split(/\s+/).join(" ") !== "0 0 4294967295" ||
    readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim() !== policy.owner.bootId || digest(readFileSync("/sys/kernel/notes")) !== policy.host.kernelNotes)
    throw Error("ROOT_WITNESS_HOST")
  // The root publisher qualifies PID1; the native UID only needs its pinned self anchors.
  for (const pid of process.geteuid?.() === 0 ? ["self", "1"] : ["self"])
    for (const ns of ["pid", "mnt", "time", "user"] as const)
      if (readlinkSync(`/proc/${pid}/ns/${ns}`) !== policy.host[ns]) throw Error("ROOT_WITNESS_HOST")
  for (const ns of ["pid", "time"] as const)
    if (readlinkSync(`/proc/self/ns/${ns}_for_children`) !== policy.host[ns]) throw Error("ROOT_WITNESS_HOST")
}
export function assertFixedSources(policy: RootPolicy) {
  policy.fixed.forEach(validateWitnessSource)
  for (const slot of policy.slots) slot.receipts.forEach(validateWitnessSource)
}

export function assertStandalonePolicy(policy: RootPolicy) {
  assertFixedSources(policy)
  validateWitnessSource(policy.server)
  const server = JSON.parse(readFileSync(policy.server.file, "utf8")) as Reservation
  if (server.state !== "retained" || server.commandId !== policy.commandId || JSON.stringify(server.owner) !== JSON.stringify(policy.owner) ||
    !policy.fixed.some(s => s.file === server.journal) || path.dirname(server.journal) !== policy.stateDir ||
    server.key !== `server:${server.identity?.containerId}`) throw Error("ROOT_RECOVERY_SCOPE")
  const command = JSON.parse(readFileSync(server.journal, "utf8"))
  if (command.version !== 2 || command.kind !== "unactivated-preparation" || command.phase !== "unactivated" || command.commandId !== policy.commandId ||
    command.runDir !== undefined || command.unitBinding !== undefined || (command.attempts !== undefined && (!Array.isArray(command.attempts) || command.attempts.length)) ||
    JSON.stringify(command.identity) !== JSON.stringify(server.identity) || !Array.isArray(command.slotIds) ||
    JSON.stringify([...command.slotIds].sort()) !== JSON.stringify(policy.slots.map(s => s.id).sort())) throw Error("ROOT_RECOVERY_SCOPE")
  const failedFile = path.join(policy.stateDir, `preparation-${policy.commandId}.json`)
  if (!policy.fixed.some(s => s.file === failedFile)) throw Error("ROOT_RECOVERY_SCOPE")
  const failed = JSON.parse(readFileSync(failedFile, "utf8"))
  if (failed.commandId !== policy.commandId || failed.journal !== server.journal || failed.status !== "quarantined" || failed.ready !== false ||
    JSON.stringify(failed.identity) !== JSON.stringify(server.identity)) throw Error("ROOT_RECOVERY_SCOPE")
}
