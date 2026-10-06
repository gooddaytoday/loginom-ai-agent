import { expect, test } from "bun:test"
import { watch } from "node:fs"
import { cp, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { evalsRoot } from "../src/config"
import { compare } from "../src/compare"
import { parseComparisonSummary } from "../src/compare-analysis"
import { main } from "../src/run"
import type { RunSummary } from "../src/report"

async function fixture(ids: string[]) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "evals-infra-retry-"))
  const profile = path.join(directory, "profile")
  const tasks = path.join(directory, "tasks")
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ status: "ok", result: { revision: "fixture" } }) })
  for (const id of ids) {
    await cp(path.join(evalsRoot, "tasks/group-sum-qty"), path.join(tasks, id), { recursive: true })
    const file = path.join(tasks, id, "task.json")
    await Bun.write(file, JSON.stringify({ ...await Bun.file(file).json(), id }))
  }
  const env = {
    EVAL_CLI_MODE: "fake", EVAL_AGENT_MODEL: "fake/model", EVAL_PROFILE_DIR: profile,
    EVAL_RESULTS_DIR: path.join(directory, "results"), EVAL_WORKSPACE_ROOT: path.join(directory, "workspace"),
    EVAL_ARTIFACT_SOURCE: `dir:${path.join(evalsRoot, "fixtures/storage")}`, LOGINOM_DOCK_API_KEY: "fixture-key",
    LOGINOM_URL: `http://127.0.0.1:${server.port}`, LOGINOM_DOCK_BASE_URL: `http://127.0.0.1:${server.port}`,
    EVAL_AGENT_PROVIDER_ID: "fake", EVAL_AGENT_PROVIDER_BASE_URL: "http://fixture", EVAL_AGENT_PROVIDER_API_KEY: "fixture-provider",
    EVAL_AGENT_PROVIDER_MODEL_ID: "model",
  }
  return { directory, profile, tasks, env, async close() {
    server.stop(true)
    await rm(directory, { recursive: true, force: true })
  } }
}

async function waitForFile(directory: string, pattern: string) {
  const until = Date.now() + 10_000
  while (Date.now() < until) {
    const files = await Array.fromAsync(new Bun.Glob(pattern).scan({ cwd: directory, absolute: true }))
    if (files[0]) return files[0]
    await Bun.sleep(10)
  }
  throw Error(`Fixture did not create ${pattern}`)
}

test("main: один startup timeout повторяется после cleanup и даёт одну quality-попытку", async () => {
  const id = "infra-retry-success"
  const context = await fixture([id])
  try {
    const run = await main(["--skip-judge", "--tasks", context.tasks], context.env)
    expect(run.code).toBe(0)
    const summary = await Bun.file(path.join(run.runDir, "summary.json")).json() as RunSummary
    expect(summary.metrics).toMatchObject({ total: 1, completed: 1, completion_rate: 1, infra_error_count: 1,
      environment_cleanup_checked_count: 2, environment_cleanup_error_count: 0 })
    expect(summary.tasks[0]!.attempts).toHaveLength(1)
    const result = summary.tasks[0]!.attempts[0]!
    expect(result).toMatchObject({ attempt: 1, status: "completed", session_id: "ses_fixture01",
      environment_cleanup: { status: "confirmed" }, infra_retry: { initial: { attempt: 1, status: "infra_error",
        session_id: null, score: null, pass: null, profile_recovered: true,
        environment_cleanup: { status: "confirmed" } } } })
    const out = path.join(run.runDir, id, "1")
    expect(await Bun.file(path.join(out, "result.json")).json()).toEqual(result)
    expect(await Bun.file(path.join(out, "infra-error/result.json")).json()).toEqual(result.infra_retry!.initial)
    expect(await Bun.file(path.join(out, "infra-error/stderr.txt")).text()).toBe("LOGINOM_HOST_TIMEOUT\n")
    expect(await Bun.file(path.join(out, "artifact/package.lgp")).exists()).toBe(true)
    expect(await Bun.file(path.join(out, "prompt.txt")).text()).toBe(await Bun.file(path.join(out, "infra-error/prompt.txt")).text())
    expect(await Bun.file(path.join(context.profile, ".writer/owner")).exists()).toBe(false)
    expect(await Bun.file(path.join(context.directory, "workspace", summary.run_id, id, "1/fake-launches.json")).json()).toBe(2)
    expect(await Bun.file(path.join(run.runDir, "report.md")).text()).toContain("infra_error")
  } finally { await context.close() }
}, 30_000)

test("main: отказ архива исходного infra_error запрещает повтор и сохраняет результат", async () => {
  const id = "infra-retry-success"
  const context = await fixture([id, "z-next"])
  try {
    const running = main(["--skip-judge", "--tasks", context.tasks], context.env)
    const prompt = await waitForFile(context.directory, `results/*/${id}/1/prompt.txt`)
    await Bun.write(path.join(path.dirname(prompt), "infra-error"), "fixture archive collision")
    const run = await running
    const summary = await Bun.file(path.join(run.runDir, "summary.json")).json() as RunSummary
    expect(run.code).toBe(1)
    expect(summary.stopped_reason).toContain("EEXIST")
    expect(summary.tasks[0]!.attempts[0]).toMatchObject({ status: "infra_error", environment_cleanup: { status: "failed" } })
    expect(summary.tasks[1]!.attempts).toEqual([])
    expect(await Bun.file(path.join(run.runDir, id, "1/result.json")).json()).toEqual(summary.tasks[0]!.attempts[0])
    expect(await Bun.file(path.join(context.directory, "workspace", summary.run_id, id, "1/fake-launches.json")).json()).toBe(1)
  } finally { await context.close() }
}, 30_000)

test("CLI SIGINT во время cleanup первого infra_error запрещает повтор", async () => {
  const id = "infra-retry-success"
  const context = await fixture([id])
  const child = Bun.spawn([process.execPath, path.join(evalsRoot, "src/run.ts"), "--skip-judge", "--tasks", context.tasks], {
    env: { PATH: process.env.PATH, ...context.env }, stdout: "pipe", stderr: "pipe",
  })
  try {
    const result = await waitForFile(context.directory, `results/*/${id}/1/result.json`)
    child.kill("SIGINT")
    expect(await child.exited).toBe(0)
    const runDir = path.resolve(path.dirname(result), "../..")
    const summary = await Bun.file(path.join(runDir, "summary.json")).json() as RunSummary
    expect(summary.interrupted).toBe(true)
    expect(summary.tasks[0]!.attempts[0]).toMatchObject({ status: "infra_error", environment_cleanup: { status: "confirmed" } })
    expect(summary.tasks[0]!.attempts[0]!.infra_retry).toBeUndefined()
    expect(await Bun.file(path.join(context.directory, "workspace", summary.run_id, id, "1/fake-launches.json")).json()).toBe(1)
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL")
    await child.exited
    await context.close()
  }
}, 30_000)

test("CLI SIGINT во время архива infra_error сохраняет корневой result.json", async () => {
  const id = "infra-retry-success"
  const context = await fixture([id])
  const child = Bun.spawn([process.execPath, path.join(evalsRoot, "src/run.ts"), "--skip-judge", "--tasks", context.tasks], {
    env: { PATH: process.env.PATH, ...context.env }, stdout: "pipe", stderr: "pipe",
  })
  const watcher = { close() {} }
  const signal = { sent: false }
  try {
    const out = path.dirname(await waitForFile(context.directory, `results/*/${id}/1/prompt.txt`))
    // Реальные файлы удерживают архивирование открытым до доставки SIGINT.
    await Promise.all(Array.from({ length: 2000 }, (_, i) => Bun.write(path.join(out, `archive-${i}.txt`), "fixture")))
    const observed = watch(out, (_, file) => {
      if (file !== "infra-error" || signal.sent) return
      signal.sent = true
      child.kill("SIGINT")
    })
    watcher.close = () => observed.close()
    expect(await child.exited).toBe(0)
    const summary = await Bun.file(path.resolve(out, "../../summary.json")).json() as RunSummary
    expect(signal.sent).toBe(true)
    expect(summary.interrupted).toBe(true)
    const result = summary.tasks[0]!.attempts[0]!
    expect(result).toMatchObject({ status: "infra_error", environment_cleanup: { status: "confirmed" } })
    expect(result.infra_retry).toBeUndefined()
    expect(await Bun.file(path.join(out, "result.json")).json()).toEqual(result)
    expect(await Bun.file(path.join(out, "infra-error/result.json")).json()).toEqual(result)
    expect(await Bun.file(path.join(context.directory, "workspace", summary.run_id, id, "1/fake-launches.json")).json()).toBe(1)
  } finally {
    watcher.close()
    if (child.exitCode === null) child.kill("SIGKILL")
    await child.exited
    await context.close()
  }
}, 30_000)

test("main: retry сохраняет round-robin и номера обычных repeat, compare видит только итог", async () => {
  const context = await fixture(["infra-retry-success", "z-next"])
  try {
    const run = await main(["--skip-judge", "--tasks", context.tasks, "--repeat", "2"], context.env)
    const summary = parseComparisonSummary(await Bun.file(path.join(run.runDir, "summary.json")).json())
    expect(run.code).toBe(0)
    expect(summary.metrics).toMatchObject({ total: 4, completed: 2, infra_error_count: 2, completion_rate: 0.5 })
    expect(summary.tasks[0]!.attempts.map((item) => [item.attempt, item.status])).toEqual([[1, "completed"], [2, "completed"]])
    expect(summary.tasks[1]!.attempts.map((item) => [item.attempt, item.status, item.infra_retry])).toEqual([[1, "no_artifact", undefined], [2, "no_artifact", undefined]])
    for (const attempt of [1, 2]) {
      expect(await Bun.file(path.join(context.directory, "workspace", summary.run_id, "infra-retry-success", String(attempt), "fake-launches.json")).json()).toBe(2)
    }
    expect(compare(summary, summary)).toContain("Попыток: 4 → 4")
    expect(compare(summary, summary)).not.toContain("неполное покрытие")
  } finally { await context.close() }
}, 30_000)

test("main и judge-only: quality считается по повтору, исходный infra_error сохраняется", async () => {
  const id = "infra-retry-success"
  const context = await fixture([id])
  const env = { ...context.env, JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: `bun ${path.join(evalsRoot, "fixtures/fake-codex.ts")}` }
  try {
    const run = await main(["--tasks", context.tasks], env)
    const original = await Bun.file(path.join(run.runDir, "summary.json")).json() as RunSummary
    expect(original.metrics).toMatchObject({ total: 1, completed: 1, mean_score: 100, pass_rate: 1, scored_count: 1, infra_error_count: 1 })
    const out = path.join(run.runDir, id, "1")
    const initial = await Bun.file(path.join(out, "infra-error/result.json")).text()
    expect(await Bun.file(path.join(out, "infra-error/judge/verdict.json")).exists()).toBe(false)
    const rejudged = await main(["--judge-only", original.run_id], env)
    expect(rejudged.code).toBe(0)
    const summary = parseComparisonSummary(await Bun.file(path.join(run.runDir, "summary.json")).json())
    expect(summary.metrics).toMatchObject({ total: 1, completed: 1, mean_score: 100, pass_rate: 1, infra_error_count: 1,
      environment_cleanup_checked_count: 2 })
    expect(summary.tasks[0]!.attempts[0]!.infra_retry).toEqual(original.tasks[0]!.attempts[0]!.infra_retry)
    expect(await Bun.file(path.join(out, "infra-error/result.json")).text()).toBe(initial)
    expect(await Bun.file(path.join(out, "result.json")).json()).toEqual(summary.tasks[0]!.attempts[0])
    expect(compare(original, summary)).toContain("Попыток: 1 → 1")
  } finally { await context.close() }
}, 30_000)

for (const [suffix, status] of [["no-artifact", "no_artifact"], ["failed", "failed"], ["harness-error", "harness_error"]] as const) {
  test(`main: повтор с ${status} сохраняет исходный infra_error и не запускается снова`, async () => {
    const id = `infra-retry-${suffix}`
    const context = await fixture([id])
    try {
      const run = await main(["--skip-judge", "--tasks", context.tasks], context.env)
      const summary = await Bun.file(path.join(run.runDir, "summary.json")).json() as RunSummary
      expect(run.code).toBe(status === "harness_error" ? 1 : 0)
      const result = summary.tasks[0]!.attempts[0]!
      expect(result).toMatchObject({ status, infra_retry: { initial: { status: "infra_error" } } })
      expect(summary.metrics).toMatchObject({ total: status === "harness_error" ? 0 : 1, completed: 0, infra_error_count: 1 })
      expect(await Bun.file(path.join(context.directory, "workspace", summary.run_id, id, "1/fake-launches.json")).json()).toBe(2)
      expect(await Bun.file(path.join(run.runDir, id, "1/result.json")).json()).toEqual(result)
    } finally { await context.close() }
  }, 30_000)
}

test("main: failed cleanup после infra_error запрещает повтор и следующую задачу", async () => {
  const id = "infra-retry-cleanup-failure"
  const context = await fixture([id, "z-next"])
  try {
    const run = await main(["--skip-judge", "--tasks", context.tasks], context.env)
    const summary = await Bun.file(path.join(run.runDir, "summary.json")).json() as RunSummary
    expect(run.code).toBe(1)
    expect(summary.stopped_reason).not.toBeNull()
    const result = summary.tasks[0]!.attempts[0]!
    expect(result).toMatchObject({ status: "infra_error", environment_cleanup: { status: "failed" } })
    expect(result.infra_retry).toBeUndefined()
    expect(summary.metrics).toMatchObject({ total: 0, infra_error_count: 1, environment_cleanup_error_count: 1 })
    expect(summary.tasks[1]!.attempts).toEqual([])
    expect(await Bun.file(path.join(context.directory, "workspace", summary.run_id, id, "1/fake-launches.json")).json()).toBe(1)
    expect(await Bun.file(path.join(context.profile, ".writer/owner")).text()).toBe("replacement")
    expect(await Bun.file(path.join(run.runDir, id, "1/result.json")).json()).toEqual(result)
  } finally { await context.close() }
}, 30_000)

test("main: два startup timeout дают infra_error_count 2 без третьего запуска", async () => {
  const id = "infra-retry-twice"
  const context = await fixture([id])
  try {
    const run = await main(["--skip-judge", "--tasks", context.tasks], context.env)
    const summary = await Bun.file(path.join(run.runDir, "summary.json")).json() as RunSummary
    expect(run.code).toBe(0)
    expect(summary.metrics).toMatchObject({ total: 0, completed: 0, completion_rate: null, mean_score: null,
      pass_rate: null, infra_error_count: 2, environment_cleanup_checked_count: 2 })
    const result = summary.tasks[0]!.attempts[0]!
    expect(result).toMatchObject({ attempt: 1, status: "infra_error", session_id: null, score: null, pass: null,
      infra_retry: { initial: { attempt: 1, status: "infra_error", session_id: null, score: null, pass: null } } })
    expect(summary.tasks[0]!.attempts).toHaveLength(1)
    expect(await Bun.file(path.join(run.runDir, id, "1/result.json")).json()).toEqual(result)
    expect(await Bun.file(path.join(context.directory, "workspace", summary.run_id, id, "1/fake-launches.json")).json()).toBe(2)
    expect(summary.metrics.total_duration_ms).toBe(result.duration_ms + result.infra_retry!.initial.duration_ms)
    expect(await Bun.file(path.join(run.runDir, "report.md")).text()).toContain("1 (повтор) | infra_error")
  } finally { await context.close() }
}, 30_000)
