import { expect, test } from "bun:test"
import { chmod, link, lstat, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { loadJudgeEnvironment } from "../src/slots"
import { acquireJudgeLease, writeLeaseReceipt } from "../src/lease"
import { evalsRoot, loadConfig, type EvalConfig } from "../src/config"
import { runOfflineJudge } from "../src/judge-environment"
import { main } from "../src/run"
import { parallelFixture } from "./helpers/parallel-fixture"

for (const kind of ["missing", "symlink", "hardlink", "public"]) test(`native judge refuses ${kind} auth before any probe or reservation`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-auth-private-"))
  try {
    const fixture = await parallelFixture(root)
    const file = path.join(root, "slots.json")
    const binary = path.join(root, "codex")
    const probe = path.join(root, "version-called")
    const borrowed = path.join(root, "parent-auth-canary")
    const auth = path.join(fixture.slots.judge.codexHome, "auth.json")
    await writeLeaseReceipt(file, fixture.slots)
    if (kind === "public") await writeFile(auth, "private-auth-canary", { mode: 0o644 })
    if (["symlink", "hardlink"].includes(kind)) {
      await writeFile(borrowed, "parent-auth-canary", { mode: 0o600 })
      if (kind === "symlink") await symlink(borrowed, auth)
      if (kind === "hardlink") await link(borrowed, auth)
    }
    await writeFile(binary, '#!/bin/sh\nprintf called > "$PROBE_JUDGE_HOME_FILE"\nprintf "fake-codex 0.0.0\\n"\n', { mode: 0o700 })
    const config: EvalConfig = loadConfig(["--calibrate", "--only", "group-sum-qty"], {
      EVAL_SLOTS_FILE: file, EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: binary,
    })
    config.judge.env = { PROBE_JUDGE_HOME_FILE: probe }
    await expect(runOfflineJudge(config, fixture.lockRoot)).rejects.toThrow(kind === "missing" ? "Нет входа Codex" : "JUDGE_AUTH_PRIVATE")
    expect(await Bun.file(probe).exists()).toBe(false)
    expect(await Array.fromAsync(new Bun.Glob("*.reservation.json").scan(fixture.lockRoot))).toEqual([])
    if (["symlink", "hardlink"].includes(kind)) expect(await Bun.file(borrowed).text()).toBe("parent-auth-canary")
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("main offline v2 command reads its configured slots before any judge probe", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-judge-entry-"))
  try {
    const probe = path.join(root, "version.json")
    const results = path.join(root, "results")
    await expect(main(["--calibrate", "--only", "group-sum-qty"], {
      EVAL_SLOTS_FILE: path.join(root, "missing-slots.json"), EVAL_RESULTS_DIR: results, JUDGE_MODEL: "fake",
      EVAL_JUDGE_COMMAND: `bun ${path.join(evalsRoot, "fixtures/fake-codex.ts")} --version-home-file ${probe}`,
    })).rejects.toThrow("SLOTS_FILE_PRIVATE")
    expect(await Bun.file(probe).exists()).toBe(false)
    await expect(lstat(results)).rejects.toMatchObject({ code: "ENOENT" })
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("offline calibration retains the reservation after uncertain cleanup and refuses another command", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-judge-uncertain-"))
  const fixture = await parallelFixture(root)
  const file = path.join(root, "slots.json")
  const trace = path.join(root, "judge.jsonl")
  await writeLeaseReceipt(file, fixture.slots)
  const config = loadConfig(["--calibrate", "--only", "group-sum-qty,calc-data-double"], {
    EVAL_SLOTS_FILE: file, EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake",
    EVAL_JUDGE_COMMAND: `bun ${path.join(evalsRoot, "fixtures/fake-codex.ts")} --gate-log ${trace} --delay-ms 500`,
  })
  const pending = runOfflineJudge(config, fixture.lockRoot)
  try {
    for (let wait = 0; wait < 500 && !await Bun.file(trace).exists(); wait++) await Bun.sleep(10)
    const started = JSON.parse((await Bun.file(trace).text()).trim().split("\n")[0]!) as { dir: string }
    await mkdir(path.join(path.dirname(started.dir), "judge-processes-1", "process-cleanup.json"), { recursive: true, mode: 0o700 })
    const result = await pending
    expect(result).toMatchObject({ code: 1, judgeCleanupConfirmed: false })
    const reservations = await Array.fromAsync(new Bun.Glob("*.reservation.json").scan({ cwd: fixture.lockRoot, absolute: true }))
    const reservation = await Bun.file(reservations[0]!).json()
    expect(reservation.state).toBe("retained")
    expect(reservation.releaseEvidence).toBeUndefined()
    expect((await Bun.file(reservation.journal).json()).state).toBe("quarantined")
    const before = await Bun.file(trace).text()
    await expect(runOfflineJudge(config, fixture.lockRoot)).rejects.toThrow("RECOVERY_REQUIRED")
    expect(await Bun.file(trace).text()).toBe(before)
    expect(await Bun.file(path.join(result.runDir, "calibration.json")).exists()).toBe(true)
  } finally { await pending; await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("offline calibration releases its private home after confirmed cleanup and can run again", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-judge-release-"))
  try {
    const fixture = await parallelFixture(root)
    const file = path.join(root, "slots.json")
    const trace = path.join(root, "judge.jsonl")
    const probe = path.join(root, "version.json")
    await writeLeaseReceipt(file, fixture.slots)
    const config: EvalConfig = loadConfig(["--calibrate", "--only", "group-sum-qty"], {
      EVAL_SLOTS_FILE: file, EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake",
      EVAL_JUDGE_COMMAND: `bun ${path.join(evalsRoot, "fixtures/fake-codex.ts")} --version-home-file ${probe} --gate-log ${trace}`,
    })
    config.judge.env = { CODEX_HOME: path.join(root, "unconfigured-parent-home") }
    const first = await runOfflineJudge(config, fixture.lockRoot)
    expect(first.code).toBe(0)
    const reservations = await Array.fromAsync(new Bun.Glob("*.reservation.json").scan({ cwd: fixture.lockRoot, absolute: true }))
    expect(reservations).toHaveLength(1)
    const before = await Bun.file(reservations[0]!).json()
    expect(before.state).toBe("released")
    expect(before.key).toBe(`judge:${fixture.slots.judge.codexHome}`)
    const second = await runOfflineJudge(config, fixture.lockRoot)
    expect(second.code).toBe(0)
    expect(second.runDir).not.toBe(first.runDir)
    const after = await Bun.file(reservations[0]!).json()
    expect(after).toMatchObject({ state: "released", revision: 2 })
    expect(after.token).not.toBe(before.token)
    expect((await Bun.file(probe).json()).codexHome).toBe(fixture.slots.judge.codexHome)
    const rows = (await Bun.file(trace).text()).trim().split("\n").map(line => JSON.parse(line))
    expect(rows.filter(row => row.kind === "start")).toHaveLength(2)
    expect(rows.every(row => row.codexHome === fixture.slots.judge.codexHome)).toBe(true)
    expect(config.judge.env.CODEX_HOME).toBe(path.join(root, "unconfigured-parent-home"))
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("offline judge refuses a held home before version probes or results", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-judge-busy-"))
  const fixture = await parallelFixture(root)
  const file = path.join(root, "slots.json")
  const journal = path.join(root, "holder.json")
  await writeLeaseReceipt(file, fixture.slots)
  await writeLeaseReceipt(journal, { commandId: "holder" })
  const holder = await acquireJudgeLease({ codexHome: fixture.slots.judge.codexHome, journal,
    commandId: "holder", lockRoot: fixture.lockRoot })
  try {
    const probe = path.join(root, "version.json")
    const config = loadConfig(["--calibrate", "--only", "group-sum-qty"], {
      EVAL_SLOTS_FILE: file, EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake",
      EVAL_JUDGE_COMMAND: `bun ${path.join(evalsRoot, "fixtures/fake-codex.ts")} --version-home-file ${probe}`,
    })
    await expect(runOfflineJudge(config, fixture.lockRoot)).rejects.toThrow("BUSY")
    expect(await Bun.file(probe).exists()).toBe(false)
    await expect(lstat(config.resultsDir)).rejects.toMatchObject({ code: "ENOENT" })
  } finally { await holder.close(); await rm(root, { recursive: true, force: true }) }
})

test("offline rejudge releases its lease while preserving historical slot metadata", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-rejudge-"))
  try {
    const fixture = await parallelFixture(root)
    const file = path.join(root, "slots.json")
    const trace = path.join(root, "judge.jsonl")
    await writeLeaseReceipt(file, fixture.slots)
    const env = { EVAL_RESULTS_DIR: path.join(root, "results"), EVAL_PROFILE_DIR: path.join(root, "legacy-profile"),
      EVAL_WORKSPACE_ROOT: path.join(root, "legacy-work"), JUDGE_MODEL: "fake",
      EVAL_JUDGE_COMMAND: `bun ${path.join(evalsRoot, "fixtures/fake-codex.ts")} --gate-log ${trace}` }
    const dry = await main(["--dry-run", "--only", "group-sum-qty", "--repeat", "2"], env)
    const before = await Bun.file(path.join(dry.runDir!, "summary.json")).json()
    const config = loadConfig(["--judge-only", before.run_id], { ...env, EVAL_SLOTS_FILE: file })
    expect(await runOfflineJudge(config, fixture.lockRoot)).toMatchObject({ code: 0, judgeCleanupConfirmed: true, runDir: dry.runDir })
    const after = await Bun.file(path.join(dry.runDir!, "summary.json")).json()
    expect(after.slots).toEqual(before.slots)
    expect(after.config.parallel).toBe(before.config.parallel)
    expect(after.metrics.total).toBe(2)
    const reservations = await Array.fromAsync(new Bun.Glob("*.reservation.json").scan({ cwd: fixture.lockRoot, absolute: true }))
    expect((await Bun.file(reservations[0]!).json()).state).toBe("released")
    const rows = (await Bun.file(trace).text()).trim().split("\n").map(line => JSON.parse(line))
    expect(rows.filter(row => row.kind === "start")).toHaveLength(2)
    expect(rows.every(row => row.codexHome === fixture.slots.judge.codexHome)).toBe(true)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("offline judge loads its private home and state without requiring Loginom credentials", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-judge-"))
  try {
    const fixture = await parallelFixture(root)
    const file = path.join(root, "slots.json")
    await writeLeaseReceipt(file, fixture.slots)
    expect(await loadJudgeEnvironment(file)).toEqual({ codexHome: fixture.slots.judge.codexHome,
      stateDir: fixture.slots.controller.stateDir })
    expect(await Bun.file(fixture.slots.controller.adminCredentialsFile).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("offline judge refuses a profile alias that resolves into its private home", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-judge-alias-"))
  try {
    const fixture = await parallelFixture(root)
    const alias = path.join(root, "profile-alias")
    await symlink(fixture.slots.judge.codexHome, alias)
    fixture.slots.slots[0]!.profileDir = alias
    const file = path.join(root, "slots.json")
    await writeLeaseReceipt(file, fixture.slots)
    await expect(loadJudgeEnvironment(file)).rejects.toThrow("SLOT_PATH_OVERLAP")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("offline judge refuses public state directories before any execution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-judge-private-"))
  try {
    const fixture = await parallelFixture(root)
    const file = path.join(root, "slots.json")
    await writeLeaseReceipt(file, fixture.slots)
    await chmod(fixture.slots.controller.stateDir, 0o755)
    await expect(loadJudgeEnvironment(file)).rejects.toThrow("SLOT_PATH_PRIVATE")
  } finally { await rm(root, { recursive: true, force: true }) }
})
