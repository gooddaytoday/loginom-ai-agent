import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { readAgentProcess, superviseAgentProcess } from "../src/agent-process-evidence"
import { recordAgentSessions } from "../src/agent-sessions"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { acquireEnvironmentLeases } from "../src/slots"
import { parallelFixture } from "./helpers/parallel-fixture"

test.each(["process", "directory", "time"])("agent ledger refuses an incoherent browser %s before reading user sources", async fault => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-agent-session-codec-")), fixture = await parallelFixture(root)
  const identity = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
    studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }
  const journal = path.join(fixture.slots.controller.stateDir, "command.json"), file = path.join(fixture.slots.controller.stateDir, "agents.json")
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId: "codec", identity, phase: "cli_admitted", slotIds: ["a"] })
  const environment = await acquireEnvironmentLeases(fixture.slots, 1, identity, journal, fixture.lockRoot), lease = environment.slots[0]!
  await writeLeaseReceipt(file, { version: 2, kind: "eval-agent-processes", commandId: "codec", slotId: "a", producerPid: process.pid, state: "open", processes: [] })
  const out = path.join(root, "out")
  await mkdir(out, { mode: 0o700 })
  let confirmed = false
  try {
    const result = await superviseAgentProcess({ cmd: [process.execPath, "-e", "console.log('codec')"], cwd: root,
      env: { PATH: process.env.PATH ?? "" }, timeoutMs: 5000, outDir: out }, { file, commandId: "codec", slotId: "a", assertHeld: lease.assertHeld })
    confirmed = result.processCleanup.status === "confirmed" && result.processCleanup.capture_complete
    expect(confirmed).toBe(true)
    const inventory = await Bun.file(file).json(), entry = inventory.processes[0]
    const original = await readLeaseReceipt(entry.proof.path) as typeof result.processCleanup
    // Negative codec only: no Loginom user, native snapshot or close authority is created.
    const malformed = { ...original, runtimeDirectories: [path.join(lease.slot.profileDir, "loginom/runtime/codec")],
      browserBindings: [{ process: { ...original.processes[0]!, pid: original.processes[0]!.pid + (fault === "process" ? 100_000_000 : 0) },
        runtimeDirectory: path.join(lease.slot.profileDir, fault === "directory" ? "other" : "loginom/runtime/codec"),
        observed_at: fault === "time" ? new Date(Date.parse(original.lifetime!.started_at) - 1).toISOString() : original.lifetime!.started_at }] }
    await writeLeaseReceipt(entry.proof.path, malformed)
    await writeLeaseReceipt(file, { ...inventory, processes: [{ ...entry, proof: { ...entry.proof, sha256: hash(malformed) } }] })
    const completed = await readAgentProcess({ file, commandId: "codec", slotId: "a", producerPid: process.pid }, entry.id)
    const unused = { path: path.join(root, "unused"), sha256: "e".repeat(64) }
    await expect(recordAgentSessions(fixture.slots, lease, path.join(root, "no-user-secret"), {
      process: completed.entrySource, before: unused, during: [unused], after: unused,
    })).rejects.toThrow("AGENT_SESSION_BROWSER_UNCONFIRMED")
    expect(await Array.fromAsync(new Bun.Glob("agent-session-*.json").scan({ cwd: fixture.slots.controller.stateDir }))).toEqual([])
  } finally {
    await Promise.all([environment.server.close(), lease.close()])
    if (confirmed) await rm(root, { recursive: true })
  }
})

function hash(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}
