import { expect, test } from "bun:test"
import { chmod, link, lstat, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { loadJudgeEnvironment } from "../src/slots"
import { acquireJudgeLease, readResourceReservation, writeLeaseReceipt } from "../src/lease"
import { evalsRoot, loadConfig, type EvalConfig } from "../src/config"
import { runOfflineJudge } from "../src/judge-environment"
import { main } from "../src/run"
import { superviseProcess } from "../src/process-supervisor"
import { parallelFixture } from "./helpers/parallel-fixture"
import { pendingJudgeFixture } from "./helpers/pending-judge"

test("offline pending judge finishes one saved generation without summary and repeats as a no-op", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-pending-"))
  try {
    const test = await pendingJudgeFixture(root)
    const config = { ...test.config, judge: { ...test.config.judge, env: { FAKE_CODEX_VERDICT: "fail" } } }
    const sibling = path.join(test.runDir, "already-scored/1/result.json")
    await mkdir(path.dirname(sibling), { recursive: true })
    await writeLeaseReceipt(sibling, { ...test.original.result, task_id: "already-scored", judge_status: "scored", judge_attempts: 1, score: 0, pass: false })
    const siblingBefore = await Bun.file(sibling).text()
    expect(await runOfflineJudge(config, test.fixture.lockRoot, test.resultFile)).toMatchObject({ code: 0, runDir: test.runDir, judgeCleanupConfirmed: true })
    const saved = await Bun.file(test.resultFile).json()
    expect(saved).toMatchObject({ judge_status: "scored", judge_attempts: 1, score: 0, pass: false, evaluation_contract_hash: test.hash,
      session_id: test.original.result.session_id, package_path: test.original.result.package_path, tokens: test.original.result.tokens })
    expect(await Bun.file(path.join(test.runDir, "summary.json")).exists()).toBe(false)
    const rows = (await Bun.file(test.trace).text()).trim().split("\n").map(line => JSON.parse(line))
    expect(rows.filter(row => row.kind === "start")).toHaveLength(1)
    expect(rows.every(row => row.codexHome === test.fixture.slots.judge.codexHome)).toBe(true)
    const reservation = await readResourceReservation({ key: `judge:${test.fixture.slots.judge.codexHome}`, lockRoot: test.fixture.lockRoot })
    expect(reservation?.state).toBe("released")
    const before = await Bun.file(test.resultFile).text()
    await rm(test.probe)
    expect(await runOfflineJudge(config, test.fixture.lockRoot, test.resultFile)).toMatchObject({ code: 0, judgeCleanupConfirmed: true })
    expect(await Bun.file(test.resultFile).text()).toBe(before)
    expect(await Bun.file(test.probe).exists()).toBe(false)
    expect(await readResourceReservation({ key: `judge:${test.fixture.slots.judge.codexHome}`, lockRoot: test.fixture.lockRoot })).toEqual(reservation)
    expect(await Bun.file(sibling).text()).toBe(siblingBefore)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("offline pending judge preserves an unconfirmed previous invocation without calling another judge", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-pending-unknown-outcome-"))
  try {
    const test = await pendingJudgeFixture(root)
    await writeLeaseReceipt(test.resultFile, { ...await Bun.file(test.resultFile).json(), judge_attempts: 1 })
    const verdict = path.join(path.dirname(test.resultFile), "judge/verdict.json")
    await Bun.write(verdict, '{"unconfirmed":"old judge output"}')
    const before = await Bun.file(test.resultFile).text()
    await expect(runOfflineJudge(test.config, test.fixture.lockRoot, test.resultFile)).rejects.toThrow("PENDING_JUDGE_OUTCOME_UNCONFIRMED")
    expect(await Bun.file(test.resultFile).text()).toBe(before)
    expect(await Bun.file(verdict).text()).toBe('{"unconfirmed":"old judge output"}')
    expect(await Bun.file(test.trace).exists()).toBe(false)
    expect(await readResourceReservation({ key: `judge:${test.fixture.slots.judge.codexHome}`, lockRoot: test.fixture.lockRoot })).toBeUndefined()
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("offline pending judge rejects changed threshold, timeout and model pins before acquiring its home", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-pending-changed-threshold-"))
  try {
    const test = await pendingJudgeFixture(root)
    const before = await Bun.file(test.resultFile).text()
    await rm(test.probe)
    for (const config of [{ ...test.config, passThreshold: test.config.passThreshold + 1 },
      { ...test.config, judgeTimeoutMs: test.config.judgeTimeoutMs + 1 },
      { ...test.config, judge: { ...test.config.judge, model: "another-model" } },
      { ...test.config, judge: { ...test.config.judge, reasoning: "another-reasoning" } }])
      await expect(runOfflineJudge(config, test.fixture.lockRoot, test.resultFile)).rejects.toThrow("PENDING_JUDGE_PINS_CHANGED")
    expect(await Bun.file(test.resultFile).text()).toBe(before)
    expect(await Bun.file(test.trace).exists()).toBe(false)
    expect(await Bun.file(test.probe).exists()).toBe(false)
    expect(await readResourceReservation({ key: `judge:${test.fixture.slots.judge.codexHome}`, lockRoot: test.fixture.lockRoot })).toBeUndefined()
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("offline pending judge rejects a changed saved corpus without touching the generation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-pending-changed-corpus-"))
  try {
    const test = await pendingJudgeFixture(root)
    const before = await Bun.file(test.resultFile).text()
    const file = path.join(root, "tasks/group-sum-qty/task.json")
    const task = await Bun.file(file).json()
    task.checklist[0].weight = 2
    await Bun.write(file, JSON.stringify(task))
    await expect(runOfflineJudge(test.config, test.fixture.lockRoot, test.resultFile)).rejects.toThrow("PENDING_JUDGE_PINS_CHANGED")
    expect(await Bun.file(test.resultFile).text()).toBe(before)
    expect(await Bun.file(test.trace).exists()).toBe(false)
    expect(await readResourceReservation({ key: `judge:${test.fixture.slots.judge.codexHome}`, lockRoot: test.fixture.lockRoot })).toBeUndefined()
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("offline pending judge respects busy and quarantined homes without invoking the judge", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-pending-held-home-"))
  const test = await pendingJudgeFixture(root)
  const journal = path.join(root, "holder.json")
  await writeLeaseReceipt(journal, { commandId: "holder" })
  const holder = await acquireJudgeLease({ codexHome: test.fixture.slots.judge.codexHome, journal, commandId: "holder", lockRoot: test.fixture.lockRoot })
  try {
    const before = await Bun.file(test.resultFile).text()
    await rm(test.probe)
    await expect(runOfflineJudge(test.config, test.fixture.lockRoot, test.resultFile)).rejects.toThrow("BUSY")
    await holder.close()
    await expect(runOfflineJudge(test.config, test.fixture.lockRoot, test.resultFile)).rejects.toThrow("RECOVERY_REQUIRED")
    expect(await Bun.file(test.resultFile).text()).toBe(before)
    expect(await Bun.file(test.trace).exists()).toBe(false)
    expect(await Bun.file(test.probe).exists()).toBe(false)
  } finally { await holder.close(); await rm(root, { recursive: true, force: true }) }
})

test("offline pending judge uses the saved invoke budget and refuses an exhausted attempt", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-pending-budget-"))
  try {
    for (const used of [1, 2]) {
      const directory = path.join(root, String(used))
      await mkdir(directory)
      const test = await pendingJudgeFixture(directory)
      await writeLeaseReceipt(test.resultFile, { ...await Bun.file(test.resultFile).json(), judge_status: "error", judge_attempts: used, judge_summary: "previous confirmed failure" })
      const before = await Bun.file(test.resultFile).text()
      if (used === 1) {
        expect(await runOfflineJudge(test.config, test.fixture.lockRoot, test.resultFile)).toMatchObject({ code: 0, judgeCleanupConfirmed: true })
        expect(await Bun.file(test.resultFile).json()).toMatchObject({ judge_status: "scored", judge_attempts: 2, score: 100, session_id: test.original.result.session_id })
        expect((await Bun.file(test.trace).text()).trim().split("\n").map(line => JSON.parse(line)).filter(row => row.kind === "start")).toHaveLength(1)
        continue
      }
      await expect(runOfflineJudge(test.config, test.fixture.lockRoot, test.resultFile)).rejects.toThrow("budget exhausted")
      expect(await Bun.file(test.resultFile).text()).toBe(before)
      expect(await Bun.file(test.trace).exists()).toBe(false)
      expect(await readResourceReservation({ key: `judge:${test.fixture.slots.judge.codexHome}`, lockRoot: test.fixture.lockRoot })).toBeUndefined()
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("offline pending judge revokes previous cleanup confirmation when its new process proof is unconfirmed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-pending-unknown-cleanup-"))
  try {
    const fixture = await pendingJudgeFixture(root)
    await writeLeaseReceipt(fixture.resultFile, { ...fixture.original.result, environment_cleanup: { status: "confirmed", evidence: "cleanup.json", error: null } })
    await mkdir(path.join(path.dirname(fixture.resultFile), "judge-processes-1/process-cleanup.json"), { recursive: true })
    expect(await runOfflineJudge(fixture.config, fixture.fixture.lockRoot, fixture.resultFile)).toMatchObject({ code: 1, judgeCleanupConfirmed: false })
    const saved = await Bun.file(fixture.resultFile).json()
    expect(saved).toMatchObject({ status: "completed", judge_status: "error", judge_attempts: 1, judge_cleanup_unconfirmed: true,
      session_id: fixture.original.result.session_id, environment_cleanup: { status: "failed" } })
    expect((await readResourceReservation({ key: `judge:${fixture.fixture.slots.judge.codexHome}`, lockRoot: fixture.fixture.lockRoot }))?.state).toBe("retained")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("offline missing run leaves its judge home available to the next command", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-missing-run-"))
  try {
    const fixture = await parallelFixture(root)
    const file = path.join(root, "slots.json"), probe = path.join(root, "version.json")
    await writeLeaseReceipt(file, fixture.slots)
    const env = { EVAL_SLOTS_FILE: file, EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake",
      EVAL_JUDGE_COMMAND: `bun ${path.join(evalsRoot, "fixtures/fake-codex.ts")} --version-home-file ${probe}` }
    await expect(runOfflineJudge(loadConfig(["--judge-only", "missing-run"], env), fixture.lockRoot)).rejects.toMatchObject({
      exitCode: 2, message: `Нет прогона missing-run: ${env.EVAL_RESULTS_DIR}/missing-run/summary.json не найден`,
    })
    expect(await Bun.file(probe).exists()).toBe(false)
    expect(await readResourceReservation({ key: `judge:${fixture.slots.judge.codexHome}`, lockRoot: fixture.lockRoot })).toBeUndefined()
    expect(await runOfflineJudge(loadConfig(["--calibrate", "--only", "group-sum-qty"], env), fixture.lockRoot))
      .toMatchObject({ code: 0, judgeCleanupConfirmed: true })
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("offline calibration releases its home after SIGINT only with confirmed judge cleanup", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-sigint-"))
  let cleanupConfirmed = true
  try {
    const fixture = await parallelFixture(root)
    const file = path.join(root, "slots.json")
    const trace = path.join(root, "judge.jsonl")
    const resultFile = path.join(root, "result.json")
    const script = path.join(root, "interrupt.ts")
    const env = { EVAL_SLOTS_FILE: file, EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake",
      EVAL_JUDGE_COMMAND: `bun ${path.join(evalsRoot, "fixtures/fake-codex.ts")} --gate-log ${trace} --delay-ms 1500` }
    await writeLeaseReceipt(file, fixture.slots)
    await mkdir(path.join(root, "supervision"))
    await Bun.write(script, `import { runOfflineJudge } from ${JSON.stringify(path.join(evalsRoot, "src/judge-environment.ts"))}
import { loadConfig } from ${JSON.stringify(path.join(evalsRoot, "src/config.ts"))}
const pending = runOfflineJudge(loadConfig(["--calibrate","--only","group-sum-qty"],${JSON.stringify(env)}),${JSON.stringify(fixture.lockRoot)})
const deadline = Date.now() + 10000
while (!await Bun.file(${JSON.stringify(trace)}).exists() && Date.now() < deadline) await Bun.sleep(10)
if (!await Bun.file(${JSON.stringify(trace)}).exists()) throw Error("Judge did not start")
process.kill(process.pid,"SIGINT")
await Bun.write(${JSON.stringify(resultFile)},JSON.stringify(await pending))
`)
    cleanupConfirmed = false
    const run = await superviseProcess({ cmd: [process.execPath, script], cwd: root,
      env: { PATH: process.env.PATH!, HOME: root }, timeoutMs: 20_000, outDir: path.join(root, "supervision") })
    cleanupConfirmed = run.processCleanup.status === "confirmed" && run.processCleanup.capture_complete
    expect(run.processCleanup.status).toBe("confirmed")
    expect(run.exitCode).toBe(0)
    const result = await Bun.file(resultFile).json()
    expect(result).toMatchObject({ code: 1, judgeCleanupConfirmed: true })
    const saved = await Bun.file(path.join(result.runDir, "calibration.json")).json()
    expect(saved.interrupted).toBe(true)
    expect(saved.rows).toHaveLength(1)
    const reservations = await Array.fromAsync(new Bun.Glob("*.reservation.json").scan({ cwd: fixture.lockRoot, absolute: true }))
    const first = await Bun.file(reservations[0]!).json()
    expect(first.state).toBe("released")
    expect((await Bun.file(first.journal).json()).state).toBe("released")
    const proof = await Bun.file(first.releaseEvidence.path).json()
    expect(proof).toMatchObject({ status: "confirmed", key: first.key, token: first.token, revision: first.revision })
    const calls = (await Bun.file(trace).text()).trim().split("\n").map(line => JSON.parse(line))
    expect(calls.filter(call => call.kind === "start")).toHaveLength(1)
    cleanupConfirmed = false
    const next = await runOfflineJudge(loadConfig(["--calibrate", "--only", "group-sum-qty"], env), fixture.lockRoot)
    cleanupConfirmed = next.judgeCleanupConfirmed
    expect(next).toMatchObject({ code: 0, judgeCleanupConfirmed: true })
    const second = await Bun.file(reservations[0]!).json()
    expect(second.state).toBe("released")
    expect(second.token).not.toBe(first.token)
    expect(second.revision).toBe(first.revision + 1)
  } finally { if (cleanupConfirmed) await rm(root, { recursive: true, force: true }) }
}, 45_000)

test("offline proof persistence exception quarantines the journal and preserves completed output", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-proof-error-"))
  const fixture = await parallelFixture(root)
  const file = path.join(root, "slots.json")
  const trace = path.join(root, "judge.jsonl")
  await writeLeaseReceipt(file, fixture.slots)
  const config = loadConfig(["--calibrate", "--only", "group-sum-qty"], {
    EVAL_SLOTS_FILE: file, EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake",
    EVAL_JUDGE_COMMAND: `bun ${path.join(evalsRoot, "fixtures/fake-codex.ts")} --gate-log ${trace} --delay-ms 500`,
  })
  const pending = runOfflineJudge(config, fixture.lockRoot)
  try {
    for (let wait = 0; wait < 500 && !await Bun.file(trace).exists(); wait++) await Bun.sleep(10)
    const reservations = await Array.fromAsync(new Bun.Glob("*.reservation.json").scan({ cwd: fixture.lockRoot, absolute: true }))
    const admitted = await Bun.file(reservations[0]!).json()
    await mkdir(path.join(path.dirname(admitted.journal), "cleanup.json"))
    await expect(pending).rejects.toThrow()
    expect((await Bun.file(reservations[0]!).json()).state).toBe("retained")
    expect((await Bun.file(admitted.journal).json()).state).toBe("quarantined")
    const completed = await Array.fromAsync(new Bun.Glob("*/calibration.json").scan({ cwd: config.resultsDir, absolute: true }))
    expect(completed).toHaveLength(1)
    expect((await Bun.file(admitted.journal).json()).runDir).toBe(path.dirname(completed[0]!))
    const before = await Bun.file(trace).text()
    await expect(runOfflineJudge(config, fixture.lockRoot)).rejects.toThrow("RECOVERY_REQUIRED")
    expect(await Bun.file(trace).text()).toBe(before)
  } finally { await pending.catch(() => {}); await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("offline result persistence failure retains the admitted run directory before completion", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-result-error-"))
  const fixture = await parallelFixture(root)
  const file = path.join(root, "slots.json"), trace = path.join(root, "judge.jsonl")
  await writeLeaseReceipt(file, fixture.slots)
  const config = loadConfig(["--calibrate", "--only", "group-sum-qty"], {
    EVAL_SLOTS_FILE: file, EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake",
    EVAL_JUDGE_COMMAND: `bun ${path.join(evalsRoot, "fixtures/fake-codex.ts")} --gate-log ${trace} --delay-ms 500`,
  })
  const pending = runOfflineJudge(config, fixture.lockRoot)
  try {
    for (let wait = 0; wait < 500 && !await Bun.file(trace).exists(); wait++) await Bun.sleep(10)
    expect(await Bun.file(trace).exists()).toBe(true)
    const configs = await Array.fromAsync(new Bun.Glob("*/config.json").scan({ cwd: config.resultsDir, absolute: true }))
    expect(configs).toHaveLength(1)
    const runDir = path.dirname(configs[0]!)
    const reservations = await Array.fromAsync(new Bun.Glob("*.reservation.json").scan({ cwd: fixture.lockRoot, absolute: true }))
    const retained = await Bun.file(reservations[0]!).json()
    const running = await Bun.file(retained.journal).json()
    expect(running).toMatchObject({ state: "running", runDir })
    await mkdir(path.join(runDir, "calibration.json"))
    await expect(pending).rejects.toThrow()
    expect((await Bun.file(reservations[0]!).json()).state).toBe("retained")
    expect(await Bun.file(retained.journal).json()).toMatchObject({ state: "quarantined", reason: "command-failed", runDir })
    const before = await Bun.file(trace).text()
    await expect(runOfflineJudge(config, fixture.lockRoot)).rejects.toThrow("RECOVERY_REQUIRED")
    expect(await Bun.file(trace).text()).toBe(before)
  } finally { await pending.catch(() => {}); await rm(root, { recursive: true, force: true }) }
}, 30000)

for (const kind of ["missing", "symlink", "hardlink", "public"]) test(`native judge refuses ${kind} auth before any probe or reservation`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-auth-private-"))
  try {
    const fixture = await parallelFixture(root)
    const file = path.join(root, "slots.json")
    const binary = path.join(root, "codex")
    const probe = path.join(root, "version-called")
    const borrowed = path.join(root, "parent-auth-canary")
    const auth = path.join(fixture.slots.judge.codexHome, "auth.json")
    await writeLeaseReceipt(file, fixture.slots)
    if (kind === "public") await writeFile(auth, "private-auth-canary", { mode: 0o644 })
    if (["symlink", "hardlink"].includes(kind)) {
      await writeFile(borrowed, "parent-auth-canary", { mode: 0o600 })
      if (kind === "symlink") await symlink(borrowed, auth)
      if (kind === "hardlink") await link(borrowed, auth)
    }
    await writeFile(binary, '#!/bin/sh\nprintf called > "$PROBE_JUDGE_HOME_FILE"\nprintf "fake-codex 0.0.0\\n"\n', { mode: 0o700 })
    const config: EvalConfig = loadConfig(["--calibrate", "--only", "group-sum-qty"], {
      EVAL_SLOTS_FILE: file, EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: binary,
    })
    config.judge.env = { PROBE_JUDGE_HOME_FILE: probe }
    await expect(runOfflineJudge(config, fixture.lockRoot)).rejects.toThrow(kind === "missing" ? "Нет входа Codex" : "JUDGE_AUTH_PRIVATE")
    expect(await Bun.file(probe).exists()).toBe(false)
    expect(await Array.fromAsync(new Bun.Glob("*.reservation.json").scan(fixture.lockRoot))).toEqual([])
    if (["symlink", "hardlink"].includes(kind)) expect(await Bun.file(borrowed).text()).toBe("parent-auth-canary")
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("main offline v2 command reads its configured slots before any judge probe", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-judge-entry-"))
  try {
    const probe = path.join(root, "version.json")
    const results = path.join(root, "results")
    await expect(main(["--calibrate", "--only", "group-sum-qty"], {
      EVAL_SLOTS_FILE: path.join(root, "missing-slots.json"), EVAL_RESULTS_DIR: results, JUDGE_MODEL: "fake",
      EVAL_JUDGE_COMMAND: `bun ${path.join(evalsRoot, "fixtures/fake-codex.ts")} --version-home-file ${probe}`,
    })).rejects.toThrow("SLOTS_FILE_PRIVATE")
    expect(await Bun.file(probe).exists()).toBe(false)
    await expect(lstat(results)).rejects.toMatchObject({ code: "ENOENT" })
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("offline calibration releases its private home after confirmed cleanup and can run again", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-judge-release-"))
  try {
    const fixture = await parallelFixture(root)
    const file = path.join(root, "slots.json")
    const trace = path.join(root, "judge.jsonl")
    const probe = path.join(root, "version.json")
    await writeLeaseReceipt(file, fixture.slots)
    const config: EvalConfig = loadConfig(["--calibrate", "--only", "group-sum-qty"], {
      EVAL_SLOTS_FILE: file, EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake",
      EVAL_JUDGE_COMMAND: `bun ${path.join(evalsRoot, "fixtures/fake-codex.ts")} --version-home-file ${probe} --gate-log ${trace}`,
    })
    config.judge.env = { CODEX_HOME: path.join(root, "unconfigured-parent-home") }
    const first = await runOfflineJudge(config, fixture.lockRoot)
    expect(first.code).toBe(0)
    expect((await Bun.file(path.join(first.runDir, "config.json")).json()).judge.processEvidence).toBeUndefined()
    const reservations = await Array.fromAsync(new Bun.Glob("*.reservation.json").scan({ cwd: fixture.lockRoot, absolute: true }))
    expect(reservations).toHaveLength(1)
    const before = await Bun.file(reservations[0]!).json()
    expect(before.state).toBe("released")
    expect(before.key).toBe(`judge:${fixture.slots.judge.codexHome}`)
    const journal = await Bun.file(before.journal).json()
    const second = await runOfflineJudge(config, fixture.lockRoot)
    expect(second.code).toBe(0)
    expect(second.runDir).not.toBe(first.runDir)
    const after = await Bun.file(reservations[0]!).json()
    expect(after).toMatchObject({ state: "released", revision: 2 })
    expect(after.token).not.toBe(before.token)
    expect((await Bun.file(probe).json()).codexHome).toBe(fixture.slots.judge.codexHome)
    const rows = (await Bun.file(trace).text()).trim().split("\n").map(line => JSON.parse(line))
    expect(rows.filter(row => row.kind === "start")).toHaveLength(2)
    expect(rows.every(row => row.codexHome === fixture.slots.judge.codexHome)).toBe(true)
    expect(config.judge.env.CODEX_HOME).toBe(path.join(root, "unconfigured-parent-home"))
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("offline judge refuses a held home before version probes or results", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-judge-busy-"))
  const fixture = await parallelFixture(root)
  const file = path.join(root, "slots.json")
  const journal = path.join(root, "holder.json")
  await writeLeaseReceipt(file, fixture.slots)
  await writeLeaseReceipt(journal, { commandId: "holder" })
  const holder = await acquireJudgeLease({ codexHome: fixture.slots.judge.codexHome, journal,
    commandId: "holder", lockRoot: fixture.lockRoot })
  try {
    const probe = path.join(root, "version.json")
    const config = loadConfig(["--calibrate", "--only", "group-sum-qty"], {
      EVAL_SLOTS_FILE: file, EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake",
      EVAL_JUDGE_COMMAND: `bun ${path.join(evalsRoot, "fixtures/fake-codex.ts")} --version-home-file ${probe}`,
    })
    await expect(runOfflineJudge(config, fixture.lockRoot)).rejects.toThrow("BUSY")
    expect(await Bun.file(probe).exists()).toBe(false)
    await expect(lstat(config.resultsDir)).rejects.toMatchObject({ code: "ENOENT" })
  } finally { await holder.close(); await rm(root, { recursive: true, force: true }) }
})

test("offline rejudge releases its lease while preserving historical slot metadata", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-rejudge-"))
  try {
    const fixture = await parallelFixture(root)
    const file = path.join(root, "slots.json")
    const trace = path.join(root, "judge.jsonl")
    await writeLeaseReceipt(file, fixture.slots)
    const env = { EVAL_RESULTS_DIR: path.join(root, "results"), EVAL_PROFILE_DIR: path.join(root, "legacy-profile"),
      EVAL_WORKSPACE_ROOT: path.join(root, "legacy-work"), JUDGE_MODEL: "fake",
      EVAL_JUDGE_COMMAND: `bun ${path.join(evalsRoot, "fixtures/fake-codex.ts")} --gate-log ${trace}` }
    const dry = await main(["--dry-run", "--only", "group-sum-qty", "--repeat", "2"], env)
    const before = await Bun.file(path.join(dry.runDir!, "summary.json")).json()
    const config = loadConfig(["--judge-only", before.run_id], { ...env, EVAL_SLOTS_FILE: file })
    expect(await runOfflineJudge(config, fixture.lockRoot)).toMatchObject({ code: 0, judgeCleanupConfirmed: true, runDir: dry.runDir })
    const after = await Bun.file(path.join(dry.runDir!, "summary.json")).json()
    expect(after.slots).toEqual(before.slots)
    expect(after.config.parallel).toBe(before.config.parallel)
    expect(after.metrics.total).toBe(2)
    const reservations = await Array.fromAsync(new Bun.Glob("*.reservation.json").scan({ cwd: fixture.lockRoot, absolute: true }))
    const released = await Bun.file(reservations[0]!).json()
    expect(released.state).toBe("released")
    const rows = (await Bun.file(trace).text()).trim().split("\n").map(line => JSON.parse(line))
    expect(rows.filter(row => row.kind === "start")).toHaveLength(2)
    expect(rows.every(row => row.codexHome === fixture.slots.judge.codexHome)).toBe(true)
    const result = path.join(dry.runDir!, "group-sum-qty", "1", "result.json")
    await rm(result)
    await mkdir(result)
    await expect(runOfflineJudge(config, fixture.lockRoot)).rejects.toThrow()
    const retained = await Bun.file(reservations[0]!).json()
    expect(retained.state).toBe("retained")
    expect(await Bun.file(retained.journal).json()).toMatchObject({ state: "quarantined", reason: "command-failed", runDir: dry.runDir })
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("offline judge loads its private home and state without requiring Loginom credentials", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-judge-"))
  try {
    const fixture = await parallelFixture(root)
    const file = path.join(root, "slots.json")
    await writeLeaseReceipt(file, fixture.slots)
    expect(await loadJudgeEnvironment(file)).toEqual({ codexHome: fixture.slots.judge.codexHome,
      stateDir: fixture.slots.controller.stateDir })
    expect(await Bun.file(fixture.slots.controller.adminCredentialsFile).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("offline judge refuses a profile alias that resolves into its private home", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-judge-alias-"))
  try {
    const fixture = await parallelFixture(root)
    const alias = path.join(root, "profile-alias")
    await symlink(fixture.slots.judge.codexHome, alias)
    fixture.slots.slots[0]!.profileDir = alias
    const file = path.join(root, "slots.json")
    await writeLeaseReceipt(file, fixture.slots)
    await expect(loadJudgeEnvironment(file)).rejects.toThrow("SLOT_PATH_OVERLAP")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("offline judge refuses public state directories before any execution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-judge-private-"))
  try {
    const fixture = await parallelFixture(root)
    const file = path.join(root, "slots.json")
    await writeLeaseReceipt(file, fixture.slots)
    await chmod(fixture.slots.controller.stateDir, 0o755)
    await expect(loadJudgeEnvironment(file)).rejects.toThrow("SLOT_PATH_PRIVATE")
  } finally { await rm(root, { recursive: true, force: true }) }
})
