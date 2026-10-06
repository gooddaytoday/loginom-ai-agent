import path from "node:path"
import { cp, mkdir, rm } from "node:fs/promises"
import type { Task } from "./task"
import { unzip } from "./artifact"
import { checkOracle, compareCsv } from "./oracle"
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
    const raw: unknown = await file.json().catch(() => { throw new EvalFailure(task.id + ": неверный JSON корпуса", 2) })
    const corpus = requireCorpus(raw, task.id)
    for (const [name, digest] of Object.entries(corpus.sources)) {
      const bytes = await Bun.file(path.join(task.dir, name)).bytes().catch(() => {
        throw new EvalFailure(task.id + ": источник корпуса недоступен " + name, 2)
      })
      const actual = new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
      if (actual !== digest) throw new EvalFailure(task.id + ": устаревший источник " + name, 2)
    }
    for (const name of ["task.json", task.reference, task.spec, ...task.inputs, ...(task.oracle ? [task.oracle] : [])])
      if (!corpus.sources[name]) throw new EvalFailure(task.id + ": отсутствует source hash " + name, 2)
    for (const command of ["zip", "xmllint"])
      if (corpus.cases.length && !Bun.which(command)) throw new EvalFailure("Не найдена команда " + command, 2)
    hasher.update(task.id + "\n" + source)
    for (const mutation of corpus.cases) {
      const unavailable = mutation.expected_failed.filter((id) => !task.checklist.some((item) => item.id === id && !item.requiresRun))
      if (!mutation.expected_failed.length || unavailable.length)
        throw new EvalFailure(task.id + "/" + mutation.id + ": недоступные expected_failed " + unavailable.join(", "), 2)
      const artifactDir = path.join(runDir, task.id, "near-miss", mutation.id, "artifact")
      await mkdir(path.join(artifactDir, "results"), { recursive: true })
      const archive = path.join(artifactDir, "package.lgp")
      const unpacked = path.join(artifactDir, "unpacked")
      await cp(path.join(task.dir, task.reference), archive)
      if (!(await unzip(archive, unpacked))) throw new EvalFailure(task.id + ": reference не распакован", 2)
      for (const edit of mutation.edits) {
        const target = path.join(unpacked, edit.file)
        const xml = await Bun.file(target).text().catch(() => {
          throw new EvalFailure(task.id + "/" + mutation.id + ": XML замены недоступен " + edit.file, 2)
        })
        if (!edit.from || edit.from === edit.to || xml.split(edit.from).length - 1 !== edit.count)
          throw new EvalFailure(task.id + "/" + mutation.id + ": неверное число XML-замен", 2)
        await Bun.write(target, xml.replaceAll(edit.from, edit.to))
      }
      const xmlFiles = [...new Set(mutation.edits.map((edit) => edit.file))]
      const validation = Bun.spawn(["xmllint", "--nonet", "--noout", ...xmlFiles], { cwd: unpacked, stdout: "ignore", stderr: "pipe" })
      // xmllint reports namespace errors on stderr even when its exit code is zero.
      const diagnostics = await new Response(validation.stderr).text()
      if (await validation.exited !== 0 || diagnostics.trim())
        throw new EvalFailure(task.id + "/" + mutation.id + ": XML корпуса невалиден " + xmlFiles.join(", "), 2)
      await rm(archive)
      const zipped = Bun.spawn(["zip", "-q", "-r", archive, "."], { cwd: unpacked, stdout: "ignore", stderr: "pipe" })
      if (await zipped.exited !== 0) throw new EvalFailure(task.id + ": zip failed", 2)
      const csv = await Bun.file(path.join(dir, mutation.result_csv)).text().catch(() => {
        throw new EvalFailure(task.id + "/" + mutation.id + ": CSV корпуса недоступен", 2)
      })
      requireCsv(csv, task.id + "/" + mutation.id)
      hasher.update(mutation.id + "\n" + csv)
      await Bun.write(path.join(artifactDir, "results", "calibration.result.csv"), csv)
      const oracle = await checkOracle(task, artifactDir)
      if (oracle.passed !== mutation.expected_oracle_pass)
        throw new EvalFailure(task.id + "/" + mutation.id + ": CSV противоречит expected oracle", 2)
      prepared.push({ task, mutation, artifactDir, oracle })
    }
  }
  return { prepared, hash: hasher.digest("hex") }
}

function requireCorpus(raw: unknown, task: string): CalibrationCorpus {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    throw new EvalFailure(task + ": корпус должен быть объектом", 2)
  const corpus = raw as CalibrationCorpus
  if (typeof corpus.sources !== "object" || corpus.sources === null || Array.isArray(corpus.sources) ||
    !Array.isArray(corpus.cases)) throw new EvalFailure(task + ": неверные sources/cases", 2)
  for (const [name, hash] of Object.entries(corpus.sources)) {
    requireRelativePath(name, task)
    if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) throw new EvalFailure(task + ": неверный SHA256 " + name, 2)
  }
  const ids = new Set<string>()
  for (const item of corpus.cases) {
    if (!item || typeof item.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(item.id) || ids.has(item.id) ||
      !["sort", "aggregate", "threshold", "filter", "column"].includes(item.kind) ||
      !Array.isArray(item.edits) || !item.edits.length || !Array.isArray(item.expected_failed) ||
      !item.expected_failed.every((id) => typeof id === "string") || new Set(item.expected_failed).size !== item.expected_failed.length ||
      typeof item.expected_oracle_pass !== "boolean") throw new EvalFailure(task + ": неверный или дублирующийся случай", 2)
    ids.add(item.id)
    requireRelativePath(item.result_csv, task)
    for (const edit of item.edits) {
      if (!edit || typeof edit.from !== "string" || !edit.from || typeof edit.to !== "string" || edit.from === edit.to ||
        !Number.isInteger(edit.count) || edit.count <= 0) throw new EvalFailure(task + "/" + item.id + ": неверная XML-замена", 2)
      requireRelativePath(edit.file, task)
      if (!edit.file.endsWith("/Unit.xml")) throw new EvalFailure(task + ": редактируется только Unit.xml", 2)
    }
  }
  return corpus
}

function requireRelativePath(value: unknown, task: string) {
  if (typeof value !== "string" || !value || path.isAbsolute(value) || value.includes("\\") ||
    value.split("/").some((part) => !part || part === "." || part === ".."))
    throw new EvalFailure(task + ": неверный относительный путь " + String(value), 2)
}

// compareCsv rejects a malformed reference through an exception.
function requireCsv(csv: string, context: string) {
  try {
    compareCsv(csv, csv)
  } catch {
    throw new EvalFailure(context + ": CSV корпуса невалиден", 2)
  }
}
