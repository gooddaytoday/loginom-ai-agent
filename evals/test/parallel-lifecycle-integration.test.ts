import { expect, test } from "bun:test"
import path from "node:path"
import { prepareUserStorage } from "../src/parallel-pair"
import { loadConfig } from "../src/config"
import { agentCommand } from "../src/cli"
import { loadTasks } from "../src/task"
import { afterAttempt, runAttempt } from "../src/run"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { storageCodecFixture } from "./helpers/storage-codec-fixture"

const integration = process.env.EVAL_PAIR_INTEGRATION === "1" ? test : test.skip

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
