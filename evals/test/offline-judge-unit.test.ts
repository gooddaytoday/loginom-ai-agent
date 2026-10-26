import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { evalsRoot, loadConfig, type EvalConfig } from "../src/config"
import { runOfflineJudge } from "../src/judge-environment"
import { writeLeaseReceipt } from "../src/lease"
import { main } from "../src/run"
import { parallelFixture } from "./helpers/parallel-fixture"

async function nativeJudgeFixture(root: string) {
  const fixture = await parallelFixture(root)
  const slots = path.join(root, "slots.json")
  const trace = path.join(root, "units.jsonl")
  const query = path.join(root, "queries.txt")
  const command = path.join(root, "codex")
  await writeLeaseReceipt(slots, fixture.slots)
  await writeFile(path.join(fixture.slots.judge.codexHome, "auth.json"), "{}", { mode: 0o600 })
  await Bun.write(command, `#!${process.execPath}
import { appendFileSync } from "node:fs"
appendFileSync(${JSON.stringify(trace)}, JSON.stringify({ version: process.argv.includes("--version"),
  unit: process.env.LOGINOM_EVALS_JUDGE_UNIT, timeout: process.env.LOGINOM_EVALS_JUDGE_TIMEOUT_SEC,
  home: process.env.CODEX_HOME }) + "\\n")
if (!process.env.LOGINOM_EVALS_JUDGE_UNIT || !process.env.LOGINOM_EVALS_JUDGE_TIMEOUT_SEC) process.exit(91)
process.exit(await Bun.spawn([${JSON.stringify(process.execPath)}, ${JSON.stringify(path.join(evalsRoot, "fixtures/fake-codex.ts"))}, ...process.argv.slice(2)],
  { stdin: "inherit", stdout: "inherit", stderr: "inherit" }).exited)
`)
  await chmod(command, 0o700)
  await Bun.write(path.join(root, "systemctl"), `#!${process.execPath}
import { appendFileSync } from "node:fs"
appendFileSync(${JSON.stringify(query)}, process.argv[3] + "\\n")
console.log("LoadState=loaded\\nActiveState=inactive\\nMainPID=0")
`)
  await chmod(path.join(root, "systemctl"), 0o700)
  const env = { EVAL_SLOTS_FILE: slots, EVAL_RESULTS_DIR: path.join(root, "results"),
    JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: command, EVAL_JUDGE_TIMEOUT_MS: "1234" }
  return { ...fixture, env, trace, query }
}

test("offline native calibration bounds version and execution units and releases its judge home", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-calibration-unit-"))
  try {
    const fixture = await nativeJudgeFixture(root)
    const config: EvalConfig = loadConfig(["--calibrate", "--only", "group-sum-qty"], fixture.env)
    config.judge.env = { PATH: `${root}:${process.env.PATH}`, CODEX_HOME: path.join(root, "parent-home") }
    const result = await runOfflineJudge(config, fixture.lockRoot)
    expect(result).toMatchObject({ code: 0, judgeCleanupConfirmed: true })
    const rows = (await Bun.file(fixture.trace).text()).trim().split("\n").map(line => JSON.parse(line))
    expect(rows.map(row => row.version)).toEqual([true, true, false])
    expect(rows.every(row => /^loginom-evals-judge-[0-9a-f-]{36}$/.test(row.unit))).toBe(true)
    expect(new Set(rows.map(row => row.unit)).size).toBe(3)
    expect(rows.map(row => row.timeout)).toEqual(["10", "10", "2"])
    expect(rows.every(row => row.home === fixture.slots.judge.codexHome)).toBe(true)
    expect((await Bun.file(fixture.query).text()).trim().split("\n")).toEqual(rows.map(row => `${row.unit}.service`))
    const reservations = await Array.fromAsync(new Bun.Glob("*.reservation.json").scan({ cwd: fixture.lockRoot, absolute: true }))
    expect(reservations).toHaveLength(1)
    expect(await Bun.file(reservations[0]!).json()).toMatchObject({ state: "released", key: `judge:${fixture.slots.judge.codexHome}` })
    expect(config.judge.env.CODEX_HOME).toBe(path.join(root, "parent-home"))
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

test("offline native rejudge bounds version and execution units and releases its judge home", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-rejudge-unit-"))
  try {
    const fixture = await nativeJudgeFixture(root)
    const dry = await main(["--dry-run", "--only", "group-sum-qty"], {
      EVAL_RESULTS_DIR: fixture.env.EVAL_RESULTS_DIR, EVAL_PROFILE_DIR: path.join(root, "legacy-profile"),
      EVAL_WORKSPACE_ROOT: path.join(root, "legacy-work"), JUDGE_MODEL: "fake",
      EVAL_JUDGE_COMMAND: `bun ${path.join(evalsRoot, "fixtures/fake-codex.ts")}`,
    })
    const config: EvalConfig = loadConfig(["--judge-only", path.basename(dry.runDir!)], fixture.env)
    config.judge.env = { PATH: `${root}:${process.env.PATH}`, CODEX_HOME: path.join(root, "parent-home") }
    expect(await runOfflineJudge(config, fixture.lockRoot)).toMatchObject({ code: 0, judgeCleanupConfirmed: true, runDir: dry.runDir })
    const summary = await Bun.file(path.join(dry.runDir!, "summary.json")).json()
    expect(summary.tasks[0].attempts[0]).toMatchObject({ score: 100, judge_status: "scored" })
    const rows = (await Bun.file(fixture.trace).text()).trim().split("\n").map(line => JSON.parse(line))
    expect(rows.map(row => row.version)).toEqual([true, true, false])
    expect(rows.every(row => /^loginom-evals-judge-[0-9a-f-]{36}$/.test(row.unit))).toBe(true)
    expect(new Set(rows.map(row => row.unit)).size).toBe(3)
    expect(rows.map(row => row.timeout)).toEqual(["10", "10", "2"])
    expect(rows.every(row => row.home === fixture.slots.judge.codexHome)).toBe(true)
    expect((await Bun.file(fixture.query).text()).trim().split("\n")).toEqual(rows.map(row => `${row.unit}.service`))
    const reservations = await Array.fromAsync(new Bun.Glob("*.reservation.json").scan({ cwd: fixture.lockRoot, absolute: true }))
    expect(reservations).toHaveLength(1)
    expect(await Bun.file(reservations[0]!).json()).toMatchObject({ state: "released", key: `judge:${fixture.slots.judge.codexHome}` })
    expect(config.judge.env.CODEX_HOME).toBe(path.join(root, "parent-home"))
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)
