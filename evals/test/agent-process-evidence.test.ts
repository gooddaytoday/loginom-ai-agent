import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { acquireResourceLease, readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { readAgentProcessInventory, sealAgentProcessInventory, superviseAgentProcess } from "../src/agent-process-evidence"
import { qualifyClosedProcessEvidence } from "../src/closed-process-evidence"

test("agent inventory durably admits a short CLI before spawn and seals its qualified proof", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-agent-inventory-"))
  await Promise.all(["locks", "captures"].map(name => mkdir(path.join(root, name), { mode: 0o700 })))
  const file = path.join(root, "agents.json")
  await writeLeaseReceipt(file, { version: 2, kind: "eval-agent-processes", commandId: "run-one", slotId: "a", producerPid: process.pid,
    state: "open", processes: [] })
  const lease = await acquireResourceLease({ key: "agent:a", lockRoot: path.join(root, "locks"), journal: file, commandId: "run-one" })
  const evidence = { file, commandId: "run-one", slotId: "a", assertHeld: lease.assertHeld }
  let confirmed = false
  const pending = superviseAgentProcess({ cmd: [process.execPath, "-e", `
    const inventory=await Bun.file(process.argv[1]).json();
    console.log(JSON.stringify({state:inventory.state,entry:inventory.processes.at(-1).state,owner:inventory.processes.at(-1).owner}));
    await Bun.sleep(20);
  `, file], cwd: root, env: { PATH: process.env.PATH ?? "" }, timeoutMs: 5000, outDir: path.join(root, "captures") }, evidence)
  try {
    await expect(sealAgentProcessInventory(evidence)).rejects.toThrow("AGENT_PROCESS_INVENTORY_BUSY")
    await expect(superviseAgentProcess({ cmd: [process.execPath, "-e", "throw Error('concurrent spawn')"], cwd: root,
      env: { PATH: process.env.PATH ?? "" }, timeoutMs: 5000, outDir: path.join(root, "captures") }, evidence))
      .rejects.toThrow("AGENT_PROCESS_INVENTORY_BUSY")
    const result = await pending
    confirmed = result.processCleanup.status === "confirmed" && result.processCleanup.capture_complete
    expect(confirmed).toBe(true)
    expect(JSON.parse(result.stdout)).toEqual({ state: "open", entry: "planned", owner: { kind: "slot", id: "a" } })
    const input = { file, commandId: "run-one", slotId: "a", producerPid: process.pid }
    await expect(readAgentProcessInventory(input)).rejects.toThrow("AGENT_PROCESS_INVENTORY_UNSEALED")
    const sealed = await sealAgentProcessInventory(evidence)
    const inventory = await readAgentProcessInventory(input)
    expect(inventory.source).toEqual(sealed)
    expect(inventory.processes).toHaveLength(1)
    expect(inventory.processes[0]!.owner).toEqual({ kind: "slot", id: "a" })
    const before = await readLeaseReceipt(file)
    await expect(superviseAgentProcess({ cmd: [process.execPath, "-e", "throw Error('late spawn')"], cwd: root,
      env: { PATH: process.env.PATH ?? "" }, timeoutMs: 5000, outDir: path.join(root, "captures") }, evidence))
      .rejects.toThrow("AGENT_PROCESS_INVENTORY_SEALED")
    expect(await readLeaseReceipt(file)).toEqual(before)
  } finally { await pending.catch(() => {}); await lease.close(); if (confirmed) await rm(root, { recursive: true }) }
}, 15000)

test.each(["proof", "inventory", "lease"])("agent inventory retains the measured CLI result after a post-dispatch %s failure", async fault => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-agent-inventory-fault-"))
  await Promise.all(["locks", "captures"].map(name => mkdir(path.join(root, name), { mode: 0o700 })))
  const file = path.join(root, "agents.json")
  await writeLeaseReceipt(file, { version: 2, kind: "eval-agent-processes", commandId: "run-fault", slotId: "a", producerPid: process.pid,
    state: "open", processes: [] })
  const lease = await acquireResourceLease({ key: "agent:a", lockRoot: path.join(root, "locks"), journal: file, commandId: "run-fault" })
  const evidence = { file, commandId: "run-fault", slotId: "a", assertHeld: lease.assertHeld }
  try {
    const run = await superviseAgentProcess({ cmd: [process.execPath, "-e", `
      const { mkdir, unlink, rename, writeFile } = await import("node:fs/promises");
      const inventory = await Bun.file(process.argv[1]).json();
      if (process.argv[2] === "proof") await mkdir(inventory.processes.at(-1).directory + "/process-cleanup.json");
      if (process.argv[2] === "inventory") { await unlink(process.argv[1]); await mkdir(process.argv[1]); }
      if (process.argv[2] === "lease") { await rename(process.argv[3], process.argv[3] + ".old"); await writeFile(process.argv[3], "", { mode: 0o600 }); }
      console.log("measured result");
    `, file, fault, lease.guardFile], cwd: root, env: { PATH: process.env.PATH ?? "" }, timeoutMs: 5000,
      outDir: path.join(root, "captures") }, evidence)
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toBe("measured result\n")
    expect(run.timedOut).toBe(false)
    expect(run.processCleanup).toMatchObject({ status: "failed", error: "Agent process evidence unconfirmed" })
    const original = await readLeaseReceipt(path.join(root, "captures/process-cleanup.json"))
    expect(original).toMatchObject({ status: "confirmed", error: null })
    expect(qualifyClosedProcessEvidence(original, { owner: { kind: "slot", id: "a" }, producerPid: process.pid })).toBeDefined()
    await expect(sealAgentProcessInventory(evidence)).rejects.toThrow()
    if (fault !== "inventory") expect(await readLeaseReceipt(file)).toMatchObject({ processes: [{ state: "planned" }] })
  } finally {
    const original = await readLeaseReceipt(path.join(root, "captures/process-cleanup.json")).catch(() => null)
    await lease.close()
    if (qualifyClosedProcessEvidence(original, { owner: { kind: "slot", id: "a" }, producerPid: process.pid })) await rm(root, { recursive: true })
  }
}, 15000)
