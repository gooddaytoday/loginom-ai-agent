import path from "node:path"
import { cp, mkdir, rm } from "node:fs/promises"
import type { Task } from "./task"
import { unzip } from "./artifact"
import { checkOracle } from "./oracle"
import { EvalFailure } from "./fail"

export type CalibrationCase = {
  id: string
  kind: "sort" | "aggregate" | "threshold" | "filter" | "column"
  edits: { file: string; from: string; to: string; count: number }[]
  result_csv: string
  expected_failed: string[]
  expected_oracle_pass: boolean
}
export type CalibrationCorpus = { sources: Record<string, string>; cases: CalibrationCase[] }

export async function prepareCalibrationCases(tasks: Task[], runDir: string, corpusDir: string) {
  const prepared: { task: Task; mutation: CalibrationCase; artifactDir: string; oracle: Awaited<ReturnType<typeof checkOracle>> }[] = []
  const hasher = new Bun.CryptoHasher("sha256")
  for (const task of tasks) {
    const dir = path.join(corpusDir, task.id)
    const file = Bun.file(path.join(dir, "cases.json"))
    if (!(await file.exists())) continue
    const source = await file.text()
    const corpus = JSON.parse(source) as CalibrationCorpus
    for (const [name, digest] of Object.entries(corpus.sources)) {
      const actual = new Bun.CryptoHasher("sha256").update(await Bun.file(path.join(task.dir, name)).bytes()).digest("hex")
      if (actual !== digest) throw new EvalFailure(task.id + ": устаревший источник " + name, 2)
    }
    hasher.update(task.id + "\n" + source)
    for (const mutation of corpus.cases) {
      const artifactDir = path.join(runDir, task.id, "near-miss", mutation.id, "artifact")
      await mkdir(path.join(artifactDir, "results"), { recursive: true })
      const archive = path.join(artifactDir, "package.lgp")
      const unpacked = path.join(artifactDir, "unpacked")
      await cp(path.join(task.dir, task.reference), archive)
      if (!(await unzip(archive, unpacked))) throw new EvalFailure(task.id + ": reference не распакован", 2)
      for (const edit of mutation.edits) {
        const target = path.join(unpacked, edit.file)
        await Bun.write(target, (await Bun.file(target).text()).replaceAll(edit.from, edit.to))
      }
      await rm(archive)
      const zipped = Bun.spawn(["zip", "-q", "-r", archive, "."], { cwd: unpacked, stdout: "ignore", stderr: "pipe" })
      if (await zipped.exited !== 0) throw new EvalFailure(task.id + ": zip failed", 2)
      const csv = await Bun.file(path.join(dir, mutation.result_csv)).text()
      hasher.update(mutation.id + "\n" + csv)
      await Bun.write(path.join(artifactDir, "results", "calibration.result.csv"), csv)
      prepared.push({ task, mutation, artifactDir, oracle: await checkOracle(task, artifactDir) })
    }
  }
  return { prepared, hash: hasher.digest("hex") }
}
