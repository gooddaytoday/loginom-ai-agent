import { expect, test } from "bun:test"
import { cp, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { evalsRoot } from "../src/config"
import { main } from "../src/run"
import type { RunSummary } from "../src/report"

for (const stage of ["process", "archive", "ready"] as const) {
  for (const status of ["no_artifact", "failed", "timeout", "completed"] as const) {
    test(`main: ${stage} failure сохраняет настоящий ${status} и запрещает следующий dispatch`, async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), "evals-transition-"))
      const profile = path.join(directory, "profile")
      const tasks = path.join(directory, "tasks")
      const id = `a-${stage}-${status.replace("_", "-")}`
      const server = Bun.serve({ port: 0, fetch: () => Response.json({ status: "ok", result: { revision: "fixture" } }) })
      try {
        for (const taskId of [id, "b-next"]) {
          await cp(path.join(evalsRoot, "tasks/calc-data-double"), path.join(tasks, taskId), { recursive: true })
          const file = path.join(tasks, taskId, "task.json")
          await Bun.write(file, JSON.stringify({ ...await Bun.file(file).json(), id: taskId,
            ...(status === "timeout" ? { timeout_ms: 2000 } : {}) }))
        }
        const run = await main(["--skip-judge", "--tasks", tasks], {
          EVAL_CLI_MODE: "fake", EVAL_AGENT_MODEL: "fake/model", EVAL_PROFILE_DIR: profile,
          EVAL_RESULTS_DIR: path.join(directory, "results"), EVAL_WORKSPACE_ROOT: path.join(directory, "workspace"),
          EVAL_ARTIFACT_SOURCE: `dir:${path.join(evalsRoot, "fixtures/storage")}`, LOGINOM_DOCK_API_KEY: "fixture-key",
          LOGINOM_URL: `http://127.0.0.1:${server.port}`, LOGINOM_DOCK_BASE_URL: `http://127.0.0.1:${server.port}`,
          EVAL_AGENT_PROVIDER_ID: "fake", EVAL_AGENT_PROVIDER_BASE_URL: "http://fixture", EVAL_AGENT_PROVIDER_API_KEY: "fixture-provider",
          EVAL_AGENT_PROVIDER_MODEL_ID: "model",
        })
        expect(run.code).toBe(1)
        const summary = await Bun.file(path.join(run.runDir, "summary.json")).json() as RunSummary
        const result = summary.tasks[0]!.attempts[0]!
        expect(summary.stopped_reason).not.toBeNull()
        expect(result.status).toBe(status)
        expect(result.environment_cleanup?.status).toBe("failed")
        expect(result.session_id).not.toBeNull()
        expect(result.tokens.input).toBeGreaterThan(0)
        expect(result.cost).toBeGreaterThan(0)
        expect(summary.tasks[1]!.attempts).toEqual([])
        expect(summary.metrics.total).toBe(1)
        expect(summary.metrics.completed).toBe(status === "completed" ? 1 : 0)
        expect(summary.metrics.environment_cleanup_error_count).toBe(1)
        expect(summary.metrics.environment_cleanup_checked_count).toBe(1)
        expect(await Bun.file(path.join(run.runDir, id, "1/result.json")).json()).toEqual(result)
        const capture = await Bun.file(path.join(run.runDir, id, "1/run.json")).json()
        expect(capture.processCleanup.status).toBe(stage === "process" ? "failed" : "confirmed")
        expect(result.environment_cleanup?.error).toContain(stage === "process" ? "Writer identity changed"
          : stage === "archive" ? "Invalid execution journal record" : "state=unconfigured")
        expect(capture.sessionId).toBe(result.session_id)
        expect(capture.tokens).toEqual(result.tokens)
        expect(await Bun.file(path.join(run.runDir, "report.md")).exists()).toBe(true)
        expect(await Bun.file(path.join(`${profile}.harness-lease`, "owner.json")).exists()).toBe(true)
        if (stage === "archive") {
          const journals = await Array.fromAsync(new Bun.Glob("**/execution-events.jsonl").scan(profile))
          expect(journals).toHaveLength(1)
          expect(await Bun.file(path.join(profile, journals[0]!)).text()).toBe("invalid journal\n")
          expect(await Bun.file(path.join(profile, "fixture-cleanup-state.json")).json()).toEqual({ state: "ready", hasApiKey: true, recoveries: ["pending"] })
        }
      } finally { server.stop(true); await rm(directory, { recursive: true, force: true }) }
    }, 45_000)
  }
}

for (const code of [2, 3]) {
  test(`main: exit ${code} выполняет cleanup до остановки`, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "evals-stop-cleanup-"))
    const tasks = path.join(directory, "tasks")
    const id = `a-exit${code}`
    const server = Bun.serve({ port: 0, fetch: () => Response.json({ status: "ok", result: { revision: "fixture" } }) })
    try {
      for (const taskId of [id, "b-next"]) {
        await cp(path.join(evalsRoot, "tasks/calc-data-double"), path.join(tasks, taskId), { recursive: true })
        const file = path.join(tasks, taskId, "task.json")
        await Bun.write(file, JSON.stringify({ ...await Bun.file(file).json(), id: taskId }))
      }
      const run = await main(["--skip-judge", "--tasks", tasks], {
        EVAL_CLI_MODE: "fake", EVAL_AGENT_MODEL: "fake/model", EVAL_PROFILE_DIR: path.join(directory, "profile"),
        EVAL_RESULTS_DIR: path.join(directory, "results"), EVAL_WORKSPACE_ROOT: path.join(directory, "workspace"),
        EVAL_ARTIFACT_SOURCE: `dir:${path.join(evalsRoot, "fixtures/storage")}`, LOGINOM_DOCK_API_KEY: "fixture-key",
        LOGINOM_URL: `http://127.0.0.1:${server.port}`, LOGINOM_DOCK_BASE_URL: `http://127.0.0.1:${server.port}`,
        EVAL_AGENT_PROVIDER_ID: "fake", EVAL_AGENT_PROVIDER_BASE_URL: "http://fixture", EVAL_AGENT_PROVIDER_API_KEY: "fixture-provider",
        EVAL_AGENT_PROVIDER_MODEL_ID: "model",
      })
      expect(run.code).toBe(1)
      const summary = await Bun.file(path.join(run.runDir, "summary.json")).json() as RunSummary
      expect(summary.stopped_reason).not.toBeNull()
      expect(summary.tasks[0]!.attempts[0]).toMatchObject({ exit_code: code, status: "harness_error", environment_cleanup: { status: "confirmed" } })
      expect(summary.tasks[1]!.attempts).toEqual([])
      expect(await Bun.file(path.join(run.runDir, id, "1/run.json")).exists()).toBe(true)
      expect(await Bun.file(path.join(run.runDir, "report.md")).exists()).toBe(true)
    } finally { server.stop(true); await rm(directory, { recursive: true, force: true }) }
  })
}
