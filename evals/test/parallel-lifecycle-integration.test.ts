import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { createPair, destroyPair, prepareUserStorage } from "../src/parallel-pair"
import { loadConfig } from "../src/config"
import { agentCommand } from "../src/cli"
import { loadTasks } from "../src/task"
import { afterAttempt, runAttempt } from "../src/run"
import { globalLockRoot, readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { storageCodecFixture } from "./helpers/storage-codec-fixture"
import { parallelFixture } from "./helpers/parallel-fixture"
import { loadSlots, parseSlots } from "../src/slots"
import { recoverPreparationLeases } from "../src/preparation-recovery"
import { finalizeUnactivatedEnvironment } from "../src/environment-finalization"
import { openLoginomAdmin } from "../src/loginom-admin"

const integration = process.env.EVAL_PAIR_INTEGRATION === "1" ? test : test.skip

test.skipIf(!process.env.EVAL_ADMIN_LIVE_CONFIG)("preparation recovery: native blocked account releases after its controller exits", async () => {
  const source = await loadSlots(process.env.EVAL_ADMIN_LIVE_CONFIG!, 1)
  const root = await mkdtemp(path.join(tmpdir(), "evals-recover-preparation-")), fixture = await parallelFixture(root)
  const name = `evals-recover-${crypto.randomUUID().slice(0, 8)}`
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
  const url = `http://127.0.0.1:${listener.port}/app/`
  listener.stop(true)
  const file = parseSlots({ ...fixture.slots, server: { ...fixture.slots.server, container: `${name}-server`, studioContainer: `${name}-studio`,
    network: name, alias: "loginom-server-7.4.2-test", url }, controller: { ...fixture.slots.controller, adminCredentialsFile: source.controller.adminCredentialsFile } }, 1)
  const options = { purpose: "research" as const, out: path.join(root, "evidence"), lockRoot: globalLockRoot }
  const pair = await createPair(file, options)
  const slotsFile = path.join(root, "slots.json"), journal = path.join(file.controller.stateDir, "prepare-command.json")
  const inventory = path.join(file.controller.stateDir, "processes-original.json")
  await writeLeaseReceipt(slotsFile, file)
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId: "recovery-native", identity: pair.identity,
    slotIds: ["a"], phase: "unactivated", processInventory: inventory })
  await writeLeaseReceipt(inventory, { version: 2, kind: "admin-processes", commandId: "recovery-native", journal, identity: pair.identity, connections: [] })
  const child = Bun.spawn([process.execPath, "-e", `const {acquireEnvironmentLeases,loadSlots}=await import("./src/slots");
    const {openLoginomAdmin}=await import("./src/loginom-admin");const {stageUserPreparation}=await import("./src/user-environment");
    const {prepareUserStorage}=await import("./src/parallel-pair");const file=await loadSlots(process.argv[1],1),identity=JSON.parse(process.argv[2]);
    const environment=await acquireEnvironmentLeases(file,1,identity,process.argv[3]);
    try {const admin=await openLoginomAdmin(file,identity,{serverLease:environment.server,processInventory:process.argv[4]});
      try {const lease=environment.slots[0],prepared=await stageUserPreparation(file,lease,"e".repeat(64));
        await admin.reconcileUser(lease,prepared.secretFile);await prepareUserStorage(file,lease,prepared.secretFile,environment.server);
        await Bun.write(lease.slot.profileDir+"/data/recovery-history","preserve-native-recovery");console.log(lease.receipt);
      }finally{await admin.dispose()}
    }finally{await Promise.all([environment.server.close(),...environment.slots.map(lease=>lease.close())])}`,
    slotsFile, JSON.stringify(pair.identity), journal, inventory],
    { cwd: path.resolve(import.meta.dir, ".."), env: { PATH: process.env.PATH ?? "", HOME: root, EVAL_CLI_BIN: process.env.EVAL_CLI_BIN! },
      stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
  const incident = stdout.trim()
  await Bun.$`docker exec ${pair.identity.containerId} sh -c ${'mkdir /workdir/UserStorage/eval-b; printf preserve > /workdir/UserStorage/eval-b/recovery-control'}`.quiet()
  const environment = await recoverPreparationLeases(file, pair.identity, journal)
  try {
    const command = await readLeaseReceipt(environment.journal) as { processInventory: string }
    const admin = await openLoginomAdmin(file, pair.identity, { serverLease: environment.server, processInventory: command.processInventory })
    try {
      const result = await finalizeUnactivatedEnvironment(file, environment, admin)
      expect(result.status).toBe("released")
      expect(await readLeaseReceipt(incident)).toMatchObject({ state: "released", releaseReceipt: environment.slots[0]!.receipt })
      const cleanup = await readLeaseReceipt(result.slots[0]!.cleanup.path) as { profileArchive: { archive: string }; recoveryProcessInventories: unknown[] }
      expect(await Bun.file(path.join(cleanup.profileArchive.archive, "data/recovery-history")).text()).toBe("preserve-native-recovery")
      expect(cleanup.recoveryProcessInventories).toHaveLength(1)
      expect((await Bun.$`docker exec ${pair.identity.containerId} cat /workdir/UserStorage/eval-b/recovery-control`.quiet()).text()).toBe("preserve")
      const evidence = path.join(path.dirname(source.controller.stateDir), "evidence", `native-recovery-${crypto.randomUUID()}`)
      await mkdir(evidence, { mode: 0o700 })
      await writeLeaseReceipt(path.join(evidence, "recovery.json"), { version: 2, identity: pair.identity, result, cleanup,
        command: await readLeaseReceipt(environment.journal), original: await readLeaseReceipt(journal), incident: await readLeaseReceipt(incident),
        recoverySlot: await readLeaseReceipt(environment.slots[0]!.receipt), server: await readLeaseReceipt(result.server.path), liveQualified: false })
    } finally { await admin.dispose() }
    await destroyPair(file, options)
    await rm(root, { recursive: true, force: true })
  } catch (error) {
    console.error(`recovery fixture retained: ${root}`)
    throw error
  } finally { await Promise.all([environment.server.close(), ...environment.slots.map(lease => lease.close())]) }
}, 120_000)

integration("runAttempt: native slot leftovers forbid dispatch while B files remain intact", async () => {
  const fixture = await slotAttemptFixture()
  try {
    await Bun.$`docker exec ${fixture.pair.identity.containerId} sh -c ${'mkdir /workdir/UserStorage/eval-b; printf B > /workdir/UserStorage/eval-b/control; printf A > /workdir/UserStorage/eval-a/leftover.csv'}`.quiet()
    const input = fixture.input
    const result = await runAttempt(input)
    expect(result.result).toMatchObject({ status: "harness_error", exit_code: null, harness_error: expect.stringContaining("USER_STORAGE_NOT_EMPTY") })
    expect(result.stop).toBe(true)
    expect(await Bun.file(path.join(input.runDir, input.task.id, "1/run.json")).exists()).toBe(false)
    expect((await Bun.$`docker exec ${fixture.pair.identity.containerId} cat /workdir/UserStorage/eval-a/leftover.csv`.quiet()).text()).toBe("A")
    expect((await Bun.$`docker exec ${fixture.pair.identity.containerId} cat /workdir/UserStorage/eval-b/control`.quiet()).text()).toBe("B")
    await Bun.$`docker exec ${fixture.pair.identity.containerId} rm -- /workdir/UserStorage/eval-a/leftover.csv`.quiet()
    const clean = await runAttempt({ ...input, attempt: 2 })
    expect(clean.result).toMatchObject({ status: "completed", slot_id: "a", harness_error: null })
    expect(clean.stop).toBe(false)
    expect((await Bun.$`docker exec ${fixture.pair.identity.containerId} cat /workdir/UserStorage/eval-b/control`.quiet()).text()).toBe("B")
    const foreignSource = await runAttempt({ ...input, attempt: 3, source: { ...input.source, storageDir: "/workdir/UserStorage/eval-b" } })
    expect(foreignSource.result.harness_error).toContain("SLOT_STORAGE_SOURCE_MISMATCH")
    expect(foreignSource.result.exit_code).toBeNull()
    const foreignProfile = await runAttempt({ ...input, attempt: 4, command: { ...input.command,
      env: { ...input.command.env, LOGINOM_AI_AGENT_CLI_PROFILE: fixture.file.slots[1]!.profileDir } } })
    expect(foreignProfile.result.harness_error).toContain("SLOT_CONTEXT_MISMATCH")
    expect(foreignProfile.result.exit_code).toBeNull()
    const receipt = path.join(fixture.file.controller.stateDir, "storage-a.json")
    const published = await readLeaseReceipt(receipt) as Record<string, unknown>
    await writeLeaseReceipt(receipt, { ...published, inode: Number(published.inode) + 1 })
    try {
      const drift = await runAttempt({ ...input, attempt: 5 })
      expect(drift.result.harness_error).toContain("USER_STORAGE_OWNERSHIP")
      expect(drift.result.exit_code).toBeNull()
    } finally { await writeLeaseReceipt(receipt, published) }
  } finally { await fixture.dispose() }
}, 120_000)

for (const artifact of [false, true]) {
  integration(`runAttempt: v2 preserves ${artifact ? "LGP and CSV" : "CSV without LGP"} before the server session fence`, async () => {
    const fixture = await slotAttemptFixture()
    const abort = new AbortController()
    const input = { ...fixture.input, runId: "deferred", signal: abort.signal,
      command: { ...fixture.input.command, env: { ...fixture.input.command.env, EVAL_FAKE_SLEEP_MS: "5000" } } }
    const pending = runAttempt(input)
    try {
      const trace = path.join(fixture.lease.slot.workspaceRoot, input.runId, input.task.id, String(input.attempt), "parallel-trace.json")
      const deadline = Date.now() + 15_000
      while (!await Bun.file(trace).exists() && Date.now() < deadline) await Bun.sleep(20)
      expect(await Bun.file(trace).exists()).toBe(true)
      const name = `eval-${input.runId}-${input.task.id}-${input.attempt}`
      const csv = "Region,A\nN,1\n"
      await Bun.$`docker exec ${fixture.pair.identity.containerId} sh -c ${'printf %s "$1" > "$2"'} slot-output ${csv} ${`${input.source.storageDir}/${name}.result.csv`}`.quiet()
      if (artifact) {
        await Bun.$`docker cp ${path.resolve(import.meta.dir, "../fixtures/storage/fixture-group-sum-qty.lgp")} ${`${fixture.pair.identity.containerId}:${input.source.storageDir}/${name}.lgp`}`.quiet()
        await Bun.$`docker exec ${fixture.pair.identity.containerId} chown ${`${fixture.storage.uid}:${fixture.storage.gid}`} ${`${input.source.storageDir}/${name}.lgp`}`.quiet()
      }
      const completed = await pending
      expect(completed.result.status).toBe("completed")
      expect((await Bun.$`docker exec ${fixture.pair.identity.containerId} test -f ${`${input.source.storageDir}/${name}.result.csv`}`.quiet().nothrow()).exitCode).toBe(0)
      if (artifact) expect((await Bun.$`docker exec ${fixture.pair.identity.containerId} test -f ${`${input.source.storageDir}/${name}.lgp`}`.quiet().nothrow()).exitCode).toBe(0)
      const out = path.join(input.runDir, input.task.id, String(input.attempt))
      expect(await Bun.file(path.join(out, artifact ? "artifact/results" : "storage-outputs", `${name}.result.csv`)).text()).toBe(csv)
      expect(await Bun.file(path.join(out, "storage-cleanup.json")).json()).toMatchObject({ status: "pending", removed: false, verified_absent: false, deletion_deferred: true })
      expect(await Bun.file(path.join(out, "cleanup.json")).json()).toMatchObject({ serverSessions: "unknown", storageDeletionAllowed: false, nextAdmissionAllowed: false })
      const blocked = await runAttempt({ ...input, attempt: 2 })
      expect(blocked.result.harness_error).toContain("USER_STORAGE_NOT_EMPTY")
      expect(blocked.result.exit_code).toBeNull()
      expect(await afterAttempt(input.config, input.command, completed.result, out)).toEqual({ stop: "SLOT_CLEANUP_REQUIRED" })
      expect(completed.result).toMatchObject({ status: "completed", environment_cleanup: { status: "failed" } })
      expect(await Bun.file(path.join(out, "cleanup.json")).json()).toMatchObject({ serverSessions: "unknown", storageDeletionAllowed: false, nextAdmissionAllowed: false })
    } finally {
      abort.abort()
      await pending
      await fixture.dispose()
    }
  }, 120_000)
}

async function slotAttemptFixture() {
  const fixture = await storageCodecFixture()
  const storage = await prepareUserStorage(fixture.file, fixture.lease, fixture.prepared.secretFile, fixture.server)
  const config = { ...loadConfig(["--dry-run", "--skip-judge", "--tasks", path.join(fixture.root, "tasks")], {
    EVAL_PROFILE_DIR: fixture.lease.slot.profileDir, EVAL_WORKSPACE_ROOT: fixture.lease.slot.workspaceRoot,
  }), dryRun: false, loginom: { url: fixture.file.server.url, username: fixture.lease.slot.username, password: "", container: fixture.pair.identity.containerId, storageDir: storage.root } }
  const [task] = await loadTasks(config.tasksDir, ["parallel-fast"])
  const input = { config, command: agentCommand(config), source: { kind: "docker" as const, container: fixture.pair.identity.containerId, storageDir: storage.root },
    task: task!, attempt: 1, runId: "admission", runDir: path.join(fixture.root, "results"), signal: new AbortController().signal,
    profileRecovered: false, slotId: fixture.lease.slot.id, skipJudge: true,
    slot: { file: fixture.file, lease: fixture.lease, secretFile: fixture.prepared.secretFile } }
  return { ...fixture, storage, input }
}
