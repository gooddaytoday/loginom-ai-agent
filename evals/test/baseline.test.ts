import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { prepareBaseline, beginBaselineMeasurement, recordBaselineMeasurement, checkBaseline, sealBaselineRelease } from "../src/baseline"
import { repoRoot } from "../src/config"

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
    await Bun.write(path.join(after.rows[0]!.runDir!, "summary.json"), "{}")
    await expect(checkBaseline(series)).rejects.toThrow("EVIDENCE_CHANGED")
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 30_000)

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
