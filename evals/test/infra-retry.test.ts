import { expect, test } from "bun:test"
import { cp, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { evalsRoot } from "../src/config"
import { main } from "../src/run"
import type { RunSummary } from "../src/report"

test("main: один startup timeout повторяется после cleanup и даёт одну quality-попытку", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "evals-infra-retry-"))
  const profile = path.join(directory, "profile")
  const tasks = path.join(directory, "tasks")
  const id = "infra-retry-success"
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ status: "ok", result: { revision: "fixture" } }) })
  try {
    await cp(path.join(evalsRoot, "tasks/group-sum-qty"), path.join(tasks, id), { recursive: true })
    const file = path.join(tasks, id, "task.json")
    await Bun.write(file, JSON.stringify({ ...await Bun.file(file).json(), id }))
    const run = await main(["--skip-judge", "--tasks", tasks], {
      EVAL_CLI_MODE: "fake", EVAL_AGENT_MODEL: "fake/model", EVAL_PROFILE_DIR: profile,
      EVAL_RESULTS_DIR: path.join(directory, "results"), EVAL_WORKSPACE_ROOT: path.join(directory, "workspace"),
      EVAL_ARTIFACT_SOURCE: `dir:${path.join(evalsRoot, "fixtures/storage")}`, LOGINOM_DOCK_API_KEY: "fixture-key",
      LOGINOM_URL: `http://127.0.0.1:${server.port}`, LOGINOM_DOCK_BASE_URL: `http://127.0.0.1:${server.port}`,
      EVAL_AGENT_PROVIDER_ID: "fake", EVAL_AGENT_PROVIDER_BASE_URL: "http://fixture", EVAL_AGENT_PROVIDER_API_KEY: "fixture-provider",
      EVAL_AGENT_PROVIDER_MODEL_ID: "model",
    })
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
    expect(await Bun.file(path.join(profile, ".writer/owner")).exists()).toBe(false)
    expect(await Bun.file(path.join(directory, "workspace", summary.run_id, id, "1/fake-launches.json")).json()).toBe(2)
    expect(await Bun.file(path.join(run.runDir, "report.md")).text()).toContain("infra_error")
  } finally { server.stop(true); await rm(directory, { recursive: true, force: true }) }
}, 30_000)
