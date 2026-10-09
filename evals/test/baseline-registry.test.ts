import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { acceptBaseline, acceptedBaseline } from "../src/baseline-registry"
import { prepareBaseline } from "../src/baseline"
import { baselineFixturePins } from "../fixtures/baseline"
import { repoRoot } from "../src/config"
import { completedBaselineFixture } from "./helpers/baseline-series"

test("acceptance is compare-and-swap and prepared baseline references survive pointer changes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "evalrunner-acceptance-"))
  try {
    const fixture = await completedBaselineFixture(directory)
    const registry = path.join(directory, "registry.json")
    const input = { issue: "LAB-55", decision: "explicit owner acceptance", expectedCurrent: null,
      archive: fixture.archive, archiveSha256: fixture.archiveSha256 }
    const attempts = await Promise.allSettled([acceptBaseline(registry, fixture.series, input), acceptBaseline(registry, fixture.series, input)])
    expect(attempts.filter(item => item.status === "fulfilled")).toHaveLength(1)
    const baseline = await acceptedBaseline(registry)
    expect(baseline.id).toBe(fixture.manifest.id)
    const product = { version: baselineFixturePins.cliVersion, source: baselineFixturePins.cliSource,
      manifestSha256: baselineFixturePins.cliManifestSha256, binarySha256: baselineFixturePins.binarySha256,
      model: baselineFixturePins.model, variant: baselineFixturePins.variant }
    const series = path.join(directory, "candidate")
    const prepared = await prepareBaseline(series, { checkout: repoRoot, pins: baselineFixturePins, executorRole: "evalrunner", product, baseline })
    expect(prepared.baseline).toEqual(baseline)
    await expect(acceptBaseline(registry, fixture.series, { ...input, expectedCurrent: "foreign" })).rejects.toThrow("BASELINE_POINTER_CHANGED")
    const before = await Bun.file(path.join(series, "manifest.json")).text()
    await expect(prepareBaseline(path.join(directory, "invalid"), { checkout: repoRoot, pins: baselineFixturePins,
      executorRole: "evalrunner", product, baseline: { ...baseline, manifestSha256: "0".repeat(64) } })).rejects.toThrow("ACCEPTED_BASELINE_CHANGED")
    expect(await Bun.file(path.join(series, "manifest.json")).text()).toBe(before)
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 60_000)

test("an incomplete LAB-55 cannot become the accepted baseline", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "evalrunner-registry-"))
  try {
    const series = path.join(directory, "LAB-55")
    await prepareBaseline(series, { checkout: repoRoot, pins: baselineFixturePins })
    await expect(acceptBaseline(path.join(directory, "registry.json"), series, { issue: "LAB-55", decision: "owner acceptance",
      expectedCurrent: null, archive: path.join(directory, "not-delivered.tar.gz"), archiveSha256: "0".repeat(64) })).rejects.toThrow("BASELINE_NOT_COMPLETE")
    expect(await Bun.file(path.join(directory, "registry.json")).exists()).toBe(false)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("candidate product inherits omitted model/reasoning from the exact accepted baseline", async () => {
  const { resolveEvalRunnerProduct } = await import("../src/baseline")
  const installed = { version: "0.1.18", source: "a".repeat(40), manifestSha256: "b".repeat(64), binarySha256: "c".repeat(64) }
  expect(resolveEvalRunnerProduct(installed, baselineFixturePins)).toEqual({ ...installed, model: baselineFixturePins.model, variant: baselineFixturePins.variant })
  expect(resolveEvalRunnerProduct(installed, baselineFixturePins, { model: "openai/other", variant: "high" })).toMatchObject({ model: "openai/other", variant: "high" })
})
