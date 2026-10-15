import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, rmdir } from "node:fs/promises"
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
    // The allowed fake-CLI seam checks management wiring; no native Loginom readiness is claimed.
    const command = { ...agentCommand({ ...loadConfig(["--dry-run"], {}), profileDir: lease.slot.profileDir }),
      cleanupDir: path.join(fixture.slots.controller.stateDir, "management"), managementEvidence: { file, lease } }
    const managed = await management(command, ["loginom", "status", "--format", "json"])
    expect(managed.processCleanup.status).toBe("confirmed")
    expect((await readManagementProcessInventory(input)).processes).toHaveLength(2)
    await management(command, ["loginom", "setup", "--stdin-json", "--format", "json"], '{"password":"private-management-canary"}')
    expect((await readManagementProcessInventory(input)).processes).toHaveLength(3)
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

test.skipIf(!process.env.EVAL_CLI_BIN)("installed CLI management publishes continuous slot evidence for an unconfigured status", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-management-native-")), fixture = await parallelFixture(root)
  // Native CLI initializes its own marker and requires an empty fresh profile.
  await rm(path.join(fixture.slots.slots[0]!.profileDir, "data/auth.json"))
  await rmdir(path.join(fixture.slots.slots[0]!.profileDir, "data"))
  const journal = path.join(fixture.slots.controller.stateDir, "command.json")
  // Slot authority is a data-only fixture; this control makes no Loginom login or readiness claim.
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId: "native-management", identity, phase: "cli_admitted" })
  const environment = await acquireEnvironmentLeases(fixture.slots, 1, identity, journal, fixture.lockRoot), lease = environment.slots[0]!
  const file = path.join(fixture.slots.controller.stateDir, "management-a.json")
  await writeLeaseReceipt(file, { version: 2, kind: "management-processes", commandId: "native-management", journal, identity,
    leaseToken: lease.token, slotId: lease.slot.id, profileDir: lease.slot.profileDir, processes: [] })
  let confirmed = false
  try {
    const config = loadConfig(["--skip-judge"], { EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: process.env.EVAL_CLI_BIN!,
      EVAL_PROFILE_DIR: lease.slot.profileDir, EVAL_AGENT_MODEL: "openai/gpt-6-luna", LOGINOM_DOCK_API_KEY: "unused-metadata-control" })
    const command = { ...agentCommand(config), cleanupDir: path.join(fixture.slots.controller.stateDir, "captures"), managementEvidence: { file, lease } }
    const result = await management(command, ["loginom", "status", "--format", "json"])
    expect({ code: result.exitCode, stderr: result.stderr, outputOnFailure: result.exitCode ? result.stdout : "" })
      .toEqual({ code: 0, stderr: "", outputOnFailure: "" })
    expect(JSON.parse(result.stdout)).toMatchObject({ state: "unconfigured", hasApiKey: false })
    const inventory = await readManagementProcessInventory({ file, journal, commandId: "native-management", identity, leaseToken: lease.token,
      slotId: lease.slot.id, profileDir: lease.slot.profileDir, producerPid: process.pid })
    expect(inventory.processes).toHaveLength(1)
    expect(inventory.processes[0]!.identities.length).toBeGreaterThan(1)
    confirmed = result.processCleanup.status === "confirmed" && result.processCleanup.capture_complete
    expect(confirmed).toBe(true)
  } finally { await Promise.all([environment.server.close(), lease.close()]); if (confirmed) await rm(root, { recursive: true, force: true }) }
}, 30000)
