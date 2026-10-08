import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { prepareBaseline, beginBaselineMeasurement, recordBaselineMeasurement, checkBaseline } from "../src/baseline"
import { repoRoot } from "../src/config"

const pins = { mode: "fixture" as const, harnessSha: "a".repeat(40), corpusSha: "b".repeat(40), cliVersion: "0.1.17",
  cliSource: "fc3d97dbf695c2ed8dba942feb6fe83591a33944", cliManifestSha256: "c".repeat(64), binarySha256: "d".repeat(64),
  model: "openai/gpt-6.1-sol", variant: "medium", judgeModel: "gpt-6-astra", judgeReasoning: "high", threshold: 70,
  timeoutMs: 1_800_000, judgeTimeoutMs: 300_000, promptSha256: "e".repeat(64), schemaSha256: "f".repeat(64),
  opsConfigSha256: "1".repeat(64), isolationSha256: "2".repeat(64), endpoint: "http://localhost/app/",
  containerId: "3".repeat(64), imageDigest: "sha256:" + "4".repeat(64), dockRevision: "fixture" }

test("prepare freezes all 44 cases as three complete rounds without executing a model", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-"))
  try {
    const manifest = await prepareBaseline(path.join(directory, "series"), { checkout: repoRoot, pins })
    expect(manifest.cases).toHaveLength(44)
    expect(manifest.jobs).toHaveLength(132)
    expect(new Set(manifest.jobs.map(job => job.key)).size).toBe(132)
    for (const attempt of [1, 2, 3]) {
      expect(manifest.jobs.filter(job => job.attempt === attempt).map(job => job.caseKey)).toEqual(manifest.cases.map(item => item.key))
    }
    const before = await Bun.file(path.join(directory, "series/manifest.json")).text()
    await expect(prepareBaseline(path.join(directory, "series"), { checkout: repoRoot, pins })).rejects.toThrow("SERIES_EXISTS")
    expect(await Bun.file(path.join(directory, "series/manifest.json")).text()).toBe(before)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("a recorded product failure is retained while an unknown dispatch or pin drift blocks continuation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-resume-"))
  try {
    const series = path.join(directory, "series")
    const manifest = await prepareBaseline(series, { checkout: repoRoot, pins, smoke: true })
    const first = manifest.jobs[0]!
    const dispatched = await beginBaselineMeasurement(series, first.key, { checkout: repoRoot, pins })
    const run = path.join(dispatched.resultsDir, "fixture")
    await Bun.write(path.join(run, "summary.json"), JSON.stringify({ run_id: "fixture", config: { repeat: 1 }, task_ids: ["calc-data-double"], storage_leftovers: [],
      tasks: [{ id: "calc-data-double", attempts: [{ task_id: "calc-data-double", attempt: 1, status: "failed", judge_status: "no_artifact", pass: false, score: 0,
        environment_cleanup: { status: "confirmed" }, tokens: { input: 0, output: 0, reasoning: 0 }, counters: { toolCalls: 0, toolErrors: 0, memoryToolCalls: 0 }, duration_ms: 1, cost: 0 }] }] }))
    await Bun.write(path.join(run, "calc-data-double/1/cleanup.json"), JSON.stringify({ result: { status: "confirmed" }, processes: { status: "confirmed" },
      stages: ["processes", "diagnostics", "writer", "ready", "profile_history", "storage"].map(stage => ({ stage, status: "confirmed" })) }))
    await recordBaselineMeasurement(series, first.key, run)
    await expect(beginBaselineMeasurement(series, first.key, { checkout: repoRoot, pins })).rejects.toThrow("ALREADY_DISPATCHED")
    const report = await checkBaseline(series)
    expect(report.coverage).toMatchObject({ expected: 2, recorded: 1, measured: 1, pending: 1, unknown: 0 })
    expect(report.status).toBe("incomplete")
    await expect(beginBaselineMeasurement(series, manifest.jobs[1]!.key, { checkout: repoRoot, pins: { ...pins, dockRevision: "changed" } })).rejects.toThrow("PINS_CHANGED")
    await beginBaselineMeasurement(series, manifest.jobs[1]!.key, { checkout: repoRoot, pins })
    expect((await checkBaseline(series)).coverage.unknown).toBe(1)
    await expect(beginBaselineMeasurement(series, manifest.jobs[1]!.key, { checkout: repoRoot, pins })).rejects.toThrow("ALREADY_DISPATCHED")
  } finally { await rm(directory, { recursive: true, force: true }) }
})
