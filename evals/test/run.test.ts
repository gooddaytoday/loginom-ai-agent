import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import { parseArtifactSource } from "../src/artifact"
import { agentCommand } from "../src/cli"
import { evalsRoot, loadConfig } from "../src/config"
import { afterAttempt, main, redact, runAttempt, stamp } from "../src/run"
import type { RunSummary } from "../src/report"
import { loadTasks } from "../src/task"

test("main --dry-run --repeat 2: статусы по фикстурам, попытки в подпапках, summary без судьи", async () => {
  const result = await main(["--dry-run", "--repeat", "2", "--label", "dry"])
  const runDir = result.runDir
  try {
    expect(result.code).toBe(0)
    const summary = (await Bun.file(path.join(runDir!, "summary.json")).json()) as RunSummary
    expect(summary.label).toBe("dry")
    expect(summary.config.repeat).toBe(2)
    expect(summary.metrics.total).toBe(6)
    expect(summary.metrics.completed).toBe(2)
    expect(summary.metrics.mean_score).toBeNull()
    expect(summary.judge).toBeNull()
    const byTask = Object.fromEntries(summary.tasks.map((task) => [task.id, task]))
    const attempts = byTask["group-sum-qty"]!.attempts
    expect(attempts.map((item) => item.status)).toEqual(["completed", "completed"])
    expect(attempts[0]!.artifact_origin).toBe("receipt")
    expect(attempts[0]!.judge_status).toBe("skipped")
    expect(Object.keys(attempts[0]!).includes("stop")).toBe(false)
    expect(byTask["filter-active-rows"]!.attempts[0]).toMatchObject({ status: "failed", exit_code: 1, failure_kind: "tool", score: null, judge_status: "skipped" })
    expect(byTask["calc-data-double"]!.attempts[0]).toMatchObject({ status: "no_artifact", score: null, pass: null, judge_status: "skipped" })
    expect(await Bun.file(path.join(runDir!, "group-sum-qty", "2", "artifact", "package.lgp")).exists()).toBe(true)
    expect(await Bun.file(path.join(runDir!, "group-sum-qty", "1", "prompt.txt")).text()).toContain("Сохрани готовый пакет как")
    expect(await Bun.file(path.join(runDir!, "report.md")).exists()).toBe(true)
    const config = await Bun.file(path.join(runDir!, "config.json")).json()
    expect(config.dock.apiKey).toBe("<unset>")
  } finally {
    if (runDir) await rm(runDir, { recursive: true, force: true })
  }
}, 60_000)

test("stamp: YYYYMMDD-HHmmss", () => {
  expect(stamp(new Date("2026-09-18T12:34:56.789Z"))).toBe("20260918-123456")
})

test("main --dry-run --only: подмножество задач", async () => {
  const result = await main(["--dry-run", "--only", "group-sum-qty", "--repeat", "1"])
  try {
    const summary = (await Bun.file(path.join(result.runDir!, "summary.json")).json()) as RunSummary
    expect(summary.task_ids).toEqual(["group-sum-qty"])
    expect(summary.metrics.total).toBe(1)
  } finally {
    if (result.runDir) await rm(result.runDir, { recursive: true, force: true })
  }
}, 30_000)

test("redact: password, dock.apiKey и provider.apiKey не попадают в JSON", () => {
  const loaded = loadConfig([], {
    LOGINOM_DOCK_API_KEY: "dock-env",
    EVAL_AGENT_MODEL: "openai/gpt-5.6-sol",
    JUDGE_MODEL: "gpt-6-astra",
    EVAL_AGENT_PROVIDER_ID: "prov",
    EVAL_AGENT_PROVIDER_BASE_URL: "https://example.test",
    EVAL_AGENT_PROVIDER_API_KEY: "prov-env",
    EVAL_AGENT_PROVIDER_MODEL_ID: "model-1",
  })
  const cfg = {
    ...loaded,
    loginom: { ...loaded.loginom, password: "pw-secret" },
    dock: { ...loaded.dock, apiKey: "dock-secret" },
    agent: {
      ...loaded.agent,
      provider: { id: "prov", baseUrl: "https://example.test", apiKey: "prov-secret", modelId: "model-1" },
    },
  }
  const text = JSON.stringify(redact(cfg))
  expect(text).not.toContain("pw-secret")
  expect(text).not.toContain("dock-secret")
  expect(text).not.toContain("prov-secret")
  expect(redact(cfg).loginom.password).toBe("<set>")
  expect(redact(cfg).dock.apiKey).toBe("<set>")
  expect(redact(cfg).agent.provider?.apiKey).toBe("<set>")
})

test("main --dry-run: exit 2 останавливает прогон с CLI exit в stopped_reason", async () => {
  const tasksDir = await mkdtemp(path.join(os.tmpdir(), "evals-stop-tasks-"))
  let runDir: string | null = null
  try {
    await cp(path.join(evalsRoot, "tasks", "group-sum-qty"), path.join(tasksDir, "stop-case"), { recursive: true })
    const raw = (await Bun.file(path.join(tasksDir, "stop-case", "task.json")).json()) as { id: string }
    await Bun.write(path.join(tasksDir, "stop-case", "task.json"), `${JSON.stringify({ ...raw, id: "stop-case" }, null, 2)}\n`)
    await cp(path.join(evalsRoot, "tasks", "calc-data-double"), path.join(tasksDir, "calc-data-double"), { recursive: true })
    const result = await main(["--dry-run", "--tasks", tasksDir, "--repeat", "2"])
    runDir = result.runDir
    expect(result.code).toBe(1)
    const summary = (await Bun.file(path.join(result.runDir!, "summary.json")).json()) as RunSummary
    expect(summary.stopped_reason?.startsWith("CLI exit 2")).toBe(true)
    const stopCase = summary.tasks.find((task) => task.id === "stop-case")
    expect(stopCase?.attempts[0]?.status).toBe("harness_error")
    expect(stopCase?.attempts[0]?.harness_error).not.toBeNull()
    expect(summary.tasks.reduce((count, task) => count + task.attempts.length, 0)).toBeLessThan(4)
  } finally {
    if (runDir) await rm(runDir, { recursive: true, force: true })
    await rm(tasksDir, { recursive: true, force: true })
  }
}, 30_000)

test("runAttempt: ошибка артефакта сохраняет телеметрию и пишет result.json", async () => {
  const loaded = loadConfig(["--dry-run"], {})
  const config = { ...loaded, artifactSource: "dir:/nonexistent/xyz" }
  const [task] = await loadTasks(config.tasksDir, ["group-sum-qty"])
  const runDir = await mkdtemp(path.join(os.tmpdir(), "evals-artifact-"))
  try {
    const { result } = await runAttempt({
      config,
      command: agentCommand(config),
      source: parseArtifactSource(config.artifactSource, config.loginom),
      task: task!,
      attempt: 1,
      runId: "artifact-error",
      runDir,
      signal: new AbortController().signal,
      profileRecovered: false,
      skipJudge: true,
})

    expect(result.status).toBe("harness_error")
    expect(result.harness_error).toMatch(/ENOENT|\/nonexistent\/xyz/)
    expect(result.cost).toBeGreaterThan(0)
    expect(result.exit_code).toBe(0)
    expect(await Bun.file(path.join(runDir, "group-sum-qty", "1", "result.json")).exists()).toBe(true)
  } finally {
    await rm(runDir, { recursive: true, force: true })
  }
}, 30_000)

test("runAttempt: сбой подготовки судьи сохраняет телеметрию и judge_status=error", async () => {
  const tasksDir = await mkdtemp(path.join(os.tmpdir(), "evals-judge-fail-tasks-"))
  const runDir = await mkdtemp(path.join(os.tmpdir(), "evals-judge-fail-"))
  try {
    await cp(path.join(evalsRoot, "tasks", "group-sum-qty"), path.join(tasksDir, "group-sum-qty"), { recursive: true })
    await cp(path.join(evalsRoot, "fixtures", "storage", "not-a-package.lgp"), path.join(tasksDir, "group-sum-qty", "reference.lgp"))
    const [task] = await loadTasks(tasksDir)
    const config = { ...loadConfig(["--dry-run"], {}), skipJudge: false }
    const { result } = await runAttempt({
      config,
      command: agentCommand(config),
      source: parseArtifactSource(config.artifactSource, config.loginom),
      task: task!,
      attempt: 1,
      runId: "bad-ref",
      runDir,
      signal: new AbortController().signal,
      profileRecovered: false,
      skipJudge: false,
      judge: {
        command: ["bun", path.join(evalsRoot, "fixtures", "fake-codex.ts")],
        model: "fake",
        reasoning: "high",
        timeoutMs: 30_000,
        passThreshold: 70,
      },
    })
    expect(result.status).toBe("completed")
    expect(result.judge_status).toBe("error")
    expect(result.judge_summary).toContain(task!.id)
    expect(result.exit_code).toBe(0)
    expect(result.cost).toBeGreaterThan(0)
  } finally {
    await rm(runDir, { recursive: true, force: true })
    await rm(tasksDir, { recursive: true, force: true })
  }
}, 60_000)

test("runAttempt: no_artifact при включённом судье даёт score 0 и judge_status=no_artifact", async () => {
  const config = loadConfig(["--dry-run"], {})
  const [task] = await loadTasks(config.tasksDir, ["calc-data-double"])
  const runDir = await mkdtemp(path.join(os.tmpdir(), "evals-no-artifact-"))
  try {
    const { result } = await runAttempt({
      config,
      command: agentCommand(config),
      source: parseArtifactSource(config.artifactSource, config.loginom),
      task: task!,
      attempt: 1,
      runId: "no-artifact",
      runDir,
      signal: new AbortController().signal,
      profileRecovered: false,
      skipJudge: false,
      judge: {
        command: ["bun", path.join(evalsRoot, "fixtures", "fake-codex.ts")],
        model: "fake",
        reasoning: "high",
        timeoutMs: 30_000,
        passThreshold: 70,
      },
    })
    expect(result.status).toBe("no_artifact")
    expect(result.score).toBe(0)
    expect(result.pass).toBe(false)
    expect(result.judge_status).toBe("no_artifact")
    expect(result.judge_attempts).toBe(0)
    expect((await readdir(path.join(runDir, "calc-data-double", "1"))).includes("judge")).toBe(false)
  } finally {
    await rm(runDir, { recursive: true, force: true })
  }
}, 60_000)

test("runAttempt: с судьёй completed получает score и judge_status=scored", async () => {
  const config = { ...loadConfig(["--dry-run"], {}), skipJudge: false }
  const [task] = await loadTasks(config.tasksDir, ["group-sum-qty"])
  const runDir = await mkdtemp(path.join(os.tmpdir(), "evals-run-"))
  try {
    const { result } = await runAttempt({
      config,
      command: agentCommand(config),
      source: parseArtifactSource(config.artifactSource, config.loginom),
      task: task!,
      attempt: 1,
      runId: "test-run",
      runDir,
      signal: new AbortController().signal,
      profileRecovered: false,
      skipJudge: false,
      judge: { command: ["bun", path.join(evalsRoot, "fixtures", "fake-codex.ts")], model: "fake", reasoning: "high", timeoutMs: 30_000, passThreshold: 70 },
    })
    expect(result).toMatchObject({ status: "completed", score: 100, pass: true, judge_status: "scored", judge_attempts: 1, judge_confidence: "high" })
    expect(result.checklist?.length).toBe(7)
    expect(await Bun.file(path.join(runDir, "group-sum-qty", "1", "judge", "verdict.json")).exists()).toBe(true)
  } finally {
    await rm(runDir, { recursive: true, force: true })
  }
}, 60_000)


test("runAttempt: стартовый timeout host сохраняется без score и поиска артефакта", async () => {
  const config = loadConfig(["--dry-run"], {})
  const [task] = await loadTasks(config.tasksDir, ["group-sum-qty"])
  const runDir = await mkdtemp(path.join(os.tmpdir(), "evals-infra-"))
  try {
    const { result } = await runAttempt({ config, command: agentCommand(config),
      source: { kind: "dir", dir: "/nonexistent/infra" }, task: { ...task!, id: "host-timeout" },
      attempt: 1, runId: "infra", runDir, signal: new AbortController().signal,
      profileRecovered: false, skipJudge: false })
    expect(result).toMatchObject({ status: "infra_error", session_id: null,
      score: null, pass: null, judge_status: "skipped", stderr_head: "LOGINOM_HOST_TIMEOUT\n" })
    expect(await Bun.file(path.join(runDir, "host-timeout", "1", "result.json")).exists()).toBe(true)
  } finally { await rm(runDir, { recursive: true, force: true }) }
})

test("afterAttempt: exit 1 со stale writer восстанавливает профиль до следующей попытки", async () => {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "evals-stale-"))
  const runDir = await mkdtemp(path.join(os.tmpdir(), "evals-stale-run-"))
  const config = { ...loadConfig(["--dry-run"], {}), profileDir }
  const command = agentCommand(config)
  const [task] = await loadTasks(config.tasksDir, ["group-sum-qty"])
  try {
    const { result } = await runAttempt({ config, command,
      source: { kind: "dir", dir: "/nonexistent/infra" }, task: { ...task!, id: "host-timeout" },
      attempt: 1, runId: "infra", runDir, signal: new AbortController().signal,
      profileRecovered: false, skipJudge: false })
    await mkdir(path.join(profileDir, ".writer"))
    await Bun.write(path.join(profileDir, ".writer", "owner"), "stale")
    const diagnostic = path.join(profileDir, "loginom", "runtime", "generations", "1", "chats", "old", "attempts", "one", "execution-events.jsonl")
    await Bun.write(diagnostic, "diagnostic")
    const recovery = await afterAttempt(config, { ...command, env: { ...command.env, EVAL_FAKE_ENFORCE_WRITER: "1" } }, result)
    expect(recovery).toMatchObject({ recovered: true })
    expect(result.profile_recovered).toBe(true)
    expect(await Bun.file(path.join(profileDir, ".writer", "owner")).exists()).toBe(false)
    expect(await Bun.file(diagnostic).exists()).toBe(false)
  } finally {
    await rm(profileDir, { recursive: true, force: true })
    await rm(runDir, { recursive: true, force: true })
  }
})

test("main: summary фиксирует переданный variant и эффективный лимит задачи", async () => {
  const tasksDir = await mkdtemp(path.join(os.tmpdir(), "evals-metadata-"))
  let runDir: string | undefined
  try {
    await cp(path.join(evalsRoot, "tasks", "group-sum-qty"), path.join(tasksDir, "group-sum-qty"), { recursive: true })
    const file = path.join(tasksDir, "group-sum-qty", "task.json")
    await Bun.write(file, JSON.stringify({ ...await Bun.file(file).json(), timeout_ms: 123456 }))
    const run = await main(["--dry-run", "--tasks", tasksDir])
    runDir = run.runDir
    const summary = await Bun.file(path.join(runDir, "summary.json")).json()
    expect(summary.agent.variant).toBe(loadConfig(["--dry-run"]).agent.variant)
    expect(summary.config.task_timeout_ms).toEqual({ "group-sum-qty": 123456 })
    expect(summary.config.tasks_dir).toBe(tasksDir)
    expect(summary.harness.git_sha).toBeDefined()
  } finally {
    if (runDir) await rm(runDir, { recursive: true, force: true })
    await rm(tasksDir, { recursive: true, force: true })
  }
})

test("runAttempt: отсутствие артефакта проваливает обязательную oracle-ось", async () => {
  const config = loadConfig(["--dry-run"], {})
  const [task] = await loadTasks(config.tasksDir, ["calc-data-double"])
  const runDir = await mkdtemp(path.join(os.tmpdir(), "evals-missing-oracle-"))
  try {
    const { result } = await runAttempt({ config, command: agentCommand(config),
      source: parseArtifactSource(config.artifactSource, config.loginom), task: { ...task!, oracle: "oracle.csv" },
      attempt: 1, runId: "missing-oracle", runDir, signal: new AbortController().signal,
      profileRecovered: false, skipJudge: false })
    expect(result).toMatchObject({ status: "no_artifact", oracle_pass: false, pass: false })
  } finally { await rm(runDir, { recursive: true, force: true }) }
})
