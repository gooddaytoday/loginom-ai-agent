import path from "node:path"
import { baselineFixturePins } from "../../fixtures/baseline"
import { baselineHash, beginBaselineMeasurement, prepareBaseline, recordBaselineMeasurement, runBaseline, sealBaselineRelease } from "../../src/baseline"
import { repoRoot } from "../../src/config"
import { comparisonSummary } from "./compare-summary"

export async function completedBaselineFixture(directory: string) {
  const series = path.join(directory, "series")
  const manifest = await prepareBaseline(series, { checkout: repoRoot, pins: baselineFixturePins })
  for (const job of manifest.jobs) {
    const admitted = await beginBaselineMeasurement(series, job.key, { checkout: repoRoot, pins: baselineFixturePins })
    const id = admitted.case.id
    const run = path.join(admitted.resultsDir, "fixture")
    const summary = comparisonSummary([{ successes: 0, attempts: 1 }], 1)
    summary.run_id = job.key
    summary.task_ids = [id]
    summary.tasks[0]!.id = id
    summary.tasks[0]!.attempts[0]!.task_id = id
    summary.tasks[0]!.attempts[0]!.environment_cleanup = { status: "confirmed", evidence: null, error: null }
    summary.agent = { ...summary.agent, model: baselineFixturePins.model, variant: baselineFixturePins.variant }
    summary.config.infra_retries = 1
    summary.config.task_timeout_ms = { [id]: summary.config.timeout_ms }
    await Bun.write(path.join(run, "summary.json"), JSON.stringify(summary))
    await Bun.write(path.join(run, id, "1/cleanup.json"), JSON.stringify({ result: { status: "confirmed" }, processes: { status: "confirmed" },
      stages: ["processes", "diagnostics", "writer", "ready", "profile_history", "storage"].map(stage => ({ stage, status: "confirmed" })) }))
    await recordBaselineMeasurement(series, job.key, run)
  }
  await sealBaselineRelease(series, { status: "RELEASED", evidenceSha256: "5".repeat(64) })
  const exported = await runBaseline(["check", "--series", series, "--export"], {})
  if (exported.code !== 0 || typeof exported.archive !== "string") throw new Error("FIXTURE_EXPORT_FAILED")
  return { series, manifest, archive: exported.archive, archiveSha256: baselineHash(await Bun.file(exported.archive).bytes()) }
}
