import path from "node:path"
import { lstat, mkdtemp, realpath } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { superviseProcess } from "./process-supervisor"
import type { ProcessIdentity } from "./process-supervisor"

export type JudgeProcessEvidence = { file: string; commandId: string; assertHeld(): Promise<void> }

export async function readJudgeProcessInventory(input: { file: string; commandId: string; producerPid: number }) {
  const { readLeaseReceipt } = await import("./lease")
  const root = path.dirname(input.file), info = await lstat(root)
  if (!path.isAbsolute(input.file) || path.resolve(input.file) !== input.file || await realpath(root) !== root ||
    !info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700)
    throw new EvalFailure("JUDGE_PROCESS_INVENTORY_PRIVATE", 2)
  const inventory = evidenceObject(await readLeaseReceipt(input.file))
  if (inventory.version !== 2 || inventory.kind !== "offline-judge-processes" || inventory.commandId !== input.commandId || !Array.isArray(inventory.processes))
    throw new EvalFailure("JUDGE_PROCESS_INVENTORY_INVALID", 2)
  const entries = inventory.processes.map(evidenceObject)
  if (new Set(entries.map(entry => evidenceObject(entry.owner).id)).size !== entries.length)
    throw new EvalFailure("JUDGE_PROCESS_INVENTORY_INVALID", 2)
  const processes = []
  for (const entry of entries) {
    const owner = evidenceObject(entry.owner), reference = evidenceObject(entry.proof)
    if (owner.kind !== "judge" || typeof owner.id !== "string" || !owner.id.startsWith(input.commandId + ":") ||
      typeof entry.directory !== "string" || path.dirname(entry.directory) !== root || !path.basename(entry.directory).startsWith("judge-process-") ||
      reference.path !== path.join(entry.directory, "process-cleanup.json") || typeof reference.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(reference.sha256) || entry.state !== "confirmed")
      throw new EvalFailure("JUDGE_PROCESS_PROOF_UNCONFIRMED", 2)
    const proof = evidenceObject(await readLeaseReceipt(reference.path))
    if (new Bun.CryptoHasher("sha256").update(JSON.stringify(proof)).digest("hex") !== reference.sha256)
      throw new EvalFailure("JUDGE_PROCESS_PROOF_HASH_MISMATCH", 2)
    const lifetime = evidenceObject(proof.lifetime), launcher = lifetime.launcher
    if (proof.status !== "confirmed" || proof.error !== null || proof.capture_complete !== true || proof.observation_mode !== "continuous" ||
      !Number.isSafeInteger(evidenceObject(proof.observations).count) || Number(evidenceObject(proof.observations).count) < 1 ||
      !Array.isArray(proof.unknownProcesses) || proof.unknownProcesses.length ||
      !Array.isArray(proof.verification) || proof.verification.length !== 2 || proof.verification.some((value, index, passes) => {
        const pass = evidenceObject(value)
        return pass.owned_remaining !== 0 || typeof pass.observed_at !== "string" || !Number.isFinite(Date.parse(pass.observed_at)) ||
          Date.parse(pass.observed_at) < Date.parse(String(lifetime.finished_at)) ||
          index > 0 && Date.parse(pass.observed_at) <= Date.parse(String(evidenceObject(passes[index - 1]).observed_at))
      }) || lifetime.producer_pid !== input.producerPid || JSON.stringify(lifetime.owner) !== JSON.stringify(owner) ||
      typeof lifetime.started_at !== "string" || typeof lifetime.finished_at !== "string" ||
      ![lifetime.started_at, lifetime.finished_at].every(value => Number.isFinite(Date.parse(value))) || Date.parse(lifetime.finished_at) < Date.parse(lifetime.started_at) ||
      !validEvidenceIdentity(launcher) || evidenceObject(proof.launcher).pid !== launcher.pid ||
      !Array.isArray(proof.processes) || !proof.processes.every(validEvidenceIdentity) || !proof.processes.some(identity => JSON.stringify(identity) === JSON.stringify(launcher)))
      throw new EvalFailure("JUDGE_PROCESS_PROOF_UNCONFIRMED", 2)
    processes.push({ owner: { kind: "judge" as const, id: owner.id }, launcher, identities: proof.processes,
      source: { path: reference.path, sha256: reference.sha256 } })
  }
  return { commandId: input.commandId, processes }
}

export async function superviseJudgeProcess(input: Parameters<typeof superviseProcess>[0], evidence?: JudgeProcessEvidence) {
  if (!evidence) return superviseProcess(input)
  const { readLeaseReceipt, writeLeaseReceipt } = await import("./lease")
  await evidence.assertHeld()
  const inventory = await readLeaseReceipt(evidence.file)
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory) ||
    !("version" in inventory) || inventory.version !== 2 || !("kind" in inventory) || inventory.kind !== "offline-judge-processes" ||
    !("commandId" in inventory) || inventory.commandId !== evidence.commandId || !("processes" in inventory) || !Array.isArray(inventory.processes))
    throw new EvalFailure("JUDGE_PROCESS_INVENTORY_INVALID", 2)
  const directory = await mkdtemp(path.join(path.dirname(evidence.file), "judge-process-"))
  const captureDirectory = input.outDir ?? directory
  const owner = { kind: "judge" as const, id: `${evidence.commandId}:${crypto.randomUUID()}` }
  const entry = { directory, captureDirectory, owner, state: "planned" }
  await writeLeaseReceipt(evidence.file, { ...inventory, processes: [...inventory.processes, entry] })
  const run = await superviseProcess({ ...input, outDir: captureDirectory, owner })
  const file = path.join(captureDirectory, "process-cleanup.json")
  const saved = await readLeaseReceipt(file).catch(() => null)
  const matched = saved !== null && JSON.stringify(saved) === JSON.stringify(run.processCleanup)
  if (!matched) {
    run.processCleanup.status = "failed"
    run.processCleanup.error ??= "Judge process evidence mismatch"
  }
  const proof = path.join(directory, "process-cleanup.json")
  if (matched && proof !== file) await writeLeaseReceipt(proof, run.processCleanup)
  await evidence.assertHeld()
  await writeLeaseReceipt(evidence.file, { ...inventory, processes: [...inventory.processes, { ...entry,
    state: run.processCleanup.status === "confirmed" && run.processCleanup.capture_complete ? "confirmed" : "unconfirmed",
    proof: matched ? { path: proof, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(saved)).digest("hex") } : null }] })
  return run
}

function evidenceObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function validEvidenceIdentity(value: unknown): value is ProcessIdentity {
  const identity = evidenceObject(value)
  return typeof identity.starttime === "string" && /^\d+$/.test(identity.starttime) && typeof identity.executable === "string" && path.isAbsolute(identity.executable) &&
    ["pid", "group", "session"].every(key => Number.isSafeInteger(identity[key]) && Number(identity[key]) >= 1) &&
    ["uid", "parent", "device", "inode"].every(key => Number.isSafeInteger(identity[key]) && Number(identity[key]) >= 0)
}
