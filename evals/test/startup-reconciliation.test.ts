import { expect, test } from "bun:test"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import { readStartupCleanup } from "../src/startup-reconciliation"
import { writeLeaseReceipt } from "../src/lease"
import { reconcileEnvironment } from "../src/startup-reconciliation"
import { parallelFixture } from "./helpers/parallel-fixture"

test("startup uses supervisor cleanup and refuses unknown prior processes before deletion", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-startup-"))
  const file = path.join(root, "cleanup.json")
  const confirmed = { status: "confirmed", capture_complete: true, unknownProcesses: [], lifetime: { producer_pid: 12 } }
  try {
    await writeLeaseReceipt(file, { processes: confirmed })
    expect(JSON.stringify(await readStartupCleanup(file, 12))).toBe(JSON.stringify(confirmed))
    for (const processes of [{ ...confirmed, status: "unconfirmed" }, { ...confirmed, capture_complete: false },
      { ...confirmed, unknownProcesses: [{ pid: 123 }] }, { ...confirmed, lifetime: { producer_pid: 13 } }]) {
      await writeLeaseReceipt(file, { processes })
      await expect(readStartupCleanup(file, 12)).rejects.toThrow("STARTUP_PROCESS_CLEANUP_UNCONFIRMED")
    }
  } finally { await rm(root, { recursive: true }) }
})

test("startup retains unknown prior admin ownership without touching slot files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-startup-unknown-")), fixture = await parallelFixture(root)
  const identity = { containerId: "a".repeat(64), startedAt: "2026-10-16T10:00:00Z", serverEpoch: "b".repeat(64),
    studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-16T10:00:00Z", configurationHash: "d".repeat(64) }
  const journal = path.join(fixture.slots.controller.stateDir, "prepare-command.json")
  try {
    await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId: "startup-unknown", phase: "unactivated", slotIds: ["a"], identity })
    const child = Bun.spawn([process.execPath, "-e", `const {acquireEnvironmentLeases}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/slots.ts"))});const env=await acquireEnvironmentLeases(${JSON.stringify(fixture.slots)},1,${JSON.stringify(identity)},${JSON.stringify(journal)},${JSON.stringify(fixture.lockRoot)});await Promise.all([env.server.close(),...env.slots.map(s=>s.close())])`], { stdout: "pipe", stderr: "pipe" })
    expect(await child.exited).toBe(0)
    const canary = path.join(fixture.slots.slots[0]!.workspaceRoot, "keep.txt")
    await Bun.write(canary, "unknown ownership")
    await expect(reconcileEnvironment(fixture.slots, identity, "/missing-cli", fixture.lockRoot)).rejects.toThrow("STARTUP_ADMIN_CLEANUP_UNCONFIRMED")
    expect(await Bun.file(canary).text()).toBe("unknown ownership")
  } finally { await rm(root, { recursive: true }) }
})
