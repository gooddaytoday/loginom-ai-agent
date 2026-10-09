import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { cp, mkdtemp, rm } from "node:fs/promises"
import { evalsRoot } from "../src/config"
import { runNodeEvals } from "../src/node-runner"

test("runner вызывает штатный fake harness без судьи и пишет FAIL при no_artifact вместо generic code=0", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-runner-"))
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ status: "ok", result: { revision: "fixture" } }) })
  try {
    const tasks = path.join(directory, "tasks")
    const taskDir = path.join(tasks, "crosstable-fixed-sum")
    await cp(path.join(evalsRoot, "tasks/calc-data-double"), taskDir, { recursive: true })
    const raw = await Bun.file(path.join(taskDir, "task.json")).json()
    await Bun.write(path.join(taskDir, "task.json"), JSON.stringify({ ...raw, id: "crosstable-fixed-sum",
      checklist: [{ id: "crosstable", text: "real CrossTable", required: true }] }))
    const env = { EVAL_CLI_MODE: "fake", EVAL_AGENT_MODEL: "fake/model", EVAL_PROFILE_DIR: path.join(directory, "profile"),
      EVAL_RESULTS_DIR: path.join(directory, "results"), EVAL_WORKSPACE_ROOT: path.join(directory, "workspace"),
      EVAL_ARTIFACT_SOURCE: `dir:${path.join(evalsRoot, "fixtures/storage")}`, LOGINOM_DOCK_API_KEY: "fixture-key",
      LOGINOM_URL: `http://127.0.0.1:${server.port}`, LOGINOM_DOCK_BASE_URL: `http://127.0.0.1:${server.port}`,
      EVAL_AGENT_PROVIDER_ID: "fake", EVAL_AGENT_PROVIDER_BASE_URL: "http://fixture", EVAL_AGENT_PROVIDER_API_KEY: "fixture-provider",
      EVAL_AGENT_PROVIDER_MODEL_ID: "model" }
    const result = await runNodeEvals(["--tasks", tasks], env)
    expect(result.code).toBe(1)
    const summary = await Bun.file(path.join(result.runDir!, "summary.json")).json()
    expect(summary.judge).toBeNull()
    expect(summary.config.repeat).toBe(1)
    expect(summary.tasks[0].attempts[0]).toMatchObject({ status: "no_artifact", pass: null, oracle_pass: null })
    expect(await Bun.file(path.join(result.runDir!, "code-verdict.json")).json()).toMatchObject({ verdict: "FAIL", code: 1 })
    expect(await Bun.file(path.join(result.runDir!, "code-report.md")).text()).toContain("FAIL")
  } finally { server.stop(true); await rm(directory, { recursive: true, force: true }) }
}, 60_000)

test("runner отклоняет режимы с судьёй и сохранением live storage до вызова harness", async () => {
  for (const flag of ["--calibrate", "--judge-only", "--keep-storage", "--dry-run", "--reset-profile"]) {
    expect(await runNodeEvals([flag], {})).toMatchObject({ code: 2, runDir: null })
  }
  expect(await runNodeEvals(["--unknown-flag"], {})).toMatchObject({ code: 2, runDir: null })
})

test("text import diagnostic pipeline completes without a package but does not certify missing refusal evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "import-runner-"))
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ result: { revision: "fixture" } }) })
  try {
    const tasks = path.join(root, "tasks"), id = "txt-ambiguous-headers"
    await cp(path.join(evalsRoot, "drafts/text-import", id), path.join(tasks, id), { recursive: true })
    const result = await runNodeEvals(["--tasks", tasks], { EVAL_CLI_MODE: "fake", EVAL_AGENT_MODEL: "fake/model",
      EVAL_PROFILE_DIR: path.join(root, "profile"), EVAL_RESULTS_DIR: path.join(root, "results"), EVAL_WORKSPACE_ROOT: path.join(root, "work"),
      EVAL_ARTIFACT_SOURCE: `dir:${path.join(evalsRoot, "fixtures/storage")}`, LOGINOM_DOCK_API_KEY: "fixture",
      LOGINOM_URL: `http://127.0.0.1:${server.port}`, LOGINOM_DOCK_BASE_URL: `http://127.0.0.1:${server.port}`,
      EVAL_AGENT_PROVIDER_ID: "fake", EVAL_AGENT_PROVIDER_BASE_URL: "http://fixture", EVAL_AGENT_PROVIDER_API_KEY: "fixture",
      EVAL_AGENT_PROVIDER_MODEL_ID: "model" })
    expect(result.code).toBe(1)
    const summary = await Bun.file(path.join(result.runDir!, "summary.json")).json()
    expect(summary.tasks[0].attempts[0]).toMatchObject({ status: "completed", package_path: null, environment_cleanup: { status: "confirmed" } })
    const verdict = await Bun.file(path.join(result.runDir!, "code-verdict.json")).json()
    expect(verdict).toMatchObject({ verdict: "FAIL", code: 1, errors: [] })
    expect(verdict.failures.join(" ")).toContain("prepare")
    expect(await Bun.file(path.join(result.runDir!, id, "1/native-import.json")).exists()).toBe(true)
  } finally { server.stop(true); await rm(root, { recursive: true, force: true }) }
}, 30000)
