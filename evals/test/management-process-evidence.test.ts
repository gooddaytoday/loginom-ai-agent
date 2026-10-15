import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { acquireEnvironmentLeases } from "../src/slots"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { readManagementProcessInventory, superviseManagementProcess } from "../src/management-process-evidence"
import { parallelFixture } from "./helpers/parallel-fixture"
import { agentCommand } from "../src/cli"
import { loadConfig } from "../src/config"
import { management } from "../src/profile"

const identity = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
  studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }

test("management process inventory precedes dispatch and binds actual continuous process closure to its slot", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-management-evidence-")), fixture = await parallelFixture(root)
  const journal = path.join(fixture.slots.controller.stateDir, "command.json")
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId: "management", identity, phase: "cli_admitted" })
  const environment = await acquireEnvironmentLeases(fixture.slots, 1, identity, journal, fixture.lockRoot), lease = environment.slots[0]!
  const file = path.join(fixture.slots.controller.stateDir, "management-a.json"), directory = path.join(fixture.slots.controller.stateDir, "capture")
  await mkdir(directory, { mode: 0o700 })
  const bundle = path.join(root, "metadata-bundle")
  await mkdir(bundle, { mode: 0o700 })
  // Metadata-only expected executable; no browser is launched by this OS probe.
  await Bun.write(path.join(bundle, "browser"), Bun.file("/usr/bin/true"))
  await Bun.write(path.join(bundle, "resource-manifest.json"), JSON.stringify({ browser: "browser" }))
  const input = { file, journal, commandId: "management", identity, leaseToken: lease.token, slotId: lease.slot.id,
    profileDir: lease.slot.profileDir, producerPid: process.pid }
  await writeLeaseReceipt(file, { version: 2, kind: "management-processes", commandId: input.commandId, journal, identity,
    leaseToken: lease.token, slotId: lease.slot.id, profileDir: lease.slot.profileDir, processes: [] })
  try {
    // Real OS probe, not a simulated Loginom operation. It independently reads admission before exit.
    const program = `const rows=(await Bun.file(${JSON.stringify(file)}).json()).processes;process.stdout.write(rows.at(-1).state);await Bun.sleep(100)`
    const run = await superviseManagementProcess({ cmd: [process.execPath, "-e", program], cwd: root, env: { PATH: process.env.PATH ?? "", LOGINOM_AI_AGENT_CLI_BUNDLE: bundle },
      profileDir: lease.slot.profileDir, timeoutMs: 3000 }, { file, lease, directory, operation: ["loginom", "status"] })
    expect({ stdout: run.stdout, exitCode: run.exitCode, cleanup: run.processCleanup.status }).toEqual({ stdout: "planned", exitCode: 0, cleanup: "confirmed" })
    const inventory = await readManagementProcessInventory(input)
    expect(inventory.processes).toHaveLength(1)
    expect(inventory.processes[0]).toMatchObject({ operation: ["loginom", "status"], owner: { kind: "slot" } })
    expect(inventory.processes[0]!.result).toMatchObject({ exitCode: 0, interrupted: false, timedOut: false,
      stdoutSha256: new Bun.CryptoHasher("sha256").update("planned").digest("hex"), reply: null })
    const resultFile = inventory.processes[0]!.result!.source.path
    const resultBytes = await Bun.file(resultFile).text()
    await writeLeaseReceipt(resultFile, { ...JSON.parse(resultBytes), exitCode: 2 })
    await expect(readManagementProcessInventory(input)).rejects.toThrow("MANAGEMENT_RESULT_UNCONFIRMED")
    await writeLeaseReceipt(resultFile, JSON.parse(resultBytes))
    // Native snapshots below are data-only codecs around the actual OS process window.
    const baseline = await readLeaseReceipt(file) as { processes: Record<string, unknown>[] }
    const lifetime = (await Bun.file(inventory.processes[0]!.source.path).json()).lifetime
    const start = Date.parse(lifetime.started_at), finish = Date.parse(lifetime.finished_at)
    const codec = path.join(fixture.slots.controller.stateDir, "admin-codec")
    await mkdir(path.join(codec, "commands"), { recursive: true, mode: 0o700 })
    const snapshots = await Promise.all([["before", start - 2, start - 1], ["during", start, finish], ["after", finish + 1, finish + 2]].map(async values => {
      const id = String(values[0]), commandFile = path.join(codec, "commands", `${id}.json`)
      const command = { version: 1, kind: "loginom-admin-command", id, op: "inspect", expectedIdentity: identity, desiredHash: hash({}),
        replyHash: "e".repeat(64), state: "confirmed", at: new Date(Number(values[1])).toISOString(), settledAt: new Date(Number(values[2])).toISOString() }
      const receipt = { version: 2, kind: "admin-session-inventory", identity, sessionIdentityQualified: false, sessions: [],
        command: { path: commandFile, sha256: hash(command) }, reply: { id, sha256: command.replyHash } }
      const source = { path: path.join(codec, `session-inventory-${id}.json`), sha256: hash(receipt) }
      await writeLeaseReceipt(commandFile, command)
      await writeLeaseReceipt(source.path, receipt)
      return source
    }))
    const sessions = { before: snapshots[0]!, during: [snapshots[1]!], after: snapshots[2]! }
    await writeLeaseReceipt(file, { ...baseline, processes: [{ ...baseline.processes[0], sessions }] })
    expect((await readManagementProcessInventory(input)).processes[0]!.sessions!.during).toHaveLength(1)
    await writeLeaseReceipt(file, { ...baseline, processes: [{ ...baseline.processes[0], sessions: { ...sessions, during: [sessions.before] } }] })
    await expect(readManagementProcessInventory(input)).rejects.toThrow("MANAGEMENT_SESSION_SCOPE_INVALID")
    await writeLeaseReceipt(file, { ...baseline, processes: [{ ...baseline.processes[0], sessions: { ...sessions, during: [sessions.after] } }] })
    await expect(readManagementProcessInventory(input)).rejects.toThrow("MANAGEMENT_SESSION_SCOPE_INVALID")
    await writeLeaseReceipt(file, baseline)
    // The allowed fake-CLI seam checks management wiring; no native Loginom readiness is claimed.
    const command = { ...agentCommand({ ...loadConfig(["--dry-run"], {}), profileDir: lease.slot.profileDir }),
      cleanupDir: path.join(fixture.slots.controller.stateDir, "management"), managementEvidence: { file, lease } }
    const managed = await management(command, ["loginom", "status", "--format", "json"])
    expect(managed.processCleanup.status).toBe("confirmed")
    expect((await readManagementProcessInventory(input)).processes).toHaveLength(2)
    await management(command, ["loginom", "setup", "--stdin-json", "--format", "json"], '{"password":"private-management-canary"}')
    const setup = await readManagementProcessInventory(input)
    expect(setup.processes).toHaveLength(3)
    expect(await Bun.file(setup.processes[2]!.result!.source.path).text()).not.toContain("private-management-canary")
    expect(await Bun.file(file).text()).not.toContain("private-management-canary")
    const admitted = await Bun.file(file).text()
    await expect(superviseManagementProcess({ cmd: [process.execPath, "-e", "throw Error('must not dispatch')"], cwd: root,
      env: {}, profileDir: lease.slot.profileDir, timeoutMs: 3000 }, { file, lease, directory,
      operation: ["loginom", "private-management-canary"] })).rejects.toThrow("MANAGEMENT_OPERATION_INVALID")
    expect(await Bun.file(file).text()).toBe(admitted)
    const stored = await readLeaseReceipt(file) as { processes: { proof: { path: string } }[] }
    const proof = stored.processes[0]!.proof.path
    const bytes = await Bun.file(proof).text()
    await writeLeaseReceipt(proof, { ...JSON.parse(bytes), capture_complete: false })
    await expect(readManagementProcessInventory(input)).rejects.toThrow("MANAGEMENT_PROCESS_PROOF_UNCONFIRMED")
    await writeLeaseReceipt(proof, JSON.parse(bytes))
    await expect(readManagementProcessInventory({ ...input, producerPid: process.pid + 1 })).rejects.toThrow("MANAGEMENT_PROCESS_PROOF_UNCONFIRMED")
    await lease.close()
    await expect(management(command, ["loginom", "status", "--format", "json"])).rejects.toThrow("LEASE_NOT_HELD")
    await expect(superviseManagementProcess({ cmd: [process.execPath, "-e", "throw Error('must not dispatch')"], cwd: root,
      env: {}, profileDir: lease.slot.profileDir, timeoutMs: 3000 }, { file, lease, directory, operation: ["loginom", "check"] }))
      .rejects.toThrow("LEASE_NOT_HELD")
    expect(await Bun.file(proof).text()).toBe(bytes)
  } finally { await Promise.all([environment.server.close(), lease.close()]); await rm(root, { recursive: true, force: true }) }
}, 10000)

function hash(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}
