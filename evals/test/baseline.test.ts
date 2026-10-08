import { expect, test } from "bun:test"
import { chmod, lstat, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { prepareBaseline, beginBaselineMeasurement, recordBaselineMeasurement, checkBaseline, sealBaselineRelease, runBaseline, verifyBaselineInstallation, baselineHash, captureBaselinePins } from "../src/baseline"
import type { NodeOpsConfig } from "../src/node-eval-ops"
import { repoRoot, evalsRoot } from "../src/config"

import { baselineFixturePins } from "../fixtures/baseline"

test("prepare freezes all 44 cases as three complete rounds without executing a model", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-"))
  try {
    const manifest = await prepareBaseline(path.join(directory, "series"), { checkout: repoRoot, pins: baselineFixturePins })
    expect(manifest.cases).toHaveLength(44)
    expect(manifest.jobs).toHaveLength(132)
    expect(new Set(manifest.jobs.map(job => job.key)).size).toBe(132)
    for (const attempt of [1, 2, 3]) {
      expect(manifest.jobs.filter(job => job.attempt === attempt).map(job => job.caseKey)).toEqual(manifest.cases.map(item => item.key))
    }
    const before = await Bun.file(path.join(directory, "series/manifest.json")).text()
    await expect(prepareBaseline(path.join(directory, "series"), { checkout: repoRoot, pins: baselineFixturePins })).rejects.toThrow("SERIES_EXISTS")
    expect(await Bun.file(path.join(directory, "series/manifest.json")).text()).toBe(before)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("installation verification refuses tampered payloads and extra files without executing CLI", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "baseline-install-"))
  try {
    const bin = path.join(root, "bin/loginom-ai-agent-cli")
    await Bun.write(bin, "fixture binary never executed")
    await chmod(bin, 0o755)
    await Bun.write(path.join(root, "cli-manifest.json"), JSON.stringify({ format: "loginom-cli-artifact-v1", metadata: { version: "0.1.17", sourceCommit: baselineFixturePins.cliSource, sourceDirty: false },
      files: [{ path: "bin/loginom-ai-agent-cli", sha256: baselineHash("fixture binary never executed"), mode: 0o755 }] }))
    expect((await verifyBaselineInstallation(bin)).files).toBe(1)
    const manifest = await Bun.file(path.join(root, "cli-manifest.json")).json()
    manifest.files[0].mode = 0o4755
    await Bun.write(path.join(root, "cli-manifest.json"), JSON.stringify(manifest))
    await expect(verifyBaselineInstallation(bin)).rejects.toThrow("CLI_FILE_CHANGED")
    manifest.files[0].mode = 0o755
    await Bun.write(path.join(root, "cli-manifest.json"), JSON.stringify(manifest))
    await Bun.write(bin, "tampered")
    await expect(verifyBaselineInstallation(bin)).rejects.toThrow("CLI_FILE_CHANGED")
    await Bun.write(bin, "fixture binary never executed")
    await Bun.write(path.join(root, "unexpected"), "extra")
    await expect(verifyBaselineInstallation(bin)).rejects.toThrow("CLI_FILE_SET_CHANGED")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("live preparation rejects drift from the agreed product and judge settings before connecting", async () => {
  const role = { checkout: "/fixture/checkout", referenceProfile: "/fixture/reference", evalProfile: "/fixture/eval", workRoots: ["/fixture/work"], resultsRoot: "/fixture/results" }
  const config: NodeOpsConfig = { version: 2, runtimeRoot: "/fixture", endpoint: "http://localhost/app/", container: { name: "fixture", id: "b".repeat(64), storageDir: "/workdir/UserStorage/user" },
    cliBin: "/fixture/old/bin/cli", roles: { rich: role, ben: role, evalbaseline: { ...role, referenceProfile: undefined, cliBin: "/fixture/new/bin/cli" } } }
  await expect(captureBaselinePins(config, { EVAL_AGENT_MODEL: "openai/gpt-6.1-sol", EVAL_AGENT_VARIANT: "high" })).rejects.toThrow("MODEL_PIN_CHANGED")
  await expect(captureBaselinePins(config, { EVAL_AGENT_MODEL: "openai/gpt-6.1-sol", EVAL_AGENT_VARIANT: "medium", JUDGE_MODEL: "gpt-6-astra", JUDGE_REASONING: "medium" })).rejects.toThrow("JUDGE_PIN_CHANGED")
})

test("live entry refuses a test-only attempt limit instead of quietly starting a partial baseline", async () => {
  expect(await runBaseline(["start", "--series", "/fixture/series", "--limit", "1"], {})).toMatchObject({ code: 2, reason: "LIVE_LIMIT_REFUSED" })
})

test("prepare freezes a matching operational config before any live admission", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-config-"))
  try {
    const config = { version: 2 } as NodeOpsConfig
    const pins = { ...baselineFixturePins, opsConfigSha256: baselineHash(JSON.stringify(config)) }
    await prepareBaseline(path.join(directory, "series"), { checkout: repoRoot, pins, config })
    expect(await Bun.file(path.join(directory, "series/ops-config.json")).json()).toEqual(config)
    expect((await lstat(path.join(directory, "series/ops-config.json"))).mode & 0o077).toBe(0)
    await expect(prepareBaseline(path.join(directory, "wrong"), { checkout: repoRoot, pins: baselineFixturePins, config })).rejects.toThrow("CONFIG_PIN_CHANGED")
    expect(await Bun.file(path.join(directory, "wrong/manifest.json")).exists()).toBe(false)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("all 132 fixture measurements retain separate quality axes and become complete only after release", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-full-"))
  try {
    const series = path.join(directory, "series")
    const manifest = await prepareBaseline(series, { checkout: repoRoot, pins: baselineFixturePins })
    for (const job of manifest.jobs) {
      const dispatched = await beginBaselineMeasurement(series, job.key, { checkout: repoRoot, pins: baselineFixturePins })
      const run = path.join(dispatched.resultsDir, "fixture")
      const id = dispatched.case.id
      await Bun.write(path.join(run, "summary.json"), JSON.stringify({ run_id: job.key, config: { repeat: 1 }, task_ids: [id], storage_leftovers: [],
        tasks: [{ id, attempts: [{ task_id: id, attempt: 1, status: "failed", judge_status: "no_artifact", pass: false, score: 0,
          environment_cleanup: { status: "confirmed" }, tokens: { input: 4, output: 2, reasoning: 0 }, counters: { toolCalls: 0, toolErrors: 0, memoryToolCalls: 0 }, duration_ms: 1, cost: 0 }] }] }))
      await Bun.write(path.join(run, id, "1/cleanup.json"), JSON.stringify({ result: { status: "confirmed" }, processes: { status: "confirmed" },
        stages: ["processes", "diagnostics", "writer", "ready", "profile_history", "storage"].map(stage => ({ stage, status: "confirmed" })) }))
      await recordBaselineMeasurement(series, job.key, run)
    }
    const before = await checkBaseline(series)
    expect(before.coverage).toEqual({ expected: 132, recorded: 132, measured: 132, pending: 0, unknown: 0 })
    expect(before.status).toBe("incomplete")
    await sealBaselineRelease(series, { status: "RELEASED", evidenceSha256: "5".repeat(64) })
    const after = await checkBaseline(series)
    expect(after.status).toBe("complete")
    expect(after.nodes).toHaveLength(6)
    expect(after.nodes.every(item => item.measured === 3 && item.passed === 0)).toBe(true)
    expect(after.groups.regular?.metrics.total).toBe(9)
    expect(after.groups.analytic?.metrics.total).toBe(105)
    expect((await lstat(path.join(after.rows[0]!.runDir!, "summary.json"))).mode & 0o222).toBe(0)
    await chmod(path.join(after.rows[0]!.runDir!, "summary.json"), 0o600)
    await Bun.write(path.join(after.rows[0]!.runDir!, "summary.json"), "{}")
    await expect(checkBaseline(series)).rejects.toThrow("EVIDENCE_CHANGED")
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 30_000)

test("check writes a separate report without models, admission or changes to stored evidence", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-check-"))
  try {
    const series = path.join(directory, "series")
    await prepareBaseline(series, { checkout: repoRoot, pins: baselineFixturePins })
    const before = await Bun.file(path.join(series, "journal.json")).text()
    const result = await runBaseline(["check", "--series", series], {})
    expect(result).toMatchObject({ code: 0, status: "incomplete", expected: 132, measured: 0 })
    expect(typeof result.reportDir).toBe("string")
    expect(await Bun.file(path.join(String(result.reportDir), "report.md")).text()).toContain("132")
    expect(await Bun.file(path.join(series, "journal.json")).text()).toBe(before)
    expect((await runBaseline(["start", "--series", series], {})).code).toBe(2)
    await Bun.write(path.join(series, "stand-handle.json"), JSON.stringify({ token: "secret-token" }))
    await Bun.write(path.join(series, "private-history/agent.db"), "secret-history")
    const exported = await runBaseline(["check", "--series", series, "--export"], {})
    expect(exported).toMatchObject({ code: 0 })
    expect(typeof exported.archive).toBe("string")
    const inspected = await Bun.$`python3 ${path.join(evalsRoot, "script/baseline-archive.py")} verify ${String(exported.archive)} ${String(exported.archiveSha256)}`.quiet()
    const names = JSON.parse(inspected.text()).files as string[]
    expect(names).toContain("manifest.json")
    expect(names).not.toContain("stand-handle.json")
    expect(names.some(name => name.endsWith(".db"))).toBe(false)
    expect(await Bun.file(path.join(series, "journal.json")).text()).toBe(before)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("fixture executor resumes pending jobs through the real harness without repeating a saved attempt", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-executor-"))
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ status: "ok", result: { revision: "fixture" } }) })
  try {
    const series = path.join(directory, "series")
    await prepareBaseline(series, { checkout: repoRoot, pins: baselineFixturePins })
    const env = { PATH: Bun.env.PATH, EVAL_BASELINE_FIXTURE: "1", EVAL_CLI_MODE: "fake", EVAL_AGENT_MODEL: "openai/gpt-6.1-sol", EVAL_AGENT_VARIANT: "medium",
      EVAL_PROFILE_DIR: path.join(directory, "profile"), EVAL_WORKSPACE_ROOT: path.join(directory, "work"), EVAL_ARTIFACT_SOURCE: `dir:${path.join(evalsRoot, "fixtures/storage")}`,
      LOGINOM_URL: `http://127.0.0.1:${server.port}`, LOGINOM_DOCK_BASE_URL: `http://127.0.0.1:${server.port}`, LOGINOM_DOCK_API_KEY: "fixture",
      EVAL_AGENT_PROVIDER_ID: "openai", EVAL_AGENT_PROVIDER_BASE_URL: "http://fixture", EVAL_AGENT_PROVIDER_API_KEY: "fixture", EVAL_AGENT_PROVIDER_MODEL_ID: "model",
      EVAL_JUDGE_COMMAND: `${Bun.which("bun")} ${path.join(evalsRoot, "fixtures/fake-codex.ts")}`, JUDGE_MODEL: "gpt-6-astra", JUDGE_REASONING: "high" }
    const started = await runBaseline(["start", "--series", series, "--limit", "1"], env)
    expect(started).toMatchObject({ code: 0, recorded: 1, measured: 1 })
    const first = (await checkBaseline(series)).rows[0]!.runDir!
    const before = await Bun.file(path.join(first, "summary.json")).text()
    const resumed = await runBaseline(["resume", "--series", series, "--limit", "1"], env)
    expect(resumed).toMatchObject({ code: 0, recorded: 2 })
    expect(await Bun.file(path.join(first, "summary.json")).text()).toBe(before)
    expect((await checkBaseline(series)).rows.filter(row => row.runDir === first)).toHaveLength(1)
    const comparison = await runBaseline(["check", "--series", series, "--compare", series], {})
    expect(comparison).toMatchObject({ code: 0 })
    expect(await Bun.file(path.join(String(comparison.reportDir), "compare-regular.md")).text()).toContain("calc-data-double")
    expect(await Bun.file(path.join(first, "summary.json")).text()).toBe(before)
  } finally { server.stop(true); await rm(directory, { recursive: true, force: true }) }
}, 60_000)

test("a recorded product failure is retained while an unknown dispatch or pin drift blocks continuation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-resume-"))
  try {
    const series = path.join(directory, "series")
    const manifest = await prepareBaseline(series, { checkout: repoRoot, pins: baselineFixturePins, smoke: true })
    const first = manifest.jobs[0]!
    const dispatched = await beginBaselineMeasurement(series, first.key, { checkout: repoRoot, pins: baselineFixturePins })
    const run = path.join(dispatched.resultsDir, "fixture")
    await Bun.write(path.join(run, "summary.json"), JSON.stringify({ run_id: "fixture", config: { repeat: 1 }, task_ids: ["calc-data-double"], storage_leftovers: [],
      tasks: [{ id: "calc-data-double", attempts: [{ task_id: "calc-data-double", attempt: 1, status: "failed", judge_status: "no_artifact", pass: false, score: 0,
        environment_cleanup: { status: "confirmed" }, tokens: { input: 0, output: 0, reasoning: 0 }, counters: { toolCalls: 0, toolErrors: 0, memoryToolCalls: 0 }, duration_ms: 1, cost: 0 }] }] }))
    await Bun.write(path.join(run, "calc-data-double/1/cleanup.json"), JSON.stringify({ result: { status: "confirmed" }, processes: { status: "confirmed" },
      stages: ["processes", "diagnostics", "writer", "ready", "profile_history", "storage"].map(stage => ({ stage, status: "confirmed" })) }))
    await recordBaselineMeasurement(series, first.key, run)
    await expect(beginBaselineMeasurement(series, first.key, { checkout: repoRoot, pins: baselineFixturePins })).rejects.toThrow("ALREADY_DISPATCHED")
    const report = await checkBaseline(series)
    expect(report.coverage).toMatchObject({ expected: 2, recorded: 1, measured: 1, pending: 1, unknown: 0 })
    expect(report.status).toBe("incomplete")
    await expect(beginBaselineMeasurement(series, manifest.jobs[1]!.key, { checkout: repoRoot, pins: { ...baselineFixturePins, dockRevision: "changed" } })).rejects.toThrow("PINS_CHANGED")
    await beginBaselineMeasurement(series, manifest.jobs[1]!.key, { checkout: repoRoot, pins: baselineFixturePins })
    expect((await checkBaseline(series)).coverage.unknown).toBe(1)
    await expect(beginBaselineMeasurement(series, manifest.jobs[1]!.key, { checkout: repoRoot, pins: baselineFixturePins })).rejects.toThrow("ALREADY_DISPATCHED")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("judge and infrastructure errors stay incomplete and their retry expenditure remains visible", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-errors-"))
  try {
    const series = path.join(directory, "series")
    const manifest = await prepareBaseline(series, { checkout: repoRoot, pins: baselineFixturePins })
    for (const [index, job] of manifest.jobs.slice(0, 2).entries()) {
      const admitted = await beginBaselineMeasurement(series, job.key, { checkout: repoRoot, pins: baselineFixturePins })
      const run = path.join(admitted.resultsDir, "fixture")
      const initial = { task_id: admitted.case.id, attempt: 1, status: "infra_error", judge_status: "skipped", pass: null, score: null,
        environment_cleanup: { status: "confirmed" }, tokens: { input: 2, output: 1, reasoning: 0 }, counters: { toolCalls: 0, toolErrors: 0, memoryToolCalls: 0 }, duration_ms: 10, cost: 0.01 }
      await Bun.write(path.join(run, "summary.json"), JSON.stringify({ run_id: job.key, config: { repeat: 1 }, task_ids: [admitted.case.id], storage_leftovers: [],
        tasks: [{ id: admitted.case.id, attempts: [{ ...initial, status: index ? "infra_error" : "completed", judge_status: index ? "skipped" : "error", infra_retry: { initial } }] }] }))
      for (const out of ["1", "1/infra-error"]) await Bun.write(path.join(run, admitted.case.id, out, "cleanup.json"), JSON.stringify({ result: { status: "confirmed" }, processes: { status: "confirmed" },
        stages: ["processes", "diagnostics", "writer", "ready", "profile_history", "storage"].map(stage => ({ stage, status: "confirmed" })) }))
      await recordBaselineMeasurement(series, job.key, run)
      await expect(beginBaselineMeasurement(series, job.key, { checkout: repoRoot, pins: baselineFixturePins })).rejects.toThrow("ALREADY_DISPATCHED")
    }
    const report = await checkBaseline(series)
    expect(report.coverage.measured).toBe(0)
    expect(report.status).toBe("incomplete")
    expect(report.spending).toMatchObject({ duration_ms: 40, cost: 0.04, tokens: { input: 8, output: 4, reasoning: 0 } })
    expect(report.infrastructure).toHaveLength(4)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
