import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { acquireEvalrunnerExecutor, acquireEvalrunnerSeriesLease, prepareEvalrunnerSeries, runEvalrunnerSeries } from "../src/evalrunner-controller"
import type { EvalrunnerConfig } from "../src/evalrunner"
import { createEvalrunnerManifest, loadEvalrunnerCorpus, reserveEvalrunnerSeries } from "../src/evalrunner-series"
import { evalsRoot } from "../src/config"

test("series commands fail before qualification or dispatch on a legacy configuration", async () => {
  const config = { version: 1 } as EvalrunnerConfig
  await expect(prepareEvalrunnerSeries(config, { issue: "LAB-77", task: "task", scope: "full" })).rejects.toThrow("Version 2 runtime required")
  await expect(runEvalrunnerSeries(config, { series: "/no-dispatch", task: "task", resume: false })).rejects.toThrow("Version 2 runtime required")
})

test("one durable executor excludes concurrent start and resume, and refuses altered owner on release", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-controller-"))
  try {
    await mkdir(path.join(root, "operations"))
    const input = { issue: "LAB-77", series: path.join(root, "results/v02-full-LAB-77"), task: "task-1" }
    const first = await acquireEvalrunnerExecutor({ root }, input)
    await expect(acquireEvalrunnerExecutor({ root }, { ...input, task: "task-2" })).rejects.toThrow("Executor BUSY/BLOCKED")
    await Bun.write(path.join(root, "operations/series-executor.lock/owner.json"), "replaced")
    await expect(first.release()).rejects.toThrow("Executor owner changed")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("logical series lease remains across controller handles and never adopts historical or foreign ownership", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-logical-lease-"))
  try {
    await mkdir(path.join(root, "operations"))
    const corpus = await loadEvalrunnerCorpus(evalsRoot)
    const manifest = createEvalrunnerManifest({ issue: "LAB-77", task: "task-1", series: path.join(root, "results/v02-full-LAB-77"), scope: "full", pins: {}, corpus })
    await mkdir(path.join(root, "results"))
    await reserveEvalrunnerSeries({ root, results: path.join(root, "results") }, manifest)
    const first = await acquireEvalrunnerSeriesLease({ root }, manifest)
    const resumed = await acquireEvalrunnerSeriesLease({ root }, manifest)
    expect(resumed.nonce).toBe(first.nonce)
    await expect(acquireEvalrunnerSeriesLease({ root }, { ...manifest, nonce: crypto.randomUUID() })).rejects.toThrow("Stand BUSY/BLOCKED")
    await expect(first.release()).rejects.toThrow("Series coverage unconfirmed")
    expect(await Bun.file(path.join(root, "operations/stand.lease/owner.json")).exists()).toBe(true)
  } finally { await rm(root, { recursive: true, force: true }) }
})
