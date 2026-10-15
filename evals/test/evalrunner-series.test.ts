import { expect, test } from "bun:test"
import { evalsRoot } from "../src/config"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { loadEvalrunnerCorpus, buildEvalrunnerSlots, createEvalrunnerManifest, reserveEvalrunnerSeries, readEvalrunnerSeries, admitEvalrunnerSlot } from "../src/evalrunner-series"

test("full series freezes only 48 accepted cases and orders three rounds regular, analytic, node", async () => {
  const corpus = await loadEvalrunnerCorpus(evalsRoot)
  expect(corpus.cases.length).toBe(48)
  expect(["regular", "analytic", "node"].map(collection => corpus.cases.filter(item => item.collection === collection).length)).toEqual([3, 35, 10])
  const slots = buildEvalrunnerSlots(corpus)
  expect(slots.length).toBe(144)
  expect(new Set(slots.map(slot => slot.id)).size).toBe(144)
  for (const round of [1, 2, 3]) {
    const current = slots.filter(slot => slot.round === round)
    expect(current.map(slot => [slot.collection, slot.case])).toEqual(corpus.cases.map(item => [item.collection, item.id]))
    expect(current.slice(0, 3).every(slot => slot.collection === "regular")).toBe(true)
    expect(current.slice(38).every(slot => slot.collection === "node")).toBe(true)
  }
  expect(corpus.files.length).toBeGreaterThan(48)
  expect(corpus.files.every(file => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true)
  expect((await loadEvalrunnerCorpus(evalsRoot)).sha256).toBe(corpus.sha256)
})

test("versioned series reservation survives another directory and task, and a consumed slot cannot dispatch again", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-series-"))
  const config = { root, results: path.join(root, "results") }
  await mkdir(config.results)
  try {
    const corpus = await loadEvalrunnerCorpus(evalsRoot)
    const manifest = createEvalrunnerManifest({ issue: "LAB-77", task: "task-1", scope: "full",
      series: path.join(config.results, "v02-full-LAB-77"), pins: { configSha256: "a".repeat(64) }, corpus })
    await reserveEvalrunnerSeries(config, manifest)
    expect((await readEvalrunnerSeries(config, manifest.series)).slots.length).toBe(144)
    await expect(reserveEvalrunnerSeries(config, { ...manifest, series: path.join(config.results, "another"), task: "task-2" })).rejects.toThrow()
    const first = manifest.slots[0]!
    await admitEvalrunnerSlot(config, manifest, first, "task-1")
    await expect(admitEvalrunnerSlot(config, manifest, first, "task-2")).rejects.toThrow("already admitted")
    await Bun.write(path.join(manifest.series, "manifest.json"), JSON.stringify({ ...manifest, slots: manifest.slots.slice(1) }))
    await expect(readEvalrunnerSeries(config, manifest.series)).rejects.toThrow("Manifest changed")
  } finally { await rm(root, { recursive: true, force: true }) }
})
