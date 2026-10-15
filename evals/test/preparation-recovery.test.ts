import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { parallelFixture } from "./helpers/parallel-fixture"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { recoverPreparationLeases } from "../src/preparation-recovery"
import { stageUserPreparation } from "../src/user-environment"
import { openLoginomAdmin, sealAdminProcessInventory } from "../src/loginom-admin"

const identity = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
  studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }

test("preparation recovery adopts the exited controller server and both slots with explicit incident lineage", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-preparation-recovery-")), fixture = await parallelFixture(root)
  const journal = path.join(fixture.slots.controller.stateDir, "prepare-command.json"), inventory = path.join(fixture.slots.controller.stateDir, "processes.json")
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId: "preparation", identity,
    slotIds: ["a", "b"], phase: "unactivated", processInventory: inventory })
  await writeLeaseReceipt(inventory, { version: 2, kind: "admin-processes", commandId: "preparation", journal, identity, connections: [] })
  const child = Bun.spawn([process.execPath, "-e", `const {acquireEnvironmentLeases}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/slots.ts"))});
    const environment=await acquireEnvironmentLeases(${JSON.stringify(fixture.slots)},2,${JSON.stringify(identity)},${JSON.stringify(journal)},${JSON.stringify(fixture.lockRoot)});
    console.log(JSON.stringify(environment.slots.map(lease=>lease.receipt)));
    await Promise.all([environment.server.close(),...environment.slots.map(lease=>lease.close())]);`],
    { cwd: root, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  try {
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
    const incidents = JSON.parse(stdout) as string[]
    const adopter = Bun.spawn([process.execPath, "-e", `const {recoverPreparationLeases}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/preparation-recovery.ts"))});
      const environment=await recoverPreparationLeases(${JSON.stringify(fixture.slots)},${JSON.stringify(identity)},${JSON.stringify(journal)},${JSON.stringify(fixture.lockRoot)});
      console.log(environment.journal);await Promise.all([environment.server.close(),...environment.slots.map(lease=>lease.close())]);`],
      { cwd: root, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
    const [adoptedCode, adoptedJournal, adoptedError] = await Promise.all([adopter.exited, new Response(adopter.stdout).text(), new Response(adopter.stderr).text()])
    expect({ code: adoptedCode, stderr: adoptedError }).toEqual({ code: 0, stderr: "" })
    const recovered = await recoverPreparationLeases(fixture.slots, identity, journal, fixture.lockRoot)
    try {
      expect(recovered.server.reservation).toMatchObject({ state: "recovery-only", revision: 3,
        lineage: [{ journal, commandId: "preparation", owner: { pid: child.pid } }, { journal: adoptedJournal.trim(), owner: { pid: adopter.pid } }] })
      expect(recovered.slots.map(lease => [lease.slot.id, lease.recoveryOnly])).toEqual([["a", true], ["b", true]])
      expect(await readLeaseReceipt(recovered.journal)).toMatchObject({ kind: "unactivated-recovery", phase: "unactivated",
        incident: { path: journal }, slotIncidents: incidents, slotRecoveries: recovered.slots.map(lease => lease.receipt) })
      await expect(stageUserPreparation(fixture.slots, recovered.slots[0]!, "e".repeat(64))).rejects.toThrow("SLOT_RECOVERY_ONLY")
      const before = await Bun.file(recovered.server.receipt).text()
      await expect(recoverPreparationLeases(fixture.slots, identity, journal, fixture.lockRoot)).rejects.toThrow("BUSY")
      expect(await Bun.file(recovered.server.receipt).text()).toBe(before)
      await expect(openLoginomAdmin(fixture.slots, identity, { serverLease: recovered.server, binary: "/unreadable-runtime" }))
        .rejects.toThrow("ADMIN_PROCESS_INVENTORY_UNCONFIRMED")
      const command = await readLeaseReceipt(recovered.journal) as { processInventory: string }
      expect(await sealAdminProcessInventory(fixture.slots, recovered.server,
        new Bun.CryptoHasher("sha256").update(JSON.stringify(command)).digest("hex"))).toMatchObject({ phase: "finalizing" })
      await expect(openLoginomAdmin(fixture.slots, identity, { serverLease: recovered.server,
        processInventory: command.processInventory, binary: "/unreadable-runtime" })).rejects.toThrow("ADMIN_PROCESS_INVENTORY_SEALED")
    } finally { await Promise.all([recovered.server.close(), ...recovered.slots.map(lease => lease.close())]) }
  } finally { await rm(root, { recursive: true, force: true }) }
})
