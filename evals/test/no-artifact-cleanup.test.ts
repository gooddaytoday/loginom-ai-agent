import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { parseArtifactSource } from "../src/artifact"
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
