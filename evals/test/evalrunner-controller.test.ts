import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises"
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

test("a controller crash before dispatch retains its lock; a dead PID alone never authorizes resume", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-crashed-"))
  try {
    await mkdir(path.join(root, "operations"))
    const source = `import {acquireEvalrunnerExecutor} from ${JSON.stringify(path.join(evalsRoot, "src/evalrunner-controller.ts"))};
      await acquireEvalrunnerExecutor({root:${JSON.stringify(root)}},{issue:'LAB-77',task:'crashed',series:${JSON.stringify(path.join(root, "series"))}});process.exit(0);`
    const child = Bun.spawn([process.execPath, "-e", source], { stdout: "pipe", stderr: "pipe" })
    expect(await child.exited).toBe(0)
    const owner = path.join(root, "operations/series-executor.lock/owner.json"), before = await readFile(owner)
    await expect(acquireEvalrunnerExecutor({ root }, { issue: "LAB-77", task: "resume", series: path.join(root, "series") })).rejects.toThrow("BUSY/BLOCKED")
    expect(await readFile(owner)).toEqual(before)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("independent concurrent controllers have one winner and preserve the same executor ownership", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-concurrent-"))
  await mkdir(path.join(root, "operations"))
  const start = path.join(root, "start"), release = path.join(root, "release")
  const children = [1, 2].map(index => Bun.spawn([process.execPath, "-e", `
    import {acquireEvalrunnerExecutor} from ${JSON.stringify(path.join(evalsRoot, "src/evalrunner-controller.ts"))};
    await Bun.write(${JSON.stringify(path.join(root, "ready-" + index))},'ready');
    while(!await Bun.file(${JSON.stringify(start)}).exists())await Bun.sleep(5);
    try{const owner=await acquireEvalrunnerExecutor({root:${JSON.stringify(root)}},{issue:'LAB-77',task:'task-${index}',series:${JSON.stringify(path.join(root, "series"))}});
      while(!await Bun.file(${JSON.stringify(release)}).exists())await Bun.sleep(5);
      await owner.release();process.exit(0);
    }catch{process.exit(2);}`], { stdout: "pipe", stderr: "pipe" }))
  try {
    const deadline = Date.now() + 5000
    while (!(await Bun.file(path.join(root, "ready-1")).exists() && await Bun.file(path.join(root, "ready-2")).exists()) && Date.now() < deadline) await Bun.sleep(5)
    expect(await Bun.file(path.join(root, "ready-2")).exists()).toBe(true)
    await Bun.write(start, "go")
    expect(await Promise.race(children.map(child => child.exited))).toBe(2)
    await Bun.write(release, "release")
    expect((await Promise.all(children.map(child => child.exited))).sort()).toEqual([0, 2])
  } finally {
    await Bun.write(start, "go"); await Bun.write(release, "release")
    await Promise.all(children.map(child => child.exited)); await rm(root, { recursive: true, force: true })
  }
}, 10_000)

test("a historical LAB-76 stand lease remains byte-for-byte intact regardless of its PID", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-historical-"))
  try {
    await mkdir(path.join(root, "operations/stand.lease"), { recursive: true })
    const file = path.join(root, "operations/stand.lease/owner.json"), raw = JSON.stringify({ issue: "LAB-76", pid: 999999999, nonce: "historical" })
    await Bun.write(file, raw)
    const manifest = createEvalrunnerManifest({ issue: "LAB-77", task: "fixture", series: path.join(root, "series"), scope: "full", pins: {}, corpus: await loadEvalrunnerCorpus(evalsRoot) })
    await expect(acquireEvalrunnerSeriesLease({ root }, manifest)).rejects.toThrow("BUSY/BLOCKED")
    expect(await Bun.file(file).text()).toBe(raw)
  } finally { await rm(root, { recursive: true, force: true }) }
})
