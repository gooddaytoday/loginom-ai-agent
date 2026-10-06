import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { loadTasks } from "../src/task"
import { prepareCalibrationCases, type CalibrationCorpus } from "../src/calibration-cases"
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

test("versioned sort corpus creates a matching ZIP and unpacked mutation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-corpus-zip-"))
  try {
    const tasks = await loadTasks(path.join(evalsRoot, "fixtures/calibration"), ["sales-by-category"])
    const result = await prepareCalibrationCases(tasks, root, path.join(evalsRoot, "calibration"))
    const entry = result.prepared.find((item) => item.mutation.kind === "sort")
    expect(entry).toBeDefined()
    const archive = Bun.spawn(["unzip", "-p", path.join(entry!.artifactDir, "package.lgp"), "Unit_0/Unit.xml"], { stdout: "pipe" })
    expect(await new Response(archive.stdout).text()).toBe(await Bun.file(path.join(entry!.artifactDir, "unpacked/Unit_0/Unit.xml")).text())
    expect(await archive.exited).toBe(0)
    expect(entry!.oracle.passed).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("missing export column keeps CSV and explicit export schema consistent", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-column-"))
  try {
    const tasks = await loadTasks(path.join(evalsRoot, "fixtures/calibration"), ["sales-by-category"])
    const result = await prepareCalibrationCases(tasks, root, path.join(evalsRoot, "calibration"))
    const entry = result.prepared.find((item) => item.mutation.kind === "column")
    expect(entry).toBeDefined()
    expect(await Bun.file(path.join(entry!.artifactDir, "results/calibration.result.csv")).text()).not.toContain("avg_unit_price")
    const xml = await Bun.file(path.join(entry!.artifactDir, "unpacked/Unit_0/Unit.xml")).text()
    expect(xml).toContain('SyncThroughColumns="false"')
    expect(entry!.mutation.expected_failed).toEqual(["export-columns", "result-rows"])
    expect(entry!.oracle.passed).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("wrong aggregation preserves exported names with recomputed values", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-aggregate-"))
  try {
    const tasks = await loadTasks(path.join(evalsRoot, "fixtures/calibration"), ["sales-by-category"])
    const result = await prepareCalibrationCases(tasks, root, path.join(evalsRoot, "calibration"))
    const entry = result.prepared.find((item) => item.mutation.kind === "aggregate")
    expect(entry).toBeDefined()
    const xml = await Bun.file(path.join(entry!.artifactDir, "unpacked/Unit_0/Unit.xml")).text()
    expect(xml).toContain('Source="total_Avg"')
    expect(xml).not.toContain('Source="total_Sum"')
    expect(entry!.mutation.expected_failed).toEqual(["group-category", "result-rows"])
    expect(entry!.oracle.passed).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("calibration accepts a judge that fails every expected near-miss item", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-correct-judge-"))
  try {
    const fixture = await sortCorpus(root)
    const answers = path.join(root, "answers.json")
    await Bun.write(answers, JSON.stringify({ sort: ["sort-revenue", "result-rows"] }))
    const config = loadConfig(["--calibrate", "--tasks", path.join(evalsRoot, "fixtures/calibration"), "--only", "sales-by-category"], {
      JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: "bun " + path.join(evalsRoot, "fixtures/fake-codex.ts") + " --failed-by-case " + answers, EVAL_RESULTS_DIR: path.join(root, "results"),
    })
    const result = await calibrate(config, fixture.corpusDir)
    expect(result.code).toBe(0)
    const report = await Bun.file(path.join(result.runDir, "calibration.json")).json()
    expect(report.rows.find((row: { kind: string }) => row.kind === "near-miss")).toMatchObject({ expectations_met: true })
    const markdown = await Bun.file(path.join(result.runDir, "calibration.md")).text()
    expect(markdown).toContain("near-miss/sort")
    expect(markdown).toContain("oracle")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("calculator threshold mutation recomputes downstream class totals", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-threshold-"))
  try {
    const tasks = await loadTasks(path.join(evalsRoot, "fixtures/calibration"), ["abc-pareto-groups"])
    const result = await prepareCalibrationCases(tasks, root, path.join(evalsRoot, "calibration"))
    const entry = result.prepared.find((item) => item.mutation.kind === "threshold")
    expect(entry).toBeDefined()
    expect(entry!.mutation.expected_failed).toEqual(["cumulative-class", "result-rows"])
    expect(entry!.oracle.passed).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("filter near-miss is rejected by checklist even when its CSV remains correct", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-filter-boundary-"))
  try {
    const tasks = await loadTasks(path.join(evalsRoot, "fixtures/calibration"), ["low-liquidity-companies"])
    const prepared = await prepareCalibrationCases(tasks, root, path.join(evalsRoot, "calibration"))
    const entry = prepared.prepared.find((item) => item.mutation.kind === "filter")
    expect(entry).toBeDefined()
    expect(entry!.oracle.passed).toBe(true)
    expect(entry!.mutation.expected_failed).toEqual(["filter-ratio"])
    const answers = path.join(root, "answers.json")
    await Bun.write(answers, JSON.stringify({ sort: ["sort-ratio-id", "result-rows"], column: ["export-columns", "result-rows"] }))
    const config = loadConfig(["--calibrate", "--tasks", path.join(evalsRoot, "fixtures/calibration"), "--only", "low-liquidity-companies"], {
      JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: "bun " + path.join(evalsRoot, "fixtures/fake-codex.ts") + " --failed-by-case " + answers, EVAL_RESULTS_DIR: path.join(root, "results"),
    })
    const result = await calibrate(config)
    expect(result.code).toBe(1)
    const report = await Bun.file(path.join(result.runDir, "calibration.json")).json()
    expect(report.rows.find((row: { case_id: string }) => row.case_id === "filter")).toMatchObject({ oracle_pass: true, expectations_met: false })
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("analytic corpus covers all 35 tasks and all 113 applicable defects", async () => {
  const files = await Array.fromAsync(new Bun.Glob("*/cases.json").scan(path.join(evalsRoot, "calibration")))
  const corpora = await Promise.all(files.map(async (file) => await Bun.file(path.join(evalsRoot, "calibration", file)).json() as CalibrationCorpus))
  expect(files).toHaveLength(35)
  const counts = Object.fromEntries(["sort", "aggregate", "threshold", "filter", "column"].map((kind) =>
    [kind, corpora.flatMap((corpus) => corpus.cases).filter((item) => item.kind === kind).length]))
  expect(counts).toEqual({ sort: 35, aggregate: 34, threshold: 6, filter: 3, column: 35 })
})

test("saved CSV recipes independently reproduce the representative corpus", async () => {
  const proc = Bun.spawn(["python3", path.join(evalsRoot, "script/check-calibration-corpus.py"), "--tasks", path.join(evalsRoot, "fixtures/calibration"), "--only", "sales-by-category,abc-pareto-groups,low-liquidity-companies"], { stdout: "pipe", stderr: "pipe" })
  const output = await new Response(proc.stdout).text()
  const errors = await new Response(proc.stderr).text()
  expect({ code: await proc.exited, errors }).toEqual({ code: 0, errors: "" })
  expect(output).toContain("10 cases")
})

test("missing mutant CSV is a corpus error with exit 2", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-missing-csv-"))
  try {
    const fixture = await sortCorpus(root)
    await rm(path.join(fixture.dir, "sort.csv"))
    await expect(prepareCalibrationCases(fixture.tasks, path.join(root, "run"), fixture.corpusDir)).rejects.toMatchObject({ exitCode: 2 })
  } finally { await rm(root, { recursive: true, force: true }) }
})

for (const failed of [
  ["result-rows"],
  ["import-csv", "group-category", "export-columns", "chain-links", "result-rows"],
]) test("other failed items never compensate for a missed sort: " + failed.join(","), async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-missed-item-"))
  try {
    const fixture = await sortCorpus(root)
    const answers = path.join(root, "answers.json")
    await Bun.write(answers, JSON.stringify({ sort: failed }))
    const config = loadConfig(["--calibrate", "--tasks", path.join(evalsRoot, "fixtures/calibration"), "--only", "sales-by-category"], {
      JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: "bun " + path.join(evalsRoot, "fixtures/fake-codex.ts") + " --failed-by-case " + answers, EVAL_RESULTS_DIR: path.join(root, "results"),
    })
    const result = await calibrate(config, fixture.corpusDir)
    expect(result.code).toBe(1)
    const report = await Bun.file(path.join(result.runDir, "calibration.json")).json()
    expect(report.rows.find((row: { kind: string }) => row.kind === "near-miss")).toMatchObject({ failed, expectations_met: false })
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("passing oracle plus detected filter defect is a successful calibration case", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-filter-detected-"))
  try {
    const answers = path.join(root, "answers.json")
    await Bun.write(answers, JSON.stringify({ sort: ["sort-ratio-id", "result-rows"], column: ["export-columns", "result-rows"], filter: ["filter-ratio"] }))
    const config = loadConfig(["--calibrate", "--tasks", path.join(evalsRoot, "fixtures/calibration"), "--only", "low-liquidity-companies"], {
      JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: "bun " + path.join(evalsRoot, "fixtures/fake-codex.ts") + " --failed-by-case " + answers, EVAL_RESULTS_DIR: path.join(root, "results"),
    })
    const result = await calibrate(config)
    expect(result.code).toBe(0)
    const report = await Bun.file(path.join(result.runDir, "calibration.json")).json()
    expect(report.rows.find((row: { case_id: string }) => row.case_id === "filter")).toMatchObject({ oracle_pass: true, expected_oracle_pass: true, failed: ["filter-ratio"], expectations_met: true })
    const judgeDir = path.join(result.runDir, "low-liquidity-companies/near-miss/filter/judge")
    expect(await Array.fromAsync(new Bun.Glob("**/cases.json").scan(judgeDir))).toEqual([])
    expect(await Bun.file(path.join(result.runDir, "summary.json")).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("malformed CSV cannot masquerade as the intended near-miss", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-invalid-csv-"))
  try {
    const fixture = await sortCorpus(root)
    await Bun.write(path.join(fixture.dir, "sort.csv"), 'category,revenue\n"unclosed,1')
    await expect(prepareCalibrationCases(fixture.tasks, path.join(root, "run"), fixture.corpusDir)).rejects.toMatchObject({ exitCode: 2 })
  } finally { await rm(root, { recursive: true, force: true }) }
})


test("missing XML target is an inapplicable corpus edit with exit 2", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-missing-xml-"))
  try {
    const fixture = await sortCorpus(root)
    fixture.corpus.cases[0]!.edits[0]!.file = "Unit_99/Unit.xml"
    await Bun.write(path.join(fixture.dir, "cases.json"), JSON.stringify(fixture.corpus))
    await expect(prepareCalibrationCases(fixture.tasks, path.join(root, "run"), fixture.corpusDir)).rejects.toMatchObject({ exitCode: 2 })
  } finally { await rm(root, { recursive: true, force: true }) }
})


test("first-touch aggregate CSV retains downstream rounding to two decimals", async () => {
  const csv = await Bun.file(path.join(evalsRoot, "calibration/first-last-touch/aggregate.csv")).text()
  expect(csv.trim().split("\n")[1]!.split(",")[2]).toBe("2496.84")
})
