
import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { comparisonSummary } from "./helpers/compare-summary"
import { loadConfig } from "../src/config"

async function runCompare(directory: string, args: string[]) {
 const process = Bun.spawn([Bun.which("bun")!,path.resolve("src/compare.ts"),...args], {env:{...Bun.env,EVAL_RESULTS_DIR:directory},stdout:"pipe",stderr:"pipe"})
 const [code,stdout,stderr] = await Promise.all([process.exited,new Response(process.stdout).text(),new Response(process.stderr).text()])
 return {code,stdout,stderr}
}
async function summaries(directory: string) {
 const text = JSON.stringify(comparisonSummary(Array.from({length:5}, () => ({successes:3,attempts:3}))))
 for (const id of ["a","b"]) {
  await mkdir(path.join(directory,id),{recursive:true})
  await Bun.write(path.join(directory,id,"summary.json"),text)
 }
 return text
}
test("CLI compare: изолированный results, отчёт и неизменные входы", async () => {
 const directory = await mkdtemp(path.join(os.tmpdir(),"evals-compare-cli-"))
 try {
  const original = await summaries(directory)
  const result = await runCompare(directory,["a","b","--margin","0.5","--confidence","0.95","--k","3"])
  expect(result.code).toBe(0)
  expect(result.stdout).toContain("неразличимо")
  expect(result.stdout.trimEnd()).toBe((await Bun.file(path.join(directory,"compare-a-vs-b.md")).text()).trimEnd())
  for (const id of ["a","b"]) expect(await Bun.file(path.join(directory,id,"summary.json")).text()).toBe(original)
 } finally { await rm(directory,{recursive:true,force:true}) }
})


test("CLI compare: malformed JSON shapes дают exit 2", async () => {
 const directory = await mkdtemp(path.join(os.tmpdir(),"evals-compare-bad-json-"))
 try {
  await summaries(directory)
  for (const source of ["null","[]","{}","{ broken",JSON.stringify({...comparisonSummary([{successes:3,attempts:3}]), tasks:[{id:"task-0",attempts:"bad"}]})]) {
   await Bun.write(path.join(directory,"a/summary.json"),source)
   const result = await runCompare(directory,["a","b"])
   expect(result.code).toBe(2)
   expect(result.stderr).toContain("Некорректный summary")
  }
 } finally { await rm(directory,{recursive:true,force:true}) }
})

test("CLI compare: отсутствующая обязательная метрика даёт data error exit 2", async () => {
 const directory = await mkdtemp(path.join(os.tmpdir(),"evals-compare-metrics-"))
 try {
  await summaries(directory)
  const raw = await Bun.file(path.join(directory,"a/summary.json")).json()
  delete raw.metrics.mean_score
  await Bun.write(path.join(directory,"a/summary.json"),JSON.stringify(raw))
  const result = await runCompare(directory,["a","b"])
  expect(result.code).toBe(2)
  expect(result.stderr).toContain("Некорректный summary")
 } finally { await rm(directory,{recursive:true,force:true}) }
})

test("CLI compare: malformed infra_retry.initial даёт exit 2 и сохраняет входы", async () => {
 const directory = await mkdtemp(path.join(os.tmpdir(),"evals-compare-retry-"))
 try {
  const original = await summaries(directory)
  const run = comparisonSummary([{successes:3,attempts:3}])
  const attempt = run.tasks[0]!.attempts[0]!
  const initial = { ...attempt, status: "infra_error", score: null, pass: null, judge_status: "skipped" }
  for (const retry of [null, [], {}, {initial:null}, {initial:{}},
   {initial:{...initial,cost:"bad"}}, {initial:{...initial,duration_ms:-1}},
   {initial:{...initial,tokens:null}}, {initial:{...initial,counters:{}}},
   {initial:{...initial,judge_status:"bad"}}, {initial:{...initial,task_id:"other"}},
   {initial:{...initial,attempt:2}}, {initial:{...initial,status:"completed"}},
   {initial:{...initial,infra_retry:{initial}}}]) {
   Object.assign(attempt, {infra_retry:retry})
   const saved = JSON.stringify(run)
   await Bun.write(path.join(directory,"a/summary.json"),saved)
   const result = await runCompare(directory,["a","b"])
   expect(result.code).toBe(2)
   expect(result.stderr).toContain("Некорректный summary")
   expect(await Bun.file(path.join(directory,"compare-a-vs-b.md")).exists()).toBe(false)
   expect(await Bun.file(path.join(directory,"a/summary.json")).text()).toBe(saved)
   expect(await Bun.file(path.join(directory,"b/summary.json")).text()).toBe(original)
  }
  Object.assign(attempt, {infra_retry:{initial}})
  const saved = JSON.stringify(run)
  await Bun.write(path.join(directory,"a/summary.json"),saved)
  expect((await runCompare(directory,["a","b"])).code).toBe(0)
  expect(await Bun.file(path.join(directory,"a/summary.json")).text()).toBe(saved)
  expect(await Bun.file(path.join(directory,"b/summary.json")).text()).toBe(original)
 } finally { await rm(directory,{recursive:true,force:true}) }
})

test("CLI compare: invalid policy, duplicates, unknown flags и extra args дают exit 2", async () => {
 const directory = await mkdtemp(path.join(os.tmpdir(),"evals-compare-policy-"))
 try {
  await summaries(directory)
  for (const extra of [["--margin","1"],["--margin","-1"],["--confidence","0"],["--confidence","1"],["--k","0"],["--k","1.5"],["--margin","NaN"],["--margin",""],["--k"],["--unknown","3"],["extra"],["--k","3","--k","2"]])
    expect((await runCompare(directory,["a","b",...extra])).code).toBe(2)
 } finally { await rm(directory,{recursive:true,force:true}) }
})
test("CLI compare: regression, partial и incompatibility сохраняют exit 0", async () => {
 const directory = await mkdtemp(path.join(os.tmpdir(),"evals-compare-report-status-"))
 try {
  await summaries(directory)
  const a = comparisonSummary(Array.from({length:39}, () => ({successes:3,attempts:3})))
  const b = comparisonSummary(Array.from({length:39}, () => ({successes:0,attempts:3})))
  await Bun.write(path.join(directory,"a/summary.json"),JSON.stringify(a))
  await Bun.write(path.join(directory,"b/summary.json"),JSON.stringify(b))
  const regression = await runCompare(directory,["a","b"])
  expect(regression.code).toBe(0)
  expect(regression.stdout).toContain("хуже")
  expect(regression.stdout).toContain("наблюдаемый провал")
  b.interrupted = true
  await Bun.write(path.join(directory,"b/summary.json"),JSON.stringify(b))
  expect((await runCompare(directory,["a","b"])).code).toBe(0)
  b.agent.variant = "different"
  await Bun.write(path.join(directory,"b/summary.json"),JSON.stringify(b))
  const incompatible = await runCompare(directory,["a","b"])
  expect(incompatible.code).toBe(0)
  expect(incompatible.stdout).toContain("несравнимы")
 } finally { await rm(directory,{recursive:true,force:true}) }
})

test("CLI compare: serialized enum values проверяются по типу и допустимому значению", async () => {
 const directory = await mkdtemp(path.join(os.tmpdir(),"evals-compare-enums-"))
 try {
  await summaries(directory)
  for (const kind of ["judge","axis"]) {
   const run = comparisonSummary([{successes:3,attempts:3}])
   const raw = JSON.parse(JSON.stringify(run))
   if (kind === "judge") raw.tasks[0].attempts[0].judge_status = "garbage"
   if (kind === "axis") raw.tasks[0].rubric_snapshot.checklist[0].axis = ["structure"]
   await Bun.write(path.join(directory,"a/summary.json"),JSON.stringify(raw))
   expect((await runCompare(directory,["a","b"])).code).toBe(2)
  }
 } finally { await rm(directory,{recursive:true,force:true}) }
})

test("CLI compare: массив не подменяет строку judge_status", async () => {
 const directory = await mkdtemp(path.join(os.tmpdir(),"evals-compare-enum-type-"))
 try {
  await summaries(directory)
  const raw = await Bun.file(path.join(directory,"a/summary.json")).json()
  raw.tasks[0].attempts[0].judge_status = ["scored"]
  await Bun.write(path.join(directory,"a/summary.json"),JSON.stringify(raw))
  expect((await runCompare(directory,["a","b"])).code).toBe(2)
 } finally { await rm(directory,{recursive:true,force:true}) }
})


test("CLI compare: пустая метка из run допустима и входы не изменяются", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "evals-compare-empty-label-"))
  try {
    const original = await summaries(directory)
    const run = JSON.parse(original)
    run.label = loadConfig(["--dry-run", "--label", ""], {}).label
    const saved = JSON.stringify(run)
    await Bun.write(path.join(directory, "a/summary.json"), saved)
    const result = await runCompare(directory, ["a", "b"])
    expect(result.code).toBe(0)
    expect(result.stdout).toContain("неразличимо")
    expect(await Bun.file(path.join(directory, "a/summary.json")).text()).toBe(saved)
    expect(await Bun.file(path.join(directory, "b/summary.json")).text()).toBe(original)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
