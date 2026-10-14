import path from "node:path"
import { lstat, mkdtemp, realpath } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { superviseProcess } from "./process-supervisor"
import { qualifyClosedProcessEvidence } from "./closed-process-evidence"

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
    const qualified = qualifyClosedProcessEvidence(proof, { owner: { kind: "judge", id: owner.id }, producerPid: input.producerPid })
    if (!qualified) throw new EvalFailure("JUDGE_PROCESS_PROOF_UNCONFIRMED", 2)
    processes.push({ owner: { kind: "judge" as const, id: owner.id }, launcher: qualified.launcher, identities: qualified.identities,
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
