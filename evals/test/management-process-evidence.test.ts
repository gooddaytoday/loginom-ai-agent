import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { acquireEnvironmentLeases } from "../src/slots"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { readManagementProcessInventory, sealManagementProcessInventory, superviseManagementProcess } from "../src/management-process-evidence"
import { parallelFixture } from "./helpers/parallel-fixture"
import { agentCommand } from "../src/cli"
import { loadConfig } from "../src/config"
import { management } from "../src/profile"
import { openLoginomAdmin, sealAdminProcessInventory } from "../src/loginom-admin"

const identity = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
  studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }

test("one management slot seals before further dispatch while its peer continues", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-management-slot-seal-")), fixture = await parallelFixture(root)
  const journal = path.join(fixture.slots.controller.stateDir, "command.json")
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId: "slot-seal", identity,
    slotIds: ["a", "b"], phase: "cli_admitted" })
  const environment = await acquireEnvironmentLeases(fixture.slots, 2, identity, journal, fixture.lockRoot)
  try {
    const contexts = []
    for (const lease of environment.slots) {
      const file = path.join(fixture.slots.controller.stateDir, `management-${lease.slot.id}.json`)
      const calls = path.join(root, `calls-${lease.slot.id}.jsonl`)
      await writeLeaseReceipt(file, { version: 2, kind: "management-processes", commandId: "slot-seal", journal, identity,
        leaseToken: lease.token, slotId: lease.slot.id, profileDir: lease.slot.profileDir, processes: [] })
      const command = agentCommand({ ...loadConfig(["--dry-run"], {}), profileDir: lease.slot.profileDir })
      contexts.push({ file, lease, calls, command: { ...command, env: { ...command.env, EVAL_FAKE_MANAGEMENT_CALLS_FILE: calls },
        cleanupDir: path.join(fixture.slots.controller.stateDir, `captures-${lease.slot.id}`), managementEvidence: { file, lease } } })
    }
    for (const context of contexts) expect((await management(context.command, ["loginom", "status", "--format", "json"])).exitCode).toBe(0)
    const a = contexts[0]!, b = contexts[1]!
    const before = await Bun.file(a.file).text(), calls = await Bun.file(a.calls).text(), command = await Bun.file(journal).text()
    const sealed = await sealManagementProcessInventory(fixture.slots, environment.server, a.lease, a.file)
    expect(sealed).toMatchObject({ status: "sealed", inventory: { path: a.file, sha256: hash(JSON.parse(before)) } })
    const seal = await Bun.file(sealed.source.path).text()
    expect(hash(JSON.parse(seal))).toBe(sealed.source.sha256)
    expect((await stat(sealed.source.path)).mode & 0o777).toBe(0o600)
    expect(await sealManagementProcessInventory(fixture.slots, environment.server, a.lease, a.file)).toEqual(sealed)
    await expect(management(a.command, ["loginom", "status", "--format", "json"])).rejects.toThrow("MANAGEMENT_PROCESS_INVENTORY_SEALED")
    expect(await Bun.file(a.file).text()).toBe(before)
    expect(await Bun.file(a.calls).text()).toBe(calls)
    const continued = await management(b.command, ["loginom", "status", "--format", "json"])
    expect({ exitCode: continued.exitCode, cleanup: continued.processCleanup.status }).toEqual({ exitCode: 0, cleanup: "confirmed" })
    expect((await Bun.file(b.calls).text()).trim().split("\n")).toHaveLength(2)
    expect(await Bun.file(sealed.source.path).text()).toBe(seal)
    expect(await Bun.file(journal).text()).toBe(command)
    await writeLeaseReceipt(a.file, { ...JSON.parse(before), processes: [] })
    await expect(readManagementProcessInventory({ file: a.file, journal, commandId: "slot-seal", identity, leaseToken: a.lease.token,
      slotId: a.lease.slot.id, profileDir: a.lease.slot.profileDir, producerPid: process.pid })).rejects.toThrow("MANAGEMENT_PROCESS_INVENTORY_CHANGED")
    expect(await Bun.file(sealed.source.path).text()).toBe(seal)
  } finally { await Promise.all([environment.server.close(), ...environment.slots.map(lease => lease.close())]); await rm(root, { recursive: true, force: true }) }
}, 30_000)

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
    const program = `const admitted=await Bun.file(${JSON.stringify(journal)}).json();
      if(!admitted.managementInventories?.some(entry=>entry.file===${JSON.stringify(file)}&&entry.leaseToken===${JSON.stringify(lease.token)})){await Bun.sleep(100);throw Error("INVENTORY_NOT_REGISTERED_BEFORE_DISPATCH")}
      const rows=(await Bun.file(${JSON.stringify(file)}).json()).processes;process.stdout.write(rows.at(-1).state);await Bun.sleep(100)`
    const run = await superviseManagementProcess({ cmd: [process.execPath, "-e", program], cwd: root, env: { PATH: process.env.PATH ?? "", LOGINOM_AI_AGENT_CLI_BUNDLE: bundle },
      profileDir: lease.slot.profileDir, timeoutMs: 3000 }, { file, lease, directory, operation: ["loginom", "status"] })
    expect({ stdout: run.stdout, exitCode: run.exitCode, cleanup: run.processCleanup.status }).toEqual({ stdout: "planned", exitCode: 0, cleanup: "confirmed" })
    const registered = await Bun.file(journal).text()
    expect(await readLeaseReceipt(journal)).toMatchObject({ managementInventories: [{ file, leaseToken: lease.token, slotId: lease.slot.id, profileDir: lease.slot.profileDir }] })
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
    // Actual OS cancellation probe; it does not simulate a native Loginom reply.
    const marker = path.join(root, "cancel-ready"), abort = new AbortController()
    const cancelling = management({ ...command, cmd: [process.execPath, "-e",
      `process.on("SIGINT",()=>process.exit(0));await Bun.write(${JSON.stringify(marker)},"ready");await Bun.sleep(10000)`],
      env: { ...command.env, LOGINOM_AI_AGENT_CLI_BUNDLE: bundle } }, ["loginom", "status", "--format", "json"], undefined, 3000, abort.signal)
    const deadline = Date.now() + 2000
    while (!await Bun.file(marker).exists() && Date.now() < deadline) await Bun.sleep(10)
    expect(await Bun.file(marker).exists()).toBe(true)
    abort.abort()
    const cancelled = await cancelling
    expect({ interrupted: cancelled.interrupted, timedOut: cancelled.timedOut, cleanup: cancelled.processCleanup.status })
      .toEqual({ interrupted: true, timedOut: false, cleanup: "confirmed" })
    expect((await readManagementProcessInventory(input)).processes.at(-1)!.result).toMatchObject({ interrupted: true, timedOut: false })
    expect(await Bun.file(journal).text()).toBe(registered)
    const alternate = path.join(fixture.slots.controller.stateDir, "alternate.json"), alternateDirectory = path.join(fixture.slots.controller.stateDir, "alternate")
    await mkdir(alternateDirectory, { mode: 0o700 })
    await writeLeaseReceipt(alternate, { ...await readLeaseReceipt(file) as Record<string, unknown>, processes: [] })
    await expect(superviseManagementProcess({ cmd: [process.execPath, "-e", "throw Error('must not dispatch')"], cwd: root,
      env: {}, profileDir: lease.slot.profileDir, timeoutMs: 3000 }, { file: alternate, lease, directory: alternateDirectory, operation: ["loginom", "status"] }))
      .rejects.toThrow("MANAGEMENT_INVENTORY_CONFLICT")
    expect(await Bun.file(journal).text()).toBe(registered)
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
}, 30_000)

test("parallel management owners register both slot inventories before dispatch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-management-registry-")), fixture = await parallelFixture(root)
  const journal = path.join(fixture.slots.controller.stateDir, "command.json"), bundle = path.join(root, "bundle")
  const adminInventory = path.join(fixture.slots.controller.stateDir, "admin-processes.json")
  await mkdir(bundle, { mode: 0o700 })
  await Bun.write(path.join(bundle, "browser"), Bun.file("/usr/bin/true"))
  await Bun.write(path.join(bundle, "resource-manifest.json"), JSON.stringify({ browser: "browser" }))
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId: "parallel-management", identity,
    slotIds: ["a", "b"], phase: "cli_admitted", processInventory: adminInventory })
  // Data-only empty admin inventory; this test launches no native Loginom process.
  await writeLeaseReceipt(adminInventory, { version: 2, kind: "admin-processes", commandId: "parallel-management", journal, identity, connections: [] })
  const environment = await acquireEnvironmentLeases(fixture.slots, 2, identity, journal, fixture.lockRoot)
  try {
    const settled = await Promise.allSettled(environment.slots.map(async lease => {
      const file = path.join(fixture.slots.controller.stateDir, `management-${lease.slot.id}.json`), directory = path.join(fixture.slots.controller.stateDir, `capture-${lease.slot.id}`)
      await mkdir(directory, { mode: 0o700 })
      await writeLeaseReceipt(file, { version: 2, kind: "management-processes", commandId: "parallel-management", journal, identity,
        leaseToken: lease.token, slotId: lease.slot.id, profileDir: lease.slot.profileDir, processes: [] })
      const program = `const command=await Bun.file(${JSON.stringify(journal)}).json();
        if(!command.managementInventories.some(entry=>entry.file===${JSON.stringify(file)}&&entry.leaseToken===${JSON.stringify(lease.token)}))throw Error("NOT_REGISTERED");
        process.stdout.write("registered");await Bun.sleep(100)`
      const result = await superviseManagementProcess({ cmd: [process.execPath, "-e", program], cwd: root,
        env: { PATH: process.env.PATH ?? "", LOGINOM_AI_AGENT_CLI_BUNDLE: bundle }, profileDir: lease.slot.profileDir, timeoutMs: 3000 },
        { file, lease, directory, operation: ["loginom", "status"] })
      expect({ stdout: result.stdout, code: result.exitCode, cleanup: result.processCleanup.status }).toEqual({ stdout: "registered", code: 0, cleanup: "confirmed" })
      return { file, leaseToken: lease.token, slotId: lease.slot.id, profileDir: lease.slot.profileDir }
    }))
    const results = settled.map(result => {
      if (result.status === "rejected") throw result.reason
      return result.value
    })
    const command = await readLeaseReceipt(journal) as { managementInventories: { slotId: string }[] }
    expect(command.managementInventories.sort((a, b) => a.slotId.localeCompare(b.slotId))).toEqual(results)
    const admitted = await readLeaseReceipt(journal)
    const original = await readLeaseReceipt(results[0]!.file) as { processes: unknown[] }
    await writeLeaseReceipt(results[0]!.file, { ...original, processes: [...original.processes, ...original.processes] })
    await expect(sealAdminProcessInventory(fixture.slots, environment.server, hash(admitted), environment.slots))
      .rejects.toThrow("MANAGEMENT_PROCESS_PROOF_UNCONFIRMED")
    expect(await readLeaseReceipt(journal)).toEqual(admitted)
    await writeLeaseReceipt(results[0]!.file, original)
    await expect(sealAdminProcessInventory(fixture.slots, environment.server, hash(admitted), environment.slots.slice(0, 1)))
      .rejects.toThrow("MANAGEMENT_ADMISSION_UNCONFIRMED")
    await expect(sealAdminProcessInventory(fixture.slots, environment.server, "0".repeat(64), environment.slots))
      .rejects.toThrow("MANAGEMENT_ADMISSION_UNCONFIRMED")
    const marker = path.join(root, "live"), finish = path.join(root, "finish"), liveDirectory = path.join(fixture.slots.controller.stateDir, "live-a")
    await mkdir(liveDirectory, { mode: 0o700 })
    // Keep the OS probe alive while the subreaper publishes its durable CLI admission.
    const live = superviseManagementProcess({ cmd: [process.execPath, "-e", `await Bun.write(${JSON.stringify(marker)},"ready");
      await Bun.sleep(1000);
      const until=Date.now()+2000;while(!await Bun.file(${JSON.stringify(finish)}).exists()&&Date.now()<until)await Bun.sleep(10)`],
      cwd: root, env: { PATH: process.env.PATH ?? "", LOGINOM_AI_AGENT_CLI_BUNDLE: bundle }, profileDir: environment.slots[0]!.slot.profileDir, timeoutMs: 3000 },
      { file: results[0]!.file, lease: environment.slots[0]!, directory: liveDirectory, operation: ["loginom", "status"] })
    try {
      const until = Date.now() + 2000
      while (!await Bun.file(marker).exists() && Date.now() < until) await Bun.sleep(10)
      expect(await Bun.file(marker).exists()).toBe(true)
      await expect(sealManagementProcessInventory(fixture.slots, environment.server, environment.slots[0]!, results[0]!.file))
        .rejects.toThrow("MANAGEMENT_PROCESS_BUSY")
      expect(await Bun.file(`${results[0]!.file}.sealed.json`).exists()).toBe(false)
      await expect(sealAdminProcessInventory(fixture.slots, environment.server, hash(admitted), environment.slots))
        .rejects.toThrow("MANAGEMENT_PROCESS_BUSY")
      expect(await readLeaseReceipt(journal)).toEqual(admitted)
    } finally { await Bun.write(finish, "done"); await live }
    const sealed = await sealAdminProcessInventory(fixture.slots, environment.server, hash(admitted), environment.slots)
    expect(sealed).toMatchObject({ phase: "finalizing", managementSources: await Promise.all(results.map(async result =>
      ({ path: result.file, sha256: hash(await readLeaseReceipt(result.file)) }))) })
    const lease = environment.slots[0]!, before = await Bun.file(results[0]!.file).text()
    await expect(superviseManagementProcess({ cmd: [process.execPath, "-e", "throw Error('must not dispatch')"], cwd: root,
      env: {}, profileDir: lease.slot.profileDir, timeoutMs: 3000 }, { file: results[0]!.file, lease,
      directory: path.join(fixture.slots.controller.stateDir, "capture-a"), operation: ["loginom", "status"] }))
      .rejects.toThrow("MANAGEMENT_ADMISSION_UNCONFIRMED")
    await expect(openLoginomAdmin(fixture.slots, identity, { serverLease: environment.server,
      processInventory: adminInventory, binary: "/unreadable-runtime" })).rejects.toThrow("ADMIN_PROCESS_INVENTORY_SEALED")
    expect(await Bun.file(results[0]!.file).text()).toBe(before)
    expect(await readLeaseReceipt(journal)).toEqual(sealed)
    const history = ["data/loginom-ai-agent.db", "data/loginom-ai-agent.db-wal", "data/loginom-ai-agent.db-shm", "loginom/inputs/input.csv"]
    for (const lease of environment.slots) {
      await mkdir(path.join(lease.slot.profileDir, "loginom/inputs"), { recursive: true, mode: 0o700 })
      for (const name of history) await Bun.write(path.join(lease.slot.profileDir, name), `${lease.slot.id}:${name}`)
    }
    const { archiveManagementEnvironment } = await import("../src/environment-finalization")
    const retained = await readLeaseReceipt(results[0]!.file) as { processes: unknown[] }
    await writeLeaseReceipt(results[0]!.file, { ...retained, processes: [] })
    await expect(archiveManagementEnvironment(fixture.slots, environment)).rejects.toThrow("MANAGEMENT_PROCESS_INVENTORY_CHANGED")
    expect(await Bun.file(path.join(environment.slots[0]!.slot.profileDir, history[0]!)).exists()).toBe(true)
    await writeLeaseReceipt(results[0]!.file, retained)
    const pending = path.join(environment.slots[1]!.slot.profileDir, "loginom/connection/pending.json")
    await mkdir(path.dirname(pending), { recursive: true, mode: 0o700 })
    await Bun.write(pending, "{}")
    await expect(archiveManagementEnvironment(fixture.slots, environment)).rejects.toThrow("Профиль имеет незавершённое состояние")
    expect(await Bun.file(path.join(environment.slots[0]!.slot.profileDir, history[0]!)).exists()).toBe(true)
    await rm(pending)
    const archived = await archiveManagementEnvironment(fixture.slots, environment)
    expect(archived.profiles.map(profile => profile.slotId)).toEqual(["a", "b"])
    for (const profile of archived.profiles) {
      const lease = environment.slots.find(lease => lease.slot.id === profile.slotId)!
      for (const name of history) {
        expect(await Bun.file(path.join(profile.archive, name)).text()).toBe(`${profile.slotId}:${name}`)
        expect(await Bun.file(path.join(lease.slot.profileDir, name)).exists()).toBe(false)
      }
      expect(await Bun.file(path.join(lease.slot.profileDir, "data/auth.json")).text()).toContain("fixture")
    }
    const archiveBytes = await Bun.file(archived.source.path).text()
    expect(await archiveManagementEnvironment(fixture.slots, environment)).toEqual(archived)
    expect(await Bun.file(archived.source.path).text()).toBe(archiveBytes)
    await environment.server.assertHeld()
  } finally {
    await Promise.all([environment.server.close(), ...environment.slots.map(lease => lease.close())])
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)

function hash(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}
