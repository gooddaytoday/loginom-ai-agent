import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { prepareBaseline } from "../src/baseline"
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
