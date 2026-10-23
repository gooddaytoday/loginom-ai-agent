import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import { readStartupCleanup, readStartupManagement } from "../src/startup-reconciliation"
import { readLeaseReceipt, readResourceReservation, writeLeaseReceipt } from "../src/lease"
import { reconcileEnvironment } from "../src/startup-reconciliation"
import { parallelFixture } from "./helpers/parallel-fixture"
import { management } from "../src/profile"

test("startup accepts the cleanup receipt produced by management", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-startup-management-receipt-"))
  let confirmed = false
  try {
    const result = await management({ mode: "fake", cmd: [process.execPath, "-e", "console.log('ready')"],
      cwd: root, env: { PATH: process.env.PATH ?? "" }, cleanupDir: path.join(root, "management-command-a") }, ["loginom", "status"])
    confirmed = result.processCleanup.status === "confirmed"
    expect(confirmed).toBe(true)
    expect(await readStartupManagement({ stateDir: root, commandId: "command", slotId: "a", producerPid: process.pid }))
      .toEqual(result.processCleanup)
  } finally { if (confirmed) await rm(root, { recursive: true }) }
})

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

test("startup retains unknown prior admin ownership and refuses proof-only release", async () => {
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
    const { releaseClosedEnvironment } = await import("../src/startup-reconciliation")
    await expect(releaseClosedEnvironment(fixture.slots, identity, fixture.lockRoot)).rejects.toThrow("STARTUP_FINAL_PROOFS_UNCONFIRMED")
    expect(await Bun.file(canary).text()).toBe("unknown ownership")
  } finally { await rm(root, { recursive: true }) }
})

test("startup reads every preparation supervisor outcome from the owning command", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-startup-preparation-"))
  const processes = { status: "confirmed", capture_complete: true, unknownProcesses: [], lifetime: { producer_pid: 12 } }
  try {
    await mkdir(path.join(root, "management-command-a/first"), { recursive: true })
    await writeLeaseReceipt(path.join(root, "management-command-a/first/cleanup.json"), { processes })
    expect(JSON.stringify(await readStartupManagement({ stateDir: root, commandId: "command", slotId: "a", producerPid: 12 }))).toBe(JSON.stringify(processes))
  } finally { await rm(root, { recursive: true }) }
})

test("startup reconciles an admission failure using the run's actual preparation cleanup", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-startup-run-preparation-"))
  const processes = { status: "confirmed", capture_complete: true, unknownProcesses: [], lifetime: { producer_pid: 12 } }
  try {
    const runDir = path.join(root, "run")
    await mkdir(path.join(runDir, "preparation/a/status"), { recursive: true })
    await writeLeaseReceipt(path.join(runDir, "preparation/a/status/cleanup.json"), { processes })
    expect(JSON.stringify(await readStartupManagement({ stateDir: root, runDir, commandId: "command", slotId: "a", producerPid: 12 }))).toBe(JSON.stringify(processes))
  } finally { await rm(root, { recursive: true }) }
})

test("releaseClosedEnvironment uses saved final proofs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-startup-closed-")), fixture = await parallelFixture(root)
  const identity = { containerId: "a".repeat(64), startedAt: "2026-10-16T10:00:00Z", serverEpoch: "b".repeat(64),
    studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-16T10:00:00Z", configurationHash: "d".repeat(64) }
  const commandId = "closed-command", journal = path.join(fixture.slots.controller.stateDir, "prepare-command.json")
  try {
    await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId, phase: "unactivated", slotIds: ["a", "b"], identity })
    const child = Bun.spawn([process.execPath, "-e", `
      const {acquireEnvironmentLeases}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/slots.ts"))});
      const {writeLeaseReceipt}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/lease.ts"))});
      const file=${JSON.stringify(fixture.slots)},identity=${JSON.stringify(identity)};
      const environment=await acquireEnvironmentLeases(file,2,identity,${JSON.stringify(journal)},${JSON.stringify(fixture.lockRoot)});
      for(const lease of environment.slots){
        const proof=file.controller.stateDir+"/cleanup-${commandId}-"+lease.slot.id+".json";
        await writeLeaseReceipt(proof,{version:2,status:"confirmed",slotId:lease.slot.id,leaseToken:lease.token,serverEpoch:identity.serverEpoch,
          processes:"confirmed",serverSessions:"confirmed",archive:"committed",storageDeletionAllowed:true,nextAdmissionAllowed:true});
        await lease.release(proof);
      }
      const reservation=environment.server.reservation;
      await writeLeaseReceipt(file.controller.stateDir+"/cleanup-${commandId}-server.json",{version:2,status:"confirmed",reason:"run-slots-clean",
        key:reservation.key,token:reservation.token,revision:reservation.revision,serverEpoch:identity.serverEpoch});
      await environment.server.close();
    `], { stdout: "ignore", stderr: "pipe" })
    await new Response(child.stderr).text()
    expect(await child.exited).toBe(0)
    const before = await readResourceReservation({ key: `server:${identity.containerId}`, lockRoot: fixture.lockRoot })
    expect(before?.state).toBe("retained")
    const proofs = await Promise.all((await readdir(fixture.slots.controller.stateDir)).map(async name => {
      const file = path.join(fixture.slots.controller.stateDir, name)
      return { file, bytes: await Bun.file(file).text() }
    }))
    const { releaseClosedEnvironment } = await import("../src/startup-reconciliation")
    const serverProof = path.join(fixture.slots.controller.stateDir, `cleanup-${commandId}-server.json`)
    const savedServerProof = await readLeaseReceipt(serverProof) as Record<string, unknown>
    await rm(serverProof)
    await expect(releaseClosedEnvironment(fixture.slots, identity, fixture.lockRoot)).rejects.toThrow("STARTUP_FINAL_PROOFS_UNCONFIRMED")
    await writeLeaseReceipt(serverProof, { ...savedServerProof, serverEpoch: "e".repeat(64) })
    await expect(releaseClosedEnvironment(fixture.slots, identity, fixture.lockRoot)).rejects.toThrow("LEASE_RELEASE_UNCONFIRMED")
    await writeLeaseReceipt(serverProof, savedServerProof)
    const profile = await readResourceReservation({ key: `profile:${fixture.slots.slots[0]!.profileDir}`, lockRoot: fixture.lockRoot })
    const profileProof = await readLeaseReceipt(profile!.releaseEvidence!.path) as Record<string, unknown>
    await writeLeaseReceipt(profile!.releaseEvidence!.path, { ...profileProof, status: "unconfirmed" })
    await expect(releaseClosedEnvironment(fixture.slots, identity, fixture.lockRoot)).rejects.toThrow("STARTUP_FINAL_PROOFS_UNCONFIRMED")
    expect((await readResourceReservation({ key: `server:${identity.containerId}`, lockRoot: fixture.lockRoot }))?.state).toBe("retained")
    await writeLeaseReceipt(profile!.releaseEvidence!.path, profileProof)
    await releaseClosedEnvironment(fixture.slots, identity, fixture.lockRoot)
    await releaseClosedEnvironment(fixture.slots, identity, fixture.lockRoot)
    const after = await readResourceReservation({ key: `server:${identity.containerId}`, lockRoot: fixture.lockRoot })
    expect(after?.state).toBe("released")
    expect(after?.token === before?.token && after?.revision === before?.revision).toBe(true)
    for (const proof of proofs) expect(await Bun.file(proof.file).text() === proof.bytes).toBe(true)
    for (const slot of fixture.slots.slots)
      expect((await readResourceReservation({ key: `profile:${slot.profileDir}`, lockRoot: fixture.lockRoot }))?.state).toBe("released")
  } finally { await rm(root, { recursive: true }) }
})
