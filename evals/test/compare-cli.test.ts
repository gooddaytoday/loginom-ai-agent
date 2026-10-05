
import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { comparisonSummary } from "./helpers/compare-summary"

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
