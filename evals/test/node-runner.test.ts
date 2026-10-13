import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { cp, mkdtemp, rm } from "node:fs/promises"
import { evalsRoot } from "../src/config"
import { runNodeEvals } from "../src/node-runner"
import { parallelFixture } from "./helpers/parallel-fixture"

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

test("node runner CLI: help documents slots and strict parser refuses unknown flags", async () => {
  const script = path.join(evalsRoot, "script/run-node-evals.ts")
  const help = Bun.spawn([process.execPath, script, "--help"], { cwd: evalsRoot, env: { PATH: process.env.PATH }, stdout: "pipe", stderr: "pipe" })
  expect(await help.exited).toBe(0)
  const output = await new Response(help.stdout).text()
  expect(output).toContain("--parallel")
  expect(output).toContain("EVAL_SLOTS_FILE")
  await new Response(help.stderr).text()
  const bad = Bun.spawn([process.execPath, script, "--unexpected"], { cwd: evalsRoot, env: { PATH: process.env.PATH }, stdout: "pipe", stderr: "pipe" })
  expect(await bad.exited).toBe(2)
  expect(await new Response(bad.stderr).text()).toContain("unexpected")
  await new Response(bad.stdout).text()
})

test("runNodeEvals: programmatic slots use the common parallel admission without a judge", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "node-runner-parallel-"))
  try {
    const input = await parallelFixture(root, ["crosstable-fixed-sum", "crosstable-sliding-average"], true)
    for (const id of ["crosstable-fixed-sum", "crosstable-sliding-average"]) {
      const file = path.join(root, "tasks", id, "task.json")
      await Bun.write(file, JSON.stringify({ ...await Bun.file(file).json(), inputs: [],
        checklist: [{ id: "crosstable", text: "real CrossTable", required: true }] }))
    }
    const run = await runNodeEvals(["--tasks", path.join(root, "tasks"), "--parallel", "2"], input.env,
      { fixture: { slots: input.slots, lockRoot: input.lockRoot } })
    expect(run.code).toBe(1)
    expect(run.runDir).not.toBeNull()
    const summary = await Bun.file(path.join(run.runDir!, "summary.json")).json()
    expect(summary.config.parallel).toBe(2)
    expect(summary.judge).toBeNull()
    expect(summary.tasks.flatMap((task: { attempts: { slot_id: string; status: string }[] }) => task.attempts)
      .map((attempt: { slot_id: string; status: string }) => [attempt.slot_id, attempt.status])).toEqual([["a", "no_artifact"], ["b", "no_artifact"]])
    expect(await Bun.file(path.join(run.runDir!, "code-verdict.json")).json()).toMatchObject({ verdict: "FAIL", code: 1 })
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("runNodeEvals: matching session filenames are collected only from the attempt's slot archive", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "node-runner-slot-evidence-"))
  try {
    const ids = ["crosstable-min-max", "crosstable-string-counts-null"]
    const input = await parallelFixture(root, ids, true)
    for (const id of ids) {
      const file = path.join(root, "tasks", id, "task.json")
      await Bun.write(path.join(root, "tasks", id, "parallel-native.json"), "{}")
      await Bun.write(file, JSON.stringify({ ...await Bun.file(file).json(), inputs: ["parallel-package.json", "parallel-native.json"],
        checklist: [{ id: "crosstable", text: "real CrossTable", required: true }] }))
    }
    const run = await runNodeEvals(["--tasks", path.join(root, "tasks"), "--parallel", "2"], input.env,
      { fixture: { slots: input.slots, lockRoot: input.lockRoot } })
    expect(run.runDir).not.toBeNull()
    const file = path.join(run.runDir!, "summary.json")
    const original = await Bun.file(file).text()
    const summary = JSON.parse(original)
    const evidence = await Promise.all(summary.tasks.map(async (task: { id: string; attempts: { slot_id: string }[] }) => {
      const slot = input.slots.slots.find(slot => slot.id === task.attempts[0]!.slot_id)!
      const proof = await Bun.file(path.join(run.runDir!, task.id, "1/native-crosstable.json")).json()
      expect(proof.archive.startsWith(slot.historyDir + path.sep)).toBe(true)
      expect(proof.observations).toHaveLength(1)
      return proof.observations[0].node_crosstable.input_fields[0].name
    }))
    expect(evidence).toEqual(["eval-a", "eval-b"])
    expect(await Bun.file(file).text()).toBe(original)
    expect(run.code).toBe(1)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("runNodeEvals: evidence write failure returns the completed run directory for recovery", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "node-runner-output-failure-"))
  try {
    const input = await parallelFixture(root, ["crosstable-min-max"], true)
    const directory = path.join(root, "tasks/crosstable-min-max")
    const task = await Bun.file(path.join(directory, "task.json")).json()
    await Bun.write(path.join(directory, "parallel-native.json"), "{}")
    await Bun.write(path.join(directory, "node-output-collision.json"), JSON.stringify({ resultsDir: input.env.EVAL_RESULTS_DIR }))
    await Bun.write(path.join(directory, "task.json"), JSON.stringify({ ...task,
      inputs: [...task.inputs, "parallel-native.json", "node-output-collision.json"],
      checklist: [{ id: "crosstable", text: "real CrossTable", required: true }] }))
    const run = await runNodeEvals(["--tasks", path.join(root, "tasks")], input.env,
      { fixture: { slots: input.slots, lockRoot: input.lockRoot } })
    expect(run.code).toBe(2)
    expect("error" in run ? run.error : "").toContain("native-crosstable.json")
    expect(run.runDir).not.toBeNull()
    const summary = await Bun.file(path.join(run.runDir!, "summary.json")).json()
    expect(summary.tasks[0].attempts[0]).toMatchObject({ status: "completed", slot_id: "a", environment_cleanup: { status: "confirmed" } })
    expect(await Bun.file(path.join(run.runDir!, "code-verdict.json")).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

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

test("text import live admission refuses inherited non-Luna model before touching a profile", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "import-model-"))
  try {
    const tasks = path.join(root, "tasks")
    await cp(path.join(evalsRoot, "drafts/text-import/txt-ambiguous-headers"), path.join(tasks, "txt-ambiguous-headers"), { recursive: true })
    const result = await runNodeEvals(["--tasks", tasks], { EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: "/usr/bin/false", EVAL_AGENT_MODEL: "openai/gpt-6.1-sol",
      EVAL_AGENT_VARIANT: "high", LOGINOM_DOCK_API_KEY: "fixture", EVAL_PROFILE_DIR: path.join(root, "profile") })
    expect(result).toMatchObject({ code: 2, runDir: null })
    expect(result.error).toContain("gpt-6-luna/high")
    expect(await Bun.file(path.join(root, "profile.harness-lease/owner.json")).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})
