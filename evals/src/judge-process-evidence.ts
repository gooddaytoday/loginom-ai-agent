import path from "node:path"
import { mkdtemp } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { superviseProcess } from "./process-supervisor"

export type JudgeProcessEvidence = { file: string; commandId: string; assertHeld(): Promise<void> }

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
