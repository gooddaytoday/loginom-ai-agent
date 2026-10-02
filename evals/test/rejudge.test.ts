import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { cp, mkdtemp, rm } from "node:fs/promises"
import { main } from "../src/run"
import { evalsRoot } from "../src/config"
import type { RunSummary } from "../src/report"

const fakeJudge = `bun ${path.join(evalsRoot, "fixtures", "fake-codex.ts")}`

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
