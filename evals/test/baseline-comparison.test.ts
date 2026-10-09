import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { completedBaselineFixture } from "./helpers/baseline-series"
import { baselineFixturePins } from "../fixtures/baseline"
import { acceptBaseline } from "../src/baseline-registry"
import { checkBaseline } from "../src/baseline"
import { repoRoot } from "../src/config"
import { compareBaselineConditions } from "../src/baseline-comparison"

test("full model experiment compares fixed conditions and rejects unexplained environment or scorer changes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-compare-"))
  try {
    const pins = { ...baselineFixturePins, harnessSha: (await Bun.$`git -C ${repoRoot} rev-parse HEAD`.quiet()).text().trim() }
    const before = await completedBaselineFixture(path.join(directory, "before"), { pins })
    const reference = await acceptBaseline(path.join(directory, "registry.json"), before.series, { issue: "LAB-55", decision: "owner fixture acceptance", expectedCurrent: null, archive: before.archive, archiveSha256: before.archiveSha256 })
    const candidate = { ...pins, model: "openai/other", variant: "high" }
    const after = await completedBaselineFixture(path.join(directory, "after"), { pins: candidate, executorRole: "evalrunner", baseline: reference,
      product: { version: candidate.cliVersion, source: candidate.cliSource, manifestSha256: candidate.cliManifestSha256, binarySha256: candidate.binarySha256, model: candidate.model, variant: candidate.variant }, declaredChanges: ["model", "reasoning"] })
    const a = await checkBaseline(before.series)
    const b = await checkBaseline(after.series)
    expect(await compareBaselineConditions(a, b)).toMatchObject({ status: "COMPARABLE", experiment: ["model", "reasoning"] })
    const changed = { ...b, manifest: { ...b.manifest, pins: { ...b.manifest.pins, isolationSha256: "0".repeat(64) } } }
    expect(await compareBaselineConditions(a, changed)).toMatchObject({ status: "INCOMPARABLE", reasons: ["isolationSha256"] })
    changed.manifest.operationalEquivalence = { version: 1, baselineId: a.id, previousIsolationSha256: a.manifest.pins.isolationSha256,
      currentIsolationSha256: changed.manifest.pins.isolationSha256, previousOpsConfigSha256: a.manifest.pins.opsConfigSha256,
      currentOpsConfigSha256: changed.manifest.pins.opsConfigSha256, previousHarnessSha: a.manifest.pins.harnessSha,
      currentHarnessSha: changed.manifest.pins.harnessSha, evaluatorSha256: (await (await import("../src/evaluator-replay")).evaluatorFingerprint(repoRoot, a.manifest.pins.harnessSha)),
      decision: "operator verified equivalent isolation after role/path migration", changes: ["role", "paths"] }
    expect((await compareBaselineConditions(a, changed)).status).toBe("COMPARABLE")
    changed.manifest.operationalEquivalence.baselineId = "foreign"
    expect((await compareBaselineConditions(a, changed)).status).toBe("INCOMPARABLE")
    const judge = { ...b, manifest: { ...b.manifest, pins: { ...b.manifest.pins, judgeModel: "other" } } }
    expect((await compareBaselineConditions(a, judge)).reasons).toContain("judgeModel")
    const output = await (await import("../src/baseline")).runBaseline(["check", "--series", after.series, "--export"], {})
    expect(output.code).toBe(0)
    const report = await Bun.file(path.join(String(output.reportDir), "comparison.json")).json()
    expect(report).toMatchObject({ status: "COMPARABLE", before: a.id, after: b.id })
    expect(report.cases).toHaveLength(48)
    expect(report.cases.find((item: { collection: string }) => item.collection === "node")).toMatchObject({ before: { passed: 0, measured: 3 }, after: { passed: 0, measured: 3 } })
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 90_000)
