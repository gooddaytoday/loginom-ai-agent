import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises"
import { evaluationContractHash } from "../src/evaluation"
import { analyzeComparison } from "../src/compare-analysis"
import { main } from "../src/run"
import { evalsRoot, loadConfig, type EvalConfig } from "../src/config"
import { rejudge } from "../src/rejudge"
import type { RunSummary } from "../src/report"
import { parallelFixture } from "./helpers/parallel-fixture"

const fakeJudge = `bun ${path.join(evalsRoot, "fixtures", "fake-codex.ts")}`

test("judge-only stops spawning judges after unconfirmed process cleanup", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-rejudge-uncertain-"))
  const env = { EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake",
    EVAL_JUDGE_COMMAND: `${fakeJudge} --gate-log ${path.join(root, "judge.jsonl")}` }
  try {
    const run = await main(["--dry-run", "--only", "group-sum-qty", "--repeat", "2"], env)
    await mkdir(path.join(run.runDir!, "group-sum-qty", "1", "judge-processes-1", "process-cleanup.json"), { recursive: true, mode: 0o700 })
    expect((await main(["--judge-only", path.basename(run.runDir!)], env)).code).toBe(0)
    const summary = await Bun.file(path.join(run.runDir!, "summary.json")).json() as RunSummary
    expect(summary.tasks[0]!.attempts.map(attempt => attempt.judge_cleanup_unconfirmed)).toEqual([true, true])
    expect(summary.tasks[0]!.attempts.map(attempt => attempt.judge_attempts)).toEqual([1, 0])
    expect(summary.metrics.completed).toBe(2)
    const rows = (await Bun.file(path.join(root, "judge.jsonl")).text()).trim().split("\n").map(line => JSON.parse(line))
    expect(rows.filter(row => row.kind === "start")).toHaveLength(1)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("judge-only reads a legacy summary without adding slot fields or changing quality denominators", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-rejudge-legacy-slots-"))
  const env = { EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: fakeJudge }
  try {
    const run = await main(["--dry-run"], env)
    const file = Bun.file(path.join(run.runDir!, "summary.json"))
    const legacy = await file.json() as RunSummary
    delete legacy.slots
    delete legacy.config.parallel
    legacy.tasks.forEach(task => task.attempts.forEach(attempt => { delete attempt.slot_id }))
    await Bun.write(file, JSON.stringify(legacy))
    expect((await main(["--judge-only", legacy.run_id], env)).code).toBe(0)
    const after = await file.json() as RunSummary
    expect(after.slots).toBeUndefined()
    expect(after.config.parallel).toBeUndefined()
    expect(after.tasks.flatMap(task => task.attempts).every(attempt => attempt.slot_id === undefined)).toBe(true)
    expect(after.metrics.total).toBe(3)
    expect(after.metrics.completed).toBe(1)
    expect(after.metrics.pass_evaluated_count).toBe(3)
    expect(after.metrics.pass_rate).toBeCloseTo(1 / 3, 3)
    expect(after.metrics.mean_score).toBe(33.3)
    expect(await Bun.file(path.join(run.runDir!, "summary.prev.json")).json()).toEqual(legacy)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("judge-only preserves parallel slot metadata and counts an infra retry once", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-rejudge-slots-"))
  try {
    const fixture = await parallelFixture(root, ["parallel-infra-retry", "parallel-fast"])
    const env = { ...fixture.env, JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: fakeJudge }
    const run = await main(["--tasks", path.join(root, "tasks"), "--parallel", "2", "--skip-judge"], env,
      { fixture: { slots: fixture.slots, lockRoot: fixture.lockRoot } })
    expect(run.code).toBe(0)
    const file = Bun.file(path.join(run.runDir!, "summary.json"))
    const before = await file.json() as RunSummary
    const attempts = before.tasks.flatMap(task => task.attempts)
    expect(attempts).toHaveLength(2)
    expect(attempts.filter(attempt => attempt.infra_retry)).toHaveLength(1)
    expect(new Set(attempts.map(attempt => attempt.slot_id)).size).toBe(2)
    expect((await main(["--judge-only", before.run_id], env)).code).toBe(0)
    const after = await file.json() as RunSummary
    expect(after.slots).toEqual(before.slots)
    expect(after.config.parallel).toBe(2)
    expect(after.tasks.flatMap(task => task.attempts).map(attempt => [attempt.task_id, attempt.attempt, attempt.slot_id, attempt.duration_ms, attempt.infra_retry]))
      .toEqual(attempts.map(attempt => [attempt.task_id, attempt.attempt, attempt.slot_id, attempt.duration_ms, attempt.infra_retry]))
    expect(after.metrics.total).toBe(2)
    expect(after.metrics.pass_evaluated_count).toBe(2)
    expect(after.metrics.infra_error_count).toBe(1)
    expect(after.metrics.total_duration_ms).toBe(before.metrics.total_duration_ms)
    expect(after.metrics.total_cost).toBe(before.metrics.total_cost)
    expect(await Bun.file(path.join(run.runDir!, "summary.prev.json")).json()).toEqual(before)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 40_000)

test("rejudge removes its SIGINT handler after success and failed result persistence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-rejudge-signal-"))
  const listeners = process.listeners("SIGINT")
  const env = { EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: fakeJudge }
  try {
    const dry = await main(["--dry-run", "--only", "group-sum-qty"], env)
    const runId = path.basename(dry.runDir!)
    const config = loadConfig(["--judge-only", runId], env)
    expect((await rejudge(config, runId)).code).toBe(0)
    expect(process.listeners("SIGINT")).toEqual(listeners)
    const result = path.join(dry.runDir!, "group-sum-qty", "1", "result.json")
    await rm(result)
    await mkdir(result)
    await expect(rejudge(config, runId)).rejects.toThrow()
    expect(process.listeners("SIGINT")).toEqual(listeners)
  } finally {
    process.listeners("SIGINT").filter(listener => !listeners.includes(listener)).forEach(listener => process.off("SIGINT", listener))
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)

test("rejudge uses the configured private judge home for version and execution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-rejudge-home-"))
  const env = { EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake",
    EVAL_JUDGE_COMMAND: `${fakeJudge} --version-home-file ${path.join(root, "version.json")} --gate-log ${path.join(root, "judge.jsonl")}` }
  try {
    const dry = await main(["--dry-run", "--only", "group-sum-qty"], env)
    const config: EvalConfig = loadConfig(["--judge-only", path.basename(dry.runDir!)], env)
    config.judge.env = { CODEX_HOME: path.join(root, "private-judge") }
    expect((await rejudge(config, path.basename(dry.runDir!))).code).toBe(0)
    expect((await Bun.file(path.join(root, "version.json")).json()).codexHome).toBe(config.judge.env.CODEX_HOME)
    const rows = (await Bun.file(path.join(root, "judge.jsonl")).text()).trim().split("\n").map(line => JSON.parse(line))
    expect(rows.map(row => row.kind)).toEqual(["start", "end"])
    expect(rows.map(row => row.codexHome)).toEqual([config.judge.env.CODEX_HOME, config.judge.env.CODEX_HOME])
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

function overrideJudgeEnv() {
  const original = {
    model: process.env.JUDGE_MODEL,
    command: process.env.EVAL_JUDGE_COMMAND,
    verdict: process.env.FAKE_CODEX_VERDICT,
    exit: process.env.FAKE_CODEX_EXIT,
    flaky: process.env.FAKE_CODEX_FLAKY_MARKER,
  }
  process.env.JUDGE_MODEL = "fake"
  process.env.EVAL_JUDGE_COMMAND = fakeJudge
  delete process.env.FAKE_CODEX_VERDICT
  delete process.env.FAKE_CODEX_EXIT
  delete process.env.FAKE_CODEX_FLAKY_MARKER
  return original
}

function restoreJudgeEnv(original: ReturnType<typeof overrideJudgeEnv>) {
  if (original.model === undefined) delete process.env.JUDGE_MODEL
  else process.env.JUDGE_MODEL = original.model
  if (original.command === undefined) delete process.env.EVAL_JUDGE_COMMAND
  else process.env.EVAL_JUDGE_COMMAND = original.command
  if (original.verdict === undefined) delete process.env.FAKE_CODEX_VERDICT
  else process.env.FAKE_CODEX_VERDICT = original.verdict
  if (original.exit === undefined) delete process.env.FAKE_CODEX_EXIT
  else process.env.FAKE_CODEX_EXIT = original.exit
  if (original.flaky === undefined) delete process.env.FAKE_CODEX_FLAKY_MARKER
  else process.env.FAKE_CODEX_FLAKY_MARKER = original.flaky
}

test("--judge-only: пересуживает попытки с артефактом, сохраняет prev, не трогает остальные", async () => {
  const original = overrideJudgeEnv()
  let runDir: string | undefined
  try {
    const dry = await main(["--dry-run", "--repeat", "1"])
    runDir = dry.runDir
    const runId = path.basename(dry.runDir!)
    const originalSummary = await Bun.file(path.join(dry.runDir!, "summary.json")).json() as RunSummary
    originalSummary.tasks.forEach((task) => task.attempts.forEach((attempt) => {
      attempt.environment_cleanup = { status: "failed", evidence: "cleanup.json", error: "preserved cleanup refusal" }
    }))
    await Bun.write(path.join(dry.runDir!, "summary.json"), JSON.stringify(originalSummary))
    const result = await main(["--judge-only", runId])
    expect(result.code).toBe(0)
    const summary = (await Bun.file(path.join(dry.runDir!, "summary.json")).json()) as RunSummary
    expect(summary.judge?.model).toBe("fake")
    expect(summary.tasks.flatMap((task) => task.attempts).every((attempt) =>
      attempt.environment_cleanup?.error === "preserved cleanup refusal")).toBe(true)
    expect(summary.metrics.environment_cleanup_error_count).toBe(3)
    const byTask = Object.fromEntries(summary.tasks.map((task) => [task.id, task]))
    expect(byTask["group-sum-qty"]!.attempts[0]).toMatchObject({ status: "completed", score: 100, judge_status: "scored" })
    expect(byTask["calc-data-double"]!.attempts[0]).toMatchObject({ status: "no_artifact", score: 0, judge_status: "no_artifact" })
    expect(summary.metrics.mean_score).toBeCloseTo(33.3, 0)
    expect(await Bun.file(path.join(dry.runDir!, "summary.prev.json")).exists()).toBe(true)
    const prevVerdict = path.join(dry.runDir!, "group-sum-qty", "1", "verdict.prev.json")
    expect(await Bun.file(prevVerdict).exists()).toBe(false)
    const firstVerdict = await Bun.file(path.join(dry.runDir!, "group-sum-qty", "1", "judge", "verdict.json")).text()
    const second = await main(["--judge-only", runId])
    expect(second.code).toBe(0)
    expect(await Bun.file(prevVerdict).text()).toBe(firstVerdict)
  } finally {
    restoreJudgeEnv(original)
    if (runDir) await rm(runDir, { recursive: true, force: true })
  }
}, 90_000)

test("--judge-only: сбой судьи помечает попытку error и не роняет прогон", async () => {
  const original = overrideJudgeEnv()
  const tasksDir = await mkdtemp(path.join(os.tmpdir(), "evals-rejudge-bad-ref-"))
  let runDir: string | undefined
  try {
    await cp(path.join(evalsRoot, "tasks"), tasksDir, { recursive: true })
    await cp(path.join(evalsRoot, "fixtures", "storage", "not-a-package.lgp"), path.join(tasksDir, "group-sum-qty", "reference.lgp"))
    const dry = await main(["--dry-run", "--tasks", tasksDir, "--repeat", "1"])
    runDir = dry.runDir
    const result = await main(["--judge-only", path.basename(dry.runDir!), "--tasks", tasksDir])
    expect(result.code).toBe(0)
    const summary = (await Bun.file(path.join(dry.runDir!, "summary.json")).json()) as RunSummary
    const byTask = Object.fromEntries(summary.tasks.map((task) => [task.id, task]))
    expect(byTask["group-sum-qty"]!.attempts[0]!.judge_status).toBe("error")
    expect(byTask["group-sum-qty"]!.attempts[0]!.judge_summary).toContain("group-sum-qty")
    expect(byTask["calc-data-double"]!.attempts[0]).toMatchObject({ status: "no_artifact", judge_status: "no_artifact" })
    expect(byTask["filter-active-rows"]!.attempts[0]).toMatchObject({ status: "failed", judge_status: "no_artifact" })
  } finally {
    restoreJudgeEnv(original)
    if (runDir) await rm(runDir, { recursive: true, force: true })
    await rm(tasksDir, { recursive: true, force: true })
  }
}, 90_000)

test("--judge-only: восстанавливает каталог внешних задач из summary", async () => {
  const original = overrideJudgeEnv()
  const tasksDir = await mkdtemp(path.join(os.tmpdir(), "evals-rejudge-external-"))
  let runDir: string | undefined
  try {
    await cp(path.join(evalsRoot, "tasks", "group-sum-qty"), path.join(tasksDir, "external-task"), { recursive: true })
    const file = path.join(tasksDir, "external-task", "task.json")
    const raw = await Bun.file(file).json()
    await Bun.write(file, JSON.stringify({ ...raw, id: "external-task" }))
    const dry = await main(["--dry-run", "--tasks", tasksDir])
    runDir = dry.runDir
    const summaryFile = Bun.file(path.join(runDir!, "summary.json"))
    const summary = await summaryFile.json()
    summary.config.tasks_dir = tasksDir
    await Bun.write(summaryFile, JSON.stringify(summary))
    const result = await main(["--judge-only", path.basename(runDir!)])
    expect(result.code).toBe(0)
    expect((await summaryFile.json()).task_ids).toEqual(["external-task"])
  } finally {
    restoreJudgeEnv(original)
    if (runDir) await rm(runDir, { recursive: true, force: true })
    await rm(tasksDir, { recursive: true, force: true })
  }
}, 30_000)

test("--judge-only: для старого summary восстанавливает tasksDir из config.json", async () => {
  const original = overrideJudgeEnv()
  const tasksDir = await mkdtemp(path.join(os.tmpdir(), "evals-rejudge-legacy-"))
  let runDir: string | undefined
  try {
    await cp(path.join(evalsRoot, "tasks", "group-sum-qty"), path.join(tasksDir, "legacy-task"), { recursive: true })
    const file = path.join(tasksDir, "legacy-task", "task.json")
    const raw = await Bun.file(file).json()
    await Bun.write(file, JSON.stringify({ ...raw, id: "legacy-task" }))
    const dry = await main(["--dry-run", "--tasks", tasksDir])
    runDir = dry.runDir
    const summaryFile = Bun.file(path.join(runDir!, "summary.json"))
    const summary = await summaryFile.json()
    delete summary.config.tasks_dir
    await Bun.write(summaryFile, JSON.stringify(summary))
    expect((await main(["--judge-only", path.basename(runDir!)])).code).toBe(0)
  } finally {
    restoreJudgeEnv(original)
    if (runDir) await rm(runDir, { recursive: true, force: true })
    await rm(tasksDir, { recursive: true, force: true })
  }
}, 30_000)

test("--judge-only: инфраструктурная ошибка остаётся без оценки агента", async () => {
  const original = overrideJudgeEnv()
  let runDir: string | undefined
  try {
    const dry = await main(["--dry-run", "--only", "calc-data-double"])
    runDir = dry.runDir
    const file = Bun.file(path.join(runDir!, "summary.json"))
    const summary = await file.json()
    summary.tasks[0].attempts[0].status = "infra_error"
    await Bun.write(file, JSON.stringify(summary))
    await main(["--judge-only", path.basename(runDir!)])
    expect((await file.json()).tasks[0].attempts[0]).toMatchObject({ status: "infra_error", score: null, pass: null, judge_status: "skipped" })
  } finally {
    restoreJudgeEnv(original)
    if (runDir) await rm(runDir, { recursive: true, force: true })
  }
}, 30_000)

test("--judge-only: отсутствующий артефакт проваливает oracle, как в живом прогоне", async () => {
  const original = overrideJudgeEnv()
  const tasksDir = await mkdtemp(path.join(os.tmpdir(), "evals-rejudge-oracle-"))
  let runDir: string | undefined
  try {
    await cp(path.join(evalsRoot, "tasks", "calc-data-double"), path.join(tasksDir, "calc-data-double"), { recursive: true })
    await Bun.write(path.join(tasksDir, "calc-data-double", "oracle.csv"), "Data,Double\n1,2\n")
    const dry = await main(["--dry-run", "--tasks", tasksDir])
    runDir = dry.runDir
    await main(["--judge-only", path.basename(runDir!)])
    const summary = await Bun.file(path.join(runDir!, "summary.json")).json()
    expect(summary.tasks[0].attempts[0]).toMatchObject({ judge_status: "no_artifact", oracle_pass: false })
    expect(summary.metrics.oracle_checked_count).toBe(1)
    expect(summary.metrics.oracle_pass_rate).toBe(0)
  } finally {
    restoreJudgeEnv(original)
    if (runDir) await rm(runDir, { recursive: true, force: true })
    await rm(tasksDir, { recursive: true, force: true })
  }
}, 30_000)

test("--judge-only: старый no_artifact обновляет oracle по текущей рубрике", async () => {
  const original = overrideJudgeEnv()
  const tasksDir = await mkdtemp(path.join(os.tmpdir(), "evals-rejudge-legacy-oracle-"))
  let runDir: string | undefined
  try {
    await cp(path.join(evalsRoot, "tasks", "calc-data-double"), path.join(tasksDir, "calc-data-double"), { recursive: true })
    const dry = await main(["--dry-run", "--tasks", tasksDir])
    runDir = dry.runDir
    const runId = path.basename(runDir!)
    await main(["--judge-only", runId])
    const summaryFile = Bun.file(path.join(runDir!, "summary.json"))
    const previous = await summaryFile.json()
    expect(previous.tasks[0].attempts[0]).toMatchObject({ judge_status: "no_artifact", oracle_pass: null })

    const oracle = path.join(tasksDir, "calc-data-double", "oracle.csv")
    await Bun.write(oracle, "Data,Double\n1,2\n")
    await main(["--judge-only", runId])
    const summary = await summaryFile.json()
    expect(summary.tasks[0].attempts[0]).toMatchObject({
      status: "no_artifact", judge_status: "no_artifact", score: 0, pass: false, oracle_pass: false,
    })
    expect(summary.metrics.oracle_checked_count).toBe(1)
    expect(summary.metrics.oracle_pass_rate).toBe(0)
    expect(await Bun.file(path.join(runDir!, "calc-data-double", "1", "result.json")).json()).toEqual(summary.tasks[0].attempts[0])
    expect((await Bun.file(path.join(runDir!, "summary.prev.json")).json()).tasks[0].attempts[0]).toEqual(previous.tasks[0].attempts[0])

    await rm(oracle)
    await main(["--judge-only", runId])
    const withoutOracle = await summaryFile.json()
    expect(withoutOracle.tasks[0].attempts[0]).toMatchObject({ oracle_pass: null, oracle_error: null })
    expect(withoutOracle.metrics.oracle_checked_count).toBe(0)
    expect(withoutOracle.metrics.oracle_pass_rate).toBeNull()
  } finally {
    restoreJudgeEnv(original)
    if (runDir) await rm(runDir, { recursive: true, force: true })
    await rm(tasksDir, { recursive: true, force: true })
  }
}, 30_000)

test("--judge-only: явный --tasks сохраняет новую рубрику для следующего пересудейства", async () => {
  const original = overrideJudgeEnv()
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-rejudge-tasks-override-"))
  const tasksA = path.join(dir, "A")
  const tasksB = path.join(dir, "B")
  let runDir: string | undefined
  try {
    await cp(path.join(evalsRoot, "tasks", "calc-data-double"), path.join(tasksA, "calc-data-double"), { recursive: true })
    await cp(tasksA, tasksB, { recursive: true })
    await Bun.write(path.join(tasksB, "calc-data-double", "oracle.csv"), "Data,Double\n1,2\n")
    const dry = await main(["--dry-run", "--tasks", tasksA])
    runDir = dry.runDir
    const runId = path.basename(runDir!)
    const configFile = Bun.file(path.join(runDir!, "config.json"))
    const originalConfig = await configFile.text()
    const summaryFile = Bun.file(path.join(runDir!, "summary.json"))
    const previous = await summaryFile.json()

    expect((await main(["--judge-only", runId, "--tasks", tasksB])).code).toBe(0)
    const updated = await summaryFile.json()
    expect(updated.config.tasks_dir).toBe(tasksB)
    expect(updated.rubric_hash).not.toBe(previous.rubric_hash)
    expect(updated.agent_inputs_hash).toBe(previous.agent_inputs_hash)
    expect(await configFile.text()).toBe(originalConfig)
    expect((await Bun.file(path.join(runDir!, "summary.prev.json")).json()).config.tasks_dir).toBe(tasksA)

    await rm(tasksA, { recursive: true })
    expect((await main(["--judge-only", runId])).code).toBe(0)
    const repeated = await summaryFile.json()
    expect(repeated.config.tasks_dir).toBe(tasksB)
    expect(repeated.rubric_hash).toBe(updated.rubric_hash)
    expect(repeated.tasks[0].attempts[0].oracle_pass).toBe(false)
  } finally {
    restoreJudgeEnv(original)
    if (runDir) await rm(runDir, { recursive: true, force: true })
    await rm(dir, { recursive: true, force: true })
  }
}, 30_000)

test("--judge-only: фиксирует полный контракт и фактический threshold", async () => {
 const directory = await mkdtemp(path.join(os.tmpdir(), "evals-compare-contract-"))
 const env = { EVAL_RESULTS_DIR: path.join(directory, "results"), EVAL_PROFILE_DIR: path.join(directory, "profile"), EVAL_WORKSPACE_ROOT: path.join(directory, "workspace"), EVAL_JUDGE_COMMAND: fakeJudge, JUDGE_MODEL: "fake" }
 try {
  const dry = await main(["--dry-run","--only","group-sum-qty","--repeat","1"],env)
  await main(["--judge-only",path.basename(dry.runDir!)],{...env,EVAL_PASS_THRESHOLD:"80"})
  const saved = await Bun.file(path.join(dry.runDir!, "summary.json")).json() as RunSummary
  expect(saved.config.pass_threshold).toBe(80)
  expect(saved.tasks[0]!.rubric_snapshot!.version).toBe(1)
  expect(saved.tasks[0]!.attempts[0]!.evaluation_contract_hash).toMatch(/^[0-9a-f]{64}$/)
  expect(saved.tasks[0]!.attempts[0]!.structural_score).toBe(100)
 } finally { await rm(directory, { recursive:true, force:true }) }
})



test("--judge-only: no-artifact synthetic получает structure 0 и current provenance", async () => {
 const directory = await mkdtemp(path.join(os.tmpdir(), "evals-compare-no-artifact-"))
 const env = { EVAL_RESULTS_DIR:path.join(directory,"results"), EVAL_PROFILE_DIR:path.join(directory,"profile"), EVAL_WORKSPACE_ROOT:path.join(directory,"workspace"), EVAL_JUDGE_COMMAND:fakeJudge, JUDGE_MODEL:"fake" }
 try {
  const dry = await main(["--dry-run","--only","calc-data-double","--repeat","1"],env)
  await main(["--judge-only",path.basename(dry.runDir!)],env)
  const saved = await Bun.file(path.join(dry.runDir!,"summary.json")).json() as RunSummary
  expect(saved.tasks[0]!.attempts[0]!).toMatchObject({structural_score:0,pass:false,judge_status:"no_artifact"})
  expect(saved.tasks[0]!.attempts[0]!.evaluation_contract_hash).toMatch(/^[0-9a-f]{64}$/)
 } finally { await rm(directory,{recursive:true,force:true}) }
})

test("--judge-only: сохранённая попытка сохраняет старый контракт при rubric, judge и threshold изменениях", async () => {
 const directory = await mkdtemp(path.join(os.tmpdir(), "evals-compare-lineage-"))
 const tasksDir = path.join(directory,"tasks")
 const env = { EVAL_RESULTS_DIR:path.join(directory,"results"), EVAL_PROFILE_DIR:path.join(directory,"profile"), EVAL_WORKSPACE_ROOT:path.join(directory,"workspace"), EVAL_JUDGE_COMMAND:fakeJudge, JUDGE_MODEL:"fake" }
 try {
  await cp(path.join(evalsRoot,"tasks/group-sum-qty"),path.join(tasksDir,"group-sum-qty"),{recursive:true})
  await cp(path.join(evalsRoot,"fixtures/storage/fixture-group-sum-qty.result.csv"),path.join(tasksDir,"group-sum-qty/oracle.csv"))
  const dry = await main(["--dry-run","--tasks",tasksDir,"--repeat","2"],env)
  const id = path.basename(dry.runDir!)
  await main(["--judge-only",id],env)
  const summaryFile = Bun.file(path.join(dry.runDir!,"summary.json"))
  const before = await summaryFile.json() as RunSummary
  const old = before.tasks[0]!.attempts[0]!.evaluation_contract_hash
  const artifact = path.join(dry.runDir!,"group-sum-qty/1/artifact")
  for (const file of await Array.fromAsync(new Bun.Glob("unpacked/Unit_*/Unit.xml").scan(artifact))) await rm(path.join(artifact,file))
  const taskFile = Bun.file(path.join(tasksDir,"group-sum-qty/task.json"))
  const raw = await taskFile.json()
  raw.checklist[0].weight = 2
  await Bun.write(taskFile,JSON.stringify(raw))
  for (const settings of [env, {...env,JUDGE_MODEL:"fake-new"}, {...env,JUDGE_MODEL:"fake-new",EVAL_PASS_THRESHOLD:"80"}]) {
   await main(["--judge-only",id],settings)
   const current = await summaryFile.json() as RunSummary
   expect(current.tasks[0]!.attempts[0]!.evaluation_contract_hash).toBe(old)
   expect(current.tasks[0]!.attempts[1]!.evaluation_contract_hash).not.toBe(old)
   expect(current.tasks[0]!.attempts[1]!.evaluation_contract_hash).toBe(evaluationContractHash({rubric_hash:current.rubric_hash,judge:current.judge,pass_threshold:current.config.pass_threshold}))
   const result = analyzeComparison(current,current)
   expect(result.axes.completion.verdict).toBe("indistinguishable")
   expect(result.axes.oracle.verdict).toBeNull()
   expect(result.axes.structure.verdict).toBeNull()
   expect(result.reliability.a.pass1).toBeNull()
  }
 } finally { await rm(directory,{recursive:true,force:true}) }
}, 30_000)
