import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises"
import { main, stamp } from "../src/run"
import { evalsRoot, loadConfig, type EvalConfig } from "../src/config"
import { calibrate } from "../src/calibrate"
import { superviseProcess } from "../src/process-supervisor"

const fakeJudge = `bun ${path.join(evalsRoot, "fixtures", "fake-codex.ts")}`

test("calibrate removes its SIGINT handler after success and preparation failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-calibrate-handler-"))
  const listeners = process.listeners("SIGINT")
  try {
    const config = loadConfig(["--calibrate", "--only", "group-sum-qty"], {
      EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: fakeJudge,
    })
    const corpus = path.join(root, "corpus")
    await mkdir(corpus)
    const pending = calibrate(config, corpus)
    expect(process.listeners("SIGINT")).toHaveLength(listeners.length + 1)
    expect((await pending).code).toBe(0)
    expect(process.listeners("SIGINT")).toEqual(listeners)
    const blocked = path.join(root, "blocked-results")
    await Bun.write(blocked, "preserve")
    const failed = calibrate({ ...config, resultsDir: blocked }, corpus)
    expect(process.listeners("SIGINT")).toHaveLength(listeners.length + 1)
    await expect(failed).rejects.toThrow()
    expect(process.listeners("SIGINT")).toEqual(listeners)
    expect(await Bun.file(blocked).text()).toBe("preserve")
  } finally {
    process.listeners("SIGINT").filter(listener => !listeners.includes(listener)).forEach(listener => process.off("SIGINT", listener))
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)

test("calibrate drains an active judge on SIGINT and saves an interrupted report without another invocation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-calibrate-sigint-"))
  const trace = path.join(root, "judge.jsonl")
  const resultFile = path.join(root, "result.json")
  let cleanupConfirmed = true
  try {
    await mkdir(path.join(root, "corpus"))
    await mkdir(path.join(root, "supervision"))
    const script = path.join(root, "interrupt.ts")
    await Bun.write(script, `import { calibrate } from ${JSON.stringify(path.join(evalsRoot, "src/calibrate.ts"))}
import { loadConfig } from ${JSON.stringify(path.join(evalsRoot, "src/config.ts"))}
const config = loadConfig(["--calibrate", "--only", "group-sum-qty,calc-data-double"], ${JSON.stringify({
      EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: `${fakeJudge} --gate-log ${trace} --delay-ms 1500`,
    })})
const pending = calibrate(config, ${JSON.stringify(path.join(root, "corpus"))})
const deadline = Date.now() + 10000
while (!await Bun.file(${JSON.stringify(trace)}).exists() && Date.now() < deadline) await Bun.sleep(10)
if (!await Bun.file(${JSON.stringify(trace)}).exists()) throw Error("Judge did not start")
process.kill(process.pid, "SIGINT")
await Bun.write(${JSON.stringify(resultFile)}, JSON.stringify(await pending))
`)
    cleanupConfirmed = false
    const run = await superviseProcess({ cmd: [process.execPath, script], cwd: evalsRoot,
      env: { PATH: process.env.PATH!, HOME: root }, timeoutMs: 20_000, outDir: path.join(root, "supervision") })
    cleanupConfirmed = run.processCleanup.status === "confirmed" && run.processCleanup.capture_complete
    expect(run.processCleanup.status).toBe("confirmed")
    expect(run.exitCode, JSON.stringify({ timedOut: run.timedOut, stdout: run.stdout, stderr: run.stderr })).toBe(0)
    const result = await Bun.file(resultFile).json()
    expect(result.code).toBe(1)
    expect(result.judgeCleanupConfirmed).toBe(true)
    const saved = await Bun.file(path.join(result.runDir, "calibration.json")).json()
    expect(saved.interrupted).toBe(true)
    expect(saved.rows).toHaveLength(1)
    expect(saved.rows[0].error).toContain("судья завершился кодом")
    const calls = (await Bun.file(trace).text()).trim().split("\n").map(line => JSON.parse(line))
    expect(calls.filter(call => call.kind === "start")).toHaveLength(1)
    const proof = await Bun.file(path.join(result.runDir, saved.rows[0].task, saved.rows[0].kind, "judge-processes-1/process-cleanup.json")).json()
    expect(proof.status).toBe("confirmed")
    expect(proof.capture_complete).toBe(true)
    expect(proof.verification.map((pass: { owned_remaining: number }) => pass.owned_remaining)).toEqual([0, 0])
  } finally { if (cleanupConfirmed) await rm(root, { recursive: true, force: true }) }
}, 45_000)

test("calibrate stops spawning judges after unconfirmed process cleanup", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-calibrate-uncertain-"))
  const trace = path.join(root, "judge.jsonl")
  const config = loadConfig(["--calibrate", "--only", "group-sum-qty,calc-data-double"], {
    EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake",
    EVAL_JUDGE_COMMAND: `${fakeJudge} --gate-log ${trace} --delay-ms 500`,
  })
  await mkdir(path.join(root, "corpus"))
  const pending = calibrate(config, path.join(root, "corpus"))
  try {
    for (let wait = 0; wait < 500 && !await Bun.file(trace).exists(); wait++) await Bun.sleep(10)
    const started = JSON.parse((await Bun.file(trace).text()).trim().split("\n")[0]!) as { dir: string }
    await mkdir(path.join(path.dirname(started.dir), "judge-processes-1", "process-cleanup.json"), { recursive: true, mode: 0o700 })
    const result = await pending
    expect(result.code).toBe(1)
    const saved = await Bun.file(path.join(result.runDir, "calibration.json")).json() as { rows: { error: string | null }[] }
    expect(saved.rows).toHaveLength(4)
    expect(saved.rows[0]!.error).toContain("Judge process cleanup unconfirmed")
    const rows = (await Bun.file(trace).text()).trim().split("\n").map(line => JSON.parse(line))
    expect(rows.filter(row => row.kind === "start")).toHaveLength(1)
    expect(saved.rows.slice(1).every(row => row.error?.includes("Judge gate blocked"))).toBe(true)
  } finally { await pending; await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("calibrate keeps explicit judge environment values out of saved config", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-calibrate-secret-"))
  const canary = "judge-explicit-env-canary"
  try {
    const config: EvalConfig = loadConfig(["--calibrate", "--only", "group-sum-qty"], {
      EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: fakeJudge,
    })
    config.judge.env = { OPENAI_API_KEY: canary, CODEX_HOME: path.join(root, "private-judge") }
    await mkdir(path.join(root, "corpus"))
    const result = await calibrate(config, path.join(root, "corpus"))
    expect(result.code).toBe(0)
    const saved = await Bun.file(path.join(result.runDir, "config.json")).text()
    expect(saved).not.toContain(canary)
    expect(JSON.parse(saved).judge.env.OPENAI_API_KEY).toBe("<set>")
    expect(config.judge.env.OPENAI_API_KEY).toBe(canary)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("calibrate uses the configured private judge home for version and execution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-calibrate-home-"))
  try {
    const config: EvalConfig = loadConfig(["--calibrate", "--only", "group-sum-qty"], {
      EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake",
      EVAL_JUDGE_COMMAND: `${fakeJudge} --version-home-file ${path.join(root, "version.json")} --gate-log ${path.join(root, "judge.jsonl")}`,
    })
    config.judge.env = { CODEX_HOME: path.join(root, "private-judge") }
    await mkdir(path.join(root, "corpus"))
    expect((await calibrate(config, path.join(root, "corpus"))).code).toBe(0)
    expect((await Bun.file(path.join(root, "version.json")).json()).codexHome).toBe(config.judge.env.CODEX_HOME)
    const rows = (await Bun.file(path.join(root, "judge.jsonl")).text()).trim().split("\n").map(line => JSON.parse(line))
    expect(rows.map(row => row.kind)).toEqual(["start", "end"])
    expect(rows.map(row => row.codexHome)).toEqual([config.judge.env.CODEX_HOME, config.judge.env.CODEX_HOME])
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("--calibrate: совпавшее время не перезаписывает прежнюю калибровку", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "evals-calibration-collision-"))
  try {
    const now = Date.now()
    const previous = Array.from({ length: 41 }, (_, index) => path.join(directory, "results",
      `${stamp(new Date(now + (index - 20) * 1000))}-calibrate`))
    await Promise.all(previous.map(async (dir) => {
      await mkdir(dir, { recursive: true })
      await Bun.write(path.join(dir, "config.json"), "previous config")
      await Bun.write(path.join(dir, "calibration.json"), "previous calibration")
    }))
    const result = await main(["--calibrate", "--only", "group-sum-qty"], {
      JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: fakeJudge, EVAL_RESULTS_DIR: path.join(directory, "results"),
    })
    expect(result.code).toBe(0)
    expect(previous).not.toContain(result.runDir)
    expect((await Bun.file(path.join(result.runDir, "calibration.json")).json()).run_id).toBe(path.basename(result.runDir))
    await Promise.all(previous.map(async (dir) => {
      expect(await Bun.file(path.join(dir, "config.json")).text()).toBe("previous config")
      expect(await Bun.file(path.join(dir, "calibration.json")).text()).toBe("previous calibration")
    }))
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 30_000)

test("--calibrate: выполненные пороги оставляют нулевой код", async () => {
  const originalModel = process.env.JUDGE_MODEL
  const originalCommand = process.env.EVAL_JUDGE_COMMAND
  process.env.JUDGE_MODEL = "fake"
  process.env.EVAL_JUDGE_COMMAND = fakeJudge
  let runDir: string | undefined
  try {
    const result = await main(["--calibrate", "--only", "group-sum-qty"])
    runDir = result.runDir
    expect(result.code).toBe(0)
    expect((await Bun.file(path.join(result.runDir, "calibration.json")).json()).warnings).toEqual([])
  } finally {
    if (originalModel === undefined) delete process.env.JUDGE_MODEL
    else process.env.JUDGE_MODEL = originalModel
    if (originalCommand === undefined) delete process.env.EVAL_JUDGE_COMMAND
    else process.env.EVAL_JUDGE_COMMAND = originalCommand
    if (runDir) await rm(runDir, { recursive: true, force: true })
  }
})

test("--calibrate: positive/negative для каждой задачи, предупреждение когда negative слишком высок", async () => {
  const originalModel = process.env.JUDGE_MODEL
  const originalCommand = process.env.EVAL_JUDGE_COMMAND
  const originalVerdict = process.env.FAKE_CODEX_VERDICT
  const originalExit = process.env.FAKE_CODEX_EXIT
  const originalFlaky = process.env.FAKE_CODEX_FLAKY_MARKER
  process.env.JUDGE_MODEL = "fake"
  process.env.EVAL_JUDGE_COMMAND = fakeJudge
  delete process.env.FAKE_CODEX_VERDICT
  delete process.env.FAKE_CODEX_EXIT
  delete process.env.FAKE_CODEX_FLAKY_MARKER
  let runDir: string | undefined
  try {
    const result = await main(["--calibrate"])
    runDir = result.runDir
    expect(result.code).toBe(1)
    const calibration = await Bun.file(path.join(result.runDir, "calibration.json")).json()
    expect(calibration.rows).toHaveLength(6)
    expect(calibration.rows.filter((row: { kind: string }) => row.kind === "positive").every((row: { score: number }) => row.score === 100)).toBe(true)
    // fake-судья ставит 100 всем, поэтому negative выше порога 40 — три предупреждения
    expect(calibration.warnings).toHaveLength(3)
    expect(await Bun.file(path.join(result.runDir, "calibration.md")).exists()).toBe(true)
    expect(await Bun.file(path.join(result.runDir, "summary.json")).exists()).toBe(false)
    const checklist = await Bun.file(path.join(result.runDir, "group-sum-qty", "positive", "judge", "checklist.json")).json()
    expect(checklist).not.toContainEqual(expect.objectContaining({ id: "result-rows" }))
    expect(checklist).not.toContainEqual(expect.objectContaining({ id: "honest-report" }))
  } finally {
    if (originalModel === undefined) delete process.env.JUDGE_MODEL
    else process.env.JUDGE_MODEL = originalModel
    if (originalCommand === undefined) delete process.env.EVAL_JUDGE_COMMAND
    else process.env.EVAL_JUDGE_COMMAND = originalCommand
    if (originalVerdict === undefined) delete process.env.FAKE_CODEX_VERDICT
    else process.env.FAKE_CODEX_VERDICT = originalVerdict
    if (originalExit === undefined) delete process.env.FAKE_CODEX_EXIT
    else process.env.FAKE_CODEX_EXIT = originalExit
    if (originalFlaky === undefined) delete process.env.FAKE_CODEX_FLAKY_MARKER
    else process.env.FAKE_CODEX_FLAKY_MARKER = originalFlaky
    if (runDir) await rm(runDir, { recursive: true, force: true })
  }
}, 120_000)

test("--calibrate: сбой судьи сохраняет диагностику и возвращает ненулевой код", async () => {
  const originalModel = process.env.JUDGE_MODEL
  const originalCommand = process.env.EVAL_JUDGE_COMMAND
  const originalVerdict = process.env.FAKE_CODEX_VERDICT
  const originalExit = process.env.FAKE_CODEX_EXIT
  const originalFlaky = process.env.FAKE_CODEX_FLAKY_MARKER
  process.env.JUDGE_MODEL = "fake"
  process.env.EVAL_JUDGE_COMMAND = fakeJudge
  delete process.env.FAKE_CODEX_VERDICT
  delete process.env.FAKE_CODEX_EXIT
  delete process.env.FAKE_CODEX_FLAKY_MARKER
  const tasksDir = await mkdtemp(path.join(os.tmpdir(), "evals-calibrate-bad-ref-"))
  let runDir: string | undefined
  try {
    await cp(path.join(evalsRoot, "tasks"), tasksDir, { recursive: true })
    await cp(path.join(evalsRoot, "fixtures", "storage", "not-a-package.lgp"), path.join(tasksDir, "group-sum-qty", "reference.lgp"))
    const result = await main(["--calibrate", "--tasks", tasksDir])
    runDir = result.runDir
    expect(result.code).toBe(1)
    const calibration = await Bun.file(path.join(result.runDir, "calibration.json")).json()
    const row = calibration.rows.find((item: { task: string; kind: string }) => item.task === "group-sum-qty" && item.kind === "positive")
    expect(row).toMatchObject({ score: null })
    expect(row.error).toBeTruthy()
    expect(row.error).toContain("group-sum-qty")
    expect(calibration.warnings.some((warning: string) => warning.includes("group-sum-qty"))).toBe(true)
  } finally {
    if (originalModel === undefined) delete process.env.JUDGE_MODEL
    else process.env.JUDGE_MODEL = originalModel
    if (originalCommand === undefined) delete process.env.EVAL_JUDGE_COMMAND
    else process.env.EVAL_JUDGE_COMMAND = originalCommand
    if (originalVerdict === undefined) delete process.env.FAKE_CODEX_VERDICT
    else process.env.FAKE_CODEX_VERDICT = originalVerdict
    if (originalExit === undefined) delete process.env.FAKE_CODEX_EXIT
    else process.env.FAKE_CODEX_EXIT = originalExit
    if (originalFlaky === undefined) delete process.env.FAKE_CODEX_FLAKY_MARKER
    else process.env.FAKE_CODEX_FLAKY_MARKER = originalFlaky
    if (runDir) await rm(runDir, { recursive: true, force: true })
    await rm(tasksDir, { recursive: true, force: true })
  }
}, 120_000)
