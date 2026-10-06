import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { loadTasks } from "../src/task"
import { prepareCalibrationCases } from "../src/calibration-cases"
import { calibrate } from "../src/calibrate"
import { evalsRoot, loadConfig } from "../src/config"

test("calibration rejects a missed sort even when oracle rejects its CSV", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-near-miss-"))
  try {
    const taskDir = path.join(evalsRoot, "fixtures/calibration/sales-by-category")
    const corpusDir = path.join(root, "corpus")
    await mkdir(path.join(corpusDir, "sales-by-category"), { recursive: true })
    const sources = Object.fromEntries(await Promise.all(
      ["task.json", "reference.lgp", "SPEC.md", "oracle.csv", "data/dataset.csv"].map(async (file) =>
        [file, new Bun.CryptoHasher("sha256").update(await Bun.file(path.join(taskDir, file)).bytes()).digest("hex")]),
    ))
    await Bun.write(path.join(corpusDir, "sales-by-category/cases.json"), JSON.stringify({
      sources, cases: [{
        id: "sort", kind: "sort",
        edits: [{ file: "Unit_0/Unit.xml", from: 'Name="revenue" SortDirection="sdDesc"', to: 'Name="revenue" SortDirection="sdAsc"', count: 1 }],
        result_csv: "sort.csv", expected_failed: ["sort-revenue", "result-rows"], expected_oracle_pass: false,
      }],
    }))
    const lines = (await Bun.file(path.join(taskDir, "oracle.csv")).text()).trim().split("\n")
    await Bun.write(path.join(corpusDir, "sales-by-category/sort.csv"), [lines[0], ...lines.slice(1).reverse()].join("\n") + "\n")
    const config = loadConfig(["--calibrate", "--tasks", path.dirname(taskDir), "--only", "sales-by-category"], {
      JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: "bun " + path.join(evalsRoot, "fixtures/fake-codex.ts"), EVAL_RESULTS_DIR: path.join(root, "results"),
    })
    const result = await calibrate(config, corpusDir)
    const report = await Bun.file(path.join(result.runDir, "calibration.json")).json()
    expect(result.code).toBe(1)
    expect(report.rows.find((row: { kind: string }) => row.kind === "near-miss")).toMatchObject({
      case_id: "sort", oracle_pass: false, failed: [], expectations_met: false,
    })
    expect(report.warnings.join("\n")).toContain("sort-revenue")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

 test("positive calibration includes synthetic result evidence and oracle", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-positive-csv-"))
  try {
    const config = loadConfig(["--calibrate", "--tasks", path.join(evalsRoot, "fixtures/calibration"), "--only", "sales-by-category"], {
      JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: "bun " + path.join(evalsRoot, "fixtures/fake-codex.ts"), EVAL_RESULTS_DIR: path.join(root, "results"),
    })
    const result = await calibrate(config, path.join(root, "corpus"))
    const report = await Bun.file(path.join(result.runDir, "calibration.json")).json()
    expect(report.rows[0]).toMatchObject({ kind: "positive", score: 100, oracle_pass: true })
    const checklist = await Bun.file(path.join(result.runDir, "sales-by-category/positive/judge/checklist.json")).json()
    expect(checklist.some((item: { id: string }) => item.id === "result-rows")).toBe(true)
    expect(checklist.some((item: { id: string }) => item.id === "honest-report")).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("calibration refuses a stale reference fingerprint before judging", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-corpus-hash-"))
  try {
    const corpusDir = path.join(root, "corpus/sales-by-category")
    await mkdir(corpusDir, { recursive: true })
    await Bun.write(path.join(corpusDir, "cases.json"), JSON.stringify({ sources: { "reference.lgp": "0".repeat(64) }, cases: [] }))
    const tasks = await loadTasks(path.join(evalsRoot, "fixtures/calibration"), ["sales-by-category"])
    await expect(prepareCalibrationCases(tasks, path.join(root, "run"), path.dirname(corpusDir))).rejects.toThrow("reference.lgp")
  } finally { await rm(root, { recursive: true, force: true }) }
})

async function sortCorpus(root: string) {
  const taskDir = path.join(evalsRoot, "fixtures/calibration/sales-by-category")
  const corpusDir = path.join(root, "corpus")
  const dir = path.join(corpusDir, "sales-by-category")
  await mkdir(dir, { recursive: true })
  const sources = Object.fromEntries(await Promise.all(
    ["task.json", "reference.lgp", "SPEC.md", "oracle.csv", "data/dataset.csv"].map(async (file) =>
      [file, new Bun.CryptoHasher("sha256").update(await Bun.file(path.join(taskDir, file)).bytes()).digest("hex")]),
  ))
  const corpus = { sources, cases: [{
    id: "sort", kind: "sort",
    edits: [{ file: "Unit_0/Unit.xml", from: 'Name="revenue" SortDirection="sdDesc"', to: 'Name="revenue" SortDirection="sdAsc"', count: 1 }],
    result_csv: "sort.csv", expected_failed: ["sort-revenue", "result-rows"], expected_oracle_pass: false,
  }] }
  await Bun.write(path.join(dir, "cases.json"), JSON.stringify(corpus))
  const lines = (await Bun.file(path.join(taskDir, "oracle.csv")).text()).trim().split("\n")
  await Bun.write(path.join(dir, "sort.csv"), [lines[0], ...lines.slice(1).reverse()].join("\n") + "\n")
  return { corpusDir, dir, corpus, tasks: await loadTasks(path.dirname(taskDir), ["sales-by-category"]) }
}

test("calibration refuses an XML edit that no longer matches", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-edit-count-"))
  try {
    const fixture = await sortCorpus(root)
    fixture.corpus.cases[0]!.edits[0]!.from = "nonexistent XML"
    await Bun.write(path.join(fixture.dir, "cases.json"), JSON.stringify(fixture.corpus))
    await expect(prepareCalibrationCases(fixture.tasks, path.join(root, "run"), fixture.corpusDir)).rejects.toThrow("sort")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("calibration refuses expectations on unavailable run evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-case-id-"))
  try {
    const fixture = await sortCorpus(root)
    fixture.corpus.cases[0]!.expected_failed = ["honest-report"]
    await Bun.write(path.join(fixture.dir, "cases.json"), JSON.stringify(fixture.corpus))
    await expect(prepareCalibrationCases(fixture.tasks, path.join(root, "run"), fixture.corpusDir)).rejects.toThrow("honest-report")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("calibration refuses CSV that contradicts its oracle expectation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-oracle-expect-"))
  try {
    const fixture = await sortCorpus(root)
    fixture.corpus.cases[0]!.expected_oracle_pass = true
    await Bun.write(path.join(fixture.dir, "cases.json"), JSON.stringify(fixture.corpus))
    await expect(prepareCalibrationCases(fixture.tasks, path.join(root, "run"), fixture.corpusDir)).rejects.toThrow("oracle")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("calibration rejects a result path escaping its corpus", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-path-"))
  try {
    const fixture = await sortCorpus(root)
    fixture.corpus.cases[0]!.result_csv = "../outside.csv"
    await Bun.write(path.join(fixture.corpusDir, "outside.csv"), await Bun.file(path.join(fixture.dir, "sort.csv")).text())
    await Bun.write(path.join(fixture.dir, "cases.json"), JSON.stringify(fixture.corpus))
    await expect(prepareCalibrationCases(fixture.tasks, path.join(root, "run"), fixture.corpusDir)).rejects.toMatchObject({ exitCode: 2 })
  } finally { await rm(root, { recursive: true, force: true }) }
})
