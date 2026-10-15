import path from "node:path"
import { lstat, mkdtemp, realpath } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { qualifyClosedProcessEvidence } from "./closed-process-evidence"
import { superviseProcess } from "./process-supervisor"

export type AgentProcessEvidence = { file: string; commandId: string; slotId: string; assertHeld(): Promise<void> }
type InventoryInput = { file: string; commandId: string; slotId: string; producerPid: number }
type Inventory = { version: 2; kind: "eval-agent-processes"; commandId: string; slotId: string; producerPid: number;
  state: "open" | "sealed"; processes: { id: string; directory: string; captureDirectory: string; owner: { kind: "slot"; id: string };
    state: "planned" | "confirmed" | "unconfirmed"; proof?: { path: string; sha256: string } | null }[] }
const activeInventories = new Set<string>()

export async function superviseAgentProcess(input: Parameters<typeof superviseProcess>[0], evidence?: AgentProcessEvidence) {
  if (!evidence) return superviseProcess(input)
  if (activeInventories.has(evidence.file)) throw new EvalFailure("AGENT_PROCESS_INVENTORY_BUSY", 2)
  activeInventories.add(evidence.file)
  try {
    await evidence.assertHeld()
    const inventory = await readInventory({ ...evidence, producerPid: process.pid })
    if (inventory.state !== "open") throw new EvalFailure("AGENT_PROCESS_INVENTORY_SEALED", 2)
    if (inventory.processes.some(entry => entry.state !== "confirmed")) throw new EvalFailure("AGENT_PROCESS_PROOF_UNCONFIRMED", 2)
    if (input.owner && (input.owner.kind !== "slot" || input.owner.id !== evidence.slotId)) throw new EvalFailure("AGENT_PROCESS_OWNER_MISMATCH", 2)
    const directory = await mkdtemp(path.join(path.dirname(evidence.file), "agent-process-"))
    const captureDirectory = input.outDir ?? directory
    const entry = { id: crypto.randomUUID(), directory, captureDirectory, owner: { kind: "slot" as const, id: evidence.slotId }, state: "planned" as const }
    await writeLeaseReceipt(evidence.file, { ...inventory, processes: [...inventory.processes, entry] })
    const run = await superviseProcess({ ...input, outDir: captureDirectory, owner: entry.owner })
    // Proof publication cannot discard the result of a CLI that already ran.
    try {
      await evidence.assertHeld()
      const file = path.join(captureDirectory, "process-cleanup.json"), proof = path.join(directory, "process-cleanup.json")
      const saved = await readLeaseReceipt(file).catch(() => null)
      const matched = saved !== null && JSON.stringify(saved) === JSON.stringify(run.processCleanup)
      if (matched && file !== proof) await writeLeaseReceipt(proof, run.processCleanup)
      const qualified = matched && qualifyClosedProcessEvidence(saved, { owner: entry.owner, producerPid: process.pid })
      if (!qualified) {
        run.processCleanup.status = "failed"
        run.processCleanup.error ??= "Agent process evidence unconfirmed"
      }
      await evidence.assertHeld()
      await writeLeaseReceipt(evidence.file, { ...inventory, processes: [...inventory.processes, { ...entry, state: qualified ? "confirmed" : "unconfirmed",
        proof: matched ? { path: proof, sha256: hash(saved) } : null }] })
    } catch {
      run.processCleanup.status = "failed"
      run.processCleanup.error ??= "Agent process evidence unconfirmed"
    }
    return run
  } finally { activeInventories.delete(evidence.file) }
}

export async function sealAgentProcessInventory(evidence: AgentProcessEvidence) {
  if (activeInventories.has(evidence.file)) throw new EvalFailure("AGENT_PROCESS_INVENTORY_BUSY", 2)
  activeInventories.add(evidence.file)
  try {
    await evidence.assertHeld()
    const input = { ...evidence, producerPid: process.pid }, inventory = await readInventory(input)
    await readProcesses(input, inventory)
    await writeLeaseReceipt(evidence.file, { ...inventory, state: "sealed" })
    return (await readAgentProcessInventory(input)).source
  } finally { activeInventories.delete(evidence.file) }
}

export async function readAgentProcessInventory(input: InventoryInput) {
  const inventory = await readInventory(input)
  if (inventory.state !== "sealed") throw new EvalFailure("AGENT_PROCESS_INVENTORY_UNSEALED", 2)
  const processes = await readProcesses(input, inventory)
  if (hash(await readLeaseReceipt(input.file)) !== hash(inventory)) throw new EvalFailure("AGENT_PROCESS_INVENTORY_CHANGED", 2)
  return { commandId: inventory.commandId, slotId: inventory.slotId, processes, source: { path: input.file, sha256: hash(inventory) } }
}

async function readInventory(input: InventoryInput) {
  const root = path.dirname(input.file), info = await lstat(root)
  if (!path.isAbsolute(input.file) || path.resolve(input.file) !== input.file || await realpath(root) !== root ||
    !info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700)
    throw new EvalFailure("AGENT_PROCESS_INVENTORY_PRIVATE", 2)
  const inventory = await readLeaseReceipt(input.file) as Partial<Inventory> | null
  if (!inventory || inventory.version !== 2 || inventory.kind !== "eval-agent-processes" || inventory.commandId !== input.commandId ||
    inventory.slotId !== input.slotId || inventory.producerPid !== input.producerPid || !["open", "sealed"].includes(String(inventory.state)) ||
    !Array.isArray(inventory.processes) || inventory.processes.some(entry => !entry || typeof entry.id !== "string" ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(entry.id) || typeof entry.directory !== "string" ||
      path.dirname(entry.directory) !== root || !path.basename(entry.directory).startsWith("agent-process-") ||
      entry.owner?.kind !== "slot" || entry.owner.id !== input.slotId || !["planned", "confirmed", "unconfirmed"].includes(entry.state)) ||
    new Set(inventory.processes.map(entry => entry.id)).size !== inventory.processes.length ||
    new Set(inventory.processes.map(entry => entry.directory)).size !== inventory.processes.length)
    throw new EvalFailure("AGENT_PROCESS_INVENTORY_INVALID", 2)
  return inventory as Inventory
}

async function readProcesses(input: InventoryInput, inventory: Inventory) {
  return Promise.all(inventory.processes.map(async entry => {
    const directory = await lstat(entry.directory)
    if (!directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== process.getuid?.() || (directory.mode & 0o777) !== 0o700 ||
      entry.state !== "confirmed" || entry.proof?.path !== path.join(entry.directory, "process-cleanup.json") ||
      !/^[a-f0-9]{64}$/.test(entry.proof.sha256)) throw new EvalFailure("AGENT_PROCESS_PROOF_UNCONFIRMED", 2)
    const proof = await readLeaseReceipt(entry.proof.path)
    if (hash(proof) !== entry.proof.sha256) throw new EvalFailure("AGENT_PROCESS_PROOF_HASH_MISMATCH", 2)
    const qualified = qualifyClosedProcessEvidence(proof, { owner: entry.owner, producerPid: input.producerPid })
    if (!qualified) throw new EvalFailure("AGENT_PROCESS_PROOF_UNCONFIRMED", 2)
    return { owner: qualified.owner, launcher: qualified.launcher, startedAt: qualified.startedAt, finishedAt: qualified.finishedAt, source: entry.proof }
  }))
}

function hash(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}
