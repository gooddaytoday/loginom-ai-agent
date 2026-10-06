import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { chmod, cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { cleanupOrphanResult, parseArtifactSource } from "../src/artifact"
import { agentCommand } from "../src/cli"
import { evalsRoot, loadConfig } from "../src/config"
import { main, runAttempt } from "../src/run"
import { runNodeEvals } from "../src/node-runner"
import { loadTasks } from "../src/task"

test("runAttempt сохраняет CSV без LGP как evidence, не превращая no_artifact в completed", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "eval-orphan-"))
  try {
    const storage = path.join(directory, "storage")
    await mkdir(storage)
    const config = { ...loadConfig(["--dry-run"], { EVAL_PROFILE_DIR: path.join(directory, "profile"),
      EVAL_WORKSPACE_ROOT: path.join(directory, "workspace") }), dryRun: false }
    await mkdir(config.profileDir)
    const [task] = await loadTasks(config.tasksDir, ["calc-data-double"])
    const command = agentCommand(config)
    const runDir = path.join(directory, "results")
    const { result } = await runAttempt({ config, task: task!, attempt: 1, runId: "orphan", runDir,
      command: { ...command, env: { ...command.env, EVAL_FAKE_ORPHAN_STORAGE: storage } },
      source: parseArtifactSource(`dir:${storage}`, config.loginom), signal: new AbortController().signal,
      profileRecovered: false, skipJudge: true })
    expect(result.harness_error).toBeNull()
    expect(result.status).toBe("no_artifact")
    expect(result.package_path).toBeNull()
    expect(await Bun.file(path.join(runDir, task!.id, "1", "storage-outputs", "eval-orphan-calc-data-double-1.result.csv")).text())
      .toBe("Region,A,B\nN,7.5,7\nS,3,2\n")
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 30_000)

async function orphanPipeline(directory: string, readonly = false) {
  const storage = path.join(directory, "storage"), tasks = path.join(directory, "tasks")
  await mkdir(storage)
  for (const id of readonly ? ["a-orphan-csv", "b-next"] : ["crosstable-fixed-sum"]) {
    const taskDir = path.join(tasks, id)
    await cp(path.join(evalsRoot, "tasks/calc-data-double"), taskDir, { recursive: true })
    const raw = await Bun.file(path.join(taskDir, "task.json")).json()
    const inputs = id === "b-next" ? raw.inputs : ["fake-storage-export.json"]
    await Bun.write(path.join(taskDir, "task.json"), JSON.stringify({ ...raw, id, inputs,
      checklist: [{ id: "crosstable", text: "real CrossTable", required: true }] }))
    if (id !== "b-next") await Bun.write(path.join(taskDir, inputs[0]), JSON.stringify({ storage, readonly }))
  }
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ status: "ok", result: { revision: "fixture" } }) })
  const env = { EVAL_CLI_MODE: "fake", EVAL_AGENT_MODEL: "fake/model", EVAL_PROFILE_DIR: path.join(directory, "profile"),
    EVAL_RESULTS_DIR: path.join(directory, "results"), EVAL_WORKSPACE_ROOT: path.join(directory, "workspace"),
    EVAL_ARTIFACT_SOURCE: `dir:${storage}`, LOGINOM_DOCK_API_KEY: "fixture-key",
    LOGINOM_URL: `http://127.0.0.1:${server.port}`, LOGINOM_DOCK_BASE_URL: `http://127.0.0.1:${server.port}`,
    EVAL_AGENT_PROVIDER_ID: "fake", EVAL_AGENT_PROVIDER_BASE_URL: "http://fixture", EVAL_AGENT_PROVIDER_API_KEY: "fixture-provider",
    EVAL_AGENT_PROVIDER_MODEL_ID: "model" }
  return { tasks, storage, server, env }
}

test("code-only pipeline даёт FAIL/no_artifact с подтверждённым cleanup после CSV-only export", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "eval-orphan-pipeline-"))
  const fixture = await orphanPipeline(directory)
  try {
    const result = await runNodeEvals(["--tasks", fixture.tasks], fixture.env)
    expect(result.code).toBe(1)
    const summary = await Bun.file(path.join(result.runDir!, "summary.json")).json()
    expect(summary.storage_leftovers).toEqual([])
    expect(summary.tasks[0].attempts[0]).toMatchObject({ status: "no_artifact", cleanup_error: null,
      environment_cleanup: { status: "confirmed" }, pass: null, oracle_pass: null })
    expect(await Bun.file(path.join(result.runDir!, "code-verdict.json")).json()).toMatchObject({ verdict: "FAIL", errors: [] })
    expect(await Bun.file(path.join(result.runDir!, "crosstable-fixed-sum/1/storage-cleanup.json")).json()).toMatchObject({ status: "confirmed", removed: true, verified_absent: true })
  } finally { fixture.server.stop(true); await rm(directory, { recursive: true, force: true }) }
}, 30_000)

test("main останавливает dispatch после storage cleanup failure, сохраняя качество и process cleanup", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "eval-orphan-pipeline-"))
  const fixture = await orphanPipeline(directory, true)
  try {
    const result = await main(["--tasks", fixture.tasks, "--skip-judge"], fixture.env)
    expect(result.code).toBe(1)
    const summary = await Bun.file(path.join(result.runDir, "summary.json")).json()
    expect(summary.stopped_reason).toMatch(/EACCES|Permission denied/)
    expect(summary.tasks[0].attempts[0]).toMatchObject({ status: "no_artifact", cleanup_error: expect.any(String),
      environment_cleanup: { status: "confirmed" } })
    expect(summary.tasks[1].attempts).toEqual([])
    expect(summary.storage_leftovers).toHaveLength(1)
    expect(await Bun.file(path.join(result.runDir, "a-orphan-csv/1/storage-cleanup.json")).json()).toMatchObject({ status: "failed", removed: false })
  } finally { fixture.server.stop(true); await chmod(fixture.storage, 0o700); await rm(directory, { recursive: true, force: true }) }
}, 30_000)

test("cleanupOrphanResult удаляет только точный собственный CSV после сохранения evidence", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "eval-orphan-"))
  try {
    const storage = path.join(directory, "storage")
    await mkdir(storage)
    const name = "eval-run-case-1.result.csv"
    await Bun.write(path.join(storage, name), "csv bytes\n")
    await Bun.write(path.join(storage, "eval-run-case-10.result.csv"), "other attempt\n")
    await Bun.write(path.join(storage, "personal.csv"), "other user\n")
    await cleanupOrphanResult({ source: parseArtifactSource(`dir:${storage}`, { container: "", storageDir: "" }), name, outDir: directory, existingNames: [] })
    expect(await Bun.file(path.join(storage, name)).exists()).toBe(false)
    expect(await Bun.file(path.join(directory, "storage-outputs", name)).text()).toBe("csv bytes\n")
    expect(await Bun.file(path.join(storage, "eval-run-case-10.result.csv")).text()).toBe("other attempt\n")
    expect(await Bun.file(path.join(storage, "personal.csv")).text()).toBe("other user\n")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("cleanupOrphanResult отказывает ownership для существовавшего до попытки CSV", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "eval-orphan-"))
  try {
    const name = "eval-run-case-1.result.csv"
    await Bun.write(path.join(directory, name), "pre-existing bytes\n")
    await expect(cleanupOrphanResult({ source: parseArtifactSource(`dir:${directory}`, { container: "", storageDir: "" }),
      name, outDir: path.join(directory, "evidence"), existingNames: [name] })).rejects.toThrow("pre-existing")
    expect(await Bun.file(path.join(directory, name)).text()).toBe("pre-existing bytes\n")
    expect(await Bun.file(path.join(directory, "evidence", "storage-outputs", name)).exists()).toBe(false)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("cleanupOrphanResult не читает и не удаляет symlink на чужой CSV", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "eval-orphan-"))
  try {
    const name = "eval-run-case-1.result.csv"
    await Bun.write(path.join(directory, "foreign.csv"), "foreign bytes\n")
    await symlink("foreign.csv", path.join(directory, name))
    await expect(cleanupOrphanResult({ source: parseArtifactSource(`dir:${directory}`, { container: "", storageDir: "" }),
      name, outDir: path.join(directory, "evidence"), existingNames: [] })).rejects.toThrow("regular file")
    expect(await Bun.file(path.join(directory, name)).text()).toBe("foreign bytes\n")
    expect(await Bun.file(path.join(directory, "evidence", "storage-outputs", name)).exists()).toBe(false)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("cleanupOrphanResult подтверждает byte/hash evidence и проверяет отсутствие файла после удаления", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "eval-orphan-"))
  try {
    const name = "eval-run-case-1.result.csv", bytes = "csv bytes\n"
    await Bun.write(path.join(directory, name), bytes)
    await cleanupOrphanResult({ source: parseArtifactSource(`dir:${directory}`, { container: "", storageDir: "" }),
      name, outDir: path.join(directory, "evidence"), existingNames: [] })
    expect(await Bun.file(path.join(directory, "evidence/storage-cleanup.json")).json()).toMatchObject({
      status: "confirmed", name, existed_before: false, removed: true, verified_absent: true,
      archived: { path: `storage-outputs/${name}`, bytes: Buffer.byteLength(bytes), sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") },
    })
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("runAttempt сохраняет no_artifact и CSV при отказе сохранения evidence, выставляя cleanup_error", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "eval-orphan-"))
  try {
    const storage = path.join(directory, "storage")
    await mkdir(storage)
    const config = { ...loadConfig(["--dry-run"], { EVAL_PROFILE_DIR: path.join(directory, "profile"),
      EVAL_WORKSPACE_ROOT: path.join(directory, "workspace") }), dryRun: false }
    await mkdir(config.profileDir)
    const [task] = await loadTasks(config.tasksDir, ["calc-data-double"])
    const command = agentCommand(config), runDir = path.join(directory, "results")
    const outDir = path.join(runDir, task!.id, "1")
    await Bun.write(path.join(outDir, "storage-outputs"), "blocked directory")
    const { result } = await runAttempt({ config, task: task!, attempt: 1, runId: "orphan", runDir,
      command: { ...command, env: { ...command.env, EVAL_FAKE_ORPHAN_STORAGE: storage } },
      source: parseArtifactSource(`dir:${storage}`, config.loginom), signal: new AbortController().signal,
      profileRecovered: false, skipJudge: true })
    expect(result.status).toBe("no_artifact")
    expect(result.cleanup_error).toMatch(/EEXIST|ENOTDIR/)
    expect(await Bun.file(path.join(storage, "eval-orphan-calc-data-double-1.result.csv")).exists()).toBe(true)
    expect(await Bun.file(path.join(outDir, "storage-cleanup.json")).json()).toMatchObject({ status: "failed", removed: false, verified_absent: false })
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 30_000)
