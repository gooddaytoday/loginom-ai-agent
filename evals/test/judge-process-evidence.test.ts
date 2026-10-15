import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { acquireResourceLease, writeLeaseReceipt } from "../src/lease"
import { readJudgeProcessInventory, sealJudgeProcessInventory, superviseJudgeProcess } from "../src/judge-process-evidence"

test("judge inventory seals all launches and refuses concurrent or late admission", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-judge-inventory-seal-"))
  const commandId = crypto.randomUUID(), file = path.join(root, "processes.json")
  await mkdir(path.join(root, "locks"), { mode: 0o700 })
  await writeLeaseReceipt(file, { version: 2, kind: "offline-judge-processes", commandId, state: "open", processes: [] })
  const lease = await acquireResourceLease({ key: "judge-inventory", journal: file, commandId, lockRoot: path.join(root, "locks") })
  const evidence = { file, commandId, assertHeld: lease.assertHeld }, request = { file, commandId, producerPid: process.pid }
  let confirmed = false
  const pending = superviseJudgeProcess({ cmd: [process.execPath, "-e", `
    const inventory = await Bun.file(process.argv[1]).json();
    console.log(JSON.stringify({state:inventory.state,entry:inventory.processes.at(-1).state}));
    await Bun.sleep(20);
  `, file], cwd: root, env: { PATH: process.env.PATH ?? "" }, timeoutMs: 5000 }, evidence)
  try {
    await expect(sealJudgeProcessInventory(evidence)).rejects.toThrow("JUDGE_PROCESS_INVENTORY_BUSY")
    await expect(superviseJudgeProcess({ cmd: [process.execPath, "-e", "throw Error('concurrent dispatch')"], cwd: root,
      env: { PATH: process.env.PATH ?? "" }, timeoutMs: 5000 }, evidence)).rejects.toThrow("JUDGE_PROCESS_INVENTORY_BUSY")
    const run = await pending
    confirmed = run.processCleanup.status === "confirmed" && run.processCleanup.capture_complete
    expect(confirmed).toBe(true)
    expect(JSON.parse(run.stdout)).toEqual({ state: "open", entry: "planned" })
    expect((await readJudgeProcessInventory(request)).sealed).toBe(false)
    const sealed = await sealJudgeProcessInventory(evidence)
    const inventory = await readJudgeProcessInventory(request)
    expect(inventory.sealed).toBe(true)
    expect(inventory.source).toEqual(sealed)
    expect(inventory.processes).toHaveLength(1)
    const before = await Bun.file(file).text()
    await expect(superviseJudgeProcess({ cmd: [process.execPath, "-e", "throw Error('late dispatch')"], cwd: root,
      env: { PATH: process.env.PATH ?? "" }, timeoutMs: 5000 }, evidence)).rejects.toThrow("JUDGE_PROCESS_INVENTORY_SEALED")
    expect(await Bun.file(file).text()).toBe(before)
  } finally { await pending.catch(() => {}); await lease.close(); if (confirmed) await rm(root, { recursive: true }) }
}, 15000)

test("judge proof qualification rejects inconsistent terminal timelines", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-judge-proof-readonly-"))
  const commandId = crypto.randomUUID(), file = path.join(root, "processes.json"), journal = path.join(root, "journal.json")
  await mkdir(path.join(root, "locks"), { mode: 0o700 })
  await writeLeaseReceipt(journal, { version: 2, commandId })
  await writeLeaseReceipt(file, { version: 2, kind: "offline-judge-processes", commandId, processes: [] })
  const lease = await acquireResourceLease({ key: "judge-proof-readonly", journal, commandId, lockRoot: path.join(root, "locks") })
  let confirmed = false
  try {
    const run = await superviseJudgeProcess({ cmd: [process.execPath, "-e", "await Bun.sleep(100)"], cwd: root,
      env: { PATH: process.env.PATH ?? "" }, timeoutMs: 3000 }, { file, commandId, assertHeld: lease.assertHeld })
    confirmed = run.processCleanup.status === "confirmed" && run.processCleanup.capture_complete
    expect(confirmed).toBe(true)
    const request = { file, commandId, producerPid: process.pid }
    expect((await readJudgeProcessInventory(request)).processes).toHaveLength(1)
    expect((await readJudgeProcessInventory(request)).sealed).toBe(false)
    const inventory = await Bun.file(file).json(), entry = inventory.processes[0]
    const proof = await Bun.file(entry.proof.path).json()
    await expect(readJudgeProcessInventory({ ...request, commandId: "foreign" })).rejects.toThrow("JUDGE_PROCESS_INVENTORY_INVALID")
    await expect(readJudgeProcessInventory({ ...request, producerPid: process.pid + 1 })).rejects.toThrow("JUDGE_PROCESS_PROOF_UNCONFIRMED")
    await writeLeaseReceipt(entry.proof.path, { ...proof, error: "changed" })
    await expect(readJudgeProcessInventory(request)).rejects.toThrow("JUDGE_PROCESS_PROOF_HASH_MISMATCH")
    await writeLeaseReceipt(entry.proof.path, proof)
    for (const changedInventory of [{ ...inventory, processes: [entry, entry] },
      { ...inventory, processes: [{ ...entry, state: "planned" }] },
      { ...inventory, processes: [{ ...entry, proof: { ...entry.proof, path: journal } }] }]) {
      await writeLeaseReceipt(file, changedInventory)
      await expect(readJudgeProcessInventory(request)).rejects.toThrow("JUDGE_PROCESS_")
    }
    await writeLeaseReceipt(file, inventory)
    const changed = { ...proof, lifetime: { ...proof.lifetime,
      finished_at: new Date(Date.parse(proof.verification.at(-1).observed_at) + 1000).toISOString() } }
    await writeLeaseReceipt(entry.proof.path, changed)
    await writeLeaseReceipt(file, { ...inventory, processes: [{ ...entry, proof: { ...entry.proof,
      sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(changed)).digest("hex") } }] })
    await expect(readJudgeProcessInventory(request)).rejects.toThrow("JUDGE_PROCESS_PROOF_UNCONFIRMED")
    const unobserved = { ...proof, observations: { ...proof.observations, count: 0 } }
    await writeLeaseReceipt(entry.proof.path, unobserved)
    await writeLeaseReceipt(file, { ...inventory, processes: [{ ...entry, proof: { ...entry.proof,
      sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(unobserved)).digest("hex") } }] })
    await expect(readJudgeProcessInventory(request)).rejects.toThrow("JUDGE_PROCESS_PROOF_UNCONFIRMED")
    const reordered = { ...proof, verification: [...proof.verification].reverse() }
    await writeLeaseReceipt(entry.proof.path, reordered)
    await writeLeaseReceipt(file, { ...inventory, processes: [{ ...entry, proof: { ...entry.proof,
      sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(reordered)).digest("hex") } }] })
    await expect(readJudgeProcessInventory(request)).rejects.toThrow("JUDGE_PROCESS_PROOF_UNCONFIRMED")
  } finally { await lease.close(); if (confirmed) await rm(root, { recursive: true, force: true }) }
}, 10000)

test("judge inventory refuses an unknown admission state before spawning", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-judge-inventory-state-"))
  const commandId = crypto.randomUUID(), file = path.join(root, "processes.json"), marker = path.join(root, "unexpected.txt")
  await mkdir(path.join(root, "locks"), { mode: 0o700 })
  await writeLeaseReceipt(file, { version: 2, kind: "offline-judge-processes", commandId, state: "unknown", processes: [] })
  const lease = await acquireResourceLease({ key: "judge-inventory", journal: file, commandId, lockRoot: path.join(root, "locks") })
  const pending = superviseJudgeProcess({ cmd: [process.execPath, "-e", "await Bun.write(process.argv[1], 'unexpected dispatch')", marker],
    cwd: root, env: { PATH: process.env.PATH ?? "" }, timeoutMs: 5000 }, { file, commandId, assertHeld: lease.assertHeld })
  let refused = false
  try {
    await expect(pending).rejects.toThrow("JUDGE_PROCESS_INVENTORY_INVALID")
    expect(await Bun.file(marker).exists()).toBe(false)
    refused = true
  } finally {
    const result = await pending.catch(() => undefined)
    await lease.close()
    if (refused || result?.processCleanup.status === "confirmed") await rm(root, { recursive: true })
  }
}, 15000)
