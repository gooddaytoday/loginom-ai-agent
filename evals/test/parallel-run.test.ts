import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import { main } from "../src/run"
import type { RunSummary } from "../src/report"
import type { SlotFile } from "../src/slots"

async function fixture(root: string) {
  const slots: SlotFile = {
    version: 2,
    server: { container: "fixture-server", studioContainer: "fixture-studio", url: "http://127.0.0.1/app/",
      network: "fixture-network", alias: "fixture-server", storageRoot: "/workdir/UserStorage", backupRoot: "/workdir/SessionBackup" },
    controller: { stateDir: path.join(root, "controller"), adminCredentialsFile: path.join(root, "unused-admin.json") },
    judge: { codexHome: path.join(root, "judge") },
    slots: ["a", "b"].map(id => ({ id, username: `eval-${id}`, profileDir: path.join(root, `profile-${id}`),
      workspaceRoot: path.join(root, `work-${id}`), historyDir: path.join(root, `history-${id}`) })),
  }
  const lockRoot = path.join(root, "locks")
  const storage = path.join(root, "storage")
  await Promise.all([lockRoot, storage, slots.controller.stateDir, slots.judge.codexHome,
    ...slots.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir, path.join(storage, slot.id)])]
    .map(dir => mkdir(dir, { recursive: true, mode: 0o700 })))
  await Promise.all(slots.slots.map(slot => Bun.write(path.join(slot.profileDir, "data/auth.json"), '{"fake":{"type":"api","key":"fixture"}}')))
  await Promise.all(["parallel-fast", "parallel-slow"].map(async id => {
    await Bun.write(path.join(root, "tasks", id, "spec.md"), "Fixture diagnostic")
    await Bun.write(path.join(root, "tasks", id, "task.json"), JSON.stringify({ id, title: id, prompt: id,
      output_mode: "diagnostic", spec: "spec.md", expected_output: "diagnostic", checklist: [{ id: "diagnostic", text: "Returns diagnostic", weight: 1, required: true }] }))
  }))
  return { slots, lockRoot, env: { EVAL_CLI_MODE: "fake", EVAL_ARTIFACT_SOURCE: `dir:${storage}`,
    EVAL_AGENT_MODEL: "fake/fake-model", LOGINOM_DOCK_API_KEY: "fixture-dock", EVAL_RESULTS_DIR: path.join(root, "results") } }
}

test("fixture main: independent slot pipelines cross rounds and archive evidence before reuse", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-main-"))
  try {
    const input = await fixture(root)
    const run = await main(["--tasks", path.join(root, "tasks"), "--parallel", "2", "--repeat", "2", "--skip-judge"],
      input.env, { fixture: { slots: input.slots, lockRoot: input.lockRoot } })
    expect(run.code).toBe(0)
    const summary = await Bun.file(path.join(run.runDir!, "summary.json")).json() as RunSummary
    expect(summary.config.parallel).toBe(2)
    expect(summary.slots).toHaveLength(2)
    expect(summary.metrics.total).toBe(4)
    const attempts = summary.tasks.flatMap(task => task.attempts)
    expect(attempts.every(attempt => attempt.environment_cleanup?.status === "confirmed" && attempt.slot_id)).toBe(true)
    const traces = await Promise.all(attempts.map(async attempt => {
      const slot = input.slots.slots.find(slot => slot.id === attempt.slot_id)!
      return { ...attempt, ...await Bun.file(path.join(slot.workspaceRoot, summary.run_id, attempt.task_id, String(attempt.attempt), "parallel-trace.json")).json() }
    }))
    expect(traces.find(item => item.task_id === "parallel-fast" && item.attempt === 2)!.startedAt)
      .toBeLessThan(traces.find(item => item.task_id === "parallel-slow" && item.attempt === 1)!.finishedAt)
    expect(new Set(traces.map(item => item.pid)).size).toBe(4)
    for (const slot of input.slots.slots) {
      expect(await Bun.file(path.join(slot.profileDir, "data/auth.json")).text()).toContain('"fixture"')
      expect(await Bun.file(path.join(slot.profileDir, "data/loginom-ai-agent.db")).exists()).toBe(false)
      const archives = await readdir(slot.historyDir)
      expect(archives.length).toBeGreaterThan(1)
      const cleanup = await Bun.file(path.join(input.slots.controller.stateDir, `slot-${slot.id}.cleanup.json`)).json()
      expect(cleanup).toMatchObject({ status: "confirmed", liveQualified: false, archive: "committed" })
    }
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("fixture main: overlapping writable results are rejected before any admission or dispatch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-overlap-"))
  try {
    const input = await fixture(root)
    await expect(main(["--dry-run", "--tasks", path.join(root, "tasks"), "--parallel", "2"],
      { ...input.env, EVAL_RESULTS_DIR: input.slots.slots[0]!.profileDir },
      { fixture: { slots: input.slots, lockRoot: input.lockRoot } })).rejects.toThrow("FIXTURE_ROOT_OVERLAP")
    expect(await readdir(input.slots.slots[0]!.profileDir)).toEqual(["data"])
    expect(await readdir(input.slots.controller.stateDir)).toEqual([])
    expect(await readdir(input.lockRoot)).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("fixture main: dry-run builds the round-major plan without processes, leases or profile mutations", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-plan-"))
  try {
    const input = await fixture(root)
    const run = await main(["--dry-run", "--tasks", path.join(root, "tasks"), "--parallel", "2", "--repeat", "2"],
      input.env, { fixture: { slots: input.slots, lockRoot: input.lockRoot } })
    const planned = await Bun.file(path.join(run.runDir!, "fixture-plan.json")).json()
    expect(planned).toEqual({ liveQualified: false, ready: false, jobs: [
      { index: 0, taskId: "parallel-fast", attempt: 1 }, { index: 1, taskId: "parallel-slow", attempt: 1 },
      { index: 2, taskId: "parallel-fast", attempt: 2 }, { index: 3, taskId: "parallel-slow", attempt: 2 },
    ] })
    expect(await readdir(input.lockRoot)).toEqual([])
    expect(await readdir(input.slots.controller.stateDir)).toEqual([])
    for (const slot of input.slots.slots) {
      expect(await readdir(slot.workspaceRoot)).toEqual([])
      expect(await readdir(slot.historyDir)).toEqual([])
      expect(await readdir(slot.profileDir)).toEqual(["data"])
    }
    const summary = await Bun.file(path.join(run.runDir!, "summary.json")).json() as RunSummary
    expect(summary.metrics.total).toBe(0)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("fixture main: binary/source modes and ordinary CLI cannot acquire synthetic admission", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-mode-"))
  try {
    const input = await fixture(root)
    for (const mode of ["binary", "source"]) await expect(main(["--dry-run", "--parallel", "2"],
      { ...input.env, EVAL_CLI_MODE: mode, EVAL_CLI_BIN: "/usr/bin/false" },
      { fixture: { slots: input.slots, lockRoot: input.lockRoot } })).rejects.toThrow("FIXTURE_MODE")
    await Bun.write(path.join(root, "slots.json"), JSON.stringify({ ...input.slots, fixture: true }))
    await expect(main(["--dry-run", "--parallel", "2"], { ...input.env, EVAL_SLOTS_FILE: path.join(root, "slots.json") }))
      .rejects.toThrow("SLOTS_ADMISSION_UNAVAILABLE")
    await expect(main(["--dry-run", "--parallel", "2", "--fixture"], input.env)).rejects.toThrow()
    expect(await readdir(input.lockRoot)).toEqual([])
    expect(await readdir(input.slots.controller.stateDir)).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("fixture main: a shared profile is rejected across all configured slots before reads or writes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-shared-"))
  try {
    const input = await fixture(root)
    input.slots.slots[1]!.profileDir = input.slots.slots[0]!.profileDir
    await expect(main(["--dry-run"], input.env, { fixture: { slots: input.slots, lockRoot: input.lockRoot } }))
      .rejects.toThrow("SLOT_PATH_OVERLAP")
    expect(await readdir(input.slots.slots[0]!.profileDir)).toEqual(["data"])
    expect(await readdir(input.slots.controller.stateDir)).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})
