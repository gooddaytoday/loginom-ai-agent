import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { cp, mkdtemp, rm } from "node:fs/promises"
import { parseArtifactSource } from "../src/artifact"
import { agentCommand } from "../src/cli"
import { evalsRoot, loadConfig } from "../src/config"
import { main, redact, runAttempt, stamp } from "../src/run"
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
    expect(byTask["filter-active-rows"]!.attempts[0]).toMatchObject({ status: "failed", exit_code: 1, failure_kind: "tool", score: 0, judge_status: "no_artifact" })
    expect(byTask["calc-data-double"]!.attempts[0]).toMatchObject({ status: "no_artifact", score: 0, pass: false })
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
