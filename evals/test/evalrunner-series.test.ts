import { expect, test } from "bun:test"
import { evalsRoot } from "../src/config"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { loadEvalrunnerCorpus, buildEvalrunnerSlots, createEvalrunnerManifest, reserveEvalrunnerSeries, readEvalrunnerSeries, admitEvalrunnerSlot, durableEvalrunnerJson } from "../src/evalrunner-series"
import { inspectEvalrunnerSeries } from "../src/evalrunner-series-check"

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

test("durable JSON becomes visible atomically as a complete document", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-atomic-"))
  const file = path.join(root, "admission.json"), payload = { value: "x".repeat(16 * 1024 * 1024) }
  const ready = path.join(root, "ready"), stop = path.join(root, "stop")
  const reader = Bun.spawn([process.execPath, "-e", `
    await Bun.write(${JSON.stringify(ready)},'ready');const deadline=Date.now()+15000;
    while(!await Bun.file(${JSON.stringify(file)}).exists()){
      if(Date.now()>deadline||await Bun.file(${JSON.stringify(stop)}).exists())process.exit(3);
      await Bun.sleep(0);
    }
    try{const data=await Bun.file(${JSON.stringify(file)}).json();process.exit(data.value.length===${payload.value.length}?0:2)}catch{process.exit(2)}
  `], { stdout: "pipe", stderr: "pipe" })
  try {
    const deadline = Date.now() + 5000
    while (!await Bun.file(ready).exists() && Date.now() < deadline) await Bun.sleep(5)
    expect(await Bun.file(ready).exists()).toBe(true)
    await durableEvalrunnerJson(file, payload)
    expect(await reader.exited).toBe(0)
    await expect(durableEvalrunnerJson(file, { value: "replacement" })).rejects.toThrow()
    expect((await Bun.file(file).json()).value.length).toBe(payload.value.length)
  } finally { await Bun.write(stop, "stop"); await reader.exited; await rm(root, { recursive: true, force: true }) }
}, 20_000)

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
    expect(await inspectEvalrunnerSeries(config, manifest.series)).toMatchObject({ status: "READY", completed: 0, expected: 144, next: manifest.slots[0] })
    await expect(reserveEvalrunnerSeries(config, { ...manifest, series: path.join(config.results, "another"), task: "task-2" })).rejects.toThrow()
    const first = manifest.slots[0]!
    await admitEvalrunnerSlot(config, manifest, first, "task-1")
    expect(await inspectEvalrunnerSeries(config, manifest.series)).toMatchObject({ status: "BLOCKED", completed: 0, expected: 144, blockedSlot: first.id })
    await expect(admitEvalrunnerSlot(config, manifest, manifest.slots[1]!, "task-2")).rejects.toThrow("Earlier slot unresolved")
    await expect(admitEvalrunnerSlot(config, manifest, first, "task-2")).rejects.toThrow("already admitted")
    await Bun.write(path.join(manifest.series, "manifest.json"), JSON.stringify({ ...manifest, slots: manifest.slots.slice(1) }))
    await expect(readEvalrunnerSeries(config, manifest.series)).rejects.toThrow("Manifest changed")
  } finally { await rm(root, { recursive: true, force: true }) }
})
