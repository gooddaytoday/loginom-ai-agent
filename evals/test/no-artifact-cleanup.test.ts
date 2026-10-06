import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { cleanupOrphanResult, parseArtifactSource } from "../src/artifact"
import { agentCommand } from "../src/cli"
import { loadConfig } from "../src/config"
import { runAttempt } from "../src/run"
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
