import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { existsSync, readFileSync, watch } from "node:fs"
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import { main } from "../src/run"
import type { RunSummary } from "../src/report"
import type { SlotFile } from "../src/slots"

async function fixture(root: string, taskIds = ["parallel-fast", "parallel-slow"], withArtifact = false) {
  const slots: SlotFile = {
    version: 2,
    server: { container: "fixture-server", studioContainer: "fixture-studio", url: "http://127.0.0.1/app/",
      network: "fixture-network", alias: "fixture-server", storageRoot: "/workdir/UserStorage", backupRoot: "/workdir/SessionBackup" },
    controller: { stateDir: path.join(root, "controller"), adminCredentialsFile: path.join(root, "unused-admin.json") },
    judge: { codexHome: path.join(root, "judge") },
    slots: ["a", "b"].map(id => ({ id, username: `eval-${id}`, profileDir: path.join(root, `profile-${id}`),
      workspaceRoot: path.join(root, `work-${id}`), historyDir: path.join(root, `history-${id}`) })),
  }
  const lockRoot = path.join(root, "locks")
  const storage = path.join(root, "storage")
  await Promise.all([lockRoot, storage, slots.controller.stateDir, slots.judge.codexHome,
    ...slots.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir, path.join(storage, slot.id)])]
    .map(dir => mkdir(dir, { recursive: true, mode: 0o700 })))
  await Promise.all(slots.slots.map(slot => Bun.write(path.join(slot.profileDir, "data/auth.json"), '{"fake":{"type":"api","key":"fixture"}}')))
  await Promise.all(taskIds.map(async id => {
    await Bun.write(path.join(root, "tasks", id, "spec.md"), "Fixture diagnostic")
    if (withArtifact) {
      await Bun.write(path.join(root, "tasks", id, "reference.lgp"), Bun.file(path.resolve(import.meta.dir, "../fixtures/storage/fixture-group-sum-qty.lgp")))
      await Bun.write(path.join(root, "tasks", id, "parallel-package.json"), "{}")
    }
    await Bun.write(path.join(root, "tasks", id, "task.json"), JSON.stringify({ id, title: id, prompt: id,
      ...(withArtifact ? { reference: "reference.lgp", inputs: ["parallel-package.json"] } : { output_mode: "diagnostic" }),
      spec: "spec.md", expected_output: "diagnostic", checklist: [{ id: "diagnostic", text: "Returns diagnostic", weight: 1, required: true }] }))
  }))
  return { slots, lockRoot, env: { EVAL_CLI_MODE: "fake", EVAL_ARTIFACT_SOURCE: `dir:${storage}`,
    EVAL_AGENT_MODEL: "fake/fake-model", LOGINOM_DOCK_API_KEY: "fixture-dock", EVAL_RESULTS_DIR: path.join(root, "results") } }
}

test("fixture main: independent slot pipelines cross rounds and archive evidence before reuse", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-main-"))
  try {
    const input = await fixture(root)
    const run = await main(["--tasks", path.join(root, "tasks"), "--parallel", "2", "--repeat", "2", "--skip-judge"],
      input.env, { fixture: { slots: input.slots, lockRoot: input.lockRoot } })
    expect(run.code).toBe(0)
    const summary = await Bun.file(path.join(run.runDir!, "summary.json")).json() as RunSummary
    expect(summary.config.parallel).toBe(2)
    expect(summary.slots).toHaveLength(2)
    expect(summary.metrics.total).toBe(4)
    const attempts = summary.tasks.flatMap(task => task.attempts)
    expect(attempts.every(attempt => attempt.environment_cleanup?.status === "confirmed" && attempt.slot_id)).toBe(true)
    const traces = await Promise.all(attempts.map(async attempt => {
      const slot = input.slots.slots.find(slot => slot.id === attempt.slot_id)!
      return { ...attempt, ...await Bun.file(path.join(slot.workspaceRoot, summary.run_id, attempt.task_id, String(attempt.attempt), "parallel-trace.json")).json() }
    }))
    expect(traces.find(item => item.task_id === "parallel-fast" && item.attempt === 2)!.startedAt)
      .toBeLessThan(traces.find(item => item.task_id === "parallel-slow" && item.attempt === 1)!.finishedAt)
    expect(new Set(traces.map(item => item.pid)).size).toBe(4)
    for (const slot of input.slots.slots) {
      expect(await Bun.file(path.join(slot.profileDir, "data/auth.json")).text()).toContain('"fixture"')
      expect(await Bun.file(path.join(slot.profileDir, "data/loginom-ai-agent.db")).exists()).toBe(false)
      const archives = await readdir(slot.historyDir)
      expect(archives.length).toBeGreaterThan(1)
      const cleanup = await Bun.file(summary.slots!.find(row => row.id === slot.id)!.cleanup_receipt!).json()
      expect(cleanup).toMatchObject({ status: "confirmed", liveQualified: false, archive: "committed" })
    }
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("fixture main: removes only its artifacts after the profile archive is durably committed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-storage-order-"))
  try {
    const input = await fixture(root, ["parallel-fast"], true)
    const storage = path.join(root, "storage/a")
    await Bun.write(path.join(storage, "foreign.lgp"), "foreign evidence")
    const deletions: boolean[] = []
    const watcher = watch(storage, (_event, name) => {
      if (!name?.startsWith("eval-") || existsSync(path.join(storage, name))) return
      deletions.push(Array.from(new Bun.Glob("**/*.archive.json").scanSync(input.slots.controller.stateDir)).some(file => {
        const manifest = JSON.parse(readFileSync(path.join(input.slots.controller.stateDir, file), "utf8"))
        return manifest.status === "committed" && manifest.roots.some((row: { name: string }) => row.name === "data/loginom-ai-agent.db")
      }))
    })
    try {
      const run = await main(["--tasks", path.join(root, "tasks"), "--skip-judge"], input.env,
        { fixture: { slots: input.slots, lockRoot: input.lockRoot } })
      expect(run.code).toBe(0)
      expect(await readdir(storage)).toEqual(["foreign.lgp"])
      expect(deletions).toEqual([true])
      expect(await Bun.file(path.join(storage, "foreign.lgp")).text()).toBe("foreign evidence")
      const summary = await Bun.file(path.join(run.runDir!, "summary.json")).json() as RunSummary
      expect(summary.tasks[0]!.attempts[0]).toMatchObject({ status: "completed", environment_cleanup: { status: "confirmed" } })
    } finally { watcher.close() }
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("fixture main: a changed artifact retains its fence and invalidates the earlier cleanup receipt", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-storage-changed-"))
  try {
    const input = await fixture(root, ["parallel-fast"], true)
    const traceFile = path.join(root, "judge-trace.jsonl")
    const pending = main(["--tasks", path.join(root, "tasks")], { ...input.env,
      EVAL_JUDGE_COMMAND: `${process.execPath} ${path.resolve(import.meta.dir, "../fixtures/fake-codex.ts")} --gate-log ${traceFile} --delay-ms 1000`,
      JUDGE_MODEL: "gpt-6-sol" }, { fixture: { slots: input.slots, lockRoot: input.lockRoot } })
    const deadline = Date.now() + 10_000
    while (!await Bun.file(traceFile).exists()) {
      if (Date.now() > deadline) throw Error("Judge start not observed")
      await Bun.sleep(10)
    }
    const storage = path.join(root, "storage/a")
    const file = (await readdir(storage)).find(name => name.startsWith("eval-"))!
    await Bun.write(path.join(storage, file), "changed evidence")
    const run = await pending
    expect(run.code).toBe(1)
    const summary = await Bun.file(path.join(run.runDir!, "summary.json")).json() as RunSummary
    expect(summary.tasks[0]!.attempts[0]).toMatchObject({ status: "completed", judge_status: "scored", environment_cleanup: { status: "failed" } })
    expect(await Bun.file(path.join(storage, file)).text()).toBe("changed evidence")
    const cleanup = await Bun.file(summary.slots![0]!.cleanup_receipt!).json()
    expect(cleanup.nextAdmissionAllowed).toBe(false)
    expect(cleanup.storageDeletionAllowed).toBe(false)
    expect((await Bun.file(summary.slots![0]!.lease_receipt!).json()).state).toBe("retained")
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("fixture main: overlapping agents share one judge gate through actual fake-codex processes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-judge-main-"))
  try {
    const input = await fixture(root, ["parallel-fast", "parallel-slow"], true)
    const traceFile = path.join(root, "judge-trace.jsonl")
    const run = await main(["--tasks", path.join(root, "tasks"), "--parallel", "2"], { ...input.env,
      EVAL_JUDGE_COMMAND: `${process.execPath} ${path.resolve(import.meta.dir, "../fixtures/fake-codex.ts")} --gate-log ${traceFile} --delay-ms 5000`,
      JUDGE_MODEL: "gpt-6-sol", JUDGE_REASONING: "xhigh" }, { fixture: { slots: input.slots, lockRoot: input.lockRoot } })
    expect(run.code).toBe(0)
    const summary = await Bun.file(path.join(run.runDir!, "summary.json")).json() as RunSummary
    expect(summary.metrics.scored_count).toBe(2)
    const judges = (await Bun.file(traceFile).text()).trim().split("\n").map(line => JSON.parse(line)) as
      { kind: string; pid: number; at: string; codexHome: string }[]
    expect(judges.map(item => item.kind)).toEqual(["start", "end", "start", "end"])
    expect(Number(judges[2]!.at)).toBeGreaterThanOrEqual(Number(judges[1]!.at))
    expect(judges[0]!.pid).not.toBe(judges[2]!.pid)
    expect(judges.every(item => item.codexHome === input.slots.judge.codexHome)).toBe(true)
    const agents = await Promise.all(summary.tasks.map(async task => {
      const attempt = task.attempts[0]!
      const slot = input.slots.slots.find(slot => slot.id === attempt.slot_id)!
      expect(attempt).toMatchObject({ status: "completed", judge_status: "scored", environment_cleanup: { status: "confirmed" } })
      expect(attempt.package_path).toStartWith(`/${slot.username}/eval-`)
      return await Bun.file(path.join(slot.workspaceRoot, summary.run_id, task.id, "1/parallel-trace.json")).json() as { startedAt: number; finishedAt: number }
    }))
    expect(agents[0]!.startedAt).toBeLessThan(agents[1]!.finishedAt)
    expect(agents[1]!.startedAt).toBeLessThan(agents[0]!.finishedAt)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)



test("fixture main: overlapping writable results are rejected before any admission or dispatch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-overlap-"))
  try {
    const input = await fixture(root)
    await expect(main(["--dry-run", "--tasks", path.join(root, "tasks"), "--parallel", "2"],
      { ...input.env, EVAL_RESULTS_DIR: input.slots.slots[0]!.profileDir },
      { fixture: { slots: input.slots, lockRoot: input.lockRoot } })).rejects.toThrow("FIXTURE_ROOT_OVERLAP")
    expect(await readdir(input.slots.slots[0]!.profileDir)).toEqual(["data"])
    expect(await readdir(input.slots.controller.stateDir)).toEqual([])
    expect(await readdir(input.lockRoot)).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("fixture main: dry-run builds the round-major plan without processes, leases or profile mutations", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-plan-"))
  try {
    const input = await fixture(root)
    const run = await main(["--dry-run", "--tasks", path.join(root, "tasks"), "--parallel", "2", "--repeat", "2"],
      input.env, { fixture: { slots: input.slots, lockRoot: input.lockRoot } })
    const planned = await Bun.file(path.join(run.runDir!, "fixture-plan.json")).json()
    expect(planned).toEqual({ liveQualified: false, ready: false, jobs: [
      { index: 0, taskId: "parallel-fast", attempt: 1 }, { index: 1, taskId: "parallel-slow", attempt: 1 },
      { index: 2, taskId: "parallel-fast", attempt: 2 }, { index: 3, taskId: "parallel-slow", attempt: 2 },
    ] })
    expect(await readdir(input.lockRoot)).toEqual([])
    expect(await readdir(input.slots.controller.stateDir)).toEqual([])
    for (const slot of input.slots.slots) {
      expect(await readdir(slot.workspaceRoot)).toEqual([])
      expect(await readdir(slot.historyDir)).toEqual([])
      expect(await readdir(slot.profileDir)).toEqual(["data"])
    }
    const summary = await Bun.file(path.join(run.runDir!, "summary.json")).json() as RunSummary
    expect(summary.metrics.total).toBe(0)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("fixture main: a finished controller releases its SIGINT handler", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-signal-release-"))
  try {
    const input = await fixture(root)
    const before = process.listenerCount("SIGINT")
    await main(["--dry-run", "--tasks", path.join(root, "tasks")], input.env,
      { fixture: { slots: input.slots, lockRoot: input.lockRoot } })
    expect(process.listenerCount("SIGINT")).toBe(before)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("fixture main: failed profile admission also releases its SIGINT handler", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-signal-failure-"))
  try {
    const input = await fixture(root)
    await rm(path.join(input.slots.slots[0]!.profileDir, "data/auth.json"))
    const before = process.listenerCount("SIGINT")
    await expect(main(["--tasks", path.join(root, "tasks"), "--skip-judge"], input.env,
      { fixture: { slots: input.slots, lockRoot: input.lockRoot } })).rejects.toThrow("Нет авторизации")
    expect(process.listenerCount("SIGINT")).toBe(before)
    expect(await readdir(input.slots.slots[0]!.workspaceRoot)).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("fixture main: a competing controller cannot overwrite the admitted controller journal", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-journal-"))
  const input = await fixture(root, ["parallel-slow"])
  const argv = ["--tasks", path.join(root, "tasks"), "--parallel", "2", "--skip-judge"]
  const options = { fixture: { slots: input.slots, lockRoot: input.lockRoot } }
  const pending = main(argv, input.env, options)
  try {
    const deadline = Date.now() + 10_000
    while (!await Bun.file(path.join(input.slots.slots[0]!.profileDir, "data/loginom-ai-agent.db")).exists()) {
      if (Date.now() > deadline) throw Error("Fixture dispatch not observed")
      await Bun.sleep(10)
    }
    const journals = await Array.fromAsync(new Bun.Glob("**/run-journal.json").scan({ cwd: input.slots.controller.stateDir, absolute: true }))
    expect(journals).toHaveLength(1)
    const admitted = await Bun.file(journals[0]!).text()
    await expect(main(argv, input.env, options)).rejects.toThrow("BUSY")
    expect(await Bun.file(journals[0]!).text()).toBe(admitted)
    const run = await pending
    expect(run.code).toBe(0)
    const summary = await Bun.file(path.join(run.runDir!, "summary.json")).json() as RunSummary
    expect(summary.tasks[0]!.attempts).toHaveLength(1)
  } finally { await pending; await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("fixture main: consecutive interrupted parallel runs drain both slots and retain interruption metadata", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-interruption-"))
  const input = await fixture(root, ["parallel-slow"])
  const payload = path.join(root, "input.json")
  await Bun.write(payload, JSON.stringify({ ...input, root }))
  const script = path.join(root, "controller.ts")
  await Bun.write(script, `import { main } from ${JSON.stringify(path.resolve(import.meta.dir, "../src/run.ts"))}
const input = await Bun.file(process.argv[2]).json()
for (const round of [1, 2]) {
  const run = await main(["--tasks", input.root + "/tasks", "--parallel", "2", "--repeat", "3", "--skip-judge"],
    input.env, { fixture: { slots: input.slots, lockRoot: input.lockRoot } })
  await Bun.write(input.root + "/done-" + round + ".json", JSON.stringify(run))
}
process.exit(0)
`)
  const child = Bun.spawn([process.execPath, script, payload], { stdout: "pipe", stderr: "pipe" })
  const stdout = new Response(child.stdout).text()
  const stderr = new Response(child.stderr).text()
  const exited = child.exited
  const wait = async (check: () => Promise<boolean>) => {
    const deadline = Date.now() + 15_000
    while (!await check()) {
      if (Date.now() > deadline) throw Error("Fixture progress not observed")
      await Bun.sleep(10)
    }
  }
  try {
    for (const round of [1, 2]) {
      await wait(async () => (await Promise.all(input.slots.slots.map(slot => Bun.file(path.join(slot.profileDir, "data/loginom-ai-agent.db")).exists()))).every(Boolean))
      if (round === 1) {
        const state = path.join(input.slots.controller.stateDir, "fixture-a.json")
        await Bun.write(state, JSON.stringify({ ...await Bun.file(state).json(), recoveries: ["fixture-recovery"] }))
      }
      child.kill("SIGINT")
      await wait(() => Bun.file(path.join(root, `done-${round}.json`)).exists())
      const run = await Bun.file(path.join(root, `done-${round}.json`)).json()
      expect(run.code).toBe(0)
      const summary = await Bun.file(path.join(run.runDir, "summary.json")).json() as RunSummary
      expect(summary.interrupted).toBe(true)
      expect(summary.interrupted_cleanup).toEqual({ recovered: round === 1 })
      expect(summary.tasks[0]!.attempts).toHaveLength(2)
      expect(summary.tasks[0]!.attempts.every(result => result.status === "interrupted" && result.environment_cleanup?.status === "confirmed")).toBe(true)
      expect(summary.slots?.map(slot => slot.state)).toEqual(["closed", "closed"])
    }
    expect(await exited).toBe(0)
    await Promise.all([stdout, stderr])
  } finally {
    if (child.exitCode === null) { child.kill("SIGINT"); await exited }
    await Promise.all([stdout, stderr])
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)

test("fixture main: binary/source modes and ordinary CLI cannot acquire synthetic admission", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-mode-"))
  try {
    const input = await fixture(root)
    for (const mode of ["binary", "source"]) await expect(main(["--dry-run", "--parallel", "2"],
      { ...input.env, EVAL_CLI_MODE: mode, EVAL_CLI_BIN: "/usr/bin/false" },
      { fixture: { slots: input.slots, lockRoot: input.lockRoot } })).rejects.toThrow("FIXTURE_MODE")
    await Bun.write(path.join(root, "slots.json"), JSON.stringify({ ...input.slots, fixture: true }))
    await expect(main(["--dry-run", "--parallel", "2"], { ...input.env, EVAL_SLOTS_FILE: path.join(root, "slots.json") }))
      .rejects.toThrow("SLOTS_ADMISSION_UNAVAILABLE")
    await expect(main(["--dry-run", "--parallel", "2", "--fixture"], input.env)).rejects.toThrow()
    expect(await readdir(input.lockRoot)).toEqual([])
    expect(await readdir(input.slots.controller.stateDir)).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("fixture main: a shared profile is rejected across all configured slots before reads or writes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-shared-"))
  try {
    const input = await fixture(root)
    input.slots.slots[1]!.profileDir = input.slots.slots[0]!.profileDir
    await expect(main(["--dry-run"], input.env, { fixture: { slots: input.slots, lockRoot: input.lockRoot } }))
      .rejects.toThrow("SLOT_PATH_OVERLAP")
    expect(await readdir(input.slots.slots[0]!.profileDir)).toEqual(["data"])
    expect(await readdir(input.slots.controller.stateDir)).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("fixture main: one infra retry keeps the same slot and archives the initial attempt", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-retry-"))
  try {
    const input = await fixture(root, ["parallel-infra-retry", "parallel-slow"])
    const run = await main(["--tasks", path.join(root, "tasks"), "--parallel", "2", "--skip-judge"],
      input.env, { fixture: { slots: input.slots, lockRoot: input.lockRoot } })
    expect(run.code).toBe(0)
    const summary = await Bun.file(path.join(run.runDir!, "summary.json")).json() as RunSummary
    const result = summary.tasks.find(task => task.id === "parallel-infra-retry")!.attempts[0]!
    expect(result).toMatchObject({ status: "completed", slot_id: "a", infra_retry: {
      initial: { status: "infra_error", slot_id: "a", environment_cleanup: { status: "confirmed" } },
    } })
    expect(summary.metrics.infra_error_count).toBe(1)
    expect(summary.interrupted_cleanup).toBeNull()
    expect(summary.metrics.total).toBe(2)
    const initial = await Bun.file(path.join(run.runDir!, result.task_id, "1", "infra-error/result.json")).json()
    expect(initial).toEqual(result.infra_retry!.initial)
    const slot = input.slots.slots[0]!
    const history = await Promise.all((await readdir(slot.historyDir)).map(async archive => {
      const file = Bun.file(path.join(slot.historyDir, archive, "data/loginom-ai-agent.db"))
      return await file.exists() ? await file.json() as { launch: number; profile: string } : undefined
    }))
    expect(history.filter(row => row !== undefined).map(row => row.launch).sort()).toEqual([1, 2])
    expect(history.filter(row => row !== undefined).every(row => row.profile === slot.profileDir)).toBe(true)
    expect(await Bun.file(path.join(slot.profileDir, "data/loginom-ai-agent.db")).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("fixture main: cleanup failure quarantines one slot while the healthy slot drains and releases", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-quarantine-"))
  try {
    const input = await fixture(root, ["parallel-cleanup-failure", "parallel-fast", "parallel-fast-next", "parallel-fast-last"])
    const run = await main(["--tasks", path.join(root, "tasks"), "--parallel", "2", "--skip-judge"],
      input.env, { fixture: { slots: input.slots, lockRoot: input.lockRoot } })
    expect(run.code).toBe(1)
    const summary = await Bun.file(path.join(run.runDir!, "summary.json")).json() as RunSummary
    const failed = summary.tasks.find(task => task.id === "parallel-cleanup-failure")!.attempts[0]!
    expect(failed).toMatchObject({ slot_id: "a", status: "completed", environment_cleanup: { status: "failed" } })
    expect(summary.tasks.filter(task => task.id !== failed.task_id).flatMap(task => task.attempts))
      .toMatchObject([0, 1, 2].map(() => ({ slot_id: "b", status: "completed", environment_cleanup: { status: "confirmed" } })))
    expect(summary.metrics.total).toBe(4)
    expect(summary.metrics.environment_cleanup_error_count).toBe(1)
    const leases = await Promise.all(summary.slots!.map(slot => Bun.file(slot.lease_receipt!).json()))
    expect(leases.find(lease => lease.slot.id === "a").state).toBe("retained")
    expect(leases.find(lease => lease.slot.id === "b").state).toBe("released")
    expect(await Bun.file(path.join(input.slots.slots[0]!.profileDir, ".writer/owner")).exists()).toBe(true)
    expect(await Bun.file(path.join(run.runDir!, failed.task_id, "1/result.json")).json()).toEqual(failed)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("fixture main: a common archive writer failure stops new assignments and drains the active slot", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-writer-"))
  try {
    const input = await fixture(root, ["parallel-infra-retry", "parallel-slow", "parallel-z-next"])
    const pending = main(["--tasks", path.join(root, "tasks"), "--parallel", "2", "--skip-judge"],
      input.env, { fixture: { slots: input.slots, lockRoot: input.lockRoot } })
    const deadline = Date.now() + 10_000
    const collision = await (async () => {
      while (Date.now() < deadline) {
        const prompts = await Array.fromAsync(new Bun.Glob("results/*/parallel-infra-retry/1/prompt.txt").scan({ cwd: root, absolute: true }))
        if (prompts[0]) return path.join(path.dirname(prompts[0]), "infra-error")
        await Bun.sleep(10)
      }
      throw Error("Fixture dispatch not observed")
    })()
    await Bun.write(collision, "writer collision")
    const run = await pending
    expect(run.code).toBe(1)
    const summary = await Bun.file(path.join(run.runDir!, "summary.json")).json() as RunSummary
    expect(summary.stopped_reason).toContain("EEXIST")
    const result = summary.tasks.find(task => task.id === "parallel-infra-retry")!.attempts[0]!
    expect(result).toMatchObject({ status: "infra_error", environment_cleanup: { status: "failed" } })
    expect(result.infra_retry).toBeUndefined()
    expect(summary.tasks.find(task => task.id === "parallel-z-next")!.attempts).toEqual([])
    const slow = summary.tasks.find(task => task.id === "parallel-slow")!.attempts[0]!
    expect(slow).toMatchObject({ status: "completed", slot_id: "b", environment_cleanup: { status: "confirmed" } })
    const trace = await Bun.file(path.join(input.slots.slots[1]!.workspaceRoot, summary.run_id, slow.task_id, "1/parallel-trace.json")).json()
    expect(Date.parse(summary.finished_at)).toBeGreaterThanOrEqual(trace.finishedAt)
    expect(await Bun.file(collision).text()).toBe("writer collision")
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("fixture main: quarantine of all slots leaves the remaining jobs unmeasured", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-all-quarantined-"))
  try {
    const input = await fixture(root, ["parallel-cleanup-failure"])
    const run = await main(["--tasks", path.join(root, "tasks"), "--parallel", "2", "--repeat", "3", "--skip-judge"],
      input.env, { fixture: { slots: input.slots, lockRoot: input.lockRoot } })
    expect(run.code).toBe(1)
    const summary = await Bun.file(path.join(run.runDir!, "summary.json")).json() as RunSummary
    expect(summary.tasks[0]!.attempts.map(result => result.slot_id)).toEqual(["a", "b"])
    expect(summary.metrics.total).toBe(2)
    expect(summary.metrics.environment_cleanup_error_count).toBe(2)
    expect(await Bun.file(path.join(run.runDir!, "parallel-cleanup-failure/3/prompt.txt")).exists()).toBe(false)
    const leases = await Promise.all(summary.slots!.map(slot => Bun.file(slot.lease_receipt!).json()))
    expect(leases.map(lease => lease.state)).toEqual(["retained", "retained"])
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("fixture main: clean stop releases the stopped slot and lets the other slot finish", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-clean-stop-"))
  try {
    const input = await fixture(root, ["parallel-a-stop", "parallel-fast", "parallel-fast-next"])
    const run = await main(["--tasks", path.join(root, "tasks"), "--parallel", "2", "--skip-judge"],
      input.env, { fixture: { slots: input.slots, lockRoot: input.lockRoot } })
    expect(run.code).toBe(1)
    const summary = await Bun.file(path.join(run.runDir!, "summary.json")).json() as RunSummary
    expect(summary.tasks[0]!.attempts[0]).toMatchObject({ slot_id: "a", status: "harness_error", environment_cleanup: { status: "confirmed" } })
    expect(summary.tasks.slice(1).flatMap(task => task.attempts).map(result => result.slot_id)).toEqual(["b", "b"])
    expect(summary.slots?.map(slot => slot.state)).toEqual(["closed", "closed"])
    const leases = await Promise.all(summary.slots!.map(slot => Bun.file(slot.lease_receipt!).json()))
    expect(leases.map(lease => lease.state)).toEqual(["released", "released"])
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)
